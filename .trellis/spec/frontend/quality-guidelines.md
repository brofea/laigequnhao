# 前端质量规范

## 必须通过的门禁

前端变更必须通过：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

同时遵循项目级[测试策略](../guides/testing-strategy.md)。

提交必须遵循[项目 Git 提交规范](../guides/index.md#git-提交规范强制)：使用约定式提交、必填 scope、中文摘要与中文 body，并且只提交当前任务文件。

## 必须编写的测试

- 为轮换时间窗 helper、搜索归一化、持久化点赞状态解析和图片大小/尺寸判断编写纯单元测试
- 为 GroupCard、状态/性质徽标、提交对话框、管理员表单错误和仪表盘组件独立失败编写 Vue 组件测试
- 使用 E2E 覆盖浏览/搜索/复制、点赞/取消点赞、访客提交、管理员登录/审核、软删除/恢复/永久删除和图片上传限制

### 异步操作反馈测试

- 用户主动触发的每类网络写操作都必须断言：点击后立即出现 Pending、同一动作只发送一次请求、请求失败有明确提示、结束后 Pending 清理。
- 成功反馈必须按结果显著性断言：保存/删除/恢复/永久删除/编辑板块/移出板块检查成功 Toast；板块内添加群组检查列表结果而不重复弹成功 Toast；点赞检查乐观更新和失败 Toast；公开投稿检查持久成功页面/状态而不是只检查短暂 Toast。
- 永久删除等破坏性 Dialog 必须断言响应返回前仍可见、确认按钮处于 Pending、失败后可重试，成功后才关闭。
- 失败测试不得只断言请求失败；必须检查用户可见的 warning/danger Toast 或 inline 错误，且不存在误报成功提示。

### Button 状态回归门禁

- 组件测试必须覆盖 `loading`/`disabled` 分离、同一渲染周期锁定、`aria-busy`、普通 Loading 指针和业务 Disabled 禁止指针。
- 使用真实延迟状态测试 149ms 不挂载 Spinner、约 150ms 挂载 Spinner、提前完成清理 Spinner，以及重复 Loading 周期不继承旧状态；不能只测试 CSS 动画延迟。
- 列表读取 loading 只能断言结果容器的忙碌语义，不得把它作为搜索、状态筛选、回收站、分页或无关业务 Button 的 Disabled 来源。
- 点赞必须断言请求完成前数字/`aria-pressed` 不变，慢请求才出现数字位置 Spinner，成功 Toast/权威数字状态和失败 Toast 均可见；不得以乐观更新或回滚代替该契约。
- Dialog 失败测试必须断言请求期间仍可见、确认 Button 只发出一次请求、失败后上下文保留且可重试，成功后才按反馈矩阵关闭或展示结果。

## 复核检查表

- Props 和发出的事件有类型约束。
- API 数据和持久化数据经过运行时校验。
- 加载、空、失败和成功状态齐全。
- 覆盖键盘导航、焦点、标签、对比度和减少动态效果。
- 公开组件无法收到管理员或提交记录中的私有字段。
- Logo 尺寸与懒加载避免不必要的布局偏移和提前网络请求。
- 机构相关值来自 `site.config.ts` 和主题 token。
- 使用 1,000 个群聊的测试夹具时仍可正常使用。
- 新增或修改的面向项目成员的文档以简体中文为主。

## 禁止做法

- 只在 UI 层鉴权
- 在共享 API 客户端之外直接使用原始 `fetch`
- 无明确负责方的全局可变状态
- 对应用内容使用 `v-html`
- 在组件中硬编码机构品牌信息
- 吞掉复制、上传、解析或网络错误
- 在没有具体需求且未更新架构决策时引入 Pinia、UI 框架或另一套请求缓存

## Playwright 图片三引擎约定

### 1. Scope / Trigger

- Trigger：新增或修改涉及 Canvas、图片压缩、预览、multipart 上传或 R2 资源 adoption 的浏览器行为。
- Scope：管理端图片关键路径必须在 Playwright Chromium、WebKit、Firefox 三个引擎中真实运行；公开投稿等相邻链路可由独立 spec 覆盖。

### 2. Signatures

- Playwright projects：`image-chromium`、`image-webkit`、`image-firefox`。
- 图片 spec：`tests/e2e/image-flows.spec.ts`；测试层 helper 放在 `tests/e2e/fixtures/`。
- 调试命令：`pnpm test:e2e --project=image-<browser> tests/e2e/image-flows.spec.ts`。

### 3. Contracts

- 三个 `image-*` project 只匹配图片 spec；既有 `chromium-desktop`/`chromium-mobile` 必须排除图片 spec，避免默认运行重复或漏测。
- fixture 使用真实合法图片的内存 `FilePayload`，不使用“只有 PNG 签名的随机字节”伪 fixture；测试只访问本地 E2E D1/R2。
- 成功链路必须从浏览器预览 Blob 和最终公开资源 URL 两处验证 `image/png`、PNG signature/IHDR、最长边和用途字节上限；头像还需验证 alpha，二维码还需验证所有像素不透明并通过 `jsQR`。
- 失败链路必须验证精确用户文案、无预览，并在保存动作后确认没有 `/api/v1/admin/assets` 上传请求。

### 4. Validation & Error Matrix

| 场景 | 必须断言 |
|---|---|
| 浏览器未安装、服务启动失败、project 无匹配测试 | 命令失败；禁止 `skip` 或降级为单浏览器 |
| 头像成功 | PNG、最长边 `<=128`、字节 `<=128KB`、存在透明像素、保存后资源可读 |
| 二维码成功 | PNG、最长边 `<=1024`、字节 `<=1MB`、所有 alpha 为 `255`、二维码内容可解码、保存后资源可读 |
| 头像压缩失败 | `图像压缩失败`、无预览、保存后无资源上传 |
| 二维码压缩失败 | `图像压缩失败，请考虑裁剪图像`、无预览、保存后无资源上传 |

### 5. Good / Base / Bad Cases

- Good：透明头像和固定内容二维码通过浏览器 `setInputFiles` 上传，预览与最终 R2 对象均经过字节/像素检查。
- Base：每个浏览器 project 运行同一图片 spec，使用本地 D1/R2 和隔离测试数据，`workers: 1` 保持串行。
- Bad：只断言预览可见、API 返回 2xx、只运行 Chromium，或用 WebP/随机字节伪造最终 PNG。

### 6. Tests Required

- Chromium、WebKit、Firefox 各运行头像成功、二维码成功、头像失败、二维码失败四条流程。
- 成功测试同时断言浏览器预览 Blob、上传/保存结果、最终资源响应和群组引用；不要以单一 HTTP 状态码代替资源完成。
- CI/新机器依赖安装后显式运行 `pnpm exec playwright install --with-deps chromium firefox webkit`。

### 7. Wrong vs Correct

#### Wrong

```typescript
// 只在现有 Chromium project 中检查图片预览是否出现。
await expect(page.getByAltText("已上传的二维码预览")).toBeVisible();
```

#### Correct

```typescript
// 三个 image-* project 运行同一 spec，并检查预览与最终资源的 PNG/像素契约。
await expect(dialog.getByRole("status")).toContainText("二维码已准备好");
const preview = await readImagePreview(page, "已上传的二维码预览");
assertPreviewPng(preview, { maxDimension: 1024, maxBytes: 1024 * 1024 });
await assertQrPng(Uint8Array.from(preview.bytes), expectedValue);
```

该约定防止把 Safari/WebKit 的 Canvas 编码回归误报为“后端上传成功”，也防止三引擎图片 spec 被既有 Chromium 项目重复执行或从默认门禁中遗漏。
