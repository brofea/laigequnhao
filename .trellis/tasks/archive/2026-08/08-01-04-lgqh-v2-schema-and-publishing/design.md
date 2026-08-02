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

目标字段为可空时间文本，与现有 `created_at`/`updated_at` 的 UTC ISO 精度和格式一致。目标 mapper 将其映射到内部领域对象；本任务不把它加入 public/admin API DTO。若后续审计或管理页面需要展示，另由对应任务提出受控 DTO 变更。

概念 SQL（不是未经评审可直接执行的最终 migration）：

```sql
ALTER TABLE groups ADD COLUMN last_published_at TEXT;
```

SQLite/D1 的现有表结构、默认值和历史数据必须先在 migration runner 中验证。若 backfill 或 CHECK 需要重建表，必须证明不会破坏既有外键、索引、purge 字段和时间格式，并独立评审重建方案。

### 3.2 boards

建议字段契约：

| 字段 | 存储/约束意图 | 业务说明 |
| --- | --- | --- |
| `id` | 非空主键，风格与项目 ID 一致 | 默认种子使用 migration 内固定 UUID；碰撞即阻断迁移 |
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
| `group_id` | 非空，FK `groups(id)`，`ON DELETE CASCADE` 作为物理删除兜底 |
| `position` | 非空整数且 `>= 0` |
| `created_at` | UTC 时间文本 |

主键为 `(board_id, group_id)`。为满足后续查询和排序建立：

- `boards(position, id)`。
- `board_groups(board_id, position, group_id)`。
- `board_groups(group_id)`。

board 删除级联只删除关系行，绝不能删除 group。`group_id` 的 `ON DELETE CASCADE` 只作用于物理删除，不替代 T05 在软删除事务中的显式关联清理；现有 purge 仍先删除关联资源行，再删除 `groups`，并通过外键测试防止孤立关系。

## 4. Migration 方案

### 4.1 迁移顺序

建议的 forward 顺序：

1. 执行只读审计/部署前报告，确认时间、状态、文本宽度、非法关系等阻断项。
2. 新 migration 增加 `groups.last_published_at`。
3. 当前未上线数据的 `last_published_at` 全部初始化为 `NULL`；不使用 `created_at`、迁移执行时间或其他推断时间。未来仅在真实发生非 published → published 的状态转换时写入服务端当前时间。
4. 创建 `boards`、`board_groups`、CHECK、FK、索引。
5. 幂等写入默认“自定板块”。
6. 验证 schema、索引、种子行数量和关键数据不变量。

本次固定使用一个新的 `0004_...sql` forward migration，一次完成 `last_published_at`、`boards`、`board_groups`、索引、约束和默认板块种子。由于现有数据的发布时间全部保持 `NULL`，没有大批量历史回填，也不拆分 schema/backfill deployment step。若未来出现真实上线历史数据，另立迁移决策，不修改本次方案。

### 4.2 历史发布时间回填

用户已确认网站暂未上线，因此当前迁移不做历史发布时间推断，回填函数的本次策略固定为：

```text
所有现有群组 -> NULL
未来非 published→published 成功转换 -> 使用服务端可信时钟
未来 published→published 或 published→delisted -> 保留当前值
```

不允许：

- 使用 migration 开始时间或执行时间填充所有行。
- 把 `updated_at` 无条件当作发布时间，因为 published 记录可能被普通编辑过。
- 把当前状态 published 自动解释为“刚刚发布”。
- 在没有用户重新批准的情况下为未上线历史数据引入 `created_at` 兜底。

由于本次所有初始值均为 NULL，T07 的“发现新群”查询必须在设计中明确 NULL 排序行为；未来有真实发布转换后才会出现非 NULL 值。若网站上线后需要历史回填，必须新增决策和可审计 migration，不得在本任务中暗示已有历史准确性。

### 4.3 默认板块种子

默认板块采用 migration 内固定 UUID 作为唯一身份，不依赖标题或“当前表为空”判断：

- migration 写入前检查该 UUID；已存在且内容属于该种子时保持幂等，已被其他记录占用时阻断迁移并报告碰撞。
- 普通 board 可以重命名为“自定板块”，也不会被误认成系统种子；固定 UUID 才是身份来源。
- 重复执行必须保持一行，且删除后的默认 board 不由运行时或无关 migration 自动重建。
- 初始化时间应使用 migration 约定的确定性/数据库时间来源，但不能拿它回填 group 发布时间。
- 删除默认板块后，运行时、页面加载、普通 API 和后续无关 migration 都不能自动重建；migration runner 只按已记录的 migration 执行一次，不能把重跑/修复流程变成恢复已删除种子的入口。

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
| restore | 当前只恢复软删除与资源引用 | 用户已确认保持语义；不改变 status、不更新 `last_published_at`，明确发布由独立操作完成 |
| 批处理/内部任务 | 需由全仓库搜索确认 | 复用同一纯函数和原子更新 |
| purge | 已有 R2/D1 多步状态机 | 不改变 purge_state、资产引用和永久删除顺序 |

### 5.4 后续发现查询契约

T04 只提供字段、内部映射和可验证的索引方向。后续查询的目标语义是：

```sql
WHERE status = 'published'
  AND deleted_at IS NULL
ORDER BY last_published_at DESC, id DESC
LIMIT 10
```

由于初始数据全部为 `NULL`，查询必须明确将 NULL 排在非 NULL 之后；当候选记录全部为 NULL 时，以 `id DESC` 稳定排序。T04 只交付字段、内部映射、索引方向和该数据边界说明，不交付 public API。

## 6. 显示宽度设计

### 6.1 算法层级（已批准：自研零依赖）

显示宽度分为三层，且只能有一个公开入口。用户已批准"自研零依赖"方案，不引入任何 Unicode 处理依赖：

1. **分段层**：按 grapheme cluster 分段。`Intl.Segmenter`（UAX #29 扩展字素簇）作为主分段引擎——Node v25、workerd、现代浏览器均已支持且算法为规范确定性；同时提供手写 UAX#29 子集 fallback 分段器（组合记号、ZWJ、肤色修饰、旗标 RI 对、变体选择符），供三端 golden vectors 对照验证，并作为 `Intl.Segmenter` 缺失时的兜底。两条路径必须对全部 golden vectors 输出一致。
2. **类别层**：共享模块内置自研编码范围表（固定 Unicode 版本，预计 8–12KB 范围数据），识别 East Asian Width（Wide/Fullwidth/Ambiguous/Narrow/Halfwidth/Neutral）、Emoji 序列、空白和控制类别。表格随固定 Unicode 版本锁定；未来升级 Unicode 必须同步更新表与 golden vectors。
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

函数保持纯、无 DOM、无浏览器全局依赖，使 Workers 和 Node 直接复用。自研范围表是唯一权威分类来源，`Intl.Segmenter` 只负责分段；任何 runtime 的向量差异都必须通过手写 fallback 对照定位，不能让生产端和测试端各自使用不同规则。golden vectors 至少覆盖 PRD §34 全部类别，并在 Node（Vitest 单元）、Workers（vitest-pool-workers）和浏览器（前端测试，若有编译产物）三端断言一致。

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
- public/admin DTO 都不加入 `last_published_at`；本任务只维护数据库、领域对象和内部 mapper。
- 不把 `boards` 或 `board_groups` 数据库行直接返回给 API。
- Zod schema 负责外部输入，repository mapper 负责数据库行；两者不可通过 `as` 跳过校验。

### 7.3 表单行为（已批准：最小接入）

T04 的前端改动保持最小，不引入计数器：

- 移除与业务规则冲突的 HTML `maxlength`（`AdminGroupFields.vue` 的 title/description、`SubmissionDialog.vue` 的 title/description），避免按 UTF-16 提前截断中文/Emoji。
- 表单复用共享 Contract 的字段级错误映射与展示；导出共享测量 helper 供后续 UI 任务（计数器）消费。
- 不新增宽度计数器、不写 IME composition 逻辑（无计数器即无 IME 截断问题）；计数器与视觉统一由后续 UI 任务实现，server Contract 始终是最终校验。
- 注意与 T03 工作树（未提交）对 `SubmissionDialog.vue` 等组件的并行修改：T04 只做最小编辑，冲突时以最新文件内容为基础重新应用。

## 8. 旧内容与 seed 数据边界

用户已确认网站未上架，没有需要兼容的旧内容。因此 T04 不实现旧超限内容的兼容路径：

- migration 不截断、不改写文本，也不为旧值增加 B 类宽容分支。
- mapper 只负责类型映射；新 Contract 对所有写入严格执行显示宽度。
- `scripts/seed-local.mjs` 是本地测试数据的修正入口，生成的标题/简介必须通过共享宽度规则。
- 对测试 fixture 的超限样本，应将其作为 schema rejection 边界输入，而不是作为可保存的历史实体。
- 若未来发现真实旧内容，停止实施并另立数据兼容决策；不能以当前“未上架”决定覆盖新事实。

禁止：

- mapper 读取时切片。
- migration 按 code point/UTF-16 直接截断。
- 通过低层 SQL 绕过 Zod、版本或状态规则。
- 为不存在的生产旧内容引入复杂兼容逻辑。

## 9. 测试设计

### 9.1 Migration 测试

| 场景 | 断言 |
| --- | --- |
| 空库全量 | migration 顺序、表、列、索引、FK 存在 |
| 0001-0003 代表性旧库 | 新 migration 可升级，历史数据不丢 |
| 重复 runner/种子 | default board 不重复 |
| 默认 board 后续删改 | 不因业务查询自动重建 |
| 回填 published | 当前未上线数据全部保持 `NULL`，不做 `created_at` 兜底 |
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

Schema 测试覆盖标题 49/50/51、简介 999/1000/1001、中文 500/501、trim 后为空、控制字符、已有 tags/join methods refinement、seed 数据合法性和错误消息。

### 9.4 性能与安全

- 对合理上限输入做线性复杂度基准；不可因为反复正则/切分产生明显平方复杂度。
- 超长恶意输入应能提前拒绝或安全停止测量，不能造成内存无界增长。
- Emoji/Unicode 输入不能通过 ZWJ、零宽控制或组合字符绕过限制。
- SQL 继续使用参数化语句；错误输出不泄露内部 SQL、migration 执行细节或未授权发布时间。
- FK、CHECK、公共/后台 DTO 和 repository mapper 都要有边界测试。

## 10. 决策门与风险

实现前必须确认：

1. 当前未上线数据全部保持 `NULL` 已由用户确认；未来若网站上线后需要历史回填，另立产品/数据迁移决策。
2. 确定性宽度 fallback 或依赖的许可、bundle、Workers 支持和 golden vectors；`Intl.Segmenter` 仅作为等价优化。**已批准：自研零依赖**（固定 Unicode 版本范围表 + Intl.Segmenter 分段 + 手写 fallback 分段器），不引入 Unicode 处理依赖。
3. 当前无旧内容；seed 脚本生成数据必须符合新宽度规则。
4. `board_groups.group_id` 在现有永久删除流程中的 FK 处理顺序。
5. 后续发现流的复合索引覆盖范围与实际查询计划；排序方向和 NULL 语义已冻结，不再作为产品决策门。

未解决的任一项都只能保持 planning，不能用临时默认值进入 migration 或生产代码。

## 11. 交付验收映射

- PRD 的 R04-01 至 R04-03 对应 migration backfill、领域纯函数和 repository 状态测试。
- R04-04 至 R04-07 对应表结构、索引、默认种子、空库/旧库升级和部署说明。
- R04-08 至 R04-10 对应数据审计、宽度实现、schema 边界和表单行为。
- R04-11 至 R04-13 对应共享 Contract、DTO/mapper、兼容策略和并发原子性。
- T05 接口以 `boards`/`board_groups` schema、FK、索引、状态边界和回收站责任表的形式交付，不以 T04 实现业务功能替代。

## T03 接入提示

T04 的共享 schema、配置和领域字段是正式前端真实接入的上游边界。设计中必须标出 T03 消费的稳定字段、兼容旧前端的策略、真实 API/mapper 的输入输出和回归证据；T04 不修改 T03 的 CSS、主题运行时或顶栏，也不以 prototype 数据验证 Contract。

T03 需要的站点配置至少覆盖 `title`/品牌展示文案、`githubUrl`/GitHub 文案和 `addGroup` 文案/目标入口；默认标题为“来个群号”，GitHub 默认值为 `https://github.com/brofea/laigequnhao`，添加新群默认复用现有提交弹窗。T04 负责共享 schema 的稳定字段与默认值，T03 负责前端消费，不将这些配置写死到组件。
