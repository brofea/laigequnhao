# 完善 admin 页面功能：技术设计

## 1. 设计目标

本设计解决四个根问题：

1. 管理端列表 query 目前不能表达多状态、搜索和完整结果集排序。
2. 管理端写入把响应 DTO 当请求 schema，且只更新 `groups` 主表，无法原子维护关联数据。
3. 二维码上传代码缺少 `assets` migration、稳定引用和清理状态，公开按钮也没有行为。
4. 前后台各自处理搜索与请求生命周期，容易产生字段范围和过期响应不一致。

保持 Vue 3 + composable、Hono + D1 repository、共享 Zod schema、R2 adapter 的现有架构，不引入 Pinia、ORM、UI 框架、FTS 或外部搜索服务。

## 2. 任务边界与依赖

```text
父任务：07-28-improve-admin-page
├─ 07-28-admin-list-search-sort
│  ├─ 共享搜索/query 契约
│  ├─ 管理员列表 SQL、游标与排序
│  ├─ 状态按钮、搜索框、标签列与表格排序
│  └─ 主页搜索增加简介字段
├─ 07-28-qr-resource-public-flow
│  ├─ 0002 migration 与 asset 生命周期
│  ├─ 二维码上传/删除/重试服务
│  ├─ 管理/公开二维码投影
│  └─ 移除 qrCodePublic + 主页二维码对话框
└─ 07-28-admin-group-aggregate-editor
   ├─ 管理员写入 schema
   ├─ 聚合创建/更新 transaction
   ├─ 右侧抽屉及标签/加群方式编辑器
   └─ 联系方式只读、审核备注可写
```

- 列表子任务可以独立实现。
- 二维码子任务先确定 migration、asset DTO 和服务命令。
- 聚合编辑子任务消费二维码子任务提供的 asset 引用契约，并完成抽屉集成。
- 父任务最后执行共享契约、公开字段隔离、完整数据流和全量测试 Review。

## 3. 跨层数据流

### 3.1 管理员列表

```text
URL query
→ adminGroupListQuerySchema
→ useAdminGroups
→ GET /api/v1/admin/groups
→ repository 白名单筛选/搜索/排序/游标
→ AdminGroupDto page
→ AdminGroupTable
```

URL 是筛选、搜索和排序状态的唯一页面级来源；组件只发出切换意图，composable 解析 URL 并负责请求、取消和过期响应保护。

### 3.2 聚合创建与编辑

```text
AdminGroupDrawer draft
→ adminGroupCreateSchema / adminGroupUpdateSchema
→ POST/PATCH admin groups
→ repository guarded D1 batch
→ groups + group_tags + join_methods + submission_details
→ AdminGroupDto
→ 就地替换或按当前 query 精确补取
```

请求 schema 与响应 DTO 分离。路由只解析命令和映射错误；领域校验与写入由 service/repository 边界负责。

### 3.3 二维码资源

```text
本地图片
→ useImageProcessor 生成最终 WebP
→ POST /admin/assets（staged asset）
→ 抽屉草稿持有 assetId + preview
→ 聚合保存引用 assetId
→ asset 变为 ready
→ 旧且无引用 asset 进入 delete_pending
→ R2 删除成功后删除 D1 asset 行
```

取消编辑或保存失败时，只清理本次新建且仍未被引用的 staged asset。任何清理操作先查引用，不从公开 URL 反推 R2 key。

## 4. 共享契约

### 4.1 列表 query

新增管理员专用 schema，避免继续复用只含 `q/cursor/limit` 的公开列表 schema：

```ts
type AdminGroupListQuery = {
  statuses?: GroupStatus[]; // 正常模式 1–4 个；回收站模式省略
  deleted: boolean;
  q?: string;
  sortBy?: "title" | "kind" | "status" | "platform" | "tags" | "likeCount";
  sortDir?: "asc" | "desc";
  cursor?: string | null;
  limit: number; // 默认 50，设置安全上限
};
```

- URL 使用重复的 `status` 参数，不使用未校验的逗号字符串。
- `deleted=true` 与 `statuses` 同时出现时返回 `VALIDATION_FAILED`。
- 正常模式空 `statuses` 返回 `VALIDATION_FAILED`；UI 则提前阻止关闭最后一个状态。
- 响应包含 `items`、`total`、`nextCursor` 和当前排序描述。

### 4.2 管理员写入命令

新增独立的创建/更新 schema：

```ts
type AdminGroupCreateInput = {
  title: string;
  description: string;
  kind: GroupKind;
  platform: string;
  status: GroupStatus;
  tags: string[];
  joinMethods: AdminJoinMethodInput[];
  auditNotes: string | null;
};

type AdminGroupUpdateInput = AdminGroupCreateInput & {
  version: number;
};
```

`submissionContact` 不在写入命令中。`joinMethods` 使用判别联合：

- `group_number`：非空 `value`。
- `url`：`https:` URL。
- `qr_code`：已存在的 `assetId`。

输出用管理员专用 join method DTO，包含稳定行 ID；二维码输出包含管理员可用的 asset ID、公开 URL 和尺寸/体积元数据。公开 DTO 只保留公开 URL 和展示元数据，不返回 asset ID 或 R2 key。

### 4.3 单一事实来源

- `GroupStatus`、`JoinMethod`：`shared/domain/group.ts`。
- 平台与允许方式：`site.config.ts` 经 `siteConfigSchema` 校验。
- 搜索 query 归一化：新增 `shared/domain/search.ts` 纯函数，主页和管理端共同调用。
- 管理员可排序字段与 URL parser：共享管理员列表契约。
- 状态/性质显示顺序：有类型约束的中央映射，不在组件和 SQL 中各写一套裸字符串。

## 5. 数据库设计与 migration

不修改已应用的 `migrations/0001_initial.sql`。新增有序 migration，例如 `0002_admin_group_management.sql`。

### 5.1 `assets` 表

补齐当前路由已经依赖、但 migration 尚未创建的表：

```text
id                 TEXT PRIMARY KEY
r2_key             TEXT NOT NULL UNIQUE
purpose            TEXT NOT NULL CHECK (logo | qr_code)
content_type       TEXT NOT NULL CHECK (image/webp)
byte_length        INTEGER NOT NULL
width              INTEGER NOT NULL
height             INTEGER NOT NULL
lifecycle_state    TEXT NOT NULL CHECK (staged | ready | delete_pending | delete_failed)
delete_attempts    INTEGER NOT NULL DEFAULT 0
last_error_code    TEXT
created_at         TEXT NOT NULL
updated_at         TEXT NOT NULL
```

索引至少覆盖 `r2_key`、`purpose/lifecycle_state` 和 staged 资源创建时间，便于引用检查与孤立资源回收。

### 5.2 `join_methods.asset_id`

- 为 `join_methods` 增加可空 `asset_id`，外键指向 `assets(id)`，删除策略为 `RESTRICT`。
- `group_number`/`url` 使用 `value` 且 `asset_id IS NULL`。
- 新建或替换的 `qr_code` 使用 `asset_id`，不得只保存公开 URL。
- 现有 `qr_code` 且只有 `value` 的记录视为 legacy：migration 前先统计；实现提供明确的替换/迁移路径，不能根据任意 URL 猜测 R2 key。
- 建立 `join_methods(asset_id)` 索引。

### 5.3 永久清理状态

现有 `groups.purge_state` 和 `purge_started_at` 继续作为群组删除状态；新 migration 补齐规范要求的 `purge_attempts`、`purge_last_error_code`。错误码只保存安全分类，不保存原始异常。

### 5.4 migration 发布顺序

1. 在隔离的本地/预览 D1 应用 `0001 → 0002`。
2. 检查 legacy 二维码数量、非法 join method 和缺失 asset 引用。
3. 部署兼容新旧二维码读取的应用版本。
4. 完成 legacy 替换/迁移后收紧写入校验。
5. 生产 rollout 前导出 D1；回滚使用补偿 migration，不修改 `0001`。

### 5.5 收敛修复 migration

- 新增 `0003_group_mutation_token.sql`，仅执行 `ALTER TABLE groups ADD COLUMN mutation_token TEXT`。
- `mutation_token` 可空、无默认值，不进入业务 DTO；按 group 主键与 token 联合判断，不需要单独索引。
- 本地、开发远端和生产必须继续使用 migration 目录顺序应用，禁止回写已应用的 `0002`。
- migration 测试覆盖 `0001 → 0002 → 0003` 全新建库，以及已经应用 `0002` 后升级到 `0003`。

## 6. 查询、搜索与排序

### 6.1 搜索

公开列表和管理员列表共享同一 SQL 搜索片段：

```sql
g.title LIKE ? COLLATE NOCASE
OR g.description LIKE ? COLLATE NOCASE
OR EXISTS (
  SELECT 1
  FROM group_tags gt
  WHERE gt.group_id = g.id
    AND gt.tag LIKE ? COLLATE NOCASE
)
```

参数来自共享归一化函数并始终绑定。搜索不读取联系方式、加群方式或审核备注。

### 6.2 排序白名单

请求值先通过 Zod 联合类型，再映射到固定 SQL 片段，禁止把请求字符串直接插入 `ORDER BY`：

| `sortBy` | 主排序语义 |
|---|---|
| `title` | 标题，不区分拉丁大小写 |
| `kind` | `official` → `interest` |
| `status` | `pending` → `published` → `rejected` → `delisted` |
| `platform` | 平台 ID，不区分拉丁大小写 |
| `tags` | 第一展示标签；无标签固定排在有标签之后 |
| `likeCount` | 数值排序 |

默认排序为 `created_at DESC, id DESC`。所有显式排序都追加 `id` 作为最终稳定键。

### 6.3 游标

- 游标包含 query 指纹、排序 key、方向和最后一条 ID，Base64URL 编码后对客户端保持不透明。
- 服务端验证游标与当前 `statuses/deleted/q/sortBy/sortDir` 完全一致；不一致返回 `VALIDATION_FAILED`。
- 使用 keyset 条件，不用仅靠 OFFSET 的易漂移分页。
- `COUNT` 和 items 查询必须复用同一 where builder，避免 total 与结果不一致。

## 7. 聚合写入与并发

### 7.1 创建

单个 D1 batch 写入：

1. `groups`；
2. 0–5 条 `group_tags`；
3. 至少 1 条 `join_methods`；
4. 一条 `submission_details`（contact 为 `NULL`，notes 来自管理员输入）；
5. 被引用 staged asset 的状态更新为 `ready`。

### 7.2 更新

使用 `0003_group_mutation_token.sql` 为 `groups` 增加可空 `mutation_token TEXT`。该字段只用于一次聚合命令的数据库内写入所有权，不进入任何公开或管理员 DTO。

每次更新生成 `mutationToken = crypto.randomUUID()`，并构造一个 D1 batch：

1. 第一条语句执行 `UPDATE groups SET ..., version = version + 1, mutation_token = ? WHERE id = ? AND version = ?`。
2. asset 引用增减、标签删除/插入、加群方式删除/插入、审核备注 upsert 全部使用 `EXISTS (... mutation_token = ?)` 守卫。
3. 最后一条语句使用同一 token 将 `mutation_token` 清空。
4. `db.batch()` 任一语句失败时，D1 回滚整个 batch；不得增加事后版本补偿。
5. 以 batch 返回数组第一项的 `meta.changes` 判断第一条 UPDATE 是否命中。值为 0 时，所有 token 守卫语句均为 no-op，返回 `VERSION_CONFLICT`。
6. 值为 1 时读取当前权威聚合并返回。不得通过提交后的 version/updated_at 快照推断本请求是否成功。

版本号或毫秒时间戳都不是请求唯一标识，禁止作为 mutation token 替代品。唯一 token 解决同版本、同毫秒并发请求穿透关联守卫的问题。

标签、加群方式和审核备注采用“校验后的完整集合替换”语义，对管理员表现为逐项 CRUD，对数据库保持一次原子保存。

### 7.3 校验顺序

1. Zod 结构、长度和判别联合。
2. 平台存在且加群方式受 `allowedJoinMethods` 允许。
3. 标签 trim、空值、大小写不敏感去重和 0–5 数量。
4. 至少一个加群方式；完全重复项拒绝。
5. QR asset 存在、用途为 `qr_code`、状态允许引用。
6. version 与删除状态。

字段错误使用稳定 `VALIDATION_FAILED.fieldErrors`；状态冲突使用 `STATE_CONFLICT`；并发冲突使用 `VERSION_CONFLICT`。

## 8. 二维码与多资源一致性

### 8.1 上传和草稿

- `ImageUploader` 只处理本地文件和预览；上传命令由独立 composable 负责。
- 上传成功创建 `staged` asset，并返回 asset DTO。
- 抽屉为每个新 asset 记录本次会话 owner；取消、替换或关闭时只请求清理这些 staged asset。
- 前端关闭不能被视为清理成功。`POST /admin/assets/cleanup` 是本阶段明确的人工维护入口，负责 staged 过期扫描与 `delete_failed` 重试；在没有部署定时调用前，文档和 UI 不得描述为自动后台回收。

### 8.1.1 管理员已有二维码预览

- 管理列表和单条查询把 ready asset 解析为管理员 `assetUrl`/`qrCodeUrl`。
- `DraftJoinMethod` 保存 `assetUrl`；从 DTO 建草稿时使用 `assetUrl ?? qrCodeUrl ?? null`。
- 编辑器图片源为 `localObjectUrl ?? assetUrl`，本次上传预览优先。
- asset ID 被移除或替换时同步把旧 `assetUrl` 清空，避免展示与草稿引用不一致的旧二维码。
- 远端 URL 只用于显示，不写回数据库，也不得用来反推 R2 key。

### 8.2 解除引用

聚合保存返回被移除的旧 asset ID。服务端在 D1 提交后：

1. 再次统计 `join_methods.asset_id` 和其他资源引用；
2. 有引用则保留；
3. 无引用则标记 `delete_pending`；
4. 删除 R2；对象不存在也视为成功；
5. 删除 D1 asset 行；
6. 失败则记录 `delete_failed`、安全错误码和尝试次数，可由相同命令重试。

### 8.3 永久删除

永久删除仅接受软删除群组：

```text
none → pending → R2 清理 → r2_done → D1 batch 删除关联行和 groups
```

重复调用从当前状态继续。Logo 和二维码都执行引用检查；任何步骤失败保留可重试状态并返回安全错误。

## 9. 前端结构

### 9.1 列表

- `AdminView.vue`：组合 URL 状态、工具栏、表格、抽屉和确认对话框。
- `useAdminGroups.ts`：列表请求、AbortController、游标、权威响应和变更后协调。
- `AdminStatusFilters.vue`：五个按钮与互斥/至少一个状态机。
- `AdminGroupSearch.vue`：防抖、回车和清空意图。
- `AdminGroupTable.vue`：展示数据、排序意图、分页/继续加载；不直接请求 API。

表头使用原生 button，`th` 设置 `aria-sort`。操作列没有排序按钮。

### 9.2 编辑抽屉

- `AdminGroupDrawer.vue`：焦点管理、Escape、dirty guard、响应式外壳。
- `AdminGroupFields.vue`：标题、简介、性质、平台、状态。
- `AdminTagEditor.vue`：稳定 client key、0–5、增删和上移/下移。
- `AdminJoinMethodEditor.vue`：判别联合、增删、排序、平台兼容错误。
- `AdminPrivateDetails.vue`：联系方式只读、审核备注可写。
- `useAdminGroupDraft.ts`：深拷贝草稿、dirty、字段错误、保存命令和 staged asset 清理。

抽屉打开时聚焦标题/第一个错误，关闭后焦点返回原“编辑”按钮；窄屏宽度为 `100vw`，宽屏设置最大宽度；遵守 reduced motion。

### 9.3 公开二维码

`GroupCard` 对三种加群方式使用穷尽分支：

- 群号：复制；
- URL：以 `noopener` 打开；
- 二维码：打开 `QrCodeDialog`。

对话框包含群名称、懒加载二维码图片、关闭按钮、Escape 和焦点归还。列表 key 使用稳定复合键，不能继续只用 `method.type`。

## 10. 变更后的列表一致性

- 创建成功：记录满足当前 query 时插入正确位置；否则不显示。
- 编辑成功：先用权威响应替换同 ID；若筛选字段或排序键改变，精确重新查询当前页并以行 ID/scroll offset 恢复位置。
- 软删除/永久删除：就地移除。
- 恢复：从回收站移除；退出回收站后按原状态查询。
- 任何路径都不得无条件重置 URL、游标和 `scrollTop`。

## 11. 兼容性、发布与回滚

- 公开 DTO 只做加法或保持字段语义；二维码仍使用 `qrCodeUrl`，不暴露 asset ID。
- 管理员写入请求切换到新 schema，前后端必须同版本发布。
- migration 先于依赖新表/列的应用代码部署；预览环境完成端到端验证后再生产。
- 删除 `qrCodePublic` 是有意的配置契约变化，必须同步 `shared/domain/config.ts`、`site.config.ts`、README、spec 和测试。
- 应用回滚时保留新增表/列；补偿 migration 只在确认没有新数据依赖后执行。

## 12. 主要风险与控制

| 风险 | 控制 |
|---|---|
| 多状态/搜索/排序 where 不一致 | 单一 query builder，同一组绑定生成 COUNT 与 items |
| 动态排序 SQL 注入 | Zod 枚举 + 固定 SQL 映射 |
| 乐观锁检查与关联写入竞态 | 单 D1 batch + UUID mutation token；第一条 UPDATE 的 `meta.changes` 是唯一成功判据，所有关联语句受 token 守卫 |
| 保存失败误删二维码 | staged/ready 状态、引用检查、只清理本次新 asset |
| R2 成功但 D1 失败或相反 | 可重试状态机、幂等对象不存在处理 |
| 重复同类型加群方式导致 Vue key 冲突 | client key/稳定复合 key，不用数组索引或仅 type |
| 请求乱序覆盖新结果 | AbortSignal 传入 API client + request sequence 兜底 |
| 多 Agent 修改共享契约冲突 | 收敛阶段只允许一个实现 Agent 串行修改，并先写失败测试 |
| mutation token 残留 | token 清除作为同一 batch 最后一条语句；batch 失败整体回滚；维护检查扫描非空 token |
| 测试“绿但无证明力” | 场景测试必须创建真实 asset/群组引用并断言 D1、R2、API、UI，不接受固定不存在 UUID 代替状态测试 |
