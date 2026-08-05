# 三平台 Playwright 图片流程 E2E 测试

## Goal

为头像和二维码图片处理建立真正跨浏览器引擎的 Playwright E2E 回归，覆盖 Chromium、WebKit（Safari 对应引擎）和 Firefox，确保用户从选择原图、前端压缩、预览到上传保存的关键链路在三平台上都能工作。该任务只负责测试与测试运行基础设施，不改变已经落地的 PNG 图片业务契约。

## What I already know

- 当前 Playwright 配置只有 `chromium-desktop` 与 `chromium-mobile` 两个项目。
- `tests/e2e/` 当前没有专门的图片上传流程；现有图片契约主要由 Vitest 覆盖。
- 头像上传入口位于 `AdminEditForm.vue`，公开投稿支持头像，管理员编辑还支持二维码。
- 前端压缩最终输出统一为 PNG：头像最长边 128px、最大 128KB 且保留 alpha；二维码最长边 1024px、最大 1MB 且不透明白底。
- 后端会对最终 PNG 的 MIME、签名、尺寸、像素和字节数再次校验；管理端图片通过 staged asset 上传后随群组保存完成 adoption。
- 现有 E2E 已有 API 登录/种子数据模式，但没有图片 fixture 和资源落库验收模式。
- 当前本机 Chromium、WebKit 与 Firefox 均已安装；Firefox 已通过实际 `firefox.launch()` 验证为 Playwright `153.0`。

## Assumptions (temporary)

- 优先新增独立的图片流程 spec，并让该 spec 在三个浏览器项目中运行；不把所有既有公开/管理流程复制到三个引擎。
- 测试使用仓库内确定性、无真实联系方式的 PNG/JPEG/WebP fixture；不依赖网络图片或个人浏览器会话。
- 成功用例应走真实浏览器 UI，并在必要处通过本地 E2E API/R2/D1 读取结果，避免只验证“按钮点击后没有报错”。
- 失败用例聚焦前端压缩失败后的精确 Toast；后端纯校验边界继续由已有 Worker/Vitest 测试负责，除非实现过程中发现跨浏览器必须补充的 E2E 边界。

## Scope Decision

本任务按完整管理端链路实施：在每个目标浏览器中登录管理端，编辑一个测试群组，上传头像和二维码，验证预览与 PNG 元数据，保存后读取后端资源并验收最终对象，同时覆盖压缩失败 Toast。公开投稿的头像链路不在本次三引擎专用 spec 内。

## Requirements

- 为 Chromium、WebKit、Firefox 增加明确的 Playwright 项目或等价运行入口，并保证图片 spec 可以被单独选择和在 CI 中执行。
- 新增图片相关 E2E，至少覆盖管理端头像和二维码的成功上传/保存流程，以及头像/二维码压缩失败 Toast。
- 成功流程必须验证最终上传对象满足对应契约：`image/png`、PNG 签名、最长边限制、字节数限制；头像保留 alpha，二维码为不透明白底。
- 二维码成功流程必须验证图片仍可被真实二维码解码器识别，或记录清晰、可重复的跨浏览器替代验收策略。
- 上传使用本地 E2E 服务、隔离数据和确定性 fixture；每个测试应清理或隔离自己创建的记录与资源，避免依赖测试执行顺序。
- 浏览器缺失、服务未启动、测试未发现或任一目标浏览器失败，都必须让 E2E 命令失败，不能静默降级为单浏览器或组件测试。
- 更新必要的 Playwright 配置、fixture、运行文档和任务文档；不修改产品图片压缩策略。

## Acceptance Criteria

- [x] 图片 E2E spec 在 Chromium、WebKit、Firefox 三个浏览器引擎项目中均被列出并实际执行。
- [x] 管理端头像成功流程从文件选择走到真实上传/保存，并验证最终 PNG、尺寸、128KB 上限和 alpha 保留。
- [x] 管理端二维码成功流程从文件选择走到真实上传/保存，并验证最终 PNG、尺寸、1MB 上限、不透明白底和二维码可识别。
- [x] 头像和二维码压缩失败分别显示精确文案：`图像压缩失败`、`图像压缩失败，请考虑裁剪图像`，且不会继续上传无效 Blob。
- [x] 测试数据、图片 fixture 和本地服务隔离可重复；测试不访问生产资源、不包含真实敏感信息。
- [x] 运行文档明确三浏览器安装前置条件、单 spec 调试命令和 CI 门禁命令。
- [x] 任务相关 lint、format、typecheck、单元/Worker 测试、E2E 和 build 通过；已知全局 format 基线问题单独记录。

## Definition of Done

- 三平台图片 E2E 和运行配置完成并通过质量检查。
- 任务文档记录浏览器安装、数据隔离、fixture 和失败诊断方式。
- 不改变现有业务代码的 PNG 契约；若为可测试性需要调整代码，必须在设计中说明边界和理由。

## Out of Scope

- 不恢复 WebP 作为最终资源格式，也不兼容旧 WebP 资源。
- 不把所有现有 E2E 流程复制到 WebKit/Firefox；本任务只扩展管理端图片关键路径的三引擎覆盖。
- 不在本任务中新增公开投稿的三引擎图片 spec；公开投稿的头像行为仍由现有分层测试和后续专门任务覆盖。
- 不用 Playwright 替代已有的 Vitest 图片算法、Canvas 编码和 Worker 图片校验测试。
- 不接入真实 Safari/真实 Firefox GUI 或生产 Cloudflare 资源；Playwright 的 WebKit/Firefox 引擎与本地 E2E 服务是验收对象。

## Technical Notes

- 相关前端入口：`src/components/AdminEditForm.vue`、`src/shared/browser/image-compression.ts`、`src/features/admin/pending-images.ts`。
- 相关后端入口：`functions/_lib/routes/admin-assets.ts`、`functions/_lib/services/image-validation.ts`、`functions/_lib/routes/admin-groups.ts`。
- 相关 E2E 基础设施：`playwright.config.ts`、`scripts/start-e2e-api.mjs`、`tests/e2e/application.spec.ts`、`tests/e2e/admin-flows.spec.ts`、`tests/e2e/real-flows.spec.ts`。
- 项目测试策略要求 Playwright 覆盖图片关键路径，并禁止以“浏览器未安装”或组件测试替代目标浏览器门禁。
- 研究结论见 [`research/playwright-cross-browser-image-e2e.md`](research/playwright-cross-browser-image-e2e.md)：采用单一配置、三个图片专用 desktop project；使用真实内存 `FilePayload`、本地 D1/R2 和 `jsQR`/像素检查。

## Divergence Notes

- 后续演进：若图片三引擎稳定，可再把完整公开/管理关键路径扩展到 WebKit/Firefox，或按浏览器拆分独立 CI job。
- 相关场景：公开投稿头像与移动视口暂不加入本任务的三引擎图片 spec，避免把管理端资源 adoption 和公开投稿限流混成一组回归。
- 失败边界：浏览器缺失、`No tests found`、本地服务启动失败和资源未完成 adoption 都视为门禁失败；压缩失败必须阻止无效 Blob 继续上传。
