# T04 后端能力扩展：技术设计规划

## 0. 设计边界

本文件只设计 T04 的后端、数据库、共享数据 Contract、权限、存储兼容和测试方案。它不授权修改 Vue 表现组件、CSS、布局、主题、Dialog、动画或用户交互流程。

T04 的服务端输出必须能够被 T03 已冻结的正式前端通过非表现层 adapter 消费。不能因为后端字段设计方便，就要求前端重新排版、增加控件或改变流程。

## 1. 事实核对清单

实施前必须核对而不是假设：

- 当前 group 表字段、状态枚举和时间字段。
- 当前 repository 的查询、排序和 cursor 语义。
- 当前路由注册、错误处理和 request id 方式。
- 当前管理员认证、session、CSRF 和版本 token。
- 当前提交、点赞、上传、回收站和永久删除入口。
- 当前 D1 migration 顺序、外键开启方式和测试数据库初始化。
- 当前 R2 临时资源和删除策略。
- 当前共享 domain/contract 导出路径。
- T03 正式前端实际需要的 DTO/view-model 字段。
- 当前测试脚本、夹具和时间控制方式。

事实与总 PRD 不一致时，先记录差异、风险和兼容方案；不通过猜测静默改变产品规则。

## 2. 逻辑分层

```text
Route
  ├─ 解析身份、CSRF、参数
  ├─ 调用 service
  └─ 统一成功/错误响应
Service
  ├─ 状态机
  ├─ 权限规则
  ├─ 事务边界
  ├─ 排序和公开过滤策略
  └─ 调用 repository
Repository
  ├─ D1 查询
  ├─ 稳定排序
  ├─ 聚合
  ├─ 批量位置更新
  └─ 关联清理
Contract
  ├─ 输入 schema
  ├─ 输出 DTO
  ├─ 错误类型
  └─ 共享 domain 规则
```

禁止 route 直接拼接复杂 SQL 或在前端复制服务端状态规则。禁止 repository 决定用户是否有权限。禁止 adapter 承担数据库语义。

## 3. 数据库设计

### 3.1 `last_published_at`

- 类型与现有时间字段保持一致。
- 可为空。
- 增加服务于发现新群查询的索引。
- migration 不回填历史时间。
- 发布状态转换在事务内更新。
- published → published 不触发更新。
- 失败发布不写入时间。

### 3.2 `boards`

- `id` 使用项目一致的 ID 策略。
- `title` 使用共享长度校验。
- `is_enabled` 默认值与总 PRD一致。
- `position` 可排序且不能产生重复有效位置。
- `sort_mode` 只接受三种枚举。
- `version` 用于并发保护。
- `created_at`、`updated_at` 使用现有时间策略。
- 板块位置需要查询索引。

### 3.3 `board_groups`

- `(board_id, group_id)` 作为主键。
- `position` 用于板块内稳定编辑顺序。
- `created_at` 使用现有时间策略。
- 板块删除级联成员关联。
- 群组永久删除清理成员关联。
- 板块和位置查询需有合适索引。
- D1 外键行为必须在本地和 Workers 测试中一致。

### 3.4 默认板块

首次迁移/初始化创建“自定板块”。插入条件必须基于可审计的幂等键或存在性检查；重复执行不能创建第二个默认板块，也不能覆盖用户已经编辑的板块。

## 4. Migration 兼容与回滚

迁移前记录：当前 schema 版本、数据量、外键状态、备份点和验证命令。迁移中先增加兼容结构，再启用依赖新字段的业务逻辑。迁移后运行 schema 检查、默认板块计数、NULL 初始值、索引存在性和旧业务回归。

必须设计：

- 空数据库迁移。
- 已有群组但没有板块数据的迁移。
- 已有板块数据的重复初始化。
- 迁移中断后的再次执行。
- 新代码面对旧 schema 的明确错误。
- 旧代码面对新增 nullable 字段的兼容。
- 需要时的恢复/回滚步骤。

## 5. 领域状态机

### 5.1 发布转换

```text
非 published --成功发布--> published + 写入服务端时间
published --编辑仍 published--> published + 时间不变
published --下架--> unpublished + 时间保留
unpublished --重新发布--> published + 写入新时间
trash --恢复但未发布--> 非 published + 不自动恢复板块关联
trash --恢复并发布--> published + 写入新时间
```

状态机必须有单元和 Workers 测试，避免 route 通过不同路径产生不同时间语义。

### 5.2 板块状态

板块启用状态只影响公开展示，不影响管理操作。删除板块删除关联但不删除群组。群组下架保留关联，进入回收站原子删除关联，恢复不自动重建。

## 6. 公开查询设计

### 6.1 公共过滤器

公开查询必须使用集中式过滤策略：状态、敏感字段、板块启用状态、成员状态和详情可见性统一检查。不同 route 不能各自复制近似过滤。

### 6.2 发现新群

查询条件固定为 published，按 `last_published_at DESC, id DESC`，限制 10。NULL 值不应错误地排在最新发布之前；具体数据库排序行为必须通过测试固定。

### 6.3 标签聚合

使用一次聚合查询取得标签和 published 计数。标签解析、去重和大小写语义复用现有规则。空标签返回空集合而不是泄露未发布群组计数。

### 6.4 板块公开查询

先查询启用板块，再以批量方式取得 published 成员。每个板块的结果应避免明显 N+1；若采用聚合或批量查询，必须确保返回顺序和板块边界可恢复。

### 6.5 详情

详情只接受有效公开 group id。不存在、下架、回收站和删除统一为非敏感的不可用结果，不返回私有加群信息、原始状态或内部删除原因。

### 6.6 公开路由清单（已确认）

公开首页采用分区独立接口，不提供聚合首页接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/discover` | 发现新群，`last_published_at DESC, id DESC`，最多 10 |
| `GET` | `/api/v1/tags` | 标签聚合，只统计 published，`count DESC, tag ASC` |
| `GET` | `/api/v1/boards` | 启用板块 + 批量公开成员 |
| `GET` | `/api/v1/groups` | 目录 cursor，**收紧为只返回 published**（修复现网 `status IN ('published','delisted')` 缺口） |
| `GET` | `/api/v1/groups/:id` | 已发布详情深链 |

`last_published_at` 不进入公开 DTO；发现接口内部排序即可。

## 7. 板块管理设计

### 7.1 CRUD

创建、编辑、启停和删除均须经过 schema、权限、版本和事务校验。删除前后关联数据的数量和级联结果要可测试。允许删除最后一个板块。

### 7.2 板块顺序

批量更新时先校验目标列表是否完整、无重复、属于同一管理员可见集合，再在原子边界内写入。失败不得留下部分位置。

### 7.3 成员顺序

上移/下移采用相邻位置交换或等价原子算法。不得通过连续非事务写入暴露重复位置。并发版本不符时返回冲突。

### 7.4 sort mode

`manual_asc` 使用位置正序；`manual_desc` 在查询层返回位置倒序但不改变保存位置；`hourly_random` 使用站点时区的自然小时槽位和稳定种子计算，不更新位置。

### 7.5 管理路由清单（已确认）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/admin/boards` | 板块列表（含成员数量） |
| `POST` | `/api/v1/admin/boards` | 创建板块 |
| `PATCH` | `/api/v1/admin/boards/:id` | 编辑标题/启停/sort mode（version 校验） |
| `DELETE` | `/api/v1/admin/boards/:id` | 删除板块（级联删关联） |
| `POST` | `/api/v1/admin/boards/reorder` | 批量更新板块 position（原子） |
| `POST` | `/api/v1/admin/boards/:id/members` | 添加成员（published/delisted，拒绝 trash，防重） |
| `DELETE` | `/api/v1/admin/boards/:id/members/:groupId` | 移除成员关联，不删群组 |
| `POST` | `/api/v1/admin/boards/:id/members/:groupId/move` | 上移/下移（相邻交换，原子） |

板块添加群组选择器复用管理列表接口（`statuses=published,delisted` + `q`，排除 trash）。

### 7.6 管理分页（已确认）

- 参数沿用现有 `sortBy/sortDir`（不采用 RPD §21.3 示例 `sort/direction` 参数名），新增 `page`（≥1，默认 1）。
- 每页固定 50，不提供 pageSize 切换。
- 返回 `{ items, page, pageSize: 50, totalItems, totalPages }`；零条目时 `totalPages = 0`。
- 所有排序追加稳定次排序字段 `id`。

## 8. 管理页码分页设计

分页参数必须做边界校验：页码至少为 1，页大小固定 50，超出范围返回明确结果或规范化到最后一页，行为固定并可测试。`totalItems` 与过滤条件同一事务/一致性视图计算；`totalPages` 在零条目场景有明确值。

排序字段使用允许列表，方向使用允许枚举，始终追加稳定次排序字段。搜索、状态、回收站和排序语义必须与现有管理功能兼容。

## 9. Contract 设计

Contract 设计必须区分：

- 输入 DTO：用户可提交的字段和校验。
- 输出 DTO：公开/管理可见字段。
- 管理 DTO：可包含非公开状态，但受管理员权限保护。
- 错误 DTO：稳定 code、message、field errors 和 request id。
- 分页 DTO：固定页大小、总数和页数。
- 冲突 DTO：当前版本和可恢复提示所需信息。

共享 Contract 不允许把数据库内部字段无条件暴露到公开响应；`last_published_at` 是否公开由总 PRD和 T05 视图需求决定，不能因为数据库存在就直接返回。

## 10. 权限与安全设计

所有管理写路由依次通过：

1. 请求方法与路由校验。
2. 会话认证。
3. 管理员权限。
4. CSRF 校验。
5. JSON/表单 schema 校验。
6. 版本或突变令牌校验。
7. 业务状态和资源归属校验。
8. 原子数据变更。

公开路由不得因错误区别暴露资源存在性。上传接口验证管理员、类型、大小和资源状态，继续复用既有 R2 生命周期。

## 11. 测试设计

### 11.1 Domain

- ASCII/中日韩/全角边界。
- Emoji 和组合 Emoji。
- 带重音拉丁字符。
- 前后空格和换行。
- 标题 50、简介 1000 的刚好通过和刚好超限。
- 主题、排序模式和分页参数。

### 11.2 Workers

- 发布转换时间。
- 已发布编辑不更新时间。
- 下架重新发布更新时间。
- 新群稳定排序。
- 标签只计 published。
- 板块 CRUD 和启停。
- 重复成员拒绝。
- 已下架可加、trash 不可加。
- 上移、下移、板块拖拽。
- 并发冲突。
- 回收站原子清理。
- 永久删除清理。
- 公开详情过滤。
- 管理分页 50/51 边界和跨页排序。
- 权限、CSRF、输入校验。

### 11.3 Migration

- 空库。
- 已有数据。
- 重复执行。
- 中断重试。
- 默认板块不重复。
- `last_published_at` 全为 NULL。
- 外键、索引和级联。

## 12. 性能设计

- 标签使用聚合。
- 板块成员使用批量查询。
- 目录和搜索保持 cursor。
- 管理列表只查询一页和总数所需信息。
- 发现新群最多 10。
- 稳定随机在请求内计算，不写数据库、不跑定时任务。
- 对慢查询记录 query shape 和改进证据。

## 13. 监控与日志

每个新 route 记录 request id、状态码、耗时、业务错误类别和受控资源 id。禁止记录 CSRF token、session、私有链接、二维码内容和用户输入全文。迁移和后台批量操作输出可审计的开始、结束、失败原因和影响数量。

## 14. T05 移交格式

移交包至少包括：

- route 表。
- method、path、认证要求。
- request 示例。
- success response 示例。
- empty response 示例。
- validation error 示例。
- permission/CSRF error 示例。
- conflict error 示例。
- 状态过滤说明。
- 时间/时区说明。
- 分页/排序说明。
- 测试命令和结果。
- 已知限制和待用户决策项。

## 15. 设计验收

- [ ] 任何前端表现层改动都不在设计授权中。
- [ ] 每条 RPD 后端规则有对应实现位置和测试。
- [ ] 所有公开查询有统一过滤策略。
- [ ] 所有管理写操作有完整安全链路。
- [ ] 所有批量位置和关联清理有事务边界。
- [ ] Contract 可被 T05 adapter 消费。
- [ ] Migration 可重复、可观察、可回滚。
- [ ] 性能风险和 N+1 风险有检查方式。

## 16. 已确认决策记录

| 决策 | 依据 | 状态 |
|---|---|---|
| 公开首页分区独立接口 | 用户确认 | 已批准 |
| 标签排序 `count DESC, tag ASC` | RPD §14.4 默认建议（唯一依据） | 采用默认 |
| 管理列表参数沿用 `sortBy/sortDir` | api-guidelines `/api/v1` 稳定性 | 采用 |
| `boards.timezone` 显式配置，默认 `Asia/Shanghai` | RPD §16.4 站点配置时区 | 采用 |
| 公开 DTO 不暴露 `last_published_at` | RPD §13 无展示需求 | 采用 |
| 公开详情不可用统一 `404 NOT_FOUND` 非敏感 | error-handling | 采用 |
| 重复成员 → `STATE_CONFLICT` | error-handling 领域不变量 | 采用 |
| 板块添加群组选择器复用管理列表接口 | RPD §23.5 | 采用 |
| 公开列表过滤收紧为 `status='published'` | RPD §5.1 + api-guidelines | P0 修复项 |
