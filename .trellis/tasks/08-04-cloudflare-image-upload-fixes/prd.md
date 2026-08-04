# 修复 Cloudflare 上线后的图片上传与显示问题

## Goal

让网站在 Cloudflare Worker + R2 生产环境中稳定完成群组头像和二维码的完整链路：

```text
移动端/桌面端选图 → 浏览器压缩与本地预览 → 保存/提交时上传 → R2/D1 记录 → 页面展示
```

同时彻底移除 Turnstile，取消对中国大陆不可用的外部验证依赖，保证公开投稿恢复正常；现有服务端投稿限流继续保留。

## 背景与已确认事实

- 本地开发环境的图片功能正常；上线 Cloudflare 后，主页和管理页均没有图片能正常显示。
- iPhone 13 / iOS 18 / Chrome 最新版（底层 WebKit）中，从相册、直接拍照、文件选择器选择 PNG 或 HEIC 后均无法完成压缩和预览，未产生后端上传请求。HEIC 暂不纳入支持范围，但 PNG 等受支持格式必须可用。
- Windows 10 / Chrome 最新版和 macOS 15.7 ARM / Chrome 中，浏览器能压缩并显示本地预览，管理员上传后 R2 确实有对象且大小正确，但网页无法显示该图片。
- macOS 15.7 ARM / Safari 中，选择图片后无法显示预览，说明当前浏览器压缩器未覆盖 WebKit 的实际解码/Canvas/WebP 编码边界。
- 生产管理员上传请求 `POST /api/v1/admin/assets` 返回 HTTP 500 `INTERNAL_ERROR`，但 R2 已有图片对象。代码证据表明：`functions/_lib/adapters/r2-adapter.ts:65-67` 在未配置 `R2_PUBLIC_BASE_URL` 时生成相对路径 `/api/v1/assets/<key>`，而 `shared/contracts/asset.ts:118-127` 的 `assetInfoSchema.publicUrl` 强制要求绝对 URL；`functions/_lib/routes/admin-assets.ts:146` 在 R2 写入后解析该 schema，因相对 URL 抛错。这是“R2 有对象但上传响应 500”的确定根因。
- R2 公开读取路由位于 `functions/_lib/app.ts:46-60`，但现有 Worker 测试主要验证 `R2.head()` 和 DTO URL，没有真正请求图片 URL 并消费响应体，因此生产公开读取链路缺少等价回归。
- `src/components/AdminEditForm.vue:245-286` 当前在选择图片后立即调用管理员资源上传接口。取消/关闭 Dialog 后，R2 仍会留下未被群组引用的对象，违反“先本地预览、保存/提交时再统一上传”的约定。
- 公开投稿当前在 `src/components/AdminEditForm.vue:251-253` 暂存 Blob，但仍依赖 `TurnstileWidget`；`shared/contracts/submission.ts:67`、`functions/_lib/routes/submissions.ts:141-250` 以及配置、文档和测试中均存在 Turnstile 依赖。
- 当前压缩器 `src/shared/browser/image-compression.ts:239-251` 严格要求 `canvas.toBlob()` 返回 `image/webp`，解码优先走 `createImageBitmap` 并在 `finally` 调用 `ImageBitmap.close()`；现有测试没有覆盖 WebKit 的空 Blob、非 WebP 回退、对象 URL 生命周期和缺少 `close()` 方法等边界。
- 已知本地基线：管理员资源、管理员群组、公开投稿 Worker 测试共 51 个通过；浏览器压缩单测 10 个通过。Worker 测试退出时出现 Miniflare 临时目录 `EBUSY` 清理警告，但不影响测试结果，后续质量检查需确认其稳定性。

## Requirements

### R1. WebKit 与移动端图片处理

- iOS Chrome/Safari 从相册、拍照或文件选择器选取 PNG/JPEG/WebP 后，必须完成解码、压缩、WebP 预览和后续上传准备；成功时显示明确的本地预览，失败时显示具体可操作错误，不能静默停在“处理中”或点击按钮无请求。
- 统一处理头像和二维码的解码、等比缩放、WebP 编码、目标字节限制和对象 URL 清理；不能为移动端复制第二套压缩逻辑。
- 压缩器必须对 `createImageBitmap`、`ImageBitmap.close`、`HTMLImageElement`、Canvas 2D、`toBlob` 回调为空/类型异常等能力分别做兼容处理，并在能力不足时给出稳定错误。
- HEIC 暂不支持上传；选择 HEIC 时应明确提示“不支持 HEIC，请转换为 PNG/JPEG/WebP 后重试”，不得影响 PNG/JPEG/WebP。
- 压缩失败不得发起上传请求；替换、取消、关闭和卸载时不得遗留 Blob URL。

### R2. 生产 R2 URL 与图片展示

- 未配置 `R2_PUBLIC_BASE_URL` 时，系统使用当前 Worker 同源 `/api/v1/assets/<key>` 作为合法资源 URL；共享契约必须接受这种同源 URL，不能在 R2 已写入后因 URL 形式抛出 500。
- 配置了 `R2_PUBLIC_BASE_URL` 时，仍可使用经过编码的自定义资源域名；不得生成 localhost、测试域名或重复斜杠路径。
- `/api/v1/assets/<key>` 必须在 Cloudflare Worker 生产路由中返回对应 R2 对象的真实字节、`Content-Type: image/webp`、长期缓存头和 `X-Content-Type-Options: nosniff`；不存在对象返回 404。
- 管理员群组列表、详情、创建、更新以及公开首页、发现、板块和群组详情必须使用一致的头像/二维码 URL 规则；刷新页面后图片仍可加载。
- 增加 Worker 集成回归：上传合法图片后请求返回的公开 URL，消费 fetch 响应体并断言字节、Content-Type、缓存头；同时覆盖不存在对象的 404 和同源 URL。

### R3. 保存/提交时统一上传图片

- 头像和二维码选择后只在浏览器压缩并创建本地预览，不立即调用 R2 上传接口。
- 管理员创建/编辑 Dialog 在点击保存/添加新群后，才按当前草稿上传待提交的压缩 WebP；成功后提交群组聚合，失败时清理本次产生的 staged 资源。
- 公开投稿在点击提交后，才把待提交头像 WebP 与表单放入一次 multipart 请求；取消/关闭、图片替换或校验失败都不得产生 R2 对象。
- 已存在的头像/二维码在用户未替换时继续沿用；用户替换或移除时，保存后的既有 staged/adopt/ref_count/delete_pending/delete_failed 生命周期保持一致。
- 一次保存涉及多个二维码或头像时，必须明确上传顺序、失败补偿和草稿状态，不能留下无法回收的 R2 孤儿。

### R4. 彻底移除 Turnstile

- 删除公开投稿前端 widget、脚本加载器、Sitekey 运行时配置、表单 token 状态和提交前验证；不再显示“安全验证暂时不可用”或任何 Turnstile 文案。
- 删除后端 `TURNSTILE_SECRET_KEY`、`SKIP_TURNSTILE`、Turnstile adapter、投稿 token 字段、multipart token 解析以及投稿路由的配置检查/远程验证。
- 删除或更新 `.dev.vars.example`、`wrangler*.jsonc`、`scripts/worker-dev.mjs`、生产配置生成脚本、`src/env.d.ts`、README、Cloudflare 部署 runbook 和所有测试中的 Turnstile 配置与断言。
- 公开投稿（纯 JSON、无图 multipart、带头像 multipart）在不依赖外部验证的情况下成功；既有服务端投稿限流、图片校验、R2/D1 原子写入和补偿清理继续有效。

### R5. 跨层契约与回归测试

- 共享投稿契约、前端 API 客户端、后端 multipart parser、service、D1/R2 资源生命周期和 DTO 映射保持一致；不得由组件自行重定义 payload。
- 测试覆盖 WebKit 相关压缩边界：PNG/JPEG 解码、HEIC 明确拒绝、空 MIME/扩展名、`createImageBitmap` 回退、`close()` 缺失、Canvas 编码失败、空 Blob、WebP 类型确认和对象 URL 清理。
- 测试覆盖保存前零上传、保存时上传、取消/关闭零 R2 写入、上传失败清理、公开投稿带图和管理员多资源保存。
- 保留最终图片安全边界：上传资源仍为有效 WebP，按用途执行字节、尺寸、像素和完整解码校验；移除 Turnstile 不等于放宽图片校验。

## Acceptance Criteria

- [ ] 在 iPhone 13 / iOS 18 / Chrome 最新版和 macOS Safari 上选择 PNG/JPEG 后能看到本地压缩预览；选择 HEIC 显示明确不支持提示；受支持图片压缩失败时有可见错误且不会产生上传请求。
- [ ] 管理员选择头像或二维码后、未点击保存前，Network 中没有 `/api/v1/admin/assets` 请求，R2 没有新增对象；点击保存/添加新群后才上传并完成群组关联。
- [ ] Windows Chrome、macOS Chrome 和 Safari 管理员上传后，R2 对象存在，响应 URL 可被浏览器直接加载；保存群组并刷新后头像和二维码仍可显示。
- [ ] Worker 集成测试真实请求 `/api/v1/assets/<key>`，消费响应体并验证字节、`Content-Type: image/webp`、缓存头和不存在对象的 404；生产同源 URL 不再触发 500。
- [ ] 公开投稿页面不再加载 Turnstile 脚本、不再渲染安全验证区块；纯文本投稿、无图 multipart 投稿和带头像 multipart 投稿均可成功，且限流与图片校验仍生效。
- [ ] 公开投稿选择图片后取消/关闭不写入 R2；点击提交后才统一上传；投稿或 D1 聚合失败时不会留下不可回收对象。
- [ ] 全仓搜索不再存在生产运行所需的 `TURNSTILE_SECRET_KEY`、`SKIP_TURNSTILE`、`VITE_TURNSTILE_SITE_KEY`、Turnstile adapter/widget/脚本调用或相关错误文案；README 和 Cloudflare 配置说明同步更新。
- [ ] `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm test:e2e`、`pnpm build` 通过；若仍有环境性临时目录警告，必须单独记录并确认不掩盖测试失败。
- [ ] 完成一次真实 Cloudflare 部署后的 smoke：公开资源 GET、管理员上传/刷新展示、公开投稿、移动端 PNG/JPEG 选择结果；不把仅本地 workerd 通过当作生产验收。

## Out of Scope

- 不新增替代 CAPTCHA、Turnstile 或其他外部安全验证；后续安全防护另立任务。
- 不支持 HEIC，不引入服务器端 HEIC/PNG/JPEG 转码；HEIC 只需明确拒绝并指导用户转换格式。
- 不改变 R2/D1 资源生命周期语义，不删除既有 staged/ready/delete_pending/delete_failed 清理机制。
- 不进行与本问题无关的页面视觉重构、数据库结构重构或部署架构迁移。

## 规划决策

- 生产默认采用同源 `/api/v1/assets/<key>` URL；`R2_PUBLIC_BASE_URL` 只作为可选自定义域名覆盖。
- 图片一律“先本地压缩预览、保存/提交时上传”；管理员不需要人机验证，但也不因选择图片而提前写 R2。
- 移除 Turnstile 后保留服务端投稿限流、最终 WebP 安全校验和 R2/D1 失败补偿。
- WebKit 兼容采用现有 Canvas/浏览器 API 适配器增强和能力探测；不因 HEIC 另引入重量级转码器。
