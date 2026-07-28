# API 契约

## 边界

所有应用端点都位于 `/api/v1` 下。Pages 路由只能为 `/api/*` 调用 Function。Hono 统一负责请求 ID、JSON 处理、校验、认证、Origin/CSRF 检查、限流、日志和最终错误映射。

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
| `GET` | `/groups` | 已发布/已下架群聊的游标页；query 为 `q`、`cursor`、`limit` |
| `POST` | `/submissions` | 访客纯文本提交及 Turnstile token |
| `PUT` | `/groups/:id/like` | 幂等创建当前浏览器的点赞 |
| `DELETE` | `/groups/:id/like` | 幂等移除当前浏览器的点赞 |

`GET /groups` 默认返回 24 条，`limit` 超过 60 时拒绝请求。游标对客户端不透明，并绑定到归一化查询词和轮换时间窗。响应包含 `nextCursor` 和 `rotationWindow`。无效或过期游标返回 `VALIDATION_FAILED`，客户端应重新开始分页。

公开群聊 DTO 可以包含 ID、标题、描述、性质 `kind`、平台、标签、公开状态、Logo URL/元数据、当前阶段允许公开使用的加群方式、点赞数，以及获准展示的时间戳。禁止包含提交者联系方式、审核备注、软删除字段、R2 对象 key、投票者 hash 或内部版本号。

访客提交必须包含标题、性质 `kind`、已配置的平台，以及至少一个群号或 HTTPS URL。可以包含 1–5 个可选标签、描述、备注和私密联系方式。拒绝 multipart 和文件字段。

点赞路由通过 `X-Device-Id` header 接收由浏览器生成并持久化的 UUID。缺失或格式无效时返回 `VALIDATION_FAILED`。持久化前，使用 Secret pepper 对规范化后的设备 ID 做 hash。成功的 PUT/DELETE 返回权威点赞数和最终 `liked` 状态；不得把设备 ID 或 hash 放入响应。

公开二维码操作受 `site.config.ts` 中的阶段功能开关控制。开关启用前，公开 DTO 不返回 `qr_code` 加群方式，管理员 DTO 仍可读取和配置它；群聊要调整为 `published` 或 `delisted` 时，必须至少保留一种当前阶段可公开使用的加群方式。开关启用后，公开 DTO 才返回二维码资源的公开 URL 和展示元数据，仍不得返回 R2 key。

## 轮换窗口与分页

配置中的每日轮换时间点必须是按当地时间升序排列且不重复的 `HH:mm` 列表，至少包含一个值。默认时区为 `Asia/Shanghai`，默认列表为 `["04:01", "16:01"]`。

轮换算法只有一个服务端实现：

1. 把当前时刻转换到配置的 IANA 时区，定位最近一个已经到达的时间点；当天第一个时间点之前属于前一天最后一个时间窗。
2. 以当地日期 `2026-01-01` 为固定纪元，根据“经过的当地日数 × 每日时间点数量 + 当日时间点索引”生成整数 `rotationOrdinal`。
3. 对当前查询结果按稳定的 `rotation_key ASC, id ASC` 得到基础序列，以 `rotationOrdinal mod 结果总数` 为起点做循环位移；结果为空时不计算余数。
4. 搜索只过滤基础序列，不另行排序；点赞数绝不进入排序表达式。

游标必须绑定归一化查询词、`rotationOrdinal`、循环是否已经越过序列尾部以及最后一项的稳定排序 key。任一绑定值与当前请求不一致时返回 `VALIDATION_FAILED`。客户端只使用 API 返回的 `rotationWindow` 标识和顺序，不得自行计算轮换。

## 管理员路由

| 方法 | 路径 | 契约 |
|---|---|---|
| `POST` | `/admin/session` | 校验共享密码、设置 Cookie，并返回会话绑定的 CSRF token |
| `GET` | `/admin/session` | 返回当前会话状态和会话绑定的 CSRF token |
| `DELETE` | `/admin/session` | 使当前会话失效 |
| `GET` | `/admin/groups` | 经过筛选的游标列表，包含私有字段 |
| `POST` | `/admin/groups` | 新建群聊 |
| `PATCH` | `/admin/groups/:id` | 使用版本检查编辑内容/状态 |
| `DELETE` | `/admin/groups/:id` | 软删除 |
| `POST` | `/admin/groups/:id/restore` | 恢复软删除群聊 |
| `DELETE` | `/admin/trash/groups/:id` | 确认后永久删除 |
| `POST` | `/admin/assets` | 上传最终 WebP 及用途元数据 |
| `DELETE` | `/admin/assets/:id` | 删除未被引用的资源 |
| `GET` | `/admin/dashboard` | D1 业务指标和相互独立的 Analytics 组件 |
| `GET` | `/admin/health` | API、D1、R2、版本和部署健康状态 |

管理员列表查询必须明确区分业务 `status` 和 `deleted`。变更请求带上最后观察到的整数 `version`；编辑已过期时返回 `VERSION_CONFLICT`，禁止静默覆盖另一个标签页中的改动。

资源上传使用 `multipart/form-data`，但只接受一个最终 WebP。用途为 `logo` 或 `qr_code`；硬上限分别为 100 KB 和 300 KB。写入 R2 前，服务端必须验证 RIFF/WEBP 签名、可解析尺寸、用途和实际字节长度。

## 认证与请求安全

- 会话 Cookie 必须签名、带有效期，并设置 `HttpOnly`、`Secure`、`SameSite=Lax` 和适当的 Path。
- 默认会话有效期为 8 小时，只能通过服务端环境配置修改。
- 登录请求必须检查同源 `Origin`。登录成功后，服务端从会话 nonce 派生 CSRF token；`POST /admin/session` 和 `GET /admin/session` 在响应数据中返回该 token。
- 除登录外，不安全的管理员方法必须同时检查同源 `Origin` 和 `X-CSRF-Token`。该 header 必须与当前会话以常量时间比较校验；退出登录也适用。CSRF token 不得持久化到本地存储。
- 登录失败使用通用响应；默认按保护隐私的客户端分桶，每 15 分钟最多尝试 5 次。
- 公开提交必须通过 Turnstile；默认按客户端分桶，每小时最多接受 5 次。
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
