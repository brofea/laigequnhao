# 三平台 Playwright 图片流程 E2E 测试：实施计划

## 实施前置

- [x] 创建 Trellis 任务并完成需求确认。
- [x] 安装并启动验证 Playwright Firefox；本机 `firefox.launch()` 返回版本 `153.0`。
- [x] 读取前端、测试策略和 Playwright 跨浏览器研究资料。
- [ ] 用户 review 本 `prd.md`、`design.md` 和本实施计划。
- [x] 用户 review 通过后执行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/08-05-cross-platform-image-e2e`，任务已切换为 `in_progress`。

## 实施步骤

### 1. 配置三引擎图片项目

- [x] 修改 `playwright.config.ts`：为图片 spec 增加 `image-chromium`、`image-webkit`、`image-firefox` 三个 desktop project。
- [x] 让既有 `chromium-desktop` 与 `chromium-mobile` 排除图片 spec，确认默认运行不会重复执行 Chromium 图片测试。
- [x] 保留现有本地 API/Vite `webServer`、串行 worker、CI retry、trace 配置。

### 2. 建立 E2E 图片 fixture/helper

- [x] 新增 `tests/e2e/fixtures/image-fixtures.ts`：合法透明头像和固定二维码的内存 `FilePayload`，以及不可解码失败样本。
- [x] 新增 `tests/e2e/fixtures/image-assertions.ts`：预览 Blob 读取、PNG signature/IHDR/尺寸/MIME/大小、alpha 像素、`sharp` 解码和 `jsQR` 验收。
- [x] 复用本仓库现有 API session/cookie 模式，提供本 spec 所需的登录、创建群组、查询群组和获取资源 helper；不改动既有 E2E 文件。

### 3. 实现图片流程 spec

- [x] 新增 `tests/e2e/image-flows.spec.ts`。
- [x] 添加头像成功用例：选择文件、等待预览、验证 PNG/尺寸/128KB/alpha、保存、读取最终 URL 并确认 adoption。
- [x] 添加二维码成功用例：选择文件、验证 PNG/尺寸/1MB/不透明白底/`jsQR`，保存并确认二维码资源关联和 ready 状态。
- [x] 添加头像压缩失败用例：断言精确 Toast、无预览、无上传请求。
- [x] 添加二维码压缩失败用例：断言精确 Toast、无预览、无上传请求。
- [x] 所有定位优先使用 role/accessible name，不使用 file input 索引或 Vue 内部实现细节。

### 4. 更新运行文档和任务记录

- [x] 在 README 中补充浏览器安装命令、图片 spec 单项目调试命令和默认三引擎门禁命令。
- [x] 记录本机 Firefox 安装结果和 WebKit/Firefox 流程结果，不把环境失败转成 skip。

## 逐步验证命令

先运行最小闭环，再运行全量质量门禁：

```bash
pnpm exec playwright test --list
pnpm test:e2e --project=image-chromium tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-webkit tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-firefox tests/e2e/image-flows.spec.ts
pnpm test:e2e tests/e2e/image-flows.spec.ts
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

若 Firefox/WebKit 单项目失败，先保留 trace 和最小复现结果，区分浏览器实现问题、已有认证问题、fixture 问题和产品回归；不得用 `test.skip`、降级到 Chromium 或只跑 Vitest 规避失败。

## 已完成验证

- `pnpm typecheck`：通过。
- `pnpm lint`：0 errors，32 个既有 warnings。
- `pnpm test`：19 files / 141 tests passed。
- `pnpm test:workers`：11 files / 129 tests passed。
- 图片 spec：Chromium、WebKit、Firefox 各 4 tests passed；失败反馈补强后各 2 tests 复跑通过。
- `pnpm test:e2e`：82 tests passed（既有 Chromium 桌面/移动 + 三引擎图片流程）。
- `pnpm build`：通过。
- 任务相关 Prettier 检查：通过；全局 `pnpm format:check` 仍只报未修改的 `tests/e2e/a11y-flows.spec.ts`。

## Review gates

- 开始编码前：用户 review planning artifacts；任务必须由 planning 进入 `in_progress`。
- 编码后：执行 Trellis check，复核 spec 与 PRD 的每项验收标准，检查三引擎 project 是否实际列出并执行。
- 提交前：确认只暂存当前任务文件，运行 `git status --porcelain`、`git diff`，并按项目 Conventional Commits 规范提交；不提交本机浏览器缓存。

## 回滚点

- 若三引擎 project 配置造成既有 Chromium suite 重复或漏测，可先回滚 project 过滤关系，不改动图片 fixture/spec。
- 若跨引擎真实 PNG 像素断言不稳定，保留 MIME/signature/IHDR/尺寸/字节/后端落库作为稳定契约，并把差异记录为需要进一步确认的测试设计问题；不能用 mock 替代真实 Canvas 压缩。
- 若环境不支持某个 Playwright 浏览器，修复安装/CI 前置；不修改生产图片兼容逻辑来适配测试环境。
