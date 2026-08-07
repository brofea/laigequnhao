# API 契约

## 边界

所有应用端点都位于 `/api/v1` 下。Worker/Assets 分流只让 `/api/*` 进入 Hono；静态资源和 SPA fallback 不得被 API catch-all 截获。Hono 统一负责请求 ID、JSON 处理、校验、认证、Origin/CSRF 检查、限流、日志和最终错误映射。

公开 DTO 和管理员 DTO 是 `shared/contracts/` 中彼此独立的 Zod schema。禁止直接序列化数据库行。

## 响应信封

成功响应：

```json
{
  "ok": true,
  "data": {},
  "meta": {},
  "requestId": "uuid"
}
```

`meta` 可选。错误响应：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request data is invalid.",
    "fieldErrors": {
      "title": ["Required"]
    }
  },
  "requestId": "uuid"
}
```

`fieldErrors` 可选，只能包含可安全公开的校验细节。客户端按 `code` 分支处理，禁止按 `message` 分支。

## 公开路由

| 方法 | 路径 | 契约 |
|---|---|---|
| `GET` | `/groups` | 仅已发布群聊的游标页；query 为 `q`、`cursor`、`limit` |
| `POST` | `/submissions` | 访客纯文本提交或带最终 PNG 的 multipart 投稿 |
| `PUT` | `/groups/:id/like` | 幂等创建当前浏览器的点赞 |
| `DELETE` | `/groups/:id/like` | 幂等移除当前浏览器的点赞 |

`GET /groups` 默认返回 24 条，`limit` 超过 60 时拒绝请求。游标对客户端不透明，并绑定到归一化查询词和轮换时间窗。响应包含 `nextCursor` 和 `rotationWindow`。无效或过期游标返回 `VALIDATION_FAILED`，客户端应重新开始分页。

公开群聊 DTO 可以包含 ID、标题、描述、性质 `kind`、平台、标签、公开状态、Logo URL/元数据、当前阶段允许公开使用的加群方式、点赞数，以及获准展示的时间戳。禁止包含提交者联系方式、审核备注、软删除字段、R2 对象 key、投票者 hash 或内部版本号。

访客提交必须包含标题、性质 `kind`、已配置的平台，以及至少一个群号或 HTTPS URL。可以包含 1–5 个可选标签、描述、备注和私密联系方式。无图片时使用 JSON；带头像时使用一次性的 `multipart/form-data`，只允许附带一个最终压缩后的 Logo PNG，并与投稿表单一起完成校验和写入。公开投稿不得调用 staged/adopt 或其他临时图片上传接口；服务端投稿限流仍必须执行。

点赞路由通过 `X-Device-Id` header 接收由浏览器生成并持久化的 UUID。缺失或格式无效时返回 `VALIDATION_FAILED`。持久化前，使用 Secret pepper 对规范化后的设备 ID 做 hash。成功的 PUT/DELETE 返回权威点赞数和最终 `liked` 状态；不得把设备 ID 或 hash 放入响应。

公开二维码操作受 `site.config.ts` 中的阶段功能开关控制。开关启用前，公开 DTO 不返回 `qr_code` 加群方式，管理员 DTO 仍可读取和配置它；群聊要调整为 `published` 时，必须至少保留一种当前阶段可公开使用的加群方式。`delisted` 仍是管理员可维护的业务状态，但不进入任何公开 DTO 或公开查询。开关启用后，公开 DTO 才返回二维码资源的公开 URL 和展示元数据，仍不得返回 R2 key。

## 场景：V2 公开可见性与发布时间初始化

### 1. Scope / Trigger

- 触发原因：V2 已冻结“已下架群组完全不公开”，并确认当前网站尚未上架。
- 适用范围：公开列表、搜索、板块成员、详情深链、状态转换和新增发布时间字段。
- 目标：把公开过滤、管理可见性、软删除和发布时间写入规则固定为可执行契约。

### 2. Signatures

- 公开读取：`GET /api/v1/groups?q=<query>&cursor=<opaque>&limit=<n>`，以及公开详情/板块查询。
- 管理读取：`GET /api/v1/admin/groups` 和管理板块成员查询，可读取 `delisted`。
- 状态写入：管理员状态转换命令；只有成功的“非 `published` → `published`”转换写入服务端当前时间。
- 数据边界：`groups.status` 为 `pending | published | rejected | delisted`；`deleted_at` 独立表示软删除；`last_published_at` 可为 `NULL`。

### 3. Contracts

- 公开查询必须在 repository/service 边界使用 `status = 'published' AND deleted_at IS NULL`，不能先返回下架记录再由前端隐藏。
- 公开 DTO 与管理员 DTO 分离；公开 DTO 不包含 `delisted`、软删除、内部版本、mutation token、R2 key 或联系方式。
- 管理端可以查看、编辑和显式重新发布 `delisted`；软删除 restore 只清除删除状态并恢复资源引用，不自动发布。
- 当前数据库中的 `last_published_at` 全部初始化为 `NULL`；不得使用 `created_at`、`updated_at`、当前状态或 migration 时间推断历史发布时间。

### 4. Validation & Error Matrix

| 条件 | 结果 |
|---|---|
| 公开查询命中 `delisted`、回收站或永久删除群组 | 返回安全的不存在/不可见结果，不泄露状态 |
| 公开板块只含下架成员 | 返回空成员列表，不返回下架群组摘要 |
| 管理员执行 restore | 清除 `deleted_at`；不改变 `status`，不更新 `last_published_at` |
| 管理员执行非发布状态 → `published` | 原子更新状态和服务端 `last_published_at` |
| 普通编辑、`published` → `delisted`、冲突或失败重试 | 不更新 `last_published_at` |
| 客户端提交 `last_published_at` | 忽略或拒绝该管理字段，不信任客户端值 |

### 5. Good / Base / Bad Cases

- Good：公开 repository 直接过滤 `published`，管理查询仍能看到 `delisted`，公开响应中不存在下架记录。
- Base：迁移后所有现有群组的 `last_published_at` 为 `NULL`；seed 生成的标题/简介满足显示宽度 Contract。
- Bad：公开 API 返回 `delisted` 并让 GroupCard 隐藏徽章，或用 `created_at` 为现有记录伪造发布时间。

### 6. Tests Required

- Workers：列表、搜索、板块、详情深链均断言下架/软删除不出现在公开响应。
- Workers：状态转换断言仅非发布到发布写入服务端时间，restore 和冲突不写入。
- Migration：从当前 `0001`–`0003` schema 升级后断言所有现有 `last_published_at` 为 `NULL`。
- Contract：公开 DTO 不含管理字段；管理 DTO 可以读取下架状态。
- Playwright：公开首页、搜索、板块和分享深链使用下架负向 fixture；管理端仍能查看并显式重新发布。

### 7. Wrong vs Correct

```sql
-- Wrong：把公开隔离留给前端
SELECT * FROM groups WHERE deleted_at IS NULL;

-- Correct：在公开数据源边界完成过滤
SELECT id, title, description, kind, status
FROM groups
WHERE status = 'published' AND deleted_at IS NULL;
```

## 轮换窗口与分页

配置中的每日轮换时间点必须是按当地时间升序排列且不重复的 `HH:mm` 列表，至少包含一个值。默认时区为 `Asia/Shanghai`，默认列表为 `["04:01", "16:01"]`。

轮换算法只有一个服务端实现：

1. 把当前时刻转换到配置的 IANA 时区，定位最近一个已经到达的时间点；当天第一个时间点之前属于前一天最后一个时间窗。
2. 以当地日期 `2026-01-01` 为固定纪元，根据“经过的当地日数 × 每日时间点数量 + 当日时间点索引”生成整数 `rotationOrdinal`。
3. 对当前查询结果按稳定的 `rotation_key ASC, id ASC` 得到基础序列，以 `rotationOrdinal mod 结果总数` 为起点做循环位移；结果为空时不计算余数。
4. 搜索只过滤基础序列，不另行排序；点赞数绝不进入排序表达式。

游标必须绑定归一化查询词、`rotationOrdinal`、循环是否已经越过序列尾部以及最后一项的稳定排序 key。任一绑定值与当前请求不一致时返回 `VALIDATION_FAILED`。客户端只使用 API 返回的 `rotationWindow` 标识和顺序，不得自行计算轮换。

## 管理员路由

实际注册路径以 `/api/v1/admin` 为前缀（admin-groups 直接挂在 `/api/v1/admin`，未使用 `/admin/groups` 二级路径）：

| 方法 | 路径 | 契约 |
|---|---|---|
| `POST` | `/admin/session` | 校验共享密码、设置 Cookie，并返回会话绑定的 CSRF token |
| `GET` | `/admin/session` | 返回当前会话状态和会话绑定的 CSRF token |
| `DELETE` | `/admin/session` | 使当前会话失效 |
| `GET` | `/admin` | 经过筛选的**页码分页**列表，每页固定 50 条，返回 `{ items, page, pageSize: 50, totalItems, totalPages }`，排序恒追加稳定次排序 `id` |
| `POST` | `/admin` | 新建群聊 |
| `PATCH` | `/admin/:id` | 使用版本检查编辑内容/状态 |
| `DELETE` | `/admin/:id` | 软删除（与板块关联清理在单 D1 batch 原子完成） |
| `POST` | `/admin/:id/restore` | 恢复软删除群聊（不自动重建板块关联、不更新发布时间） |
| `DELETE` | `/admin/trash/groups/:id` | 确认后永久删除 |
| `GET` | `/admin/boards` | 板块列表（含成员数量） |
| `POST` | `/admin/boards` | 创建板块 |
| `PATCH` | `/admin/boards/:id` | 编辑标题/启停/排序模式（版本检查） |
| `DELETE` | `/admin/boards/:id` | 删除板块（级联清理成员关联） |
| `POST` | `/admin/boards/reorder` | 全量批量更新板块顺序（列表不一致返回冲突） |
| `GET` | `/admin/boards/:id/members` | 板块成员列表 |
| `POST` | `/admin/boards/:id/members` | 添加成员（published/delisted 可加，trash 拒绝，重复成员拒绝） |
| `DELETE` | `/admin/boards/:id/members/:groupId` | 移除成员关联（不删除群组） |
| `POST` | `/admin/boards/:id/members/:groupId/move` | 上移/下移（相邻位置交换，原子） |
| `POST` | `/admin/assets` | 按用途上传最终 Logo PNG 或二维码 JPEG |
| `DELETE` | `/admin/assets/:id` | 删除未被引用的资源 |
| `GET` | `/admin/dashboard` | D1 业务指标和相互独立的 Analytics 组件 |
| `GET` | `/admin/health` | API、D1、R2、版本和部署健康状态 |

管理端列表查询必须明确区分业务 `status` 和 `deleted`。变更请求带上最后观察到的整数 `version`；编辑已过期时返回 `VERSION_CONFLICT`，禁止静默覆盖另一个标签页中的改动。

## 公开板块路由

| 方法 | 路径 | 契约 |
|---|---|---|
| `GET` | `/api/v1/boards` | 启用板块及已发布成员，支持 `manual_asc`、`manual_desc`、`hourly_random` 三种排序；空板块返回空 `groups` |
| `GET` | `/api/v1/discover` | 发现新群：`last_published_at DESC, id DESC`，最多 10 条 |
| `GET` | `/api/v1/tags` | 标签聚合：只统计 published，`count DESC, tag ASC`，单次聚合查询 |

`last_published_at` 不进入公开 DTO；`hourly_random` 的小时槽位使用 `site.config.boards.timezone`，不写数据库位置。

资源上传使用 `multipart/form-data`，用途为 `logo` 或 `qr_code`，且 MIME 必须与用途严格匹配：Logo 只能是透明 PNG，二维码只能是白底 JPEG。硬上限分别为 128 KB 和 1 MB，Logo 最长边/总像素上限为 128/16,384，二维码为 1024/1,048,576；上传请求体总上限为 1.2 MB。浏览器原图上限 5 MB 只属于客户端预处理约束，不能作为后端收到压缩文件后的校验条件。写入 R2 前，服务端必须依次限制请求体和实际文件字节数、读取对应格式的真实签名和尺寸、检查宽高与总像素；PNG 在 workerd 中完整解码验证，JPEG 至少完成 SOI/marker/SOF/SOS/EOI 结构校验。不得信任客户端声明的尺寸、字节数或 MIME。

## 场景：管理员图片资源的本地访问与聚合保存

### 1. Scope / Trigger

- 涉及 R2 上传、Logo/二维码预览或群组创建/PATCH 时，必须同时检查“对象已写入”“URL 可访问”“资源已纳入群组聚合保存”三条链路。

### 2. Signatures

- `POST /api/v1/admin/assets` 返回 `{ id, r2Key, purpose, publicUrl, width, height, byteLength }`。
- `POST /api/v1/admin/groups` 与 `PATCH /api/v1/admin/groups/:id` 使用 `logoR2Key?: string | null`；二维码加群方式使用 `assetId`。
- 群组响应使用 `logoUrl` 和 `joinMethods[].assetUrl`，不得要求前端拼接 R2 key。

### 3. Contracts

- `R2_PUBLIC_BASE_URL` 是服务端生成公开 URL 的唯一基址，返回前须移除尾部 `/`。
- 本地 Miniflare R2 持久化目录不自带 HTTP 服务；开发环境由 Vite 的 `/assets/*` 中间件只读提供文件，基址为 `http://localhost:5173/assets`。
- 上传成功后，前端必须把 `publicUrl` 写入当前草稿的 `assetUrl`；保存群组时仍提交 `r2Key/assetId`，URL 只用于展示。
- 服务端按当前环境和持久化的 R2 key 重建响应 URL，不能信任数据库中的历史域名。

### 4. Validation & Error Matrix

- `logoR2Key` 不存在、用途不是 `logo`、状态不可采用 → `VALIDATION_FAILED`，字段为 `logoR2Key`。
- 二维码 `assetId` 不存在、用途不匹配或状态不可采用 → `VALIDATION_FAILED`，字段定位到对应加群方式。
- `/assets/*` key 为空、路径越界或对象不存在 → 本地文件服务返回 `404`，不得回退到 SPA。
- 删除仍被其他群组引用的 Logo → 只减少当前群组引用，不删除共享 R2 对象。

### 5. Good / Base / Bad Cases

- Good：上传返回 `publicUrl`，界面立即预览，保存后重新获取仍返回当前环境的 URL。
- Base：旧数据保存了失效域名，但存在 `logo_r2_key`；读取时使用当前 `R2_PUBLIC_BASE_URL` 恢复显示。
- Bad：只把对象写入 Miniflare 目录，或只在界面保存临时 URL，却没有提交 `logoR2Key/assetId`。

### 6. Tests Required

- 前端单测断言上传后向父组件传递 `publicUrl`，删除时同时清空 `assetId` 与 `assetUrl`。
- Worker 契约测试断言创建、替换、清空和共享 Logo 的 URL、状态及 `ref_count`。
- 本地验证必须直接请求 `/assets/<r2-key>`，断言 `200`、正确 `Content-Type`，并确认浏览器图片具有非零 `naturalWidth`。

### 7. Wrong vs Correct

```ts
// Wrong：上传成功后只保存 ID，界面和群组聚合都丢失图片状态
emit("update:assetId", clientKey, result.id);

// Correct：展示 URL 立即进入草稿，保存时服务端再采用稳定资源标识
emit("update:assetId", clientKey, result.id, result.publicUrl);
```

## 场景：公开投稿单请求图片写入与 R2 补偿

### 1. Scope / Trigger

- 适用范围：访客创建一条带头像的投稿，以及该头像从浏览器预览到审核前存储的完整链路。
- 公开投稿只允许在最终提交请求中携带一张头像；管理员已有的认证 staged/adopt 资源流程继续保留。
- 目标：避免公开 staged 资源、临时状态和孤儿资源，同时保证 R2 与 D1 写入失败时可恢复。

### 2. Signatures

- 无图片：`POST /api/v1/submissions` 使用 JSON，包含投稿 payload。
- 带图片：同一路径使用 `multipart/form-data`，包含 `payload` JSON、`file`（或 `logo`）以及可选的 `filePurpose=logo`；服务端统一验证后才写入。
- 服务端生成内部 R2 key，写入 Logo 对象后以同一 D1 batch 创建 ready asset 引用和投稿群组。

### 3. Contracts

- 浏览器接受最大 5 MB 的 PNG/JPEG 原图，不再兼容 WebP；先缩放并按用途输出本地预览。透明 Logo 保留 alpha 并一次编码为 PNG，二维码铺白底后依次以 JPEG quality `0.90 → 0.80 → 0.70` 尝试，三次均超限才失败。
- 最终 Logo/二维码分别限制 128 KB/1 MB；分别限制 128/1024 最长边和 16,384/1,048,576 总像素；请求体总上限为 1.2 MB。
- 后端只信任实际请求体和文件字节，按“请求体/文件字节 → 用途 MIME → PNG/JPEG 真实结构与尺寸 → 宽高/像素 → 格式对应的解码/结构校验”顺序校验。
- 公开端不得有 staged/adopt 上传接口；R2 写入后若 D1 或投稿创建失败，必须补偿删除；补偿删除失败要记录 request ID、资源 key 和错误，并留下 `delete_failed` 清理记录供后续重试。

### 4. Validation & Error Matrix

- 请求体或最终文件超限 → `PAYLOAD_TOO_LARGE`（413）。
- 用途 MIME 不匹配、非 PNG/JPEG、PNG chunk 结构无效或 JPEG marker 结构无效 → `UNSUPPORTED_MEDIA_TYPE`（415）。
- 宽高或总像素超限 → `VALIDATION_FAILED`（400）。
- R2 或 D1 不可用 → `DEPENDENCY_UNAVAILABLE`（503），不得留下可公开采用的半成品。
- 补偿删除失败 → 保留安全错误响应，结构化记录并进入 `delete_failed` 清理队列。

### 5. Good / Base / Bad Cases

- Good：用户选择 5 MB 以内 PNG/JPEG 原图，浏览器本地得到目标 Logo PNG 或二维码 JPEG，最终请求一次完成限流、图片校验、R2 和 D1 写入。
- Base：头像只执行一次 PNG 编码；二维码按 `0.90 → 0.80 → 0.70` 质量阶梯尝试，三次仍超限时不上传并提示用户裁剪。
- Bad：先公开上传临时 key、信任前端尺寸/字节声明，或 D1 失败后不删除 R2 对象。

### 6. Tests Required

- 浏览器单测覆盖透明 Logo PNG、白底二维码 JPEG、质量参数序列、三次失败、5 MB 原图、对象 URL 清理，并使用真实二维码解码器验收压缩结果。
- Workers Vitest 必须在本地 workerd 中覆盖 multipart 请求体/文件上限、用途 MIME、PNG/JPEG 结构/尺寸/字节校验、ready asset 聚合及 R2 补偿/清理失败。
- Playwright 覆盖管理员头像/二维码上传和公开单请求头像投稿，至少运行桌面与移动视口。

### 7. Wrong vs Correct

```ts
// Wrong：公开端先调用临时上传接口，再把临时 key 交给投稿接口
await api.post("/public/uploads", file);
await api.post("/submissions", { ...payload, logoKey });

// Correct：公开端只在最终投稿时发送压缩后的单张图片
const form = new FormData();
form.append("payload", JSON.stringify(payload));
form.append("file", compressedLogo, "logo.png");
await api.postForm("/submissions", form);
```

## 认证与请求安全

- 会话 Cookie 必须签名、带有效期，并设置 `HttpOnly`、`Secure`、`SameSite=Lax` 和适当的 Path。
- 默认会话有效期为 8 小时，只能通过服务端环境配置修改。
- 登录请求必须检查同源 `Origin`。登录成功后，服务端从会话 nonce 派生 CSRF token；`POST /admin/session` 和 `GET /admin/session` 在响应数据中返回该 token。
- 除登录外，不安全的管理员方法必须同时检查同源 `Origin` 和 `X-CSRF-Token`。该 header 必须与当前会话以常量时间比较校验；退出登录也适用。CSRF token 不得持久化到本地存储。
- 登录失败使用通用响应；默认按保护隐私的客户端分桶，每 15 分钟最多尝试 5 次。
- 公开提交按客户端分桶，每小时最多成功提交默认 10 次（可由 `SUBMISSION_LIMIT_PER_HOUR` 配置）；限制必须在服务端执行。
- 点赞使用幂等语义、投票者唯一约束，并默认按客户端分桶限制为每 10 分钟最多 30 次变更。
- 限制必须在服务端执行，且返回 `Retry-After`。

限流 key 可以组合由 IP 衍生请求元数据生成的短期 hash 和匿名设备 ID。禁止持久化原始 IP 地址。

## HTTP 规则

- JSON 请求必须使用 `Content-Type: application/json`。
- URL 加群方式只允许 `https:`；群号仍为纯文本。
- 创建使用 `201`；只有确实不返回响应体时使用 `204`；只有经过验证的条件读取使用 `304`。
- 私有/管理员响应使用 `Cache-Control: no-store`。
- 公开列表缓存不得超过当前轮换时间窗，也不得把一个查询的游标泄漏到另一个查询。
- 默认同源部署；不要添加宽松 CORS。
- 每个响应都包含 `X-Request-Id`。

## 兼容性

允许新增响应字段。删除或重命名字段、改变字段含义或新增枚举成员时，必须同时更新共享契约、前端处理、migration 分析和契约测试。在有明确的版本迁移方案之前，保持 `/api/v1` 稳定。
