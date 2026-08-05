# Research: Playwright 三引擎图片上传/压缩 E2E

- Query: Playwright 在 Chromium、WebKit、Firefox 上组织图片上传/压缩 E2E；项目配置、浏览器安装与 CI 门禁、文件上传 fixture，以及在浏览器层验证 PNG 的 MIME、签名、尺寸、alpha、大小；核对本仓库现有约束。
- Scope: mixed
- Date: 2026-08-05

## Findings

### 结论与推荐

推荐方案是“单一 `playwright.config.ts` + 三个图片专用 desktop project”，即新增逻辑上的 `image-chromium`、`image-webkit`、`image-firefox`，三者只匹配图片流程 E2E；现有 `chromium-desktop`/`chromium-mobile` 继续承载已有全量关键路径，并通过 `testIgnore` 或互斥的 `testMatch` 避免图片 spec 重复执行。

这样能满足“图片上传/压缩在三引擎真实运行”的门禁，同时不把目前所有 E2E 直接放大到三倍。图片 spec 仍应放在 `tests/e2e/*.spec.ts`，fixture/helper 放在 `tests/e2e/fixtures/` 或同一 E2E 层的专用 helper 中；不要把浏览器 fixture 放进 `shared/`，因为 `shared/` 不能依赖 DOM/Vue（`.trellis/spec/frontend/architecture.md:60-64`）。

Playwright 官方把 project 定义为一组共用配置的测试，明确支持用 project 跑 Chromium、WebKit、Firefox，也支持用 `testMatch`/`testIgnore` 拆分 smoke 或功能子集，并可用 `--project` 选择性运行（[Projects](https://playwright.dev/docs/test-projects)）。

### 可行方案与取舍

| 方案 | 组织方式 | 优点 | 代价/风险 | 适用性 |
|---|---|---|---|---|
| A（推荐） | 单 config；图片 spec 独占 `image-chromium`、`image-webkit`、`image-firefox` 三个 desktop project；既有项目排除该 spec | 三引擎覆盖集中、运行量可控；现有 Chromium 移动视口仍保留；图片失败定位清楚 | 需要维护 project 过滤关系，漏配 `testMatch`/`testIgnore` 会造成重复或漏测 | 当前仓库最合适 |
| B | 三引擎都运行整个 `tests/e2e`，另保留移动项目 | 配置概念最简单，所有关键路径都能发现引擎差异 | 当前真实 API、共享本地 D1/R2 和大量种子会使运行时间、数据污染和跨引擎差异成本显著上升；全量 suite 约按引擎数放大 | 适合后续已有稳定隔离 fixture、需要全量跨引擎认证时 |
| C | 保留 project 定义，但 CI 按引擎拆 job，每个 job 只安装/运行一个图片 project；本地仍可一次选择三项目 | job 间 `.e2e-state`、端口、浏览器进程天然隔离，可并行降低墙钟时间；每 job 只装需要的浏览器 | 需要 CI workflow、报告合并和三份服务启动；当前启动脚本硬编码 8788 与 `.e2e-state`，同一 runner 内并行不可直接复用 | CI 规模扩大后的演进方案；当前没有仓库 CI workflow |

建议先落地 A；若 CI 墙钟时间成为问题，再把 A 的三个 project 映射到 C 的独立 job，而不是在同一个工作目录并行启动现有 E2E API。

### 仓库现状与约束

- 根 `playwright.config.ts` 当前只有 `chromium-desktop` 与 `chromium-mobile`（`playwright.config.ts:14-22`），且使用 `channel: "chromium"`；API 与 Vite 服务分别由 `webServer` 启动（`playwright.config.ts:24-37`）。图片三引擎 project 应使用 Playwright 管理的 `browserName: "chromium" | "webkit" | "firefox"`，desktop device 只负责 viewport/user-agent，不要误用 `channel: "chrome"` 把测试变成 branded Chrome。
- 当前配置已设置 `fullyParallel: false`、`workers: 1`、CI 下 `forbidOnly` 和 2 次 retry（`playwright.config.ts:5-9`）。Playwright CI 文档也建议 CI 使用 1 worker 以提高可重复性，并在需要扩大吞吐时用 sharding/独立 job（[Continuous Integration](https://playwright.dev/docs/ci)）。在本仓库的共享本地状态约束下，应继续保持串行，除非每个 job 有独立持久化目录。
- `package.json` 声明 `@playwright/test: ^1.49.0`，但锁文件与本机 `pnpm exec playwright --version` 实际为 1.62.0（`package.json:39-45`、`pnpm-lock.yaml:36-38,1281-1284`）。实现前应把 manifest/lock/CI 浏览器版本当作同一升级单元核对；本研究不修改它们。
- 本机 `pnpm exec playwright install --list` 能看到 Chromium、Firefox、WebKit，但这是开发者缓存，不是仓库或 CI 保证。官方要求每个 Playwright 版本安装匹配的浏览器；CI 应在依赖安装后显式执行 `pnpm exec playwright install --with-deps chromium firefox webkit`（[Browsers](https://playwright.dev/docs/browsers)）。
- 因当前配置使用 `channel: "chromium"`，官方文档所说只安装 headless shell 的 `--only-shell` 优化不应直接套用；`channel: "chromium"` 是新 headless 模式，需要保留常规 Chromium，或先统一改变项目配置后再重新评估（[Browsers: Chromium headless](https://playwright.dev/docs/browsers#chromium-headless-shell)）。Firefox/WebKit 仍应显式安装及其 Linux 依赖。
- 仓库未发现 `.github/workflows/` 或其它 CI YAML；README 只描述 Cloudflare Workers Builds 的部署流程。当前 `pnpm test:e2e` 只是 `playwright test`（`package.json:17-21`），因此“浏览器已安装、服务能启动、三引擎图片 project 被选中”的门禁尚未被 CI 自动化。
- `scripts/start-e2e-api.mjs` 每次启动会安全删除并重建工作区内 `.e2e-state`，使用 `wrangler.test.jsonc`、本地 D1/R2、8788 端口和 `tests/e2e/.dev.vars`（`scripts/start-e2e-api.mjs:5-50`）；`wrangler.test.jsonc` 明确设置 `nodejs_compat`、本地 D1/R2（`wrangler.test.jsonc:1-25`）。不得把该流程替换为生产 binding 或开发者个人浏览器。
- `playwright-report/`、`test-results/`、`.e2e-state/` 已被忽略（`.gitignore:13-20`），适合 CI 产出报告/trace 而不污染工作树。

### 文件上传 fixture 的推荐组织

Playwright 官方推荐基于 locator 的 `locator.setInputFiles()`，支持路径，也支持包含 `name`、`mimeType`、`buffer` 的内存文件；动态打开文件选择器时才需要 `page.waitForEvent('filechooser')`/`fileChooser.setFiles()`（[Page API: file upload](https://playwright.dev/docs/api/class-page#page-set-input-files)、[Input: Upload files](https://playwright.dev/docs/input#upload-files)）。本仓库应优先使用 locator，避免依赖系统文件选择器。

建议的未来结构（仅为组织建议，不是本研究中的修改）：

```text
tests/e2e/
├── fixtures/
│   ├── image-fixtures.ts       # FilePayload、已知尺寸/用途、PNG 解析和预览读取
│   └── images/
│       ├── transparent-logo.png # 真正可解码、含透明像素、尺寸已知
│       └── qr-source.png        # 真实可扫码二维码，白底
└── image-flows.spec.ts
```

- 用 `test.extend()` 暴露 `transparentLogo`、`qrImage`、`adminSession` 等类型化 fixture；官方 fixture 文档明确说明自定义 fixture 应用 `test.extend()`，并在 `await use()` 前后负责 setup/teardown（[Fixtures](https://playwright.dev/docs/test-fixtures)）。当前 E2E 文件在 `tests/e2e/admin-flows.spec.ts:7-76` 与 `tests/e2e/real-flows.spec.ts:8-80` 各自重复 API 登录、cookie 注入和种子 helper，新的图片 fixture 可复用这些模式，但不应继续增加更多文件级全局认证缓存。
- 上传用 `locator.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer })`；`AdminEditForm` 的实际可访问标签是“上传群组头像”和“上传二维码”（`src/components/AdminEditForm.vue:423-430,552-573`），所以不要按 `input[type=file]` 的索引定位。隐藏 input 也可以直接由 locator 设置文件。
- fixture 必须是真实合法 PNG，而不是“PNG 签名 + 随机填充”的伪文件。项目测试策略明确要求用最小合法二进制 fixture 走真实上传路由（`.trellis/spec/guides/testing-strategy.md:83-87`）。透明 logo 应有已知的非全不透明像素；二维码应有固定内容、白底和可复现尺寸。源文件小于 5 MiB，最终输出应使用策略边界。
- 可复用当前单元测试中的真实二维码内容作为 fixture 来源（`src/shared/browser/image-compression.spec.ts:14-16,274-317`），但 E2E fixture 最好独立于 Vitest spec 文件，避免跨测试层导入。不要含真实联系方式、Secret、Cookie、设备 ID 或 Cloudflare token（`.trellis/spec/guides/testing-strategy.md:152-157`）。
- 超限结果不要用伪字节制造。应准备可真实解码、压缩后仍明显超过策略的高熵图片，并要求三引擎都稳定超过限制；“恰好边界”继续由现有单元测试验证，因为不同浏览器 PNG encoder 可能产生不同字节数。

### 图片流程与应覆盖的实际边界

浏览器压缩适配器的跨引擎语义已经有明确代码契约：支持 PNG/JPEG/WebP，拒绝 HEIC/HEIF（`src/shared/browser/image-compression.ts:33-38,98-123`）；优先 `createImageBitmap`，失败后回退 `HTMLImageElement`，并特别记录 Safari/WebKit 某些解码差异（`src/shared/browser/image-compression.ts:188-202`）；canvas 创建时按用途设置 `alpha`（`src/shared/browser/image-compression.ts:204-222`）。

最终编码固定调用 `canvas.toBlob(..., "image/png")`，且应用代码在接受结果前检查 `blob.type` 与 PNG signature（`src/shared/browser/image-compression.ts:255-275`）。Logo 不铺白底，二维码铺纯白底；输出超过用途上限时不生成预览（`src/shared/browser/image-compression.ts:321-368`）。共享策略是 logo 128 KiB/最长边 128/保留 alpha，二维码 1 MiB/最长边 1024/不透明（`shared/contracts/asset.ts:6-31`）。

建议至少有两个浏览器流程：

1. Logo：选择带透明像素且尺寸大于 128 的 PNG，等待“头像已准备好/保存时上传”，验证 preview 的真实 PNG，并在保存后验证 `/admin/assets` multipart 与 `AssetInfo` 元数据。
2. QR：管理员编辑中添加二维码加群方式，选择真实二维码，验证 preview 的真实 PNG、扫码内容和所有解码像素 alpha 为 255；保存时验证 `/admin/assets` 的 `purpose=qr_code`。二维码不要依赖原生 `BarcodeDetector`，因为产品代码本身把该能力定义为可选、缺失时返回 `null`（`src/shared/browser/image-compression.ts:283-317`）。

公开投稿可再复用 logo 流程，验证 `FormData` 发送的是最终 PNG 而不是原图；当前 API 明确把最终 Blob 作为 `file`、`filePurpose=logo` 放入 `/submissions` multipart（`src/features/groups/api.ts:86-99`）。管理员资源上传则使用 `file` + `purpose`，文件名固定为 `logo.png`/`qr.png`（`src/features/admin/api.ts:60-85`）；一次管理员保存会先按 logo 后二维码暂存，失败时清理 staged 资产（`src/features/admin/pending-images.ts:24-63`）。

### 浏览器层验证 PNG 输出的建议

不要只断言“预览 `<img>` 可见”或 HTTP 返回 2xx。应从浏览器创建的 preview Blob 取出真实字节，再在同一个 browser context 解码像素；同时在上传请求边界捕获 multipart，证明最终相同的 PNG 被发到 API。

建议把 `readPreviewImage(locator)` 封装在 E2E fixture/helper 中，流程如下：

1. 用可访问名称定位预览：logo 是 `img[alt="已上传的群组头像预览"]`，二维码是 `img[alt="已上传的二维码预览"]`（`src/components/AdminEditForm.vue:384-395,555-560`）。当前 change handler 会立即清空 file input 的 value（`src/components/AdminEditForm.vue:237-242`），所以应断言预览/`role=status`，不要在上传完成后再检查 `input.files`。
2. 读取 `<img>` 的 `currentSrc`/`src`（通常为 `blob:` URL），在 `page.evaluate` 中 `fetch` 该 URL 并返回 `Response` 的 MIME、`ArrayBuffer` 字节、`naturalWidth`/`naturalHeight`；如果某引擎对 Blob URL response header 表现不同，使用 `page.addInitScript` 包装 `URL.createObjectURL`，按 URL 保存 `Blob.type`、`Blob.size` 和 `arrayBuffer()`，再按 preview URL 取回。二者都只观测实际 Blob，不替换压缩逻辑。
3. MIME：要求 `image/png`，同时检查 multipart 文件 part 的 `Content-Type: image/png`。不能把 `Blob.type` 当成唯一真相；MDN 明确提示浏览器通常不会读取字节流来确定 Blob MIME，MIME 必须和签名/结构一起验证（[Blob.type](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type)）。
4. 签名/结构：在 test runner 中对浏览器返回的字节执行最小 PNG parser：前 8 字节必须是 `89 50 4E 47 0D 0A 1A 0A`；首个 chunk 必须是 13-byte `IHDR`，读取其 big-endian width/height/bit depth/color type；至少确认 `IHDR`、`IDAT`、`IEND` 的存在和边界。W3C PNG 规范规定该 signature、chunk 布局以及 `IHDR` 首位/`IEND` 末位（[PNG file structure](https://www.w3.org/Tools/Multiformat/png-master.html#File-Structure)）。服务端已有更完整 parser，应由 Worker 集成测试继续负责畸形 chunk、CRC/完整 Photon 解码，E2E 不必复制全部服务端校验（`functions/_lib/services/image-validation.ts:107-217,231-287`）。
5. 尺寸：同时比较 PNG `IHDR`、`img.naturalWidth`/`naturalHeight` 和应用输出的预期缩放。已知输入尺寸可形成稳定断言，例如 300×150 logo 应按最长边策略得到 128×64；二维码应不超过 1024×1024。策略与 `calculateTargetDimensions` 分别见 `shared/contracts/asset.ts:15-31` 和 `src/shared/browser/image-compression.ts:73-88`。
6. 大小：用返回字节的 `byteLength`（不是 JavaScript 字符串长度）断言 logo `<= 128 * 1024`、二维码 `<= 1024 * 1024`；上传请求中的文件 part 字节也应与 preview Blob 相等。超限用例应断言用户可见的 `role=status`/Toast 和没有预览，符合 `AdminEditForm` 的失败清理路径（`src/components/AdminEditForm.vue:278-297`）。
7. Alpha：仅看 PNG color type 不够证明“真的有透明像素”。PNG color type 4/6 表示带 alpha；`tRNS` 也可能为灰度、真彩或索引色提供透明度（[W3C PNG color types/chunks](https://www.w3.org/TR/PNG-Chunks)）。对预览 Blob 在 `page.evaluate` 中创建透明 canvas，`drawImage` 后读取 `getImageData().data`：logo 断言至少一个 alpha `< 255`，二维码断言所有 alpha `=== 255`。二维码的服务端语义同样是逐像素要求 alpha 255（`functions/_lib/services/image-validation.ts:231-253`）。
8. 二维码：把浏览器 canvas 返回的 RGBA 数组交给现有 `jsqr` 依赖（`package.json:53-57`）做真实内容解码，断言固定 URL/文本；不要以 `BarcodeDetector` 是否存在决定测试 pass。现有 Vitest 已证明“真实二维码 + 解码 + 全部 alpha 255”的断言形态（`src/shared/browser/image-compression.spec.ts:274-317`）。
9. 网络边界：在点击“提交/保存”前用 `page.waitForRequest` 或 `page.route` 捕获 `/api/v1/submissions`、`/api/v1/admin/assets` 的 `postDataBuffer()`，按 multipart boundary 提取 file part，检查 part header、字节和用途。成功后还要检查 API 返回的 `contentType`、`byteLength`、`width`、`height`/最终 ready 状态；仓库测试策略禁止只以 2xx 代表资源完成（`.trellis/spec/guides/testing-strategy.md:77,83-87`）。

`HTMLCanvasElement.toBlob()` 的官方/MDN 约束是：指定或不支持的格式会回退为 PNG，用户代理必须支持 `image/png`，返回对象是表示 canvas 图像的 Blob（[HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)）。这正好对应当前适配器的 `toBlob` + MIME + signature 三重检查；跨引擎 E2E 应验证它确实在三引擎完成，而不是把 `toBlob` mock 掉。

### 浏览器安装与 CI 门禁建议

CI 的最小顺序应为：

```text
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e                 # 包含现有关键路径
pnpm build
```

图片三引擎 project 必须包含在 `pnpm test:e2e` 的默认运行集合中；若为降低日常成本提供选择性命令，也必须另有 CI 任务显式运行 `--project=image-chromium --project=image-webkit --project=image-firefox`。Playwright 官方 CI 示例同样把依赖安装、`playwright install --with-deps` 和测试作为连续步骤，并建议上传 HTML report（[Continuous Integration](https://playwright.dev/docs/ci)）。

门禁要点：

- `CI=true` 下 browser binary 缺失、项目过滤后 `No tests found`、8788/5173 服务启动失败、任一 engine 失败都必须使 job 失败；不要用 `test.skip` 或仅运行 Vitest 来掩盖环境缺失。仓库明确把这些列为门禁失败（`.trellis/spec/guides/testing-strategy.md:113-117`）。
- 只缓存浏览器时以锁定的 Playwright 版本作 cache key；官方当前文档提示 Linux 系统依赖不可缓存，恢复 cache 的收益可能不高（[CI caching](https://playwright.dev/docs/ci#caching-browsers)）。首先采用显式安装更可诊断。
- 报告至少保存 `playwright-report/`、失败 trace/video/screenshot；当前配置已有 `trace: "on-first-retry"`（`playwright.config.ts:10-12`），与 CI 的 2 retries 相配。
- 单 job 三 project 时维持 `workers: 1`，避免现有 `.e2e-state` 和真实 API 种子相互干扰。若改为 C 的矩阵，确保每 job 有独立 workspace/持久化目录；当前 `start-e2e-api.mjs` 的固定目录和端口不支持在一个 workspace 内直接并行。
- CI 只使用 `wrangler.test.jsonc` 的本地 D1/R2 和 `tests/e2e/.dev.vars`，不允许生产数据、生产写入 token 或个人浏览器。该约束见 `.trellis/spec/guides/testing-strategy.md:152-157`。

## Files found

- `playwright.config.ts` — 当前 Playwright project、viewport/channel、webServer、CI retries/workers。
- `package.json` — `test:e2e` 命令、pnpm 版本、Playwright/jsQR/sharp 依赖。
- `pnpm-lock.yaml` — 实际锁定的 `@playwright/test`/Playwright 版本 1.62.0。
- `tests/e2e/admin-flows.spec.ts` — API 登录、session cookie 注入、真实管理数据种子模式。
- `tests/e2e/real-flows.spec.ts` — 另一套真实 API/E2E helper 与跨层持久化流程。
- `src/components/AdminEditForm.vue` — logo/二维码 file input、可访问 label、预览、压缩状态和失败反馈。
- `src/shared/browser/image-compression.ts` — 浏览器解码、canvas、PNG 编码、MIME/signature、大小和 object URL 清理。
- `src/shared/browser/image-compression.spec.ts` — 真实二维码 base64、alpha/扫码/PNG 签名的现有 Vitest 参考。
- `shared/contracts/asset.ts` — 5 MiB 原图上限、最终 PNG MIME、logo/二维码尺寸/像素/大小/alpha 策略。
- `src/features/groups/api.ts` — 公开投稿 logo multipart 边界。
- `src/features/admin/api.ts` — 管理 logo/二维码资源 multipart 边界。
- `src/features/admin/pending-images.ts` — 管理保存时 staged asset 顺序与失败清理。
- `functions/_lib/services/image-validation.ts` — 服务端 PNG signature/chunk/IHDR/尺寸/完整解码/QR alpha 校验。
- `scripts/start-e2e-api.mjs` — E2E 本地 API/D1/R2 状态重建、端口和环境文件。
- `wrangler.test.jsonc` — E2E 测试专用本地 D1/R2 与 `nodejs_compat`。
- `.trellis/spec/guides/testing-strategy.md` — 图片 E2E、fixture、真实上传、PNG 与 CI 门禁。
- `.trellis/spec/frontend/quality-guidelines.md` — 必须运行的全套质量命令和上传错误反馈门禁。
- `.trellis/spec/frontend/architecture.md` — 浏览器边界适配器、shared 层依赖边界。
- `.trellis/tasks/08-05-cross-platform-image-e2e/prd.md` — 当前 PRD 仍为 TBD，尚未提供额外验收标准。

## Code patterns

- Project/服务启动：`playwright.config.ts:14-37`。
- 现有串行与 CI 保护：`playwright.config.ts:5-12`。
- 真实登录和本地种子：`tests/e2e/admin-flows.spec.ts:7-76`、`tests/e2e/real-flows.spec.ts:8-80`。
- file input 与可访问 locator：`src/components/AdminEditForm.vue:237-242,423-430,552-573`。
- 浏览器输出验证契约：`src/shared/browser/image-compression.ts:255-275,321-372`。
- 用途策略：`shared/contracts/asset.ts:6-31,61-99`。
- 公开/admin multipart：`src/features/groups/api.ts:86-99`、`src/features/admin/api.ts:60-85`。
- staged asset 事务边界：`src/features/admin/pending-images.ts:24-63`。
- 服务端 PNG parser/解码：`functions/_lib/services/image-validation.ts:107-217,231-287`。
- 真实二维码、jsQR 和 alpha 参考：`src/shared/browser/image-compression.spec.ts:274-317`。

## External references

- [Playwright Projects](https://playwright.dev/docs/test-projects) — 用 project 组织多浏览器、不同配置和过滤子集；支持 `--project`。
- [Playwright Browsers](https://playwright.dev/docs/browsers) — Chromium/WebKit/Firefox 安装、`--with-deps`、浏览器版本匹配和 `channel: "chromium"` 的 headless 差异。
- [Playwright Continuous Integration](https://playwright.dev/docs/ci) — 安装依赖、CI 使用 1 worker、sharding、报告与浏览器 cache 注意事项。
- [Playwright Page API: file upload](https://playwright.dev/docs/api/class-page#page-set-input-files) — locator `setInputFiles`、FilePayload 与 file chooser API。
- [Playwright Fixtures](https://playwright.dev/docs/test-fixtures) — `test.extend()` 类型化 fixture、生命周期和 worker/test scope。
- [MDN Blob.type](https://developer.mozilla.org/en-US/docs/Web/API/Blob/type) — Blob MIME 可为空且不能作为唯一内容校验。
- [MDN HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — PNG 编码、Blob 输出与 `image/png` 支持。
- [W3C PNG file structure](https://www.w3.org/Tools/Multiformat/png-master.html#File-Structure) — 8-byte signature、chunk 布局、IHDR/IEND 位置。
- [W3C PNG Chunk Specifications](https://www.w3.org/TR/PNG-Chunks) — IHDR 宽高/color type、alpha 与 `tRNS` 规则。

## Related specs

- `.trellis/spec/guides/testing-strategy.md:9-19,33-42,58-117,138-157` — 测试分层、图片契约、真实二进制 fixture、三引擎 E2E 所需流程与 CI 失败条件。
- `.trellis/spec/frontend/quality-guidelines.md:3-31,41-60` — 全量命令、E2E 图片上传限制、异步 pending/失败反馈和错误不可吞掉。
- `.trellis/spec/frontend/architecture.md:60-64` — canvas/object URL 必须处于浏览器 adapter/composable 边界，shared 层不能依赖 DOM。
- `.trellis/spec/frontend/directory-structure.md:1-45` — E2E 文件命名与前端/共享目录职责。
- `.trellis/workflow.md:1-23,100-124` — 研究需持久化、规划阶段与任务 artifact 约束。

## Caveats / Not Found

- 本任务 `prd.md` 的 Goal、Requirements、Acceptance Criteria 仍是 TBD；本文件提供技术选型与约束映射，不替代产品验收标准。实施前应把推荐 project 命名、是否全量三引擎、二维码/超限用例和 CI 运行模式写入 design/implement artifact。
- 仓库没有发现 CI workflow；不能假设 Cloudflare Workers Builds 会自动安装 Playwright 浏览器或运行 `pnpm test:e2e`。
- `package.json` 的 Playwright 范围与 lockfile 实际版本存在漂移；官方浏览器二进制按 Playwright 版本绑定，升级前应统一 manifest、lockfile、CI 安装和本地缓存验证。
- 浏览器 PNG encoder 的压缩字节数不是跨引擎恒定值；E2E 应验证明显在限制内/外的代表性样本，精确边界继续由 Vitest/Worker 测试承担，不能把三引擎都强行要求同一 byte-for-byte 输出。
- Blob MIME 只证明声明值，不能证明内容；必须同时检查 MIME、PNG signature/IHDR、尺寸、字节数和浏览器解码后的像素 alpha。二维码“无 alpha”应按所有解码像素 alpha=255 验收，而不是只检查 PNG color type。
- `BarcodeDetector` 在 Firefox/WebKit 或不同运行模式下可能不存在；跨引擎门禁应使用浏览器 canvas 像素 + 已有 `jsQR`，把原生 BarcodeDetector 保持为产品能力的可选增强。
- 当前 E2E API 脚本固定 `.e2e-state` 与 8788 端口；在 CI 同一 workspace 并发三引擎会有状态/端口冲突。若选择 CI matrix，依赖 runner 隔离，或未来显式参数化 state/port。
- 本研究只读检查仓库；未修改产品代码、测试代码、配置、spec 或任务规划文件。
