# T04 → T05 接口移交包（2026-08-02）

本文件是 T04 完成后的服务端移交清单。T05 在此 Contract 上接线，不改表现层。

## 1. API inventory

### 公开接口（无需认证）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/groups?q=&cursor=&limit=` | 目录 cursor 分页；**只返回 published**；含 `nextCursor`、`rotationWindow` |
| `GET` | `/api/v1/groups/:id` | 公开详情深链；不存在/下架/回收站/删除统一 `404 NOT_FOUND` |
| `GET` | `/api/v1/discover` | 发现新群，最多 10 条，`last_published_at DESC, id DESC`；`{ items }` |
| `GET` | `/api/v1/tags` | 标签聚合，只统计 published；`{ tags: [{ tag, count }] }`，`count DESC, tag ASC` |
| `GET` | `/api/v1/boards` | 启用板块 + 已发布成员；`{ boards: [{ id, title, sortMode, groups: PublicGroupDto[] }] }` |
| `GET` | `/api/v1/assets/:key` | 既有 R2 资源服务（未变） |
| `PUT`/`DELETE` | `/api/v1/groups/:id/like` | 既有匿名点赞（未变） |
| `POST` | `/api/v1/submissions` | 既有访客提交（未变） |

### 管理接口（需 session + CSRF 写）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/v1/admin?page=&status=&deleted=&q=&sortBy=&sortDir=` | **页码分页，固定每页 50**，返回 `{ items, page, pageSize: 50, totalItems, totalPages }` |
| `POST` | `/api/v1/admin` | 新建群组（未变） |
| `PATCH` | `/api/v1/admin/:id` | 编辑（version 校验；未变） |
| `DELETE` | `/api/v1/admin/:id` | 软删除（**同时原子移除板块关联**） |
| `POST` | `/api/v1/admin/:id/restore` | 恢复（不自动重建板块关联、不更新发布时间） |
| `DELETE` | `/api/v1/admin/trash/groups/:id` | 永久删除（含板块关联清理） |
| `GET` | `/api/v1/admin/boards` | 板块列表（含 memberCount） |
| `POST` | `/api/v1/admin/boards` | 创建板块 |
| `PATCH` | `/api/v1/admin/boards/:id` | 编辑标题/启停/sortMode（version 校验） |
| `DELETE` | `/api/v1/admin/boards/:id` | 删除板块（级联清成员） |
| `POST` | `/api/v1/admin/boards/reorder` | 批量顺序 `{ boardIds: string[] }`，全量替换语义 |
| `GET` | `/api/v1/admin/boards/:id/members` | 板块成员列表（published+delisted 均可见） |
| `POST` | `/api/v1/admin/boards/:id/members` | 添加成员 `{ groupId }` |
| `DELETE` | `/api/v1/admin/boards/:id/members/:groupId` | 移除成员（不删群组） |
| `POST` | `/api/v1/admin/boards/:id/members/:groupId/move` | `{ direction: "up"\|"down" }`，相邻交换 |

## 2. 请求/响应示例

### 公开详情
```http
GET /api/v1/groups/7f0e... HTTP/1.1
```
```json
{
  "ok": true,
  "data": {
    "id": "7f0e...", "title": "设计交流群", "description": "...",
    "kind": "interest", "platform": "QQ", "tags": ["设计"],
    "status": "published",
    "logoUrl": "https://assets.test.invalid/logos/xxx.webp",
    "logoMeta": { "width": 1, "height": 1, "byteLength": 60 },
    "joinMethods": [{ "type": "group_number", "value": "123456" }],
    "likeCount": 0, "createdAt": "...", "updatedAt": "..."
  },
  "requestId": "uuid"
}
```
注意：公开 DTO **不含** `lastPublishedAt`、`version`、`deletedAt`、`logoR2Key`、联系方式、审核备注。

### 管理分页
```http
GET /api/v1/admin?page=3&status=published&sortBy=title&sortDir=desc
```
```json
{
  "ok": true,
  "data": {
    "items": [ /* AdminGroupDto[]，含 lastPublishedAt */ ],
    "page": 3, "pageSize": 50, "totalItems": 1173, "totalPages": 24
  },
  "requestId": "uuid"
}
```
- `page < 1` → 400；`page` 超出范围 → 空 `items` + 正确 `totalItems/totalPages`（前端可回退到最后一页）。
- 排序字段允许 `title|kind|status|platform|tags|likeCount`（沿用既有 `sortBy/sortDir` 参数名，RPD §21.3 示例的 `sort/direction` 不采用）。
- 所有排序恒追加 `id` 稳定次排序。

### 板块
```json
POST /api/v1/admin/boards  { "title": "自定板块" }
→ 201 { "ok": true, "data": { "boards": [ /* 全部板块 */ ] }, "requestId": "..." }

PATCH /api/v1/admin/boards/:id  { "title": "x", "isEnabled": false, "sortMode": "hourly_random", "version": 1 }
→ 409 VERSION_CONFLICT（版本过期时）
```
创建/编辑/删除/reorder 均返回**完整板块列表**（`{ boards: [...] }`），T05 可直接替换本地状态，无需二次拉取。

## 3. 错误码表（写操作）

| 场景 | 状态码 | code |
|---|---|---|
| 参数/字段校验失败 | 400 | `VALIDATION_FAILED` |
| 未认证 | 401 | `AUTH_REQUIRED` |
| 缺少/无效 CSRF | 403 | `FORBIDDEN` |
| 目标不存在 | 404 | `NOT_FOUND` |
| 版本过期 | 409 | `VERSION_CONFLICT` |
| 回收站群组不可添加 / 状态不可添加 / 重复成员 | 409 | `STATE_CONFLICT` |
| 板块列表已变化（reorder） | 409 | `STATE_CONFLICT` |
| 公开详情不可用 | 404 | `NOT_FOUND`（统一非敏感） |

## 4. 公开过滤承诺

- 所有公开查询（目录、搜索、发现、板块成员、详情）在 repository 边界过滤 `status = 'published' AND deleted_at IS NULL`。
- 已修复原 `listPublished` 含 delisted 的缺口（原 `group-repository.ts:174`）。
- 公开响应不含管理端字段；`last_published_at` 不进公开 DTO。

## 5. 时间/时区/排序语义

- 时间戳：UTC ISO-8601 字符串（与既有字段一致）。
- `last_published_at`：仅"非 published → published 成功转换"由服务端写入；`published→published` 编辑、下架、恢复均不更新；迁移后现有数据全 NULL。
- hourly_random：小时槽位 = `site.config.boards.timezone`（默认 `Asia/Shanghai`）自然小时；种子 `board_id + 槽位 + 成员`；刷新稳定、跨小时变化、不写库。
- manual_desc：查询层反向，不改变保存位置。
- 发现新群：`last_published_at DESC, id DESC`，NULL 排最后，最多 10。

## 6. 迁移（runbook 输入）

- 版本：`0004_board_management.sql`。
- 变更：`groups.last_published_at`（NULL）、`boards`、`board_groups`（复合主键 + FK 级联 + 索引）、默认"自定板块"（固定 UUID `00000000-0000-4000-8000-000000000001`，幂等）。
- 现有数据：`last_published_at` 保持 NULL，不回填。
- 重复运行：幂等（默认板块 `WHERE NOT EXISTS`）。
- 本地：`npm run db:migrate:local`；测试库由 vitest setup 自动应用全部 migration。
- 回滚：T04 未提供降级 migration；如需回滚需先备份 D1 并导出数据（破坏性迁移补偿方案，属 T06 演练范围）。

## 7. 测试命令与结果（2026-08-02）

```
npm test            → 6 files / 73 passed
npm run test:workers → 11 files / 103 passed
npm run typecheck   → 通过
npm run lint        → 0 errors（42 条 .vue 既有 warning 未动）
npm run build       → 通过
npm run format:check → 本任务文件全部通过（8 个既有文件 pre-existing 警告：docs/PRD/v2/RPD.md、README.md、shared/contracts/asset.ts、src/components 若干 .vue）
```
E2E：未执行。原因：8788/5173 端口被用户正在运行的 dev 服务占用（webServer `reuseExistingServer: false`），且运行中的 wrangler 为旧代码（未含 T04 变更）。E2E 断言经代码审查与 T04 变更兼容（公开页只依赖 `/groups` 响应成功 + shell 渲染；管理页仅断言标题渲染）。

## 8. 已知问题与注意事项

1. **T03 前端 composable 兼容**：`src/features/admin/composables/useAdminGroups.ts` 目前消费旧的 cursor 列表契约（`nextCursor/total`）。T04 按 RPD §21 将管理列表改为页码分页——**该 composable 必须由 T05 重写**，属允许修改范围（composable/adapter 层，非表现层）。
2. `DemoBoard.description` 无后端字段（RPD 24.2 无该字段），T05 适配时忽略。
3. 管理列表 `tags` 排序按首标签二进制序（SQLite NOCASE 只处理 ASCII），中文标签按码点序。
4. 板块成员添加选择器：复用 `GET /api/v1/admin?status=published,delisted&q=`（trash 自动排除）。
5. 空板块语义：启用无公开成员的板块返回 `groups: []`；板块总数为零返回 `boards: []`。
6. `site.config.ts` 新增 `boards.timezone`（必填）；配置校验已有单测。
7. 每页 50 固定，无 pageSize 切换（RPD §21.1 非目标）。
8. 公开 DTO 新增 `lastPublishedAt` 需 T05 同步 adminGroupDtoSchema 使用；公开 DTO 不变。
