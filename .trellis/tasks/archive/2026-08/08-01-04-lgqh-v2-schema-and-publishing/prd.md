# 04 发布状态字段、字符宽度与数据库迁移

> 执行前置规则：本任务虽已有 PRD 与三份规划，进入执行或最终批准前，仍必须完整读取 `docs/PRD/v2/子任务04.md` 原文，逐条对照 `prd.md`、`design.md`、`implement.md`，记录并修正遗漏。必须先按 `trellis-brainstorm` 规则检查代码、测试、配置、Spec 和任务历史，再与用户进行 brainstorm；每次只提出一个最高价值问题，说明决策影响、推荐方案和取舍。每次用户回答后更新规划并重新检查需求收敛；即使没有剩余疑问，也必须展示最终规划摘要并等待用户明确批准。在原文复核和用户批准完成前，不得运行 `task.py start`、进入实施或修改业务代码；源 PRD 与用户最新决定优先于规划文件。

> 状态：planning。本文是 T04 的需求基线，不授权实施；必须先完成人工 Review、设计评审和迁移方案确认，再允许进入实现阶段。

## 1. 任务定位

本任务为 V2 的数据基础与共享契约任务，依赖 T01（规范与现状审计），并为 T05（板块/回收站能力）、后续首页发现流、后台状态管理和表单改造提供稳定的数据库字段、状态语义、字符宽度工具和 Zod Contract。

本任务只建立基础能力和边界，不直接交付板块 CRUD、公共板块 API、首页卡片、后台分页、回收站业务 UI 或 R2 清理流程改写。

## 2. 联合 Review 结论

本 PRD 已从高级产品经理、Staff Engineer、QA 负责人三个视角进行二次 Review。以下是必须纳入规划的修正和决策点：

1. 当前 migration 只有 `0001_initial.sql`、`0002_admin_group_management.sql`、`0003_group_mutation_token.sql`，只能新增 forward migration，不能修改历史 migration。
2. 当前 `groups` 表的时间字段是 UTC ISO 文本默认值，状态是 `pending/published/rejected/delisted`，已有 `version`、`mutation_token`、软删除与 R2/D1 清理状态；新逻辑必须接入现有并发与清理语义。
3. 当前后台实际路由前缀为 `/api/v1/admin`，不能照抄 PRD 中的简写路径；本任务不扩展这些路由，但设计必须准确标出接入点。
4. 当前 `restore()` 仅恢复软删除、更新 `updated_at` 并恢复资源引用，不接收状态参数。用户已确认保持该语义：restore 不自动进入 `published`，管理员必须执行明确的发布操作。
5. 当前共享 Contract 使用字符串长度上限（群组标题 200、简介 2000，投稿另有标题 100、简介 500 等），V2 的显示宽度 50/1000 是有意改变，必须同时覆盖后台创建、更新和公共投稿，保留既有标签、入群方式等 refinement。
6. 当前没有显示宽度实现、`Intl.Segmenter` 封装或第二套 Emoji 计数逻辑；必须采用随项目打包的确定性 fallback 作为权威算法，`Intl.Segmenter` 只能作为通过同一 golden vectors 后的可选优化，禁止以 `string.length` 作为规则。
7. 用户已确认网站暂未上线：现有 `last_published_at` 初始全部为 `NULL`，不做历史发布时间推断；未来上线后如需回填必须另立决策，且不能使用 migration 执行时间。
8. T04 只负责板块关系的 schema、索引和级联边界；回收站关联清理与永久删除业务仍由 T05 负责，不能在 T04 破坏现有 R2/D1 状态机。
9. 用户已批准显示宽度实现采用**自研零依赖**方案：固定 Unicode 版本的自研 EAW/Emoji 范围表 + `Intl.Segmenter` 分段主引擎 + 手写 UAX#29 子集 fallback 分段器；golden vectors 在 Node/Workers/浏览器三端一致。不引入任何 Unicode 处理依赖。

## 3. 用户与业务价值

- 发现流可以按“最近一次真正发布”排序，而不是被发布后的普通编辑时间误导。
- 标题和简介在中英文、日文、韩文、全角字符、Emoji 和组合字符混排时拥有可解释且跨运行时一致的可见宽度限制。
- 后续板块能力有稳定的 `boards`、`board_groups` 数据基础，避免把板块关系和业务清理逻辑耦合在临时实现中。
- 数据库升级可从空库和现有库重复验证，降低 D1 部署、回滚和历史数据兼容风险。

## 4. 范围与非目标

### 4.1 本任务范围

- 为 `groups` 增加可空的 `last_published_at`。
- 建立发布状态时间戳的纯规则、统一写入入口和可注入时钟。
- 建立 `boards` 与 `board_groups` 表、约束、索引、外键和默认“自定板块”种子。
- 对现有数据执行迁移前审计，并定义可审计的回填与异常记录策略。
- 建立共享 `measureDisplayWidth`（名称可在设计评审时确认）和跨运行时测试。
- 把标题、简介的显示宽度规则接入共享 Zod Contract，保留既有校验和 refinement。
- 前端接入采用**已批准的最小接入**：移除与显示宽度冲突的 HTML `maxlength`（AdminGroupFields 的 title/description、SubmissionDialog 的 title/description），表单复用共享 Contract 的字段级错误映射与展示，导出共享宽度 helper 供后续 UI 任务使用；不新增实时宽度计数器，计数器、IME 计数器交互与视觉统一留给后续 UI 任务（T06/T08/T10）。T03 正在工作树修改 SubmissionDialog 等组件，T04 只做最小编辑并保持兼容。
- 编写 migration、Contract、状态转换、显示宽度、seed 数据约束和必要前端集成测试。
- 修改 `scripts/seed-local.mjs` 的测试标题/简介生成规则，使生成内容始终满足新的显示宽度边界；该文件的既有 lint 错误仍由 T10 负责门禁修复。
- 接管当前 `shared/domain/config.spec.ts` 与字符串型 `platforms` Contract 的基线不一致问题：以审计确认的现行共享 Contract 为准同步实现和测试，不扩大到无关配置重构。

### 4.2 明确非目标

- 不编辑、重排或重写任何现有 migration；实施时必须明确“不修改历史 migration”。
- 不创建 boards 的 CRUD/API/repository/service/UI，不实现小时随机排序。
- 不创建公共板块页、首页卡片、发现流、弹窗、后台板块分页或排序设置页面。
- 不改写公共提交 API 的业务流程，只在其共享输入契约和必要的长度错误展示层接入规则。
- 不实现回收站的关联清理、永久删除编排或 R2 资源清理改造。
- 不在运行时“发现没有板块就创建默认板块”。默认板块只能由 migration/初始化流程幂等创建。
- 不静默截断旧数据或新输入，不以字符串长度、UTF-16 code unit、单独的 code point 数量替代显示宽度。
- 不绕过现有 version、mutation token、状态机、事务/批处理原子性或资源清理状态机。
- 不在本任务中把内部字段 `last_published_at` 无审批地暴露给公共 DTO。
- 不进行全局 Unicode NFC、搜索、标签或其他无关文本语义重写。

## 5. 业务需求

### R04-01 发布时间字段

在 `groups` 中增加 `last_published_at`：

- 类型与现有时间字段保持一致，当前实现为可空 UTC ISO 文本；具体 SQL 类型以现有 D1 约束为准。
- 新建记录默认为 `NULL`，因为创建动作本身不是“从非 published 转为 published”。
- 只有旧状态不是 `published` 且新状态是 `published` 时才更新。
- 更新值由服务端生成，不能接受客户端传入；使用可注入 clock，生产默认使用当前 UTC 时间。
- 字段必须与状态、`version`、`mutation_token` 及同一批次写入在同一个原子操作中完成。
- 状态写入失败、版本冲突、批处理失败或重试未成功时，不能留下孤立时间戳。

以下动作不得更新该字段：新建但仍为 pending、已 published 记录的普通编辑或重复保存、published→delisted、审核失败、资源/点赞/审计写入、冲突响应、仅恢复软删除但未发生状态转换。

### R04-02 发布状态转换覆盖面

统一规则必须覆盖所有可能写入状态的路径，包括但不限于：

- 管理员创建并指定 published 的路径。
- 管理员编辑状态的路径。
- 审核通过、驳回、下架、再次发布路径。
- 批量审核和内部任务/脚本使用的写入路径。
- 恢复软删除的路径：保持当前只清除软删除字段、恢复资源引用的语义；restore 不改变 status，也不更新 `last_published_at`。

设计应将“是否发生非 published→published”抽为纯函数，写入层只负责在事务内应用计算结果。所有接入点必须在测试中证明使用同一规则。

### R04-03 回填规则与异常审计

用户已确认：网站暂未上线，现有数据库记录不需要伪造历史发布时间。因此本次新增字段时，现有所有群组的 `last_published_at` 均保持 `NULL`，不使用历史字段推断，也不使用 `created_at` 兜底，更不能使用 migration 执行时间。

迁移前仍需审计并记录：

- 当前 `groups` 是否存在已上线数据或外部导入数据；若发现与“暂未上线”不一致，必须停止并重新确认，不得静默选择另一种回填策略。
- created/updated 时间缺失、格式非法、时区不一致的数据，但这些数据不改变本次“全部 NULL”的初始化结果。
- 新字段为空不会阻塞现有读取；未来真实发生非 `published`→`published` 成功转换时，由服务端可信时钟写入发布时间。

本次迁移的回填结果必须可验证为全 NULL；后续发布转换测试负责证明新数据会正确写入。若未来需要为已上线历史数据补齐发布时间，应另立迁移/产品决策，不在本任务中隐式兼容。

### R04-04 boards 表

建立 `boards` 基础表，至少包含：

| 字段 | 规则 |
| --- | --- |
| `id` | 项目标识风格一致、稳定且非空 |
| `title` | 走共享标题显示宽度规则，数据库不承担替代业务校验 |
| `is_enabled` | 非空布尔/整数表示，默认值由设计确认 |
| `position` | 非负整数；用于稳定的手动排序 |
| `sort_mode` | 仅允许 `manual_asc`、`manual_desc`、`hourly_random` |
| `version` | 非空并用于并发更新 |
| `created_at` / `updated_at` | 遵循现有 UTC 时间格式和更新约定 |

不得为 `position` 直接增加会阻断批量交换的全局唯一约束；若未来需要唯一性，必须证明批量重排的安全策略后另行评审。T04 不实现 board 的业务 API 或排序执行器。

### R04-05 board_groups 关系表

建立 `board_groups`：

- 至少包含 `board_id`、`group_id`、`position`、`created_at`。
- 主键为 `(board_id, group_id)`，防止同一群组在同一板块重复关联。
- `board_id` 外键删除时级联删除关系，但不能删除 group 本身。
- `group_id` 外键使用 `ON DELETE CASCADE` 作为物理删除兜底；软删除阶段仍由 T05 在同一事务中显式清理 `board_groups`、压缩受影响板块位置并更新板块版本，恢复不自动恢复关联。不得因 T04 的设计让 group purge 在 R2/D1 过程中进入不可恢复的半状态。
- `position` 必须为非负整数。
- 群组下架、软删除或恢复不应自动丢失关系和位置；T05 负责回收站展示和关联清理策略。
- 建立 `boards(position, id)`、`board_groups(board_id, position, group_id)`、`board_groups(group_id)` 等服务后续查询所需索引，具体覆盖列顺序以查询计划确认。

### R04-06 默认“自定板块”

migration/初始化中幂等创建一个默认板块：

- 标题为“自定板块”。
- `is_enabled` 为 true，`position` 为 0，`sort_mode` 为 `manual_asc`。
- 初始 version 和时间字段合法且稳定。
- 允许普通业务后续重命名、禁用或删除。
- 允许系统处于零个 board 的状态；运行时不得因“零个 board”自动重建。
- 种子写入必须使用 migration 内固定 UUID 并具备幂等性，不得因重复执行生成第二个默认板块；若固定 UUID 已被其他记录占用，必须阻断迁移并报告碰撞，不能改用新 ID 或按标题猜测身份。

### R04-07 migration 与部署安全

- 本次新增一个 `0004_...sql` forward migration，不能改历史 `0001`、`0002`、`0003` 文件；一次完成字段、表、索引、约束和默认种子。
- 必须验证空数据库从零应用全部 migration，以及代表性已有数据库升级到最新版本。
- 验证列、表、索引、FK、CHECK、默认种子和 backfill 的幂等/一致性。
- 不提供假装安全的 down migration；若需要回滚，必须说明应用版本兼容、备份、补偿迁移和停机/降级顺序。
- migration 应尽量保持短事务、可观测，并在 D1 约束下使用项目既有 migration runner。

### R04-08 迁移前数据审计

审计至少检查：

- 时间字段缺失、非法格式和无法排序的值。
- 标题超过 50 个显示宽度单位。
- 简介超过 1000 个显示宽度单位。
- Unicode 控制字符、不可处理字符和需要明确策略的异常文本。
- 非法 status、主键、外键或重复关系数据。
- 未来可能阻断 board/group 关系迁移的孤儿记录。

审计结果必须影响 migration/部署决策：对不能安全自动修复的记录停在明确的阻断点，不能通过静默截断、隐式转换或跳过异常制造“迁移成功”的假象。

### R04-09 共享显示宽度算法

提供一个纯函数/共享模块，例如 `measureDisplayWidth(value)`，供浏览器、Node 和 Workers 使用同一实现或同一可验证语义：

- 以字素簇（grapheme cluster）为基本分段单位，不能使用 UTF-16 `string.length`，不能只按 code point 数量计数。
- 中文、日文、韩文、East Asian Width 为 Wide/Fullwidth 的字符和完整 Emoji 字素簇按 2 计。
- ASCII、半角、拉丁字母、数字和默认 Ambiguous 字符按 1 计。
- 普通空格按 1，全角空格按 2。
- Tab 按 4；换行按 1；CRLF 视为一个换行单位而非两个字符。
- 合法 ZWJ、variation selector、Emoji modifier 等属于同一字素簇时不能额外重复计数。
- 控制字符必须按既有清洗规则拒绝或明确处理；不得利用零宽控制字符绕过上限。
- 不因本任务无关原因修改全局 Unicode normalization、搜索、标签或入库语义。
- 必须评估确定性 fallback/dependency 的可用性、体积和许可；`Intl.Segmenter` 只能作为通过同一 golden vectors 后的可选优化，禁止未经评审引入大型依赖或只在浏览器可用的实现。
- 规则、实现和测试必须保证浏览器、Node、Workers 的结果一致；同一输入不能存在两套“前端计数”和“后端计数”。

### R04-10 标题与简介限制

- 群组标题最大 50 个显示宽度单位。
- 群组简介最大 1000 个显示宽度单位。
- 保留现有的必填、trim、空值、控制字符和其他业务规则；只把长度测量替换/扩展为共享显示宽度。
- 覆盖 ASCII、中文、日文、韩文、混合文本、Emoji、组合字符、全角/半角字符、空格、Tab、换行和 CRLF。
- 标题边界必须覆盖 49/50/51、25/26 个中文字符、50/51 个 ASCII 字符和混合/Emoji 边界。
- 简介边界必须覆盖 999/1000/1001、500/501 个中文字符、混合换行/Tab/Emoji 边界。
- 错误信息要说明是显示宽度单位超限，不能继续返回容易误导的“字符数”提示。
- 表单不能使用会产生第二套语义的 HTML `maxlength`（T04 移除与宽度冲突的 maxlength，采用最小接入；`maxlength` 的存在会造成按 UTF-16 提前截断中文/Emoji）。本任务不新增计数器；如后续 UI 任务引入计数器，必须使用共享显示宽度计数并保持 IME safe。

### R04-11 共享 Zod Contract

更新共享 Contract，至少覆盖：

- 群组创建 `groupCreateSchema`。
- 群组更新 `groupUpdateSchema`。
- 公共投稿/提交 Contract（当前 `submissionRequestSchema` 及其实际导出名以代码为准）。
- 后台创建、编辑和投稿表单消费同一标题/简介限制与错误语义。
- 导出可复用的宽度常量，避免前后端复制 `50`/`1000`。
- 保留现有 tags、join methods、平台/类型等 refinement 和关联校验，不因重构丢失已有规则。
- 为 `BoardSortMode`、`Board`、`BoardGroup` 提供基础共享类型/Contract；不在 T04 预先实现 T05 的复杂 API DTO。
- `last_published_at` 作为内部/领域字段维护；只有在审计或后续 API 需求明确时才增加受控 DTO，公共 DTO 默认不暴露。

当前代码中的旧上限（群组标题 200、简介 2000；投稿标题/简介/备注/联系人各有独立上限）必须在设计中列出迁移关系，不能只改一个 schema 而遗漏实际入口。

### R04-12 旧内容与 seed 数据边界

用户已确认网站未上架且没有需要兼容的旧内容，因此本任务不实现旧超限内容的兼容层：

- 不保留旧超限生产记录的兼容路径。
- 不在 migration 或 mapper 中静默截断、放宽或改写文本。
- 新建、更新和公共投稿统一执行标题 50、简介 1000 的显示宽度规则。
- `scripts/seed-local.mjs` 必须只生成符合新规则的测试数据；如发现其他 fixture 超限，直接修正 fixture，不把兼容逻辑引入生产 Contract。
- 如果未来发现实际存在旧内容，必须停止并重新进行产品/数据迁移决策。

### R04-13 版本冲突和批处理

- stale version 必须返回现有冲突语义，不能改变 status、`last_published_at`、version 或其他字段。
- 冲突重试只有在真正成功的非 published→published 时才更新发布时间。
- 批量状态变化必须在同一原子批次中同时验证版本/令牌、状态、时间和关联字段。
- 失败、回滚或重复请求不得留下只更新了 `last_published_at` 的部分结果。

## 6. 质量与验收标准

### AC-04-01 数据库迁移

- [ ] 空库可按顺序应用全部 migration。
- [ ] 现有 `0001`、`0002`、`0003` 数据库可升级；历史文件未被修改。
- [ ] `groups.last_published_at`、`boards`、`board_groups` 的字段、约束、索引和 FK 可通过测试验证。
- [ ] 默认“自定板块”创建幂等、可删除/重命名/禁用，重复初始化不会重建。
- [ ] 由于网站暂未上线，现有所有群组的 `last_published_at` 均保持 `NULL`，没有隐式 `created_at` 兜底或 migration 时间回填。
- [ ] 异常审计、回滚/补偿方案和部署顺序写入设计与实施计划。

### AC-04-02 发布状态语义

- [ ] 所有状态写入入口共享同一纯转换规则。
- [ ] non-published→published 更新 `last_published_at`。
- [ ] published 普通编辑、重复保存、published→delisted、审核失败、冲突和失败重试不更新它。
- [ ] 创建 pending、恢复软删除但未改变状态不更新它。
- [ ] status、时间、version、mutation token 在成功批处理中原子一致。
- [ ] 可注入 clock 让测试无需依赖真实时间。

### AC-04-03 显示宽度与输入契约

- [ ] 浏览器、Node、Workers 对同一测试向量给出一致宽度。
- [ ] 字素簇、宽字符、半角、Ambiguous、Emoji/ZWJ/variation/modifier、组合字符、空格、全角空格、Tab、换行、CRLF、控制字符均有覆盖。
- [ ] 标题 50、简介 1000 的边界和超限错误准确。
- [ ] 创建、更新、公共投稿的共享 Contract 都接入规则且保留既有 refinement。
- [ ] 移除与宽度冲突的 HTML `maxlength`，表单错误映射到正确字段；T04 不引入计数器，`maxlength` 移除后不存在 IME 组合被截断问题。
- [ ] 不使用 `string.length` 作为业务宽度，不存在第二套算法。

### AC-04-04 兼容与安全

- [ ] 测试 seed 生成的标题/简介符合新显示宽度规则。
- [ ] 不存在旧内容兼容分支，不静默截断或放宽新 Contract；新建/更新/投稿严格执行新规则。
- [ ] board/group 外键和级联不删除错误实体，不破坏 R2/D1 清理状态机。
- [ ] 参数化 SQL、权限边界、审计和错误信息符合现有后端规范。

### AC-04-05 测试完成

- [ ] migration 空库/升级/约束/索引/默认种子测试。
- [ ] 显示宽度纯函数单测、超长输入和性能基线。
- [ ] 所有相关 Zod schema 的边界和 refinement 回归测试。
- [ ] Workers/Vitest 发布转换、版本冲突、批处理原子性测试。
- [ ] 前端最小接入：移除冲突 `maxlength` 的组件 spec 无回归；因不引入计数器，无用户可见的宽度计数交互，记录无需 Playwright 的理由。

## 7. 依赖、接口与阻断条件

- 依赖 T01 的规范和现状审计；如果 T01 发现的数据库/状态约束与本 PRD 冲突，必须先更新设计和 Review 结论。
- T03 的主题/页面基础不属于 T04；只复用共享 Contract 和输入组件，不把 UI 主题工作混入本任务。
- T05 消费 `boards`/`board_groups` 和回收站边界；T04 必须提供字段、FK、索引和契约说明，但不代替 T05 实现业务清理。
- 后续发现流消费 `published + deleted_at IS NULL + last_published_at DESC + id DESC + LIMIT 10` 的查询语义；NULL 排在非 NULL 之后，全部为 NULL 时按 `id DESC` 稳定排序。T04 只保证字段和索引设计，不实现公共 API。
- 若确定性 fallback 的实现/依赖、golden vectors 或 runtime 一致性无法验证，或发现与“无旧内容”前提不一致的数据，必须停在 planning 并将问题列为决策门，不得自行假设后实施；默认 board 已确定采用固定 UUID，碰撞即停。

## 8. 交付物与最终报告

规划阶段必须保留以下三份文件：

- `prd.md`：需求、约束、验收和 Review 结果。
- `design.md`：现状证据、数据模型、迁移、状态机、宽度算法、Contract、测试和风险设计。
- `implement.md`：按依赖排序的实现步骤、验证命令、回滚/停止条件和验收清单。

本轮只创建并完善规划文件。T04 必须继续保持 `planning`，不得执行 `task.py start`，不得创建子任务，不得修改业务源码、migration 或源 PRD。

## T03 正式视觉基础接入提示

- T03 已确定采用“前端真实接入、后端契约不改”：T04 不负责视觉实现，但必须保证共享主题配置/Contract 的变更能被正式 Vue 前端消费，并记录字段兼容性。
- `ThemePreference`/`EffectiveTheme`、站点 `defaultMode` 及真实表单输入的 schema 变更必须注明与 T03 的消费关系；不得让 prototype Mock 成为 Contract 来源。
- T04 还必须冻结 T03 所需的前端站点配置字段：标题/品牌（默认“来个群号”）、GitHub URL/文案、添加新群文案/入口；GitHub 默认值为 `https://github.com/brofea/laigequnhao`，添加新群默认指向现有提交弹窗。字段和默认值必须可校验、可兼容，不得要求 T03 在组件内硬编码。
- T04 交付时须提供真实 API/共享 Contract 的变更清单、前端消费路径、兼容/回归测试和交给 T03/T10 的阻塞项；不将主题、顶栏或组件样式混入本任务。
