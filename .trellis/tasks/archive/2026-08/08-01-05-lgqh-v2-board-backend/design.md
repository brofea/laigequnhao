# T05 技术设计：板块后端服务与 API

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务05.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计阶段草案。T05 依赖 T04 的 schema 与共享 Contract；所有路径、SQL 和状态机接入在实现前必须与仓库现状对照确认。

## 1. 设计原则

本任务用正式的 Route → Service → Repository 分层承载板块领域。Route 不能承担状态或排序规则，Repository 不能返回 HTTP 语义，Service 负责领域不变量和原子操作协调。公开查询和管理查询必须有不同的 DTO projection，不能把管理 row 直接序列化给公开端。

设计的最低正确性优先级是：数据不会被错误删除；管理员并发不会静默覆盖；公开端不会泄露下架/回收站数据；小时随机跨 Worker 可复现；失败操作不会留下半批次位置或版本。

## 2. 现状证据与接入点

### 2.1 数据库

- T04 预计新增 `boards`、`board_groups` 和 `groups.last_published_at`。
- `board_groups` 以 `(board_id, group_id)` 为联合主键，并拥有按 board position 和 group_id 的索引。
- `groups` 已有 status、version、deleted_at、purge_state、mutation_token 等字段；T05 不改历史 migration。
- 位置约束和 sortMode CHECK 属于数据库底线，service 负责领域级完整集合校验。

### 2.2 现有群组状态机

`groups.status` 当前是 `pending`、`published`、`rejected`、`delisted`；回收站使用 deleted/purge 字段，不应把“下架”误判为回收站。T05 要以 repository 的真实方法和 route 调用链为准，尤其核对 `softDelete()`、`restore()`、`permanentDelete()` 和批量 mutation token。

### 2.3 管理路由

当前管理员路由实际前缀为 `/api/v1/admin`。设计不强行确定最终 board path，先通过现有 route 注册方式、认证中间件、CSRF helper、响应 wrapper 和错误 helper 定位约定。候选语义可为 `/api/v1/admin/boards`，但实现前必须验证冲突和命名。

### 2.4 公开路由

公开板块读取应放在现有公开 API v1 领域，使用公开 cache/headers 约定。候选语义为 `GET /api/v1/boards`；最终以仓库已有群组查询 route 和 typed client 注册方式为准。

### 2.5 测试基础

Workers 测试使用真实 D1 migration、真实 route/service/repository 和隔离 storage。认证/CSRF helper、固定 clock、确定性 ID 和 seed factory 应优先复用，纯函数只有宽度/哈希等小范围使用 unit test。

## 3. 目标模块

建议按当前项目目录风格拆分：

```text
shared/domain/board.ts
shared/contracts/board.ts
functions/_lib/repositories/board-repository.ts
functions/_lib/services/board-service.ts
functions/_lib/routes/admin-boards.ts
functions/_lib/routes/public-boards.ts
functions/_lib/errors/board-errors.ts
functions/_lib/adapters/stable-board-order.ts
tests/workers/boards.spec.ts
tests/workers/board-public.spec.ts
tests/workers/board-trash.spec.ts
```

实际文件可以合并/拆分，但必须保持领域错误、查询、写入和 API Contract 的职责清晰。不得为了少文件把所有 SQL、随机、HTTP 和回收站逻辑放入一个 route。

## 4. Contract 设计

### 4.1 管理 request

定义并导出：

- `boardCreateSchema`: title、isEnabled、sortMode。
- `boardUpdateSchema`: title/isEnabled/sortMode、expectedVersion。
- `boardDeleteSchema`: expectedVersion、mutationToken。
- `boardReorderSchema`: 完整 `boardIds`、每个 board 的 expectedVersion、mutationToken。
- `boardCandidateQuerySchema`: search、分页/limit、boardId。
- `boardMemberAddSchema`: groupId、expectedVersion、mutationToken。
- `boardMemberRemoveSchema`: groupId、expectedVersion、mutationToken。
- `boardMemberMoveSchema`: direction、expectedVersion、mutationToken。

每个 ID、version、数组、token 和 search 都使用项目已有类型/限制。Zod 的 refine 负责重复 ID、空数组规则、sortMode 枚举和请求体大小；service 再验证数据库当前集合，不能只靠 schema。

### 4.2 管理 response

建议：

```text
AdminBoardSummary
  id, title, isEnabled, position, sortMode, version
  memberCount, publishedMemberCount, offlineMemberCount
  createdAt, updatedAt

AdminBoardDetail
  board: AdminBoardSummary
  members: AdminBoardMember[]

AdminBoardMember
  boardId, groupId, position, createdAt
  group summary, status, version/edit marker

MutationResult
  board / boards / members as operation requires
  latest version and stable order
```

不要使用只有 `success: true` 的结果，因为 T08 需要最新 version、位置和冲突后刷新所需快照。错误 response 复用项目的统一 `{code, message, details?}` 结构，不向外泄露 SQL。

### 4.3 公开 response

公开 response 只提供：

```text
PublicBoardsResponse
  boards: PublicBoard[]

PublicBoard
  id, title, groups

PublicBoardGroup
  public group card fields only
```

不暴露 isEnabled、position、version、createdAt、updatedAt、offlineMemberCount、mutationToken、管理审计字段和完整加群方式。公开群组字段复用已有 public group DTO，避免新建不一致的 title/platform/like 语义。

## 5. Repository 设计

### 5.1 Row mapper

使用显式 `BoardRow`、`BoardGroupRow` 和 typed mapper；snake_case 到 camelCase 的转换集中在 mapper。对数据库约束和 nullable 时间做显式处理，不能让 SQL row 直接流到 route。

### 5.2 读取方法

至少需要：

- `findBoardById`。
- `listBoardsByPosition`，管理包含关闭板块。
- `listEnabledBoardsByPosition`，公开只读。
- `getMaxBoardPosition`。
- `getBoardsByIds`。
- `listMembersByBoardId`，管理用人工顺序。
- `findBoardMember`。
- `findAdjacentMembers`，由数据库当前 position 决定。
- `listBoardIdsByGroupId`，回收站用。
- `listPublicBoardGroups`，批量返回 status/purge/board fields。
- `listCandidateGroups`，分页/限制且排除当前 board 成员。
- 状态计数/批量汇总方法，避免每个 board 一个 COUNT。

### 5.3 写入方法

至少需要：

- create board at computed append position。
- update board where id and version。
- delete board and associated relation with position compression。
- atomic board reorder。
- add relation after current state check。
- delete relation and compress trailing positions。
- swap adjacent relation positions。
- remove all relations by group and compress every affected board。
- update board version/timestamp in the same batch。

每个写方法返回影响行数或 typed result；影响行数为零要让 service 区分 not found、version conflict 或 token replay。原始数据库错误不直接作为 API response。

### 5.4 事务与 D1 batch

D1 不提供传统长事务语义时，使用项目现有 batch/conditional update 方式。多行操作必须：

1. 读取当前集合和 version。
2. 在 service 计算完整变更。
3. 生成所有 prepared statements。
4. 用一个 batch 提交。
5. 验证条件更新结果。

若现有 mutation token 表/模式需要先 claim token，必须把 token claim、业务更新和 token 结果纳入同一已验证模式；不能先修改关系再异步标记 token。对 D1 能力不支持的原子组合，必须报告阻断而不是假装原子。

## 6. Service 设计

### 6.1 管理方法

```text
listAdminBoards
getAdminBoard
createBoard
updateBoard
deleteBoard
reorderBoards
listBoardMembers
searchBoardCandidates
addBoardMember
removeBoardMember
moveBoardMember
```

方法输入是已解析的 typed input，但 service 仍检查 title/状态/版本/集合和当前数据库行。输出是领域对象或明确 DTO，不是 D1 row。

### 6.2 Board CRUD

创建流程：读取最大 position → 计算 append → 校验 title/sortMode → 生成 board/version/time → insert。若没有板块 position=0。不能让客户端注入 position，也不对 title 加未批准的全局 unique。

更新流程：读取 current → 检查 expectedVersion → 允许 title/isEnabled/sortMode → 不改成员 position → version+1/updatedAt → 条件更新。关闭仅影响公开过滤，成员和管理能力保留。

删除流程：检查 version/token → 取受影响后续 board → 删除 board relation → 删除 board → 批量压缩其余位置 → 递增受影响板块版本（按冻结规则）→ 返回新序列。默认和最后一个 board 不特殊重建。

### 6.3 完整重排

service 先读取当前 board 集合，验证请求集合与数据库集合相同（无重复、遗漏、未知），校验每个 expectedVersion，计算 `id -> contiguous position`。只更新实际变化行或按设计统一更新，保证同一批次不出现重复位置。任一版本不符立即不提交，返回最新顺序和冲突信息。

### 6.4 成员操作

添加允许 board 启用/关闭、group published/delisted；禁止 group deleted/trash/pending 或其他未批准状态。插入位置为当前最大+1；联合主键冲突转为 `BOARD_MEMBER_EXISTS`，不能 500。

移除只删除关联并压缩后续位置。上移/下移在 service 读取数据库当前 ordered members，计算相邻行并交换；第一/最后边界不产生 version 递增。所有操作带板块 expectedVersion，并由 repository 一次批量提交。

## 7. 公共排序设计

### 7.1 手动模式

管理和公开都先按真实 position，公开：

- `manual_asc`: position ASC, groupId ASC。
- `manual_desc`: position DESC, groupId DESC/稳定约定。

切换 sortMode 不改存储位置，随机结束后手动位置仍可恢复。

### 7.2 小时槽位

站点时区必须来自项目配置，而不是 Worker 本地时区、浏览器时区或请求 IP。实现一个可注入的 `getSiteHourSlot(now, siteTimeZone)`：输出稳定、可序列化的年月日小时，例如 `YYYY-MM-DDTHH`。测试覆盖 UTC 与站点日期/小时不同的边界。

### 7.3 确定性哈希

实现或复用跨 runtime 确定哈希：

```text
seed = boardId + separator + hourSlot + separator + groupId
key = stableHash(seed)
sort by key ASC, groupId ASC
```

哈希不得是 `Math.random()`、加密认证 token 或 Worker 进程状态。稳定次排序保证碰撞和相同 key 时结果一致。hash utility 需要固定向量测试，避免 Node/Workers 类型转换差异。

### 7.4 成员变化

每次公开请求按当前 published 集合计算。下架/回收站成员当场过滤；重新发布当场加入；新成员当场参与当前小时的 hash。随机函数不写 DB，不修改 position/version/updatedAt。

## 8. 公开查询与性能

### 8.1 批量查询

优先一次 enabled board 查询 + 一次批量 board-group/group join 查询，service 在内存按 boardId 分组。若 D1 SQL 需要分批，按受控 batch 处理并记录最大请求量，不使用逐 board/逐 member 的嵌套数据库请求。

查询必须在 SQL/service 层过滤 status=published、deleted/purge 不可见，只选择公共 card 必要字段。不把 offline 数量、版本或完整 join methods 放进 public projection。

### 8.2 空集合

查询结果应先建立 enabled board 列表，再为每个 board 填 `groups: []`，所以只含下架成员和无成员 board 都保留。无 enabled board 返回空数组；不由读请求 seed default board。

### 8.3 缓存

T05 默认不强制缓存；如果沿用公开 API cache，必须采用短 TTL/明确失效，不能跨越下一个 site hour，且管理禁用、群组下架和回收站变化不能被长缓存掩盖。管理接口禁止公共缓存。

## 9. 回收站状态机接入

### 9.1 入口定位

实施前通过 `rg` 和 route/service/repository 阅读定位真实 trash transition，记录：群组 current version、mutation token、soft-delete 字段、purge 状态、R2 资源收集和 batch 顺序。不能凭 T04 摘要猜入口。

### 9.2 原子流程

目标流程：

```text
validate group current state/version/token
read affected board ids and ordered members
compute compressed positions and board version changes
update group into trash state
delete all board_groups for group
update each affected board's positions/version/updated_at
commit one project-approved atomic batch
```

如果项目的 D1 batch 不能表达上述条件更新，必须采用现有事务/conditional pattern 或报告阻断。不能把 group 状态先成功再后台清理关系。

### 9.3 恢复与永久删除

restore 流程不重插旧 relation；公开查询本身不会显示恢复前不存在的关联。permanent delete 在异常孤立 relation 时使用 FK/防御性删除，但不得在 R2 收集前破坏 group/purge 状态。将板块清理对接在正确阶段，避免资源引用计数或 purge_attempts 错误。

## 10. 认证、CSRF 与错误

- 管理读取/写入套用现有管理员 session middleware。
- 管理写入套用现有 CSRF double-submit middleware；GET 不能用作绕过写防护的变体。
- Service error 用稳定 code：NOT_FOUND、VERSION_CONFLICT、MEMBER_EXISTS、MEMBER_NOT_FOUND、INVALID_GROUP_STATE、MOVE_BOUNDARY、INVALID_REORDER_SET、TOKEN_REPLAY、INTEGRITY_FAILURE。
- Route 把错误映射为现有 HTTP wrapper；401、403、404、409、422 等保持项目一致。
- 公开端只返回可见的 generic error，不暴露下架成员、内部 board/version、SQL/table。

## 11. 版本与 mutation token

板块 version 是配置/成员顺序的乐观并发保护。成员变化也必须让 board version 变化。批量重排、删除压缩、移动、回收站清理使用 mutation token；普通标题更新至少 version，是否 token 由现有模式决定。令牌重复请求只能返回原结果或明确 replay，不得第二次递增 version。

## 12. 设计测试矩阵

### 12.1 CRUD

- 默认 board、空 board、未启用可见、创建 append、同名、标题/排序模式非法。
- update title/enabled/sortMode/version，冲突无变化。
- delete 普通/默认/最后一个，关系清理和位置压缩，失败 rollback。
- list metadata/计数/稳定排序。

### 12.2 Reorder

- swap、reverse、单 board、zero board。
- duplicate/missing/unknown/extra IDs。
- 任意 expected version 冲突全回滚。
- token replay、数据库中途失败、位置连续。

### 12.3 Members

- enabled/disabled board、published/delisted group、trash/pending reject。
- multiple boards allowed、same board duplicate reject。
- append/empty position、remove each boundary、up/down each boundary。
- stale neighbor ignored、position compression、board version。

### 12.4 Public/random

- enabled only、published only、empty/zero board、multiple appearance。
- no admin fields/sensitive join methods/offline details。
- manual asc/desc fixed vectors。
- same hour same order across refresh/Worker; site timezone boundary; next hour; membership changes; no DB mutation; hash collision.

### 12.5 Trash/security/performance

- single/multiple board trash removal, compression, version, atomic failure, restore no reattach, permanent-delete regression。
- auth/session, CSRF cookie/header mismatch, typed input failures, public no auth。
- no N+1, indexed member/group lookup, candidate cap, response projection。

## 13. 决策门

实现前必须冻结：

1. 最终 route path 和 API version。
2. 不存在成员移除是 404 还是幂等成功。
3. 板块重排中只变更板块 version 还是所有集合统一递增。
4. 默认 board 的管理计数定义及 deleted/trash 异常行处理。
5. 站点时区配置的真实来源和 DST 行为。
6. 稳定 hash 具体实现、编码和碰撞测试向量。
7. 回收站现有 batch 能否同时压缩多板块，或需要总任务批准的前向修复。
8. 公开点赞状态是否由现有设备 ID 机制附加，不能在 board API 重造匿名身份。

未解决的 schema/FK、原子性、公开泄露或状态机问题必须阻止实现。

## 14. 完成映射

- PRD R05-01–04 → domain types、mapper、version/position tests。
- R05-05–08 → admin CRUD/reorder routes、service、D1 integration。
- R05-09–11 → member candidate/add/remove/move。
- R05-12–16 → public query、projection、stable ordering、hour slot/hash。
- R05-17–19 → trash/restore/permanent-delete integration。
- AC-05-06 → Workers Vitest、auth/CSRF、query/performance and regression evidence。

任何实现报告都必须能从测试结果反向定位到上述需求和调用链，不以“接口能返回 200”替代数据一致性验收。

## T03 接入提示

板块后端设计必须提供正式前端可消费的 API/Contract、认证边界、错误 Envelope、公开过滤和状态冲突语义。T03 只提供视觉基础；T05 不复制原型数据，不把 UI 状态或主题逻辑下沉到服务端，并在交接中列出 T07/T08/T10 的真实数据流验证入口。

T05 不新增或替代站点标题、品牌、GitHub、添加新群等前端配置；板块 UI 通过 T03/T04 的配置消费这些值，板块服务只提供业务数据和状态 Contract。
