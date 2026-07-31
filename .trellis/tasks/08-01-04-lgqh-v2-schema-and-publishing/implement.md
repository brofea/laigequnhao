# T04 实施规划：发布状态字段、字符宽度与数据库迁移

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务04.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。以下是经联合 Review 后的执行顺序和质量门；本轮不执行任何步骤，不运行 `task.py start`，不创建子任务。

## 1. 执行原则

- 先完成数据、状态入口和运行时能力的证据核对，再写 migration。
- 每一阶段产出可 Review 的小结果；遇到决策门未确认时停止，不用隐含默认值绕过。
- migration 采用新增 forward 文件；严禁编辑已有 `0001`、`0002`、`0003`。
- 所有状态、宽度和输入规则由共享模块提供，route/repository/form 不复制算法。
- 先建测试向量和失败用例，再实现最小变更。
- T04 仍只负责基础 schema/contract/domain 逻辑；板块业务、回收站清理和公共 API 留给后续任务。

## 2. 实施前置读取

开始实现前必须重新读取并记录版本：

- `docs/PRD/v2/PRD.md` 与 `docs/PRD/v2/子任务04.md`。
- T01 规划与其 Review 结论。
- `migrations/0001_initial.sql`、`0002_admin_group_management.sql`、`0003_group_mutation_token.sql`。
- `shared/contracts/group.ts`、`shared/contracts/submission.ts`、`shared/domain/group.ts`。
- `functions/_lib/repositories/group-repository.ts`、`functions/_lib/routes/admin-groups.ts`、`functions/_lib/services/submission-service.ts`。
- `tests/workers/migrations.spec.ts`、Workers setup/config 和现有 group/repository/route 测试。
- `.trellis/spec/backend/database-guidelines.md`、`.trellis/spec/backend/api-guidelines.md`，以及与共享前端输入组件相关的 spec。

若源 PRD 在 planning 期间有新改动，必须以最新版本重新执行 Review，不得基于旧摘要实施。

## 3. Phase A：现状清单与迁移前审计

### A1. 全仓库状态入口清单

使用 `rg` 搜索所有 `status` setter、`published` 字面量、group repository 调用、批量审核 helper、内部任务和 restore 流程。形成表格：入口、旧状态来源、目标状态、版本/令牌策略、是否在 D1 batch、是否会写 deleted/purge 字段、预期发布时间行为。

特别核对：

- 管理员创建是否允许直接 published。
- 管理员 PATCH 是否能从每种状态转移。
- 审核通过/驳回/下架是否分散在 route、service 或 repository 外。
- 公共投稿是否始终 pending。
- `restore()` 是否有任何调用方另外改变 status。
- 批处理/内部脚本是否绕过 repository。
- 既有 `mutation_token` 和 version 冲突返回路径。

### A2. 数据质量报告

以只读脚本或测试 fixture 统计但不修改生产数据：

- published、non-published、软删除和 purge 中各状态数量。
- 可用的历史发布字段/审计证据分布。
- `created_at`/`updated_at` 的空值、非法值、时区和排序异常。
- 标题显示宽度 >50、简介显示宽度 >1000、控制字符和异常 Unicode。
- 非法 status、孤儿关联、重复 board/group 关系（若旧数据已经存在）。

输出审计报告样例和阻断阈值。没有可信来源的数据不能在实施时临时猜测。

### A3. Phase A 质量门

- [ ] 状态入口表覆盖 route、service、repository、batch/internal path。
- [ ] 旧 schema、索引、FK、purge 状态和 mapper 证据已记录。
- [ ] 数据审计结果区分可自动回填、可用 created_at 兜底、必须人工处理三类。
- [ ] T01、T05 和后续发现流的接口冲突已列为决策门。

## 4. Phase B：评审并冻结方案

### B1. 数据模型决策

确认：

- 新 migration 文件名/编号。
- `last_published_at` 的 nullable TEXT/格式和 mapper 字段名。
- boards 的 ID、默认值、`sort_mode` CHECK、position/version 约束。
- board_groups 的 FK 行为、删除顺序和 purge 兼容方案。
- 三组索引的列顺序和查询计划。
- 默认“自定板块”固定 ID/唯一识别和删除后行为。
- 是否把 schema/backfill 拆成不同 deployment step。

### B2. 业务决策

确认：

- restore 是否保持“只恢复软删除”，还是另立批准需求实现“恢复并发布”。T04 不从现有 PRD 推导新状态语义。
- published 历史发布时间证据和 created_at fallback 的可接受性。
- 旧超限数据采用清理策略 A 或未修改字段保留策略 B。
- 后续公共发现查询对 NULL 的排序规则。

### B3. 宽度实现决策

做小型 spike，不接入生产路径：

- 验证 Node、Workers 和浏览器构建对 `Intl.Segmenter` 的支持。
- 对 grapheme、EAW、Emoji/ZWJ、空白、Tab、换行、CRLF、控制字符运行 golden vectors。
- 比较受控 fallback/dependency 的体积、许可证、Workers 兼容和一致性。
- 选择唯一算法和跨运行时测试方式。

### B4. Phase B 质量门

- [ ] 所有决策门有批准记录。
- [ ] 不存在“实现时再决定”的 migration 约束或 restore 语义。
- [ ] 宽度算法在至少三种 runtime 的向量结果一致。
- [ ] 设计评审确认不改公共 DTO、不实现 T05 业务越界。

## 5. Phase C：实现显示宽度底层能力

### C1. 纯函数与常量

在共享目录选择与项目现有分层一致的位置建立：

- `measureDisplayWidth`。
- 可选的上限校验 helper。
- 标题 50、简介 1000 的命名常量。
- 必要的类型/错误信息 helper。

函数不得依赖 DOM、window 或数据库；不能使用 `string.length` 作为业务结果。计数过程按 grapheme 分段，处理完整 Emoji 和控制规则，并在输入过长时安全停止/拒绝。

### C2. 单元测试优先

先加入测试向量：

- ASCII 49/50/51。
- 中文 25/26、简介 500/501。
- 日文、韩文和 EAW Wide/Fullwidth。
- 半角、拉丁、数字、Ambiguous。
- 单字符 Emoji、ZWJ 序列、variation selector、modifier、组合重音。
- 普通/全角空格、Tab、LF、CRLF。
- 合法文本中的控制字符与非法控制字符。
- 混合宽度和足够长的恶意输入。

每个 vector 写明预期总宽度和分段预期；禁止只断言“没有抛错”。

### C3. Phase C 质量门

- [ ] Node、Workers、浏览器测试共享同一向量。
- [ ] Emoji/ZWJ/组合字符不被拆开或重复计数。
- [ ] CRLF、Tab、控制字符有明确定义。
- [ ] 线性复杂度/超长输入基线通过。

## 6. Phase D：更新共享 Contract 和必要表单

### D1. Group Contract

将 `groupCreateSchema` 和 `groupUpdateSchema` 的标题/简介规则接入共享宽度 helper：

- 保留 trim、min、空语义和已有控制字符处理。
- 保留 tags、join methods 及其 refinement。
- 更新错误信息为显示宽度单位。
- update 继续要求 version；不要把宽度校验变成绕过并发控制的特殊路径。

### D2. Submission Contract

核对实际公共投稿 schema/导出名和 route 使用关系，将批准的标题/简介规则接入；notes/contact 的现有上限和业务校验不得被误改。

### D3. Board 基础类型

导出 `BoardSortMode`、`Board`、`BoardGroup` 基础类型/Contract。只描述数据库与共享边界，不增加 T05 的分页、筛选、管理 API DTO。

### D4. 表单集成

若当前后台/公共表单需要随共享 Contract 一起修正：

- 删除/调整与显示宽度冲突的 `maxlength`。
- 复用同一测量 helper 做计数器或最小错误提示。
- 处理 compositionstart/update/end，不对 IME 中间值进行破坏性截断。
- server Contract 始终是最终校验。

### D5. Phase D 质量门

- [ ] group create/update/submission 都覆盖新边界。
- [ ] 既有 refinement 有回归测试。
- [ ] public/admin DTO 没有意外暴露 `last_published_at`。
- [ ] 历史超限策略 A/B 已写入测试。

## 7. Phase E：新增 migration 和回填

### E1. Schema migration

按批准设计新增 forward migration：

1. 增加 `groups.last_published_at`。
2. 建立 `boards`，加入 title/is_enabled/position/sort_mode/version/created_at/updated_at 及约束。
3. 建立 `board_groups`、联合主键、FK、position CHECK。
4. 创建 `boards(position,id)`、`board_groups(board_id,position,group_id)`、`board_groups(group_id)`。
5. 以 idempotent 方式写入默认“自定板块”。

所有 SQL 使用项目约定和 prepared/安全 migration 方式；不编辑历史文件，不引入 ORM，不创建不可解释的全局 position unique。

### E2. Backfill

实现/运行经批准的回填：

- 可信历史发布时间优先。
- 只有明确发布证据时才写 published 时间。
- 没有证据的 published 使用 created_at 兜底并记审计。
- non-published 无证明保持 NULL。
- 非法/冲突时间进入阻断/人工清单，不能写 migration 执行时间。

如果 backfill 放在应用层 job，必须保证新旧代码兼容、幂等、可重试且不会把普通编辑当发布；如果放在 SQL migration，必须验证大库事务时长和可观测性。

### E3. Phase E 质量门

- [ ] 空库全量 migration 通过。
- [ ] 0001-0003 代表性旧库升级通过。
- [ ] 重复执行/重复 seed 不产生额外 default board。
- [ ] schema、CHECK、FK、索引和回填结果可查询验证。
- [ ] 失败/回滚/补偿方案已由负责人确认。

## 8. Phase F：接入发布状态和 mapper

### F1. Domain helper

加入纯 `computePublicationTransition(previousStatus, nextStatus, now)`（最终命名按代码规范）。返回明确的 `unchanged` 或新时间，不能返回隐含 undefined 造成 SQL NULL 覆盖。

测试所有允许状态组合，尤其 pending/rejected/delisted→published 和 published→published/delisted/rejected。

### F2. Row/DTO/mapper

- `GroupRow` 增加 nullable `last_published_at`。
- typed mapper 负责时间文本到内部字段的显式转换。
- admin DTO 按批准字段暴露；public DTO 默认不暴露。
- 所有 select/insert/update projection 都检查新增字段，避免 read-after-write 丢失。

### F3. Repository 入口

在 create/update 的同一原子写入中接入：

- 旧 status 读取/校验。
- next status 合法性。
- 可注入 clock。
- status、last_published_at、updated_at、version、mutation_token 的一致提交。
- 版本冲突或 batch 失败时零副作用。

核对所有直接 SQL status writer；如果发现绕过 repository 的内部路径，应改为共享 helper 或在设计中明确迁移到后续任务，不能留下第二套规则。

### F4. restore/soft delete/purge

- softDelete 不更新发布时间。
- restore 保持当前“清除 deleted_at + 更新时间 + 资源引用恢复”语义，除非独立决策批准 restore→published。
- purge 不修改 `last_published_at` 的语义、不改变 purge_state/r2_done 顺序，不让 board FK 造成资源清理中断。

### F5. Phase F 质量门

- [ ] create、update、审核、下架、再发布、批处理和内部路径清单全部复核。
- [ ] stale version/mutation token 和失败 batch 没有时间戳副作用。
- [ ] restore 的真实语义与文档一致。
- [ ] repository、mapper、DTO、查询投影没有字段遗漏。

## 9. Phase G：完整测试与回归

### G1. Workers/D1

更新 migration 版本预期并添加：

- 空库、旧库升级和重复应用。
- 表/列/索引/FK/CHECK/default seed。
- board 删除只级联关系；group 不被 board 删除。
- position/sort_mode 非法值拒绝。
- group purge 与 board_groups 边界测试。

### G2. 状态机

以固定 clock 覆盖：

- pending→published、rejected→published、delisted→published。
- published 普通编辑、重复保存、published→delisted 不更新。
- pending create、submission create、restore-only 不更新。
- 冲突、失败、重试、批处理的原子性。
- 同一次业务转换只产生一个受控时间结果。

### G3. Contract/UI

- 所有标题/简介边界和错误消息。
- tags/join methods 等原 refinement。
- 历史超限读取、无关字段编辑、目标字段编辑。
- 计数器和 IME 行为（如果修改了表单）。
- Browser/Node/Workers golden vectors。

### G4. 工程质量

按仓库实际脚本执行并记录输出，至少覆盖：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
```

若表单有真实交互变更，再运行相关 Playwright/E2E；没有则说明原因。若项目脚本名称不同，以 `package.json` 为准，不凭空添加命令。

## 10. 风险处理与停止条件

### 10.1 必须停止并回报

- 发现历史 migration 被并发修改或无法安全应用新编号。
- 无法确定 group purge 与 board_groups FK 的安全顺序。
- 无可信历史发布时间且产品未批准 created_at 兜底。
- `Intl.Segmenter` 与 fallback 在 runtime 产生不同结果且没有批准的统一方案。
- restore 需求与当前实现冲突而没有业务决策。
- 旧超限记录无法在不静默截断的情况下兼容。
- 任一状态入口仍可绕过共享规则、version 或 mutation token。
- migration/测试显示可能误删 group、资产、标签、join methods 或 R2 对象。

### 10.2 可逆/补偿策略

- 在执行生产 migration 前保留备份和审计报告。
- 新列和新表优先采用向后兼容的 additive 变更。
- backfill 可重跑且只填 NULL/符合明确条件的行，不能覆盖新产生的真实发布时间。
- 若默认 board seed 发生碰撞，阻止部署而不是插入第二个近似种子。
- 失败时使用已评审的补偿 migration/恢复备份，禁止 `git reset`、修改历史 migration 或手工删表掩盖问题。

## 11. 最终验收清单

- [ ] `task.json` 仍为 `planning`，实现前未运行 `task.py start`。
- [ ] 未创建 T04 子任务，未实现 board API/UI/首页/回收站清理。
- [ ] 源 PRD 未被修改。
- [ ] 三份规划文件互相引用一致，所有决策门、非目标和测试矩阵完整。
- [ ] migration 只新增 forward 文件，空库和现有库测试通过。
- [ ] 发布时间只在非 published→published 成功原子转换时更新。
- [ ] 字符宽度由单一共享算法计算，50/1000 边界与多 runtime 向量一致。
- [ ] Zod Contract、mapper、DTO、form 和 route 接入点有覆盖。
- [ ] 历史超限、不可信时间、版本冲突、purge/FK 边界有明确策略。
- [ ] lint、format、typecheck、unit/worker test、build 和必要 E2E 结果已记录。

## 12. 实施完成后的报告格式

完成实施后，报告必须列出：

1. 新增/修改文件和每个文件的职责。
2. 最终 migration 编号、空库/升级结果、回填数量和异常审计结果。
3. 状态入口覆盖清单和 `last_published_at` 的转换测试结果。
4. 宽度算法的 runtime 一致性、性能基线和边界向量摘要。
5. Contract/DTO/表单兼容策略，尤其是旧超限记录。
6. T05/发现流仍需消费的接口和未解决决策。
7. 所有质量命令、失败项、修复项和剩余风险。
