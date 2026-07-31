# T04 技术设计：发布状态字段、字符宽度与数据库迁移

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务04.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计状态：planning draft。本文描述实现前的技术方案、证据和决策门；未获得 Review 通过前不得执行 migration 或业务代码改动。

## 1. 设计目标与边界

T04 交付四类可复用基础能力：

1. `groups.last_published_at` 及其状态转换语义。
2. `boards`、`board_groups` 的关系型数据基础、约束、索引和默认种子。
3. 跨浏览器、Node、Workers 一致的显示宽度测量函数。
4. 以共享 Zod Contract 为单一输入规则来源，并保留现有领域 refinement。

技术设计不能顺手实现 board repository、HTTP API、首页查询、回收站业务或 R2 清理。它必须给后续任务足够明确的接口，同时把 T04 的数据库变更限制在可审计、可回滚或可补偿的范围内。

## 2. 已核实的仓库现状

### 2.1 Migration 与数据库

- `migrations/0001_initial.sql` 建立 `groups`，当前有 `id`、`title`、`description`、`kind`、`platform`、`status`、`rotation_key`、计数、`version`、logo 字段、`deleted_at`、`purge_state`、`purge_started_at`、`created_at`、`updated_at`。
- `status` 当前允许 `pending`、`published`、`rejected`、`delisted`。
- `0001` 还建立 tags、join methods、submission details、likes、rate limits 和既有索引。
- `migrations/0002_admin_group_management.sql` 增加 assets、purge attempts、R2 purge 错误信息。
- `migrations/0003_group_mutation_token.sql` 增加 `groups.mutation_token`。
- 现有 migration 必须原样保留；T04 使用新的 `0004_...sql` 或经过评审的后续编号。

### 2.2 Repository 与状态写入

`functions/_lib/repositories/group-repository.ts` 当前：

- `GroupRow` 没有 `last_published_at`。
- `create()` 用 `new Date().toISOString()`，默认创建状态为 pending，并批量写入 tags、join methods、submission details 和 assets。
- `update()` 使用时间、version、mutation token 和 D1 batch；当前 setter 同时允许 title、description、kind、platform、status 等字段，但没有发布时刻计算。
- `softDelete()` 只写 `deleted_at` 和 `updated_at`。
- `restore()` 只清除软删除时间、更新 `updated_at` 并恢复 logo asset 引用；当前不接收状态参数，也不会自动发布。
- `permanentDelete()` 已有 R2/D1 多步骤 purge 状态机，不能被 board 外键或本任务的 mapper 改坏。

`functions/_lib/routes/admin-groups.ts` 的实际路径前缀是 `/api/v1/admin`，包含创建、更新、软删除、`/:id/restore` 和 trash 下的永久删除入口。T04 不改路由，但必须在实现接入审计中列出每一条会改变 status 的调用链。

`functions/_lib/services/submission-service.ts` 复用 group repository 创建 pending 群组，因此不能只测试后台入口而漏掉公共投稿路径。

### 2.3 Shared Contract 与领域层

- `shared/contracts/group.ts` 当前公开 DTO 没有发布时间；后台 DTO 包含内部字段。
- 当前 `groupCreateSchema`/`groupUpdateSchema` 的标题上限为 200、简介上限为 2000，且有 tags、join methods 等 refinement。
- `shared/contracts/submission.ts` 当前投稿标题、简介、备注、联系人分别有独立上限，实际导出和入口必须在实现前再核对。
- `shared/domain/group.ts` 目前只有 group kind/status/join method/asset purpose 等枚举，没有 board 或显示宽度领域模块。
- 因此应把常量与 `measureDisplayWidth` 放入共享层，避免在 route、repository、浏览器表单中各写一套。

### 2.4 测试与规范

- `tests/workers/migrations.spec.ts` 当前按 `0001`、`0002`、`0003` 验证迁移列表和升级；T04 必须更新测试预期，但不能回写历史 migration。
- `vitest.workers.config.ts` 使用 `readD1Migrations` 和隔离存储；`tests/workers/setup.ts` 对测试数据库应用全部 migration。
- `.trellis/spec/backend/database-guidelines.md` 要求无 ORM、prepared statements、typed mapper、D1 batch、空库与旧库 migration 测试、破坏性变更需备份/补偿方案。
- `.trellis/spec/backend/api-guidelines.md` 要求 public/admin DTO 分离、共享 Zod Contract、禁止数据库行直接序列化和内部字段泄露。

## 3. 目标数据模型

### 3.1 groups.last_published_at

目标字段为可空时间文本，与现有 `created_at`/`updated_at` 的 UTC ISO 精度和格式一致。目标 mapper 将其映射到内部领域对象；公共 DTO 默认不增加该字段，管理员/审计 DTO 是否增加需要以调用方需求为准并经过字段暴露审查。

概念 SQL（不是未经评审可直接执行的最终 migration）：

```sql
ALTER TABLE groups ADD COLUMN last_published_at TEXT;
```

SQLite/D1 的现有表结构、默认值和历史数据必须先在 migration runner 中验证。若 backfill 或 CHECK 需要重建表，必须证明不会破坏既有外键、索引、purge 字段和时间格式，并独立评审重建方案。

### 3.2 boards

建议字段契约：

| 字段 | 存储/约束意图 | 业务说明 |
| --- | --- | --- |
| `id` | 非空主键，风格与项目 ID 一致 | 需要稳定种子 ID/碰撞策略 |
| `title` | 非空文本 | 业务层用显示宽度校验 |
| `is_enabled` | 非空布尔表示 | 默认启用，但允许后续禁用 |
| `position` | 非空、`>= 0` 整数 | 不能直接施加无法批量交换的全局唯一约束 |
| `sort_mode` | CHECK 枚举 | `manual_asc`、`manual_desc`、`hourly_random` |
| `version` | 非空正整数或现有版本约定 | 并发更新使用 |
| `created_at` | UTC 时间文本 | 初始化时显式/默认写入 |
| `updated_at` | UTC 时间文本 | 每次 board 变更更新 |

T04 只锁定字段语义，不实现 `hourly_random`。排序模式只是可存储的受控枚举，不能因为枚举存在就引入时间窗口计算或公共展示逻辑。

### 3.3 board_groups

建议字段契约：

| 字段 | 约束 |
| --- | --- |
| `board_id` | 非空，FK `boards(id)`，board 删除时级联关系 |
| `group_id` | 非空，FK `groups(id)`，策略需兼容 purge |
| `position` | 非空整数且 `>= 0` |
| `created_at` | UTC 时间文本 |

主键为 `(board_id, group_id)`。为满足后续查询和排序建立：

- `boards(position, id)`。
- `board_groups(board_id, position, group_id)`。
- `board_groups(group_id)`。

board 删除级联只删除关系行，绝不能删除 group。group 的 FK 行为不能与永久清理、软删除和 R2 资源状态相冲突；如果现有 purge 顺序不允许直接 FK cascade，则在 migration 设计中明确限制或补偿步骤，而不是改变 purge 状态机的含义。

## 4. Migration 方案

### 4.1 迁移顺序

建议的 forward 顺序：

1. 执行只读审计/部署前报告，确认时间、状态、文本宽度、非法关系等阻断项。
2. 新 migration 增加 `groups.last_published_at`。
3. 按已确认的可信历史优先级回填 published 记录，非 published 且无证明的记录保持 NULL。
4. 创建 `boards`、`board_groups`、CHECK、FK、索引。
5. 幂等写入默认“自定板块”。
6. 验证 schema、索引、种子行数量和关键数据不变量。

实际是否拆成两个 migration，取决于 D1 事务时长、回填数据量和部署工具能力。若大数据量回填不能安全放在 schema migration 中，应拆成 schema migration + 可观测 backfill job，并确保新旧应用在过渡期间都能读写。

### 4.2 历史发布时间回填

回填函数应是可测试、可审计的纯决策：

```text
published 且存在可信历史发布时间 -> 使用可信历史时间
published 且有明确状态证据但无发布时间 -> 使用该证据对应时间
published 且没有可信证据 -> 使用 created_at
非 published 且没有证明曾发布 -> NULL
非法/冲突/无法排序的数据 -> 按审计策略阻断或进入人工修复清单
```

不允许：

- 使用 migration 开始时间或执行时间填充所有行。
- 把 `updated_at` 无条件当作发布时间，因为 published 记录可能被普通编辑过。
- 把当前状态 published 自动解释为“刚刚发布”。
- 在没有审计记录的情况下静默覆盖原字段。

如果仓库暂时没有历史审核事件表或发布时刻字段，设计必须把“只能用 `created_at` 兜底”标为产品/数据质量折衷，并在最终报告中说明发现流排序的历史准确性边界。

### 4.3 默认板块种子

默认板块需要一个可重复识别的策略：

- 优先使用项目认可的固定 ID，并在 migration 前检查碰撞。
- 如果项目不允许固定 ID，则使用受控的唯一业务条件，但必须避免用户把普通 board 重命名为“自定板块”后被误认成系统种子。
- 重复执行必须保持一行；不能依赖“当前表为空”作为幂等条件。
- 初始化时间应使用 migration 约定的确定性/数据库时间来源，但不能拿它回填 group 发布时间。
- 删除默认板块后，运行时不能自动重建；是否允许 migration 重跑恢复它必须以 migration runner 的幂等语义和产品决策为准，不能出现“每次启动都重建”。

### 4.4 约束、索引与回滚

- D1/SQLite 的 CHECK 和外键启用状态必须在测试中显式验证。
- `position >= 0` 和 `sort_mode` 枚举约束需要 DB 层与 Zod 层双重保护。
- 不添加不能安全交换的 `UNIQUE(position)`。
- 不做假 down migration。回滚设计应说明：旧应用是否能忽略新增列/表；若不能，使用先部署兼容读写、再切换、最后清理的顺序；失败时使用备份或补偿 migration。
- 迁移脚本不应直接依赖未定义的历史行顺序，backfill 查询应有稳定条件。

## 5. 发布状态设计

### 5.1 纯规则

定义领域层纯函数，例如：

```text
computePublicationTransition(previousStatus, nextStatus, now):
  if previousStatus != published and nextStatus == published:
    return { lastPublishedAt: now }
  return { lastPublishedAt: unchanged }
```

函数必须：

- 不读取数据库、不生成随机值、不依赖全局时钟。
- 能表达“保持原值”而不是把 NULL 覆盖回去。
- 对非法状态由共享枚举/调用方在更早阶段拒绝；不能通过 fallback 发布。
- 由注入的 `now` 产生可预测测试结果。

### 5.2 Repository 写入策略

在 `group-repository.update()` 中：

1. 读取并锁定/校验当前 version、mutation token 和旧 status。
2. 根据请求得到 next status，调用纯规则。
3. 构建一次包含 status、last_published_at（仅需要时）、updated_at、version、mutation token 及允许字段的 prepared update。
4. 以现有 D1 batch/条件更新语义提交。
5. 若影响行数为 0，返回既有冲突错误且确认没有时间戳写入。

`create()` 也必须显式处理 status：创建 pending 不写发布时间；若后台允许创建时直接 published，则以 `previousStatus = null/non-published` 的约定计算一次发布时间，并与创建记录在同一批次中完成。公共投稿当前创建 pending，不能因共享函数重构而意外变成 published。

### 5.3 调用链审计表

| 入口 | 当前事实 | T04 处理 |
| --- | --- | --- |
| 管理员创建 | `/api/v1/admin` 调用 repo create | 核对直接 published 的可能性并测试 |
| 管理员更新 | route → repo update | 接入统一状态规则 |
| 审核/下架 | 可能在 route/service/内部 helper | `rg` 找齐所有 status setter，禁止遗漏 |
| 公共投稿 | submission-service → repo create | 验证 pending 与共享 Contract |
| soft delete | 只更新 deleted_at | 不更新发布时间 |
| restore | 当前只恢复软删除与资源引用 | 不擅自改变状态；若需求要求 restore→published，形成决策门 |
| 批处理/内部任务 | 需由全仓库搜索确认 | 复用同一纯函数和原子更新 |
| purge | 已有 R2/D1 多步状态机 | 不改变 purge_state、资产引用和永久删除顺序 |

### 5.4 后续发现查询契约

T04 只提供字段、内部映射和可验证的索引方向。后续查询的目标语义是：

```sql
WHERE status = 'published'
  AND deleted_at IS NULL
ORDER BY last_published_at DESC, id ASC
LIMIT 10
```

是否把 NULL 放在末尾、是否增加 `created_at` 兜底、是否需要复合索引，应由后续发现流任务根据历史回填策略和 SQLite 查询计划最终确认。T04 不交付 public API。

## 6. 显示宽度设计

### 6.1 算法层级

显示宽度分为三层，且只能有一个公开入口：

1. **分段层**：按 grapheme cluster 分段；优先评估 `Intl.Segmenter`，提供经过测试的 Node/Workers fallback 或小型受控依赖。
2. **类别层**：识别 Emoji 序列、East Asian Width Wide/Fullwidth、半角/ASCII/Ambiguous、空白和控制类别。
3. **计数层**：每个字素簇返回 0、1、2 或项目明确允许的 Tab/换行宽度；累加并在超过上限时可提前停止，但不能在截断点拆开字素簇。

### 6.2 规则表

| 输入类别 | 宽度 |
| --- | ---: |
| ASCII、拉丁、数字、半角 | 1 |
| 默认 Ambiguous | 1 |
| 中文、日文、韩文、EAW Wide/Fullwidth | 2 |
| Emoji 完整字素簇 | 2 |
| 普通空格 | 1 |
| 全角空格 | 2 |
| Tab | 4 |
| 换行 | 1 |
| CRLF | 1，作为一个换行单位 |
| 合法 ZWJ、variation selector、modifier | 不额外重复计数 |
| 不允许的控制字符 | 按既有清洗规则拒绝，不能通过零宽绕过 |

组合重音、旗帜、肤色、家庭/职业 Emoji、ZWJ 序列、换行输入和 CRLF 必须进入跨运行时 golden vector。对于库无法可靠分类的 code point，设计必须定义默认值和安全上限行为，而不是在不同 runtime 静默分歧。

### 6.3 API 形态

建议提供：

- `measureDisplayWidth(value: string): number`：完整测量。
- 可选的 `validateDisplayWidth(value, max)` 或 `isWithinDisplayWidth`：共用测量，不复制算法。
- 常量 `GROUP_TITLE_MAX_DISPLAY_WIDTH = 50`、`GROUP_DESCRIPTION_MAX_DISPLAY_WIDTH = 1000`：名称可按项目命名规范调整，但只允许一个来源。

函数保持纯、无 DOM、无浏览器全局依赖，使 Workers 和 Node 直接复用。若 `Intl.Segmenter` 能力差异真实存在，必须通过 feature detection 和同一 fallback 确保结果一致，不能让生产端和测试端各自使用不同路径。

## 7. Contract 与前端集成

### 7.1 Schema 变更

在 `shared/contracts/group.ts`：

- 把标题/简介长度校验由字符串长度改为共享显示宽度 refine/superRefine。
- 保留 min、trim、空字符串语义、控制字符、tags、joinMethods、kind/platform 等已有规则。
- `groupCreateSchema` 和 `groupUpdateSchema` 必须分别测试；更新 schema 还要保留 version 必填与并发语义。
- 将可复用常量导出，不把 `50`、`1000` 分散在多个 schema。

在 `shared/contracts/submission.ts`：

- 核对当前公共投稿字段与实际 route 使用的 schema。
- 按批准的 V2 规则接入标题/简介显示宽度；notes/contact 的既有限制不得无关扩大或缩小。
- 保留投稿的必填、联系信息、标签和关联校验。

为 `shared/domain` 或共享 contract 增加基础 `BoardSortMode`、`Board`、`BoardGroup` 类型；不放入 T05 的分页筛选、管理 DTO 或公共展示字段。

### 7.2 DTO 与 mapper

- `GroupRow` 增加 nullable `last_published_at` 并由 typed mapper 显式转换。
- public DTO 继续只包含允许公开的字段；admin DTO 是否加入发布时间要以审计/管理需求确认。
- 不把 `boards` 或 `board_groups` 数据库行直接返回给 API。
- Zod schema 负责外部输入，repository mapper 负责数据库行；两者不可通过 `as` 跳过校验。

### 7.3 表单行为

若 T04 需要改现有公共投稿/后台表单：

- 移除与业务规则冲突的 HTML `maxlength`，避免按 UTF-16 提前截断。
- 已有计数器显示“当前宽度/最大宽度”，使用共享函数。
- 计数器在 IME compositionstart/update/end 期间不能把中间状态当作最终值强制截断。
- server 仍是最终裁决；前端提示不构成安全边界。
- 若当前表单没有计数器，交付最小错误显示即可，除非后续 UI 任务批准引入计数器。

## 8. 历史超限和迁移兼容

读取 mapper 只做字段类型转换，不因新长度规则拒绝数据库已有行。写入策略由产品/工程在实现前选定：

- **A：先清理**：生成有审计的超限清单，修复后再强制所有相关更新。
- **B：未修改字段保留**：无关字段更新时原样携带旧超限 title/description；被修改的字段必须满足新宽度。

两者都要测试“读旧值、改无关字段、改目标字段、状态发布、版本冲突”组合。禁止：

- mapper 读取时切片。
- migration 按 code point/UTF-16 直接截断。
- 通过低层 SQL 绕过 Zod、版本或状态规则。
- 让旧数据阻断所有读取而没有人工修复路径。

## 9. 测试设计

### 9.1 Migration 测试

| 场景 | 断言 |
| --- | --- |
| 空库全量 | migration 顺序、表、列、索引、FK 存在 |
| 0001-0003 代表性旧库 | 新 migration 可升级，历史数据不丢 |
| 重复 runner/种子 | default board 不重复 |
| 默认 board 后续删改 | 不因业务查询自动重建 |
| 回填 published | 优先可信时间，最后才 created_at |
| 回填 non-published | 无证据保持 NULL |
| 非法数据审计 | 有明确报告/阻断，不静默修复 |
| FK/CHECK | position、sort_mode、主键和级联行为符合设计 |
| purge 边界 | 不破坏 groups 的 R2/D1 状态机字段和测试 |

### 9.2 发布状态测试

以注入时钟 `2026-...Z` 固定结果，覆盖：

- pending→published、rejected→published、delisted→published 更新一次。
- published→published 普通编辑不变。
- published→delisted、published→rejected 不变。
- pending 创建、投稿创建、restore（当前只清 deleted_at）不更新。
- 版本冲突、mutation token 冲突、D1 batch 失败不更新。
- 批处理含成功/失败项时验证原子性。
- 重试同一个已成功转换的请求不生成第二次错误时间更新。

### 9.3 宽度与 Contract 测试

测试向量必须涵盖：ASCII、50/51 ASCII、25/26 中文、日文、韩文、拉丁扩展、全角/半角、Ambiguous、单独 Emoji、ZWJ Emoji、variation selector、肤色 modifier、组合重音、普通/全角空格、Tab、LF、CRLF、非法控制字符、超长输入和混合文本。

每组向量至少在共享测试环境和 Workers 测试环境执行；如果浏览器 bundle 有独立编译产物，再通过前端测试验证同样结果。

Schema 测试覆盖标题 49/50/51、简介 999/1000/1001、中文 500/501、trim 后为空、控制字符、已有 tags/join methods refinement、旧超限兼容和错误消息。

### 9.4 性能与安全

- 对合理上限输入做线性复杂度基准；不可因为反复正则/切分产生明显平方复杂度。
- 超长恶意输入应能提前拒绝或安全停止测量，不能造成内存无界增长。
- Emoji/Unicode 输入不能通过 ZWJ、零宽控制或组合字符绕过限制。
- SQL 继续使用参数化语句；错误输出不泄露内部 SQL、migration 执行细节或未授权发布时间。
- FK、CHECK、公共/后台 DTO 和 repository mapper 都要有边界测试。

## 10. 决策门与风险

实现前必须确认：

1. 默认 board 的固定 ID 或唯一识别策略以及碰撞处理。
2. 历史发布证据实际来自哪些字段/事件；没有证据时 `created_at` 兜底是否被产品接受。
3. `Intl.Segmenter` fallback 或依赖的许可、bundle、Workers 支持和 golden vectors。
4. restore 是否永远保持当前语义，还是另立“恢复并发布”的批准需求。
5. 旧超限数据选择策略 A 或 B。
6. `board_groups.group_id` 在现有永久删除流程中的 FK 处理顺序。
7. 后续发现流是否需要 NULL 的排序兜底和复合索引。

未解决的任一项都只能保持 planning，不能用临时默认值进入 migration 或生产代码。

## 11. 交付验收映射

- PRD 的 R04-01 至 R04-03 对应 migration backfill、领域纯函数和 repository 状态测试。
- R04-04 至 R04-07 对应表结构、索引、默认种子、空库/旧库升级和部署说明。
- R04-08 至 R04-10 对应数据审计、宽度实现、schema 边界和表单行为。
- R04-11 至 R04-13 对应共享 Contract、DTO/mapper、兼容策略和并发原子性。
- T05 接口以 `boards`/`board_groups` schema、FK、索引、状态边界和回收站责任表的形式交付，不以 T04 实现业务功能替代。
