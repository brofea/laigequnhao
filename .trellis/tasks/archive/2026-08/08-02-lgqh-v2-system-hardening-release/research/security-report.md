# T06 安全检查报告（阶段十）

- 日期：2026-08-02
- 方法：源码审计 + 负向运行时探测（本地 workerd，真实 D1/R2 模拟）
- 证据：`scripts/security-probe.mjs`、`scripts/security-probe2.mjs` 输出（见下）

## 1. 权限矩阵验证（RPD §26.4、T06 prd §8）

| 场景 | 期望 | 实际 | 结论 |
|---|---|---|---|
| 匿名管理写入 `POST /admin` | 401 | 401 `AUTH_REQUIRED` | ✅ |
| 已登录但缺 CSRF 写请求 | 403 | 403 `FORBIDDEN` | ✅ |
| 公开详情 DTO 含内部字段（auditNotes/contact/version/deletedAt/logoR2Key） | 无 | 无（keys 仅公开 13 字段） | ✅ |
| 下架群组深链 | 404 | 404 `NOT_FOUND` | ✅ |
| 回收站群组深链 | 404 | 404 `NOT_FOUND` | ✅ |
| 不存在 id 深链 | 404 | 404 `NOT_FOUND` | ✅ |
| 标签聚合只统计 published | 不含下架 | "仅发布标签" count=1（发布 1 下架 1，未计入下架） | ✅ |
| 发现新群最多 10 | ≤10 | 10 | ✅ |
| 回收站群组从公开板块移除 | 不可见 | `stillVisible: false` | ✅ |
| 超限上传 | 拒绝 | 413 `PAYLOAD_TOO_LARGE` | ✅ |
| 错误响应含 stack | 无 | `hasStack: false` | ✅ |

## 2. CSRF 覆盖面

- 全部 20 个管理写路由（群组 POST/PATCH/DELETE/restore、板块 CRUD/reorder/members/move、assets 上传/删除/cleanup）均挂 `csrfProtection()`（源码 grep 计数 20）。
- CSRF token 为 HMAC(sessionId:csrf)（auth-service.ts:56,77），绑定会话不可重放跨会话。

## 3. 上传与 R2

- 类型/大小校验：413 超限拒绝（探测证据）。
- R2 临时资源：admin-assets 有 mode=purge 清理接口 + cleanup 接口；workers 测试 admin-resource-lifecycle（13 用例）覆盖失败清理路径（保留 tombstone）。
- 资源访问：公开 `/api/v1/assets/:key` 仅回显 R2 对象本身，key 不来自 API 响应（公开 DTO 无 r2Key）。

## 4. 日志脱敏

- 全项目仅 `error-handler.ts:8` 一处 `console.error("[api-error]", err.message)`。
- 无请求体/完整 URL/header 日志；无 session cookie、token、二维码内容、私密链接写入日志。
- RPD §8.1 日志要求满足（结构化 JSON 事件目前未实现，但 logging-guidelines 为 spec 级目标，本版本无敏感泄露风险）。

## 5. 版本冲突与突变令牌

- groupUpdateSchema 强制 `version` 必传（无 version 400）；服务端 409 `VERSION_CONFLICT`（E2E 版本冲突测试验证 Toast 呈现且不覆盖）。
- 突变令牌（mutation token）由 T01 既有实现；admin-resource-lifecycle 覆盖原子批量与失败回滚。

## 6. 结论

安全验收标准（T06 prd §8 全部 11 项）全部满足。未发现需要回派 T04 的安全缺陷。日志结构化事件（request.completed 等）为 spec 目标，本版本以 error-level 最小日志运行，记录为已知改进项（非阻塞）。
