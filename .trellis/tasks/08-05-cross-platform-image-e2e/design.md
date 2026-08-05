# 三平台 Playwright 图片流程 E2E 测试：技术设计

## 1. 设计目标

在真实 Chromium、WebKit、Firefox 引擎中验证管理端图片链路：文件选择 → 浏览器解码与 Canvas PNG 压缩 → 预览 → staged asset 上传 → 群组保存 adoption → 重新读取最终资源。测试只验证现有 PNG 契约，不改变生产压缩器、共享资源契约或 Worker 校验逻辑。

## 2. 边界与项目矩阵

采用单一 `playwright.config.ts`，新增三个只匹配图片 spec 的 desktop project：

- `image-chromium`：Playwright 管理的 Chromium desktop。
- `image-webkit`：Playwright WebKit desktop，对应 Safari/WebKit 行为。
- `image-firefox`：Playwright Firefox desktop。

现有 `chromium-desktop` 与 `chromium-mobile` 保留既有全量测试，但排除图片 spec；这样 `pnpm test:e2e` 默认会运行既有 Chromium 流程和三引擎图片流程，图片 spec 不会在 Chromium 重复执行。三引擎 project 使用 `testMatch` 或等价过滤，不使用 branded Chrome channel 代替 Playwright Chromium。

继续沿用 `fullyParallel: false`、`workers: 1` 和现有 `webServer`。本地 API 通过 `scripts/start-e2e-api.mjs` 重建 `.e2e-state`，Vite 仍运行在 `5173`，API 仍运行在 `8788`。三引擎在同一个 job 串行执行，避免共享 D1/R2 状态和固定端口互相干扰。

## 3. 测试数据和 fixture

在 `tests/e2e/fixtures/` 建立 E2E 专用 helper：

- `image-fixtures.ts`：导出真实可解码的透明头像 PNG、固定内容二维码 PNG，以及用于压缩失败的不可解码 PNG payload。优先使用内存 `FilePayload`，避免依赖系统文件选择器；fixture 不含真实联系方式、Secret 或用户数据。
- `image-assertions.ts`：读取预览/最终资源字节，验证 PNG signature、IHDR 尺寸、MIME、大小和像素 alpha；使用现有 `sharp` 解码最终 PNG，并使用现有 `jsqr` 解码二维码。测试 helper 不进入 `shared/`，避免让共享层依赖 DOM 或 Node 图像库。
- 如需减少认证和种子重复，在该 fixture 层封装本 spec 专用的 API 登录、session cookie 注入、群组创建和资源读取；不扩大本任务范围去重写既有 E2E 文件。

fixture 必须是真实合法图片。头像样本需要包含透明像素且原图最长边大于 128px，以证明浏览器实际缩放和 alpha 保留；二维码样本使用固定可解码内容且尺寸大于目标尺寸，以证明白底处理和缩放。超限精确边界继续由 Vitest/Worker 测试负责，E2E 不依赖跨引擎完全一致的 PNG 字节数。

## 4. 成功流程

### 4.1 头像

1. 通过本地 API 登录管理员，向浏览器 context 注入 session cookie。
2. 创建一个带普通加群方式的测试群组，进入管理端并打开编辑弹窗。
3. 使用可访问名称 `上传群组头像` 定位隐藏 file input，调用 `setInputFiles(FilePayload)`。
4. 等待 `role=status` 显示头像已准备好，读取 `alt="已上传的群组头像预览"` 的 blob URL。
5. 在 browser context 内读取预览 Blob，断言 `image/png`、PNG signature、IHDR/图片尺寸、`<= 128 * 1024`，并对解码像素断言至少存在 alpha 小于 255。
6. 保存群组，等待保存成功；通过本地 API 查询群组 DTO 和 `logoUrl`，再 GET 资源 URL，断言最终响应 `Content-Type: image/png`、资源字节和服务端返回的 width/height/byteLength 一致。

### 4.2 二维码

1. 创建或准备一个带 `qr` 加群方式的测试群组，进入同一编辑弹窗。
2. 使用可访问名称 `上传二维码` 定位 file input 并上传真实二维码 fixture。
3. 读取 `alt="已上传的二维码预览"` 的预览 Blob，断言 PNG、`<= 1024 * 1024`、最长边 `<= 1024`，并对所有解码像素断言 alpha 为 255。
4. 将解码后的 RGBA 像素交给 `jsQR`，断言固定二维码内容，不能依赖可选的原生 `BarcodeDetector`。
5. 保存群组，查询群组 DTO 与二维码资源 URL，读取最终对象并重复 MIME、字节、尺寸、不透明和二维码识别验收，同时确认资源已从 staged 变为 ready/adopted。

## 5. 失败流程

使用三引擎都无法解码的 `image/png` 文件 payload 触发浏览器压缩失败：

- 头像只显示 `图像压缩失败`，没有头像预览、没有 pending logo Blob、不会发出 `/admin/assets` 上传请求。
- 二维码只显示 `图像压缩失败，请考虑裁剪图像`，没有二维码预览、没有 pending QR Blob、不会发出 `/admin/assets` 上传请求。

失败断言通过可访问的 `role=status`/Toast 和请求监听完成，不依赖 Vue 内部状态或 file input 的 `files` 属性；因为组件会在 change handler 中清空 input value。

## 6. 跨层验收方式

每个成功场景同时验收三个层次：

1. 浏览器预览 Blob：证明真实浏览器编码结果，而不是只证明后端能接受一个人工构造的 PNG。
2. 上传响应与最终资源 URL：证明 multipart 上传的 `purpose`、MIME 和字节已经进入本地 R2。
3. 群组 API/D1 聚合状态：证明 staged asset 被正确 adoption，二维码关联和头像引用存在，最终页面链路不会留下孤立资源。

后端已有更完整的 PNG chunk、CRC/Photon 解码和资源生命周期测试；E2E 不复制所有畸形 PNG 矩阵，只验证真实浏览器产物能穿过真实 Worker 路由并正确落库。

## 7. 运行和门禁

- 本机已用 `pnpm exec playwright install firefox` 检查 Firefox；实际通过 `firefox.launch()` 验证版本为 `153.0`。CI/新环境必须显式运行 `pnpm exec playwright install --with-deps chromium firefox webkit`。
- `pnpm test:e2e` 必须默认包含 `image-chromium`、`image-webkit`、`image-firefox`；允许用 `--project` 做单浏览器调试，但不能在默认门禁中跳过任一 project。
- 浏览器缺失、服务启动失败、没有匹配到图片测试或任一 project 失败都直接失败。
- 失败测试沿用现有 `trace: "on-first-retry"`；不把重试通过当成跨浏览器稳定性的唯一证明。

## 8. 方案取舍

推荐的“图片专用三 project”优于把所有现有 E2E 复制到三个引擎：当前 suite 会写入共享本地 D1/R2，扩大到全量三引擎会显著增加运行时间和状态干扰；图片专用 project 已覆盖本次 Safari 根因相关的浏览器边界。若未来需要全量三引擎，再将三个 project 映射到独立 CI job，并为每个 job 参数化 state 目录和端口。

## 9. 暂不改变的内容

- 不修改 `src/shared/browser/image-compression.ts`、`shared/contracts/asset.ts` 或 Worker 图片校验。
- 不恢复 WebP 最终输出和旧资源兼容。
- 不在本任务中新增公开投稿三平台图片 spec。
