# 05 板块后端服务与 API

> 执行前置规则：本任务虽已有 PRD 与三份规划，进入执行或最终批准前，仍必须完整读取 `docs/PRD/v2/子任务05.md` 原文，逐条对照 `prd.md`、`design.md`、`implement.md`，记录并修正遗漏。必须先按 `trellis-brainstorm` 规则检查代码、测试、配置、Spec 和任务历史，再与用户进行 brainstorm；每次只提出一个最高价值问题，说明决策影响、推荐方案和取舍。每次用户回答后更新规划并重新检查需求收敛；即使没有剩余疑问，也必须展示最终规划摘要并等待用户明确批准。在原文复核和用户批准完成前，不得运行 `task.py start`、进入实施或修改业务代码；源 PRD 与用户最新决定优先于规划文件。

> 状态：planning。T05 只完成后端领域、API、公开查询和回收站关联清理的规划，不授权实施；必须在后续人工 Review 通过后才可进入实现。

## 1. 任务定位与联合 Review

T05 依赖 T04 的 `boards`、`board_groups`、`BoardSortMode`、版本与显示宽度基础，交付板块 repository、service、管理 API、公开板块查询、排序规则、稳定随机和回收站关联清理。它为 T07 首页、T08 管理端板块页面和 T10 系统回归提供正式 Typed Contract。

本 PRD 已按高级产品经理、Staff Engineer、QA 负责人视角复核。复核后冻结以下事实：

1. 板块数量允许为 0；默认“自定板块”可以被普通业务删除，运行时不得自动重建。
2. 未启用板块仍可被管理员编辑和维护成员；它只从公开查询过滤。
3. 已发布和已下架群组都允许加入板块；下架时保留关联，进入回收站时才原子删除全部关联。
4. 群组从回收站恢复后不恢复旧关联，必须由管理员重新添加。
5. 同一群组可以加入多个板块，但同一群组不能在同一板块重复加入；成员数量没有产品硬上限。
6. `manual_asc`、`manual_desc`、`hourly_random` 是唯一排序模式；随机排序不写数据库、不运行定时任务、不依赖单个 Worker 内存。
7. 实际管理员 API 前缀要以代码为准，目前仓库证据是 `/api/v1/admin`，不能机械照抄源 PRD 示例路径。
8. 管理端写入必须沿用管理员认证、CSRF、Zod、version、mutation token 和统一错误结构；route 不直接拼接多步 SQL。
9. T04 已定义关系表和级联边界；若发现表结构/FK 不足，必须回到总任务评审，不得在 T05 偷加 migration。

## 2. 用户价值

- 管理员可以安全维护板块、成员和人工顺序，并在并发编辑时获得可恢复的冲突反馈。
- 公开端可以获取启用板块、空板块和当前已发布成员，且不会泄露下架、回收站或内部管理数据。
- 同一小时内板块随机顺序稳定，刷新、跨 Worker 和缓存行为可预测；小时切换后自然形成新顺序。
- 群组下架、回收站、恢复和永久删除与板块关系保持一致，避免孤立数据和“已删除内容仍公开”。

## 3. 范围

### 3.1 必须交付

- 板块 repository、成员 repository、service 和领域错误。
- 管理端板块列表、详情、创建、更新、删除、批量重排。
- 管理端成员列表、候选群组搜索、添加、移除、上移、下移。
- 板块启用/关闭和内部排序模式更新。
- 公开启用板块查询、已发布成员过滤、空板块和零板块。
- `manual_asc`、`manual_desc`、`hourly_random` 的服务端排序。
- 站点时区小时槽位、确定性哈希和稳定次排序。
- CSRF、管理员认证、Zod、version、mutation token、领域错误映射。
- 群组进入回收站时原子删除全部板块关系、位置压缩和受影响板块版本处理。
- 永久删除防御性兼容，不破坏已有 R2/D1 四阶段状态机。
- Workers Vitest 集成测试、查询性能/数据一致性/安全回归。

### 3.2 明确不交付

- 管理端板块页面、拖拽 UI、固定高度成员表；属于 T08。
- 公开首页、板块 Carousel、群组卡片和详情弹窗；属于 T06/T07。
- 管理端群组页码分页和响应式表格；属于 T09。
- 主题、设计 Token、视觉回归。
- 新数据库 migration 或未获批准的字段/约束。
- 每小时数据库写入任务、`Math.random()`、`ORDER BY RANDOM()` 或前端随机。
- 修改群组下架时的关联保留规则、恢复时自动恢复规则或永久删除阶段含义。

## 4. 前置条件与阻断

开始实施前须确认 T04 已完成：

- `boards` 与 `board_groups` 存在且字段、主键、外键、索引和 CHECK 通过。
- `BoardSortMode`、board/group relation 类型和统一错误/显示宽度基础已冻结。
- `last_published_at`、真实群组状态枚举、回收站和永久删除调用链已经审计。
- 空库/旧库 migration 和默认板块幂等测试通过。

若 T04 未完成，或者发现 `group_id` FK 会破坏 purge、position 无法安全压缩、状态枚举与本任务冲突，T05 必须保持 planning 并报告阻断，不得通过 route 层绕过。

## 5. 分层与领域边界

### 5.1 Route

Route 只负责请求读取、认证、CSRF、共享 Zod 解析、service 调用和统一 HTTP 错误映射。禁止直接执行 SQL、计算位置、判断状态、实现随机或拼接多步事务。

### 5.2 Service

Service 负责板块/成员领域规则、状态过滤、版本、原子操作协调、排序、随机、公开投影、回收站清理和领域错误。所有多步骤写入必须由 service 调用 repository 的原子能力完成。

### 5.3 Repository

Repository 负责参数化 D1 查询、批量写入、typed row mapper、稳定排序、位置重排、关联检查和约束错误转换。禁止输出 HTTP 状态码或公开文案。

### 5.4 Shared Contract

管理 request/response、公开 response、错误结构和 typed client 必须来自共享 Contract。禁止 T07/T08 通过 `any` 或手写重复 DTO 接入。

## 6. 领域模型与不变量

### R05-01 板块字段

板块至少包含 id、title、isEnabled、position、sortMode、version、createdAt、updatedAt。管理列表按 `position ASC, id ASC`，位置非负，排序模式只能为 `manual_asc`、`manual_desc`、`hourly_random`。

### R05-02 成员关系

关系至少包含 boardId、groupId、position、createdAt，联合主键禁止同板块重复群组。同一群组可加入多个板块；成员没有硬上限；管理成员按人工 `position ASC, groupId ASC`，不因公开 sortMode 改变。

### R05-03 位置

新板块、新成员追加到最大位置+1；空集合从 0 开始。删除后压缩受影响后续位置。完整重排、成员移动和回收站清理必须在原子操作中保持连续/确定的位置规范。

### R05-04 版本

标题、启用、关闭、sortMode、成员增删移动、板块位置变化和回收站清理都会让相应板块 version 按设计递增。只读、校验失败、冲突和无实际变化的边界动作不递增。任何 stale version 都不能部分成功。

## 7. 管理 API 需求

确切路径必须从现有 `/api/v1/admin` 路由规范冻结；语义至少覆盖：

| 能力 | 方法语义 | 规则 |
| --- | --- | --- |
| 板块列表 | GET | 全部板块，含未启用，位置稳定 |
| 板块详情 | GET | 板块与成员，管理投影 |
| 创建 | POST | 服务端决定位置，支持启用和 sortMode |
| 更新 | PATCH | title/isEnabled/sortMode + expectedVersion |
| 删除 | DELETE | expectedVersion + mutation token，清理关系并压缩 |
| 板块重排 | POST/PATCH | 完整 ID 集合、版本集合、一次性令牌 |
| 成员列表 | GET | 全部成员，不分页，人工位置排序 |
| 候选搜索 | GET | 分页/限制结果，排除回收站和已加入 |
| 添加成员 | POST | 允许 published/delisted，拒绝非法状态 |
| 移除成员 | DELETE | 只删关系，位置压缩 |
| 移动成员 | POST | up/down，按数据库当前邻居原子交换 |

管理 DTO 至少要让前端得到 id、title、enabled、position、sortMode、version、成员数量、published/offline 计数和时间；详情成员需含群组摘要和状态。不得只返回 `{success:true}`。

## 8. 创建、更新、删除与重排

### R05-05 创建

- title 经 trim、非空、控制字符和 T04 显示宽度 Contract 校验。
- sortMode 只能是三种已冻结值。
- isEnabled 可为 true/false；默认值遵循 T04 Contract。
- position 由服务端追加；客户端不能任意插入位置。
- 同名板块目前允许，不得擅自加全局唯一。
- 成功返回新板块和 version；无认证/CSRF/非法输入都不得写入。

### R05-06 更新

- 可修改 title、isEnabled、sortMode；位置走专用重排接口。
- 关闭板块不删除成员，管理员仍可编辑；公开接口只过滤。
- sortMode 切换只改变公开读取顺序，不改 `board_groups.position`。
- stale version 返回 409/项目既有冲突结构，数据完全不变。

### R05-07 删除

- 允许删除普通、默认和最后一个板块，结果可以是零板块。
- 删除板块只删关系和板块本身，不删群组、图片、加群方式或 R2 对象。
- 后续位置压缩和版本处理与删除同一原子批次。
- 版本冲突或令牌重放不得删任何行。

### R05-08 板块完整重排

- 接收完整、无重复、无遗漏、无未知 ID 的当前集合。
- 所有 expectedVersions 必须齐全且匹配。
- 任意一项冲突导致整个批次失败，不产生部分位置/版本更新。
- 位置最终连续、次排序稳定；仅变化的板块递增或按设计明确统一递增。
- 重复 mutation token 不重复执行。

## 9. 成员管理需求

### R05-09 候选与添加

- 候选查询不可一次返回全部群组，须限制/分页，排除回收站/永久删除。
- 已加入可排除或返回 `alreadyMember`，最终添加接口仍需防重复。
- 允许向启用或未启用板块添加 published/delisted 群组。
- 拒绝回收站、不存在、pending/其他未批准状态。
- 新成员按标准人工位置追加，与公开 sortMode 无关。
- 成功递增板块 version/updatedAt；冲突不插入。

### R05-10 移除

- 只删除关系，不删除群组、不改群组状态、不改资源。
- 后续位置压缩、板块 version/updatedAt 与删除原子完成。
- 不存在成员的 404 或幂等语义必须在 design 中冻结，不得随接口随机变化。

### R05-11 上移/下移

- 上移/下移只依赖数据库当前人工顺序，不能信任客户端旧邻居 ID。
- 第一项不能继续上移，最后一项不能继续下移；边界不产生无意义 version。
- 中间成员与相邻成员原子交换位置；失败时位置和 version 全部不变。
- 在三种 sortMode 下都修改同一人工位置，便于切回手动模式。

## 10. 公开板块查询

### R05-12 公开过滤

公开只返回 `is_enabled = true` 的板块，按 `position ASC, id ASC`。每个板块只返回当前 `published` 且未进入回收站/删除状态的群组。下架成员保留关系但完全从公开 DTO 消失。

### R05-13 空和零板块

启用但没有公开成员的板块仍返回 `groups: []`；只有下架成员也算空板块。零启用板块返回 `[]`，不是错误，也不触发默认板块重建。

### R05-14 公开 DTO 与查询

- 公开 DTO 只含卡片所需群组摘要，不含 version、isEnabled、position、内部时间、下架计数、mutation token、管理状态或完整加群方式。
- 一个群组出现在多个板块允许重复投影。
- 公开过滤必须在后端查询/service 完成，不能把下架数据发给前端再隐藏。
- 禁止板块→成员→群组的明显 N+1；应批量查询并按 boardId 分组。
- 缓存可选但不能让状态旧内容长期可见，且随机缓存不能跨越站点下一个自然小时。

## 11. 排序需求

### R05-15 手动排序

`manual_asc` 按 position ASC；`manual_desc` 按 position DESC；均使用稳定 groupId 次排序。公开排序不写回数据库。管理成员列表永远用 ASC 人工顺序。

### R05-16 每小时稳定随机

- 排序键至少由 boardId、站点时区自然小时槽位、groupId 组成。
- 同板块、同小时、同成员集合在刷新、不同 Worker、Workers Vitest 中一致。
- 小时切换重新计算；不能使用 `Math.random()`、`ORDER BY RANDOM()`、用户时区、Worker 本地时区或实例内存。
- 新成员/重新发布成员在当前小时立即进入；移除/下架立即消失；不必等下一个小时。
- 哈希碰撞使用 groupId 稳定次排序；哈希算法必须跨 runtime 确定且不承担认证功能。
- 随机查询不改 position、board version、updatedAt。

## 12. 状态机、回收站与永久删除

### R05-17 下架和恢复

published→delisted 保留 board_groups；后续公开查询过滤。恢复后重新 published 时无需重新添加，公开查询自然恢复。此处不改变 T04 的 `last_published_at` 规则。

### R05-18 进入回收站

现有群组回收站正式调用链必须在同一 D1 batch/事务中：验证状态/version、将群组进入回收站、删除该 group_id 的全部关系、为所有受影响板块压缩位置并按设计更新 version。任一步失败，群组、关系、板块位置和版本都不能部分变化。

### R05-19 恢复和永久删除

恢复只恢复群组自身，不恢复旧 board_groups。永久删除应防御性清除异常旧关系或按设计失败，但不得改变 R2 收集、资源清理、D1 删除的四阶段顺序；不得因 FK/板块逻辑提前删除资源或群组。

## 13. 安全、错误与可观测性

- 所有管理读写使用项目管理员认证；写入继续 CSRF 双提交。
- 所有外部输入使用共享 Zod：ID、title、isEnabled、sortMode、version、数组集合、direction、mutationToken、候选搜索和分页。
- 领域错误至少区分 NotFound、VersionConflict、DuplicateMember、InvalidState、BoundaryMove、InvalidReorderSet、TokenReplayed、IntegrityError。
- HTTP 映射沿用项目约定，通常 400/401/403/404/409/422/500；不得把可识别数据库错误原样返回。
- 日志记录操作、board/group ID、审计身份、受影响行数、冲突/失败；不得记录 CSRF、会话密钥、敏感加群信息。
- 公开错误不泄露下架成员身份、数量、内部版本、表名或 SQL。

## 14. 验收标准

### AC-05-01 CRUD 与契约

- [ ] 管理员可列表、详情、创建、编辑、启用、关闭、删除板块。
- [ ] 默认、最后一个板块可删除；零板块不重建。
- [ ] 列表稳定排序、计数和 version 正确。
- [ ] 共享 request/response/error Contract 与 T07/T08 可直接复用。
- [ ] 同名允许，标题/状态/排序模式校验正确。

### AC-05-02 成员与顺序

- [ ] 候选查询受限/分页，支持 published/delisted，拒绝回收站和未批准状态。
- [ ] 同群组可入多个板块，同一板块不重复。
- [ ] 添加、移除、上移、下移和位置压缩正确、原子、带 version。
- [ ] 完整重排拒绝重复/遗漏/未知 ID，冲突全批次回滚。
- [ ] 板块成员没有硬上限且管理列表不分页。

### AC-05-03 公开查询

- [ ] 只返回启用板块和 published 成员。
- [ ] 空板块、只含下架成员的板块、零板块符合规则。
- [ ] 不泄露管理字段、下架身份/数量和完整加群方式。
- [ ] 查询无明显 N+1，过滤在后端完成。

### AC-05-04 稳定随机

- [ ] 三种 sortMode 的顺序正确。
- [ ] 同小时跨刷新、Worker、测试实例一致。
- [ ] 站点时区小时边界正确，下一小时重新计算。
- [ ] 成员实时变化可见且不写数据库。
- [ ] 无 `Math.random()`、SQL random、定时任务或实例内存依赖。

### AC-05-05 状态机与安全

- [ ] 下架保留关联，重新发布恢复公开。
- [ ] 进入回收站原子清理所有关联、压缩位置、更新受影响板块版本。
- [ ] 恢复不自动恢复关联；永久删除兼容既有四阶段。
- [ ] 每个管理写接口有认证、CSRF、Zod、version 和必要 mutation token。
- [ ] 失败、冲突、重放没有部分更新。

### AC-05-06 测试与边界

- [ ] 空库真实 migration、Workers route/service/repository 集成测试通过。
- [ ] CRUD、重排、成员、随机、公开、安全、回收站、永久删除和回归矩阵完成。
- [ ] 性能/查询计划/N+1 有测试或证据。
- [ ] 未修改正式前端、主题、分页、数据库结构，除非总任务批准。

## 15. 交付状态

本轮只创建 `prd.md`、`design.md`、`implement.md` 并保持 T05 `planning`。不得执行 `task.py start`，不得创建 T05 子任务，不得直接修改业务源码。实现完成后的最终报告必须列出 API 路径、Contract、repository/service、版本并发、随机算法、公开过滤、回收站接入、测试结果和后续 T07/T08/T10 接口。
