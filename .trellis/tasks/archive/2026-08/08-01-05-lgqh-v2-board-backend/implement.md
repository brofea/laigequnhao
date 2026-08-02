# T05 实施规划：板块后端服务与 API

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务05.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。实施顺序供后续批准后执行；本轮不得运行 `task.py start`，不得改业务源码。

## 1. 总体顺序

依赖顺序是：T04 验收 → 现状审计 → Contract/错误 → repository 读取 → repository 原子写入 → service → 稳定排序 → 管理 route → 公开 route → 回收站接入 → Workers Vitest → 全量回归。每个阶段必须通过质量门后才能进入下一阶段。

## 2. Phase 0：恢复上下文与前置核对

实施当天重新读取：

- `docs/PRD/v2/PRD.md` 与 `docs/PRD/v2/子任务05.md`。
- T01、T04 的 `prd.md`、`design.md`、`implement.md`。
- `migrations/0001_initial.sql` 至 T04 最终 migration。
- `shared/contracts/group.ts`、现有 domain/errors/API helpers。
- 当前 admin route、认证、CSRF、mutation token、version conflict 实现。
- `group-repository` 的 soft delete/restore/permanent delete 和 R2/D1 purge。
- Workers migration setup、fixtures、现有 group 状态转换测试。

确认 T04 `task.json` 已是允许依赖的状态，且 boards/board_groups 实际列名、FK、索引和 sortMode 与规划一致。若不一致，停止并回报，不调整 T04 migration。

## 3. Phase 1：代码与调用链清单

### 1.1 路由与中间件

- 搜索 `/api/v1/admin` 注册方式、公开 API 注册方式。
- 记录管理员 session middleware 的调用顺序。
- 记录 CSRF double-submit 的 cookie/header 名称和失败响应。
- 记录统一 request parsing、response wrapper、error mapping。
- 确认 public cache headers 和 CORS/Origin 策略。

### 1.2 状态与清理

- 搜索所有 `published`、`delisted`、`deleted_at`、`purge_state` 写入。
- 确认 trash transition 的唯一正式入口。
- 确认 version/mutation token 生成、claim、重放语义。
- 确认永久删除四阶段中资源收集、R2 清理和 D1 删除顺序。
- 记录 board 清理应插入的批次位置。

### 1.3 Phase 1 质量门

- [ ] 实际 API 前缀和中间件顺序有文件证据。
- [ ] 所有 status/trash writer 有清单。
- [ ] T04 字段/索引/状态机与 T05 设计一致。
- [ ] 不存在需要临时修改数据库结构的未决项。

## 4. Phase 2：冻结 Contract 与领域错误

### 2.1 Shared Contract

创建或更新 board contract，逐项实现并测试：

1. `BoardSortMode` 复用 T04，不复制枚举。
2. board create/update/delete/reorder request。
3. candidate/member add/remove/move request。
4. admin summary/detail/member response。
5. public board/group response。
6. error code/details。
7. typed client exports。

schema 不能承载数据库状态的全部业务判断；它只验证类型、格式、数组完整性初步约束，service 仍要重新读当前数据库集合和状态。

### 2.2 领域错误

建立稳定 code 和内部结构：

- `BOARD_NOT_FOUND`
- `GROUP_NOT_FOUND`
- `BOARD_MEMBER_NOT_FOUND`
- `BOARD_MEMBER_EXISTS`
- `GROUP_STATE_NOT_ALLOWED`
- `BOARD_VERSION_CONFLICT`
- `INVALID_REORDER_SET`
- `MOVE_AT_BOUNDARY`
- `MUTATION_TOKEN_REPLAY`
- `DATA_INTEGRITY_FAILURE`

为每个错误确定 HTTP 映射、是否允许客户端刷新重试和是否允许公开端看到通用消息。

### 2.3 Phase 2 质量门

- [ ] Contract 无 `any` 和重复 DTO。
- [ ] 管理与公开 DTO 完全分离。
- [ ] 既有认证/CSRF/version/error 语义未被覆盖。
- [ ] T07/T08 可引用明确的导出名和冲突结构。

## 5. Phase 3：实现 row mapper 与读取 repository

### 3.1 Row 与 mapper

实现 typed `BoardRow`、`BoardGroupRow` 和 group public summary row。显式处理 nullable/boolean/integer/time，禁止 route 直接读取 row。对 COUNT、状态和 deleted/purge 字段定义稳定映射。

### 3.2 板块读取

实现：

- `findBoardById`。
- `listBoardsByPosition`，包括 disabled。
- `listEnabledBoardsByPosition`。
- `getMaxBoardPosition`。
- `getBoardsByIds`。
- 批量计数/摘要查询。

### 3.3 成员/候选读取

实现：

- 按 board 的全部成员人工排序。
- 相邻成员读取。
- board/group relation 是否存在。
- group 关联的所有 board。
- 公开 board-group 批量 join。
- 候选群组搜索、分页/limit、当前 board 排除。

候选搜索不能返回所有群组；公开 join 必须在 SQL/service 过滤 published、未删除、未 purge。

### 3.4 Phase 3 质量门

- [ ] SQL 全部参数化，row mapper 有单测。
- [ ] 管理/公开查询投影分离。
- [ ] 成员和候选查询使用 T04 索引。
- [ ] public 查询可以一次/受控批量加载，不逐成员 N+1。

## 6. Phase 4：实现原子写 repository

### 4.1 创建与更新 board

实现 append position、insert、conditional update。更新条件包含 board id + expected version；成功递增 version、更新 updated_at；影响行数 0 转为 conflict/not found 的可识别结果。

### 4.2 删除与压缩

读取受影响 board 集合，生成 delete board、delete relations、压缩后续 positions、更新 board version/timestamps 的 batch。默认/最后一个 board 不分叉到自动 seed 路径。

### 4.3 完整重排

在 service 已校验集合后，repository 接收受控 `id -> position` 变更和 version 条件。确保 batch 不形成临时 UNIQUE 冲突；若 SQLite 更新顺序需要两阶段临时值，使用经过评审的安全策略，不修改 schema。

### 4.4 成员写入

实现 append、relation delete+compression、相邻交换、按 group 删除所有 relation。每个 affected board 的 version/updated_at 处理都写入同一批次。

### 4.5 Mutation token

复用项目现有一次性 token helper。若 T05 需要扩展 helper，先添加通用测试：成功一次、重放一次、失败重试、并发 claim。不能创建仅板块使用且语义不同的 token 系统。

### 4.6 Phase 4 质量门

- [ ] 所有多行写入有原子/条件语义证据。
- [ ] 版本冲突无任何部分变更。
- [ ] 位置不重复、压缩后连续。
- [ ] FK/联合主键错误能转为领域错误。
- [ ] 重放 token 不二次更新。

## 7. Phase 5：实现 Board Service

### 5.1 CRUD

实现 `listAdminBoards`、`getAdminBoard`、`createBoard`、`updateBoard`、`deleteBoard`。service 负责：

- title/状态/sortMode 规则。
- append position。
- expectedVersion。
- 默认/最后 board 可删除。
- 未启用 board 仍可编辑。
- 返回最新 summary/detail。

### 5.2 Reorder

实现完整集合验证：无重复、无未知、无遗漏、版本齐全。读取数据库当前集合而不是相信客户端。计算连续位置，调用 atomic repository。冲突返回最新顺序，失败不更新。

### 5.3 Members

实现候选状态 allowlist（published/delisted），拒绝 trash/pending/其他未批准；添加追加；移除压缩；上/下移动读取实时邻居；边界不递增 version；所有操作返回最新 board/member 状态。

### 5.4 Phase 5 质量门

- [ ] service 不直接执行 SQL。
- [ ] 每个写 method 的 version/token/error 规则有测试。
- [ ] group 复用多个 board、同 board duplicate、down/published/trash 状态覆盖。
- [ ] 失败返回不带成功副作用。

## 8. Phase 6：稳定排序与公开 Service

### 6.1 时区 Adapter

实现可注入 `getSiteHourSlot`，从项目配置读取站点时区。测试 DST、UTC 与站点日期不同、整点前后。禁止浏览器/Worker 本地时区。

### 6.2 Stable hash

实现固定编码的跨 runtime hash，加入 boardId/hourSlot/groupId，按 hash + groupId 排序。添加固定 vectors 和 collision injection test。绝不使用 `Math.random()`、SQL RANDOM 或实例状态。

### 6.3 Public service

实现 `listPublicBoards`：批量读取 enabled boards 与 published public group rows，按 board 分组，依据 sortMode 排序，保留空板块。公开响应 mapper 只投影卡片需要字段，默认不附完整 join methods。

### 6.4 Phase 6 质量门

- [ ] manual asc/desc 不改变 DB position。
- [ ] hourly 同小时跨调用/Worker 一致。
- [ ] 下一小时按站点时区变化。
- [ ] 成员即时变化可见。
- [ ] public 不含 disabled/offline/trash/admin fields。
- [ ] public 读取零板块返回空列表。

## 9. Phase 7：管理与公开 Route

### 7.1 Admin route

按实际 route conventions 注册列表、详情、CRUD、reorder、members、candidates、add/remove/move。每条 route 顺序：认证 → CSRF（写）→ body/query parsing → service → error mapper → typed response。不要在 route 里组合多个 service 写入。

### 7.2 Public route

注册只读 board route，套公开 v1、cache/CORS/Origin 约定。不要复用 admin auth，也不要返回 admin schema。公开错误统一且不能透露不可见 group。

### 7.3 Phase 7 质量门

- [ ] 真实路径和方法已通过现有 router 测试。
- [ ] 每条管理写 route 有 auth/CSRF negative test。
- [ ] response 可通过共享 schema parse。
- [ ] public route 不泄露管理字段。

## 10. Phase 8：接入回收站与永久删除

### 8.1 定位真实流程

再次读取群组 repository/service/route 的 trash transition，确认 status/version/token/purge 字段变更和 batch。记录接入点，不要从 UI 触发二次清理。

### 8.2 原子清理

实现/扩展现有正式 batch：验证 group → 设置 trash → 删除所有 `board_groups` → 对每个 affected board 压缩 position/更新 version → 提交。无法保证原子时停止。

### 8.3 Recovery/permanent

验证 restore 不插入旧 relation；permanent delete 能安全面对异常 relation，且 resource collection/R2/D1 四阶段不变。新代码必须有回归测试证明 board 清理不影响 assets/ref_count/purge_attempts。

### 8.4 Phase 8 质量门

- [ ] 单 board、多 board、下架 group trash 都清理。
- [ ] 原子失败不改 group、relation、board version。
- [ ] 恢复不自动关联。
- [ ] 永久删除和现有 R2 测试通过。

## 11. Phase 9：Workers Vitest 矩阵

### 9.1 CRUD

覆盖默认 board、创建 enabled/disabled、位置 append、同名、非法 title/sortMode、更新字段/version、冲突、删除普通/default/last、零板块、关系清理、位置压缩。

### 9.2 Reorder

覆盖 swap、reverse、single/zero、duplicate/unknown/missing/extra IDs、任一 version conflict、token replay、中途 D1 failure、最终连续位置和 version。

### 9.3 Members

覆盖 enabled/disabled board、published/delisted allow、trash/pending reject、multiple board、duplicate、append、remove each position、up/down boundary、concurrent neighbor、rollback。

### 9.4 Public

覆盖 enabled only、published only、disabled/offline/trash hidden、empty board、zero board、multi-board group、manual asc/desc、DTO leakage、N+1 evidence。

### 9.5 Hourly random

覆盖固定向量、同小时刷新、不同 isolate/Worker、站点时区、DST/next hour、membership changes、hash collision、数据库不变、缓存边界（若有）。

### 9.6 Security/Trash

覆盖无会话、过期会话、CSRF cookie/header 缺失/不匹配、合法写入、public anonymous、single/multiple board trash、failure rollback、restore、permanent delete、version conflict。

## 12. Phase 10：工程验证

按 `package.json` 实际脚本执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
```

如果只涉及后端，记录无需 Playwright 的理由；若 route Contract 影响 T07/T08 client，至少执行对应 API/类型测试。运行查询性能/coverage 脚本若项目存在，记录结果。失败项必须归类为代码、fixture、migration、环境或 flaky。

## 13. 停止条件与回滚

立即停止并回报：

- T04 schema/FK/index 不符合，需新 migration。
- D1 无法保证回收站与关联清理原子一致。
- 发现管理 route 绕过统一认证或 CSRF，且修复超出 T05。
- 公开查询可能返回下架/回收站数据。
- 稳定 hash 在 Node/Workers 不一致。
- position 更新会触发约束冲突或部分写入。
- 永久删除资源状态机可能被板块 FK 破坏。

回滚优先使用未部署的代码回退和经批准的前向补偿；不得编辑历史 migration、删除生产数据或使用 destructive git 操作掩盖问题。

## 14. 最终检查清单

- [ ] T05 仍为 planning，未运行 start。
- [ ] 未创建 T05 子任务。
- [ ] 未修改公开/管理 UI、主题、分页或未批准数据库结构。
- [ ] API route、Contract、错误、repository、service 文档齐全。
- [ ] 管理 CRUD、reorder、members、候选查询完成且原子。
- [ ] public filter、empty/zero、DTO projection、N+1 证据齐全。
- [ ] stable random 使用站点小时、固定 hash、跨 Worker 一致且不写 DB。
- [ ] trash/restore/permanent delete 集成和位置/version 规则齐全。
- [ ] auth/CSRF/Zod/version/token 覆盖所有管理写入。
- [ ] Workers Vitest 和现有后端回归通过。

## 15. 实施完成报告格式

1. API 实际路径、方法和 Contract 导出。
2. Repository/Service 文件和原子批次说明。
3. 版本/突变令牌/错误映射。
4. 手动排序、时区小时槽位、hash 和缓存。
5. 公开过滤、空板块、DTO 和查询次数。
6. 回收站、恢复、永久删除接入点和失败语义。
7. 测试命令、场景数量、性能证据和失败项。
8. 给 T07/T08 的集成说明和给 T10 的风险列表。

## 16. 逐项场景清单（执行时不得合并为一个笼统用例）

### 16.1 板块基础场景

- [ ] 空库应用 T04 migration 后列表可读。
- [ ] 默认板块在管理列表中出现。
- [ ] 默认板块删除后列表为空且不会被 GET 重建。
- [ ] 创建第一个普通板块位置为 0。
- [ ] 创建第二个普通板块位置为 1。
- [ ] 创建 disabled board 仍返回管理列表。
- [ ] disabled board 仍可更新标题和成员。
- [ ] 相同标题的两个 board 都能保存。
- [ ] title trim 后空字符串被拒绝。
- [ ] sortMode 非枚举被拒绝。
- [ ] position 不可由客户端注入。
- [ ] 删除中间 board 后后续 position 连续。
- [ ] 删除最后 board 后没有 seed side effect。

### 16.2 板块并发场景

- [ ] 两个管理员编辑同一 title 只有一个成功。
- [ ] 编辑冲突返回最新 board 或标准 conflict details。
- [ ] 一个管理员关闭 board，另一个用旧 version 添加成员时得到可恢复冲突。
- [ ] 删除与编辑竞争时不更新已删除 board。
- [ ] reorder 与普通 board update 竞争时不会静默覆盖。
- [ ] 同一 mutation token 并发提交只有一个业务结果。
- [ ] 失败重试遵循项目 token 语义，不重复压缩位置。

### 16.3 成员状态场景

- [ ] published group 可加入 enabled board。
- [ ] published group 可加入 disabled board。
- [ ] delisted group 可加入 enabled board。
- [ ] delisted group 可加入 disabled board。
- [ ] pending group 按批准的 allowlist 被拒绝。
- [ ] rejected group 按批准的 allowlist 被拒绝。
- [ ] trash/deleted group 被拒绝。
- [ ] 不存在 group 返回稳定 not-found。
- [ ] 一个 group 加入两个 board 均成功。
- [ ] 同一个 board 第二次添加返回 member-exists。
- [ ] duplicate 失败不递增 board version。
- [ ] 添加后 position 追加而不是按 sortMode 插入。
- [ ] 移除成员不改变 group status/version。
- [ ] 移除后中间位置压缩。
- [ ] 移除唯一成员后 board 保留且 members 为空。
- [ ] 第一项上移不产生业务变化。
- [ ] 最后一项下移不产生业务变化。
- [ ] 中间项移动只交换相邻两项。
- [ ] 移动时忽略客户端过期邻居 ID。

### 16.4 公开数据场景

- [ ] enabled board 按 position/id 返回。
- [ ] disabled board 完全不出现在 public response。
- [ ] published member 公开。
- [ ] delisted member 关联保留但 public 隐藏。
- [ ] trash member 不公开。
- [ ] 只含 delisted member 的 board 返回空 groups。
- [ ] 没有任何 enabled board 返回空数组。
- [ ] public response 不能通过 schema 解析为 admin DTO。
- [ ] public response 不含 version/position/isEnabled。
- [ ] public response 不含 offline count 和 mutation token。
- [ ] public response 不含完整二维码或敏感入群字段。
- [ ] 多 board 中相同 group 的公开投影稳定且不重复查询不必要大对象。

### 16.5 排序与时区场景

- [ ] manual_asc 用人工 position 升序。
- [ ] manual_desc 用人工 position 降序。
- [ ] 相同 position 时 groupId 次排序稳定。
- [ ] 切换 sortMode 不改 `board_groups.position`。
- [ ] hourly_random 使用 boardId、hourSlot、groupId。
- [ ] 同 hourSlot 多次请求完全一致。
- [ ] 新 Worker isolate 与旧 Worker isolate 结果一致。
- [ ] Workers Vitest 与 Node vector 结果一致。
- [ ] 站点时区整点切换触发新 slot。
- [ ] UTC 日期与站点日期不同的时刻仍按站点日期。
- [ ] DST 边界不会使用本机时区误判。
- [ ] hash collision 使用 groupId 次排序。
- [ ] 下一小时不要求每个集合必然换排列，但输入 key 必须改变。
- [ ] 新 published member 当前小时立即加入。
- [ ] 重新发布 member 当前小时立即加入。
- [ ] 下架 member 当前小时立即移除。
- [ ] 随机查询后 position/version/updatedAt 均不变。

### 16.6 回收站和资源场景

- [ ] 单 board 的 group 进入 trash 会删除关系。
- [ ] 多 board 的 group 一次清除所有关系。
- [ ] 每个 affected board 的位置正确压缩。
- [ ] 每个 affected board 的 version 规则稳定。
- [ ] trash 失败时 group 仍在原状态。
- [ ] trash 失败时所有 relation 仍在原状态。
- [ ] trash 失败时所有 affected board version 不变。
- [ ] restore 不重建旧 relation。
- [ ] permanent delete 异常旧 relation 不留下孤儿。
- [ ] board 清理不删除 group 资源或 asset。
- [ ] board 清理不跳过 R2 collect/cleanup 阶段。
- [ ] purge_attempts 和错误状态仍可审计。

### 16.7 安全与运维场景

- [ ] 未认证 admin GET 被拒绝。
- [ ] 过期会话被拒绝。
- [ ] 写入缺 CSRF cookie 被拒绝。
- [ ] 写入缺 CSRF header 被拒绝。
- [ ] CSRF cookie/header 不匹配被拒绝。
- [ ] 合法认证和 CSRF 可执行正常写入。
- [ ] public GET 无管理员会话可读取公开投影。
- [ ] invalid JSON/invalid query 返回统一 4xx。
- [ ] SQL constraint 不直接透传 SQL 文本。
- [ ] 日志不含 CSRF、session secret、完整 join secrets。
- [ ] 管理接口不使用公共缓存。
- [ ] public cache（若开启）不跨 site hour 和安全失效边界。
- [ ] candidate query 设有明确上限，超大搜索词不会返回全表。
- [ ] repository 查询使用参数化语句和可用索引。

### 16.8 最终证据包

- [ ] API contract snapshot。
- [ ] route/auth/CSRF matrix。
- [ ] repository SQL/query-plan 记录。
- [ ] service state transition table。
- [ ] position/reorder invariant 记录。
- [ ] stable hash golden vectors。
- [ ] trash atomicity test output。
- [ ] existing group/purge regression output。
- [ ] lint/typecheck/test/workers/build output。
- [ ] T07/T08 integration handoff notes。

## T03 接入检查

- [ ] route/service/repository 结果可由正式前端通过真实 API 消费，包含认证、CSRF、Contract、错误和 published-only 证据。
- [ ] 前端交接确认板块页面消费站点配置中的标题/品牌、GitHub 和添加新群入口，未在 T05 业务代码中复制硬编码。
- [ ] T07/T08/T10 的接入路径、请求/响应样例和回归命令已记录。
- [ ] 未用 prototype Mock 代替真实 API 验证，也未修改 T03 的视觉代码边界。
