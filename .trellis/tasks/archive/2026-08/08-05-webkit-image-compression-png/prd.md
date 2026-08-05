# 修复 WebKit 图片压缩与上传

## Goal

解决 macOS Safari 和 iOS 浏览器选图后没有预览、无法上传的问题：继续在浏览器本地完成头像/二维码压缩，但把最终格式从 WebP 改为 PNG，使 WebKit 不依赖原生 WebP 编码器也能完成预览和上传。

## Background and confirmed facts

- GitHub Issue #8「WebKit 浏览器无法上传图片」是 Issue #7 的延续；现象是 macOS Safari、iOS 浏览器选择图片后不出现预览，也无法上传。
- 当前唯一的前端压缩适配器位于 `src/shared/browser/image-compression.ts:16-53,347-360,410-463`：通过 Canvas 的 `toBlob`/`toDataURL` 生成并严格校验 WebP；Safari/WebKit 缺少原生 WebP 编码器时会进入压缩失败路径。
- 当前压缩策略在 `shared/contracts/asset.ts:12-48`：头像为最长边 128px、80KB，二维码为最长边 1024px、400KB，并通过 `startQuality/minQuality/qualityStep` 做阶梯降级；这些策略由前端和后端共享。
- 当前后端只接受 WebP：共享契约 `shared/contracts/asset.ts:70-76,147-156` 固定 `image/webp`，服务端 `functions/_lib/services/image-validation.ts:28-32,74-202,243-260` 解析并完整校验 WebP。
- 当前头像选择失败仅写入表单内 `role="status"` 文案（`src/components/AdminEditForm.vue:241-291,596-599`），没有按本需求弹出 toast；组件已存在 `toast` 事件，可由父容器接入现有 toast 展示。
- 公开投稿 multipart 客户端仍以 `logo.webp`/WebP 语义发送图片（`src/features/groups/api.ts:86-100`）；管理员资源上传、资源生命周期和展示链路也都以 WebP 为契约。
- `ASSET_UPLOAD_REQUEST_MAX_BYTES` 当前为 512KB（`shared/contracts/asset.ts:6-10`），小于新的二维码 1MB 最终文件上限，切换二维码上限时必须同步调整请求体总上限并保留 multipart 边界开销。
- 本地 seed 脚本 `scripts/seed-local.mjs` 当前使用 Sharp 的 WebP 编码、`.webp` 文件名、`image/webp` SQL 元数据和 WebP R2 key；对应断言位于 `scripts/seed-local.test.mjs`，必须随生产上传链路一起切换为 PNG。

## Requirements

### R1. PNG 压缩策略

- 头像统一压缩为 PNG，最长边不超过 128px，保留 alpha 通道，最终文件不超过 128KB。
- 二维码统一压缩为 PNG，最长边不超过 1024px，不保留 alpha 通道（以白色背景铺平），最终文件不超过 1MB。
- 前端仍统一使用同一套本地压缩/预览链路，不为 Safari 单独复制一套实现；输入格式支持范围和原图读取上限沿用现有约束，除非实现验证表明必须调整。
- 每张图片只执行一次 PNG 编码，不再按质量阶梯反复编码；若一次编码结果超过目标大小，视为压缩失败。

### R2. 前后端契约

- 后端对新上传头像和二维码执行与前端相同的 PNG MIME、文件字节数、最长边、像素数及透明度约束；头像上限为 128KB，二维码上限为 1MB。
- 所有依赖最终图片格式的 multipart 文件名、`contentType`、共享 DTO/schema、资源校验、R2 元数据和公开投稿链路同步改为 PNG 语义。
- 上传请求体总上限必须大于 1MB 文件及 multipart 边界开销。

### R3. 失败反馈

- 任一前端压缩失败都不创建预览、不发起上传，并弹出 toast“图像压缩失败”。
- 头像压缩失败的 toast 文案必须是“图像压缩失败”。
- 二维码压缩失败的 toast 文案必须是“图像压缩失败，请考虑裁剪图像”。
- 取消、替换、关闭和卸载时继续清理本地预览 URL；成功压缩后仍保持现有的保存/提交时上传语义。

### R4. 回归验证

- 单元测试覆盖 PNG 编码、头像 alpha、二维码白底、一次编码、超过目标大小失败、预览 URL 清理和压缩失败无上传。
- Worker/契约测试覆盖 PNG 有效性、两种用途的尺寸/字节/透明度边界、1MB 二维码请求体和错误响应。
- 具备条件时用 Playwright 在 Safari/WebKit 与 Firefox 上验证选图预览和上传准备；至少保留可重复的自动化压缩适配器测试。

## Acceptance Criteria

- [ ] macOS Safari 和 iOS 浏览器选择 PNG/JPEG/WebP 输入后，头像或二维码能显示本地 PNG 预览；不再因 WebP 编码器缺失而静默失败。
- [ ] 头像结果是 PNG、最长边不超过 128px、带 alpha、文件不超过 128KB；二维码结果是 PNG、最长边不超过 1024px、不带 alpha、文件不超过 1MB。
- [ ] 每次压缩只进行一次 PNG 编码；单次结果超过限制或浏览器压缩能力不可用时，不产生预览/上传，并显示精确的头像或二维码 toast 文案。
- [ ] 后端新上传与前端采用相同的 PNG 类型、大小、尺寸、像素和透明度限制；二维码 1MB 上传请求不会被请求体总上限误拒绝。
- [ ] 管理员保存、公开投稿和刷新后的图片展示链路均使用 PNG；既有保存/提交时上传、资源清理和失败补偿语义不回归。
- [ ] `pnpm seed` 清空本地资源后生成的 R2 key、文件扩展名、Content-Type 和 D1 SQL 元数据全部为 PNG。
- [ ] 相关前端、共享契约、Worker 测试以及项目质量门禁通过。

## Resolved decisions

- 不保留任何 WebP 兼容：新上传、资源校验、DTO、R2 元数据、公开投稿、管理员上传、前端预览和本地 seed 全部改为 PNG。
- 网站尚未发布，既有本地/开发 WebP 资源可以清空或通过现有 seed/数据库重建；不新增 WebP 读取、迁移或双格式兼容逻辑。
- 本地 `scripts/seed-local.mjs` 及 `scripts/seed-local.test.mjs` 属于本任务范围，生成的图片、R2 key、扩展名、Content-Type 和 SQL 必须全部改为 PNG。

## Technical notes and deferred items

- PNG 服务端校验按 PNG signature/chunk/IHDR/透明度结构和 Photon 完整解码实现；详细边界记录在 `design.md`，不改变 MVP 行为。
- 一次 PNG 编码超限时只提示失败；用户可重新选择或裁剪后再次触发一次新的压缩请求，不在同一次压缩中自动降级质量。
- 本任务完成前的本地验证需要先运行 `pnpm clean --yes`，避免旧的 WebP D1/R2 数据影响结果。

## Out of scope

- 不引入第三方 PNG 编码器或 HEIC 转码器，除非后续证据证明浏览器原生 PNG 编码不足以满足需求。
- 不改变与本问题无关的管理员资源生命周期、群组保存/提交事务和页面视觉结构。
