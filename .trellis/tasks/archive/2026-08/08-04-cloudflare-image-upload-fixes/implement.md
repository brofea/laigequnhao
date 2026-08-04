# Cloudflare 图片上传与展示修复执行计划

## 实施前门禁

在用户明确批准最新 planning summary 前，只维护本任务文档，不运行 `task.py start`，不修改产品代码。

任务批准后按以下顺序实施；所有代码变更只归属于本任务，遵守前后端分层规范和中文文档规范。

## 实施步骤

### 1. 修复同源 R2 URL 契约和公开读取回归

- 搜索并统一 `publicUrl`、`assetUrl`、`qrCodeUrl` 的 schema 约束。
- 为绝对 HTTP(S) URL 与 `/api/v1/assets/` 同源路径建立单一共享校验。
- 保持 `R2_PUBLIC_BASE_URL` 可选；生产默认不写入 localhost 或自定义测试域名。
- 增加 Worker 资源读取测试：真实写入 R2、请求公开 URL、消费完整响应体，断言字节、Content-Type、缓存头、安全头和 404。
- 增加管理员上传在未配置 `R2_PUBLIC_BASE_URL` 时返回 201 的回归，证明不会在 R2 写入后因 schema 解析抛 500。

风险文件：`shared/contracts/asset.ts`、`functions/_lib/adapters/r2-adapter.ts`、`functions/_lib/app.ts`、`functions/_lib/routes/admin-assets.ts`、`tests/workers/admin-assets.spec.ts` 或新的资源 Worker 测试。

回滚点：若 URL schema 或路由改动破坏既有 DTO，先恢复到仅契约/测试变更，保留根因测试，不调整 R2 bucket 公开权限。

### 2. 增强 WebKit 图片压缩适配器

- 保持 PNG/JPEG/WebP 支持和 HEIC 明确拒绝；更新输入提示与 `accept` 语义，避免把 HEIC 当成可上传格式。
- 让 `ImageBitmap.close` 缺失时安全释放；保证 `createImageBitmap` 失败时 HTMLImageElement 回退和 object URL 清理。
- 封装 Canvas WebP 编码回退：`toBlob` 空值/错误 MIME/异常时尝试 `toDataURL("image/webp")`，最终只接受真实 WebP；不接受 PNG/JPEG 伪装。
- 保持头像 alpha、二维码白底、质量阶梯、最终字节限制和预览 URL 清理。
- 扩展单元测试，至少覆盖 WebKit 失败形态、HEIC 拒绝、toBlob/toDataURL 回退、close 缺失和失败不生成预览。

风险文件：`src/shared/browser/image-compression.ts`、`src/shared/browser/image-compression.spec.ts`、必要时 `src/components/AdminEditForm.vue` 的输入提示。

回滚点：如果某浏览器仍不能编码 WebP，保留明确错误和阻止上传，不退回原图直传；隔离编码适配器的改动，便于后续替换实现。

### 3. 改为保存/提交时上传

- 在前端功能层定义 pending image 类型，不把 Blob 放入共享网络契约。
- `AdminEditForm` 选择图片只压缩、预览并保存 pending Blob；取消、关闭、替换时只清理本地 URL，不请求资源接口。
- 管理员保存时由父容器/功能 API 协调 staged logo/QR 上传，成功后把新 `r2Key`/`assetId`/公开 URL 注入待提交 DTO。
- 群组创建或更新 API 成功后保留既有 adoption/ref_count 生命周期；API 失败或版本冲突时 purge 本次 staged 资源，清理失败交给现有重试状态。
- 保存期间防止重复提交，显示处理中状态；保留旧资源直到新聚合成功。
- 公开投稿保持单次 multipart：提交前不上传，提交时携带压缩后的 logo Blob；取消/关闭零 R2 写入。
- 增加前端行为测试或 Playwright/API 组合测试，证明选择后没有 `/admin/assets` 请求，保存后才有请求，失败会清理。

风险文件：`src/components/AdminEditForm.vue`、`src/components/VisualShell.vue`、`src/features/admin/api.ts`、`src/features/admin/composables/useAdminGroups.ts`、`src/features/groups/api.ts`、相关 E2E 和 Worker 测试。

回滚点：优先回退保存编排的新增状态类型，不回退为选择即上传；若多资源协调出现复杂冲突，先拆出顺序上传与统一清理 helper，保持 UI 不直接调用原始 fetch。

### 4. 移除 Turnstile 全链路

- 删除前端 widget、脚本 loader、运行时 Sitekey 类型和公开表单 token 状态/模板。
- 删除共享 submission token 字段、后端 multipart token 合并、投稿路由配置检查和远程 siteverify adapter。
- 让纯文本 JSON、无图 multipart、带头像 multipart 均直接进入输入校验/限流/资源聚合流程。
- 更新测试夹具、Worker runtime vars、`.dev.vars.example`、Wrangler 源配置与生产生成脚本、README 和部署 runbook。
- 全仓 `rg` 检查 Turnstile key、脚本 URL、错误文案和配置 key；只保留本任务文档中对“删除范围”的历史说明，不保留生产代码引用。

风险文件：`src/components/TurnstileWidget.vue`、`src/shared/turnstile.ts`、`src/config/runtime.ts`、`src/env.d.ts`、`shared/contracts/submission.ts`、`functions/_lib/routes/submissions.ts`、`functions/_lib/adapters/turnstile-adapter.ts`、`functions/_lib/env.ts`、配置/文档/测试文件。

回滚点：Turnstile 删除不涉及数据库 migration；如果构建失败，先按全仓引用搜索补齐遗漏，不恢复运行时阻断。后续安全防护另立任务。

### 5. 跨层验证与部署 smoke

按项目门禁运行：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

重点验证矩阵：

| 场景 | 必须证明 |
|---|---|
| 生产默认 URL | 无 `R2_PUBLIC_BASE_URL` 时管理员上传返回 201，响应相对 URL 可被 Worker 读取 |
| 公开读取 | R2 对象字节、`image/webp`、缓存头和 404 正确 |
| WebKit | PNG/JPEG 预览成功；HEIC 明确拒绝；编码失败有错误且无上传 |
| 管理员草稿 | 选择/替换/关闭不上传；保存后才 staged，聚合失败会清理 |
| 公开投稿 | 无图和带图均成功；无 Turnstile；限流与图片校验不回归 |
| 全站展示 | 首页、发现、板块、详情、管理列表/详情刷新后图片都能加载 |

本地门禁通过后，由项目所有者在真实 Cloudflare 环境执行 smoke：直接访问一张 R2 资源 URL、管理员上传并刷新、公开投稿、移动端 PNG/JPEG 选择；记录状态码和部署版本，不记录 Cookie/Token/Secret。

## 文件所有权与依赖顺序

本任务作为一个集成任务实施，不拆成独立子任务；URL 契约、延迟上传和 Turnstile 删除会共同改变前后端共享 payload，拆分会增加跨层中间态。

依赖顺序：

```text
URL 契约/读取测试
  → WebKit 压缩适配
  → pending 图片保存编排
  → Turnstile 删除与投稿契约收敛
  → 全量测试和真实 Cloudflare smoke
```

## 完成定义

- `prd.md`、`design.md`、`implement.md` 已通过用户最新规划摘要审批。
- 所有接受标准有自动化或真实环境证据；未验证的真实 Cloudflare smoke 明确标记为待项目所有者执行。
- 代码质量门禁通过，Turnstile 生产引用清零，R2 公共读取和保存/提交时上传回归已覆盖。
- 完成后先提交任务代码 commit，再等待 `/trellis:finish-work` 归档任务和更新 Journal。
