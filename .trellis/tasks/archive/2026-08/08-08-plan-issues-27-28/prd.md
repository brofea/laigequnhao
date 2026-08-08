# 规划解决 GitHub #27 与 #28

## Goal

消除两个主页/管理 Dialog 的视觉回归：Dialog 表单操作区不得覆盖或露出卡片边缘文字；没有可展示群组的自定义板块，其标题计数 hint 不得下沉并与空状态重叠。

## Background and confirmed facts

- 已使用 `gh issue view -c 27` 和 `gh issue view -c 28` 查看评论；两条 issue 当前均没有评论。正文分别见 GitHub #27、#28。
- #27 影响 `AdminEditForm.vue`、`BoardEditForm.vue` 和 `BoardAddGroupForm.vue` 共用的 `.admin-edit-form__footer`。该样式在 `src/styles/index.css` 中通过 `position: sticky; bottom: 0` 固定在 Dialog 的可滚动内容区底部；其背景仅为 `var(--surface-raised)`，因此会覆盖下方内容并在 Dialog 边缘造成文字露出。
- 该 sticky 规则是 issue #2 的圆角滚动条修复后添加的辅助行为；#27 明确要求取消固定定位，改为让操作区正常跟在表单 section 之后。
- #28 的主页板块循环位于 `src/components/VisualShell.vue`。板块没有可渲染群组时会显示 `.app-empty`，但其 `.section-heading__hint` 在 `src/styles/index.css` 被 `.app-section--empty-board` 额外下移 8px（窄屏 18px），与空状态区域重叠。
- `prototype/` 是独立视觉原型，不在根目录生产构建入口中。它没有 #27 的 sticky footer，但同样保留 #28 的空板块 hint 下移规则；为保持既定的正式端/原型视觉基线，#28 的 CSS 修复需要同步到 `prototype/styles/index.css`。

## Requirements

### R1 — Dialog 表单操作区（#27）

- 从共享的 `.admin-edit-form__footer` 移除粘底定位及其仅为 sticky 服务的叠层行为，使 footer 按 DOM 顺序置于最后一个 `.admin-edit-section` 之后。
- 保留现有按钮、按钮顺序、禁用/加载状态和提交/取消/删除事件；不改变表单数据或 Dialog 的焦点管理。
- Dialog 仍应由 `.app-dialog__body` 保持原生纵向滚动；较长表单中用户可以滚动到末尾使用操作按钮。

### R2 — 空板块标题提示（#28）

- 移除正式端和原型中只为“空板块”设置的 hint 下移视觉补偿（桌面和窄屏断点），使空状态的群组数 hint 与普通群组网格的 hint 使用同一基线。
- 清理因此失效的仅样式钩子；不改变板块启用状态、公开群组过滤逻辑、轮播渲染条件或空状态文案。

### R3 — 范围和兼容性

- #27 只修改正式前端的共享 footer CSS；#28 修改正式端和对应原型 CSS。均不改 API、后端、数据库、数据契约或板块数据逻辑。
- 保持桌面与窄屏 Dialog/主页布局、深浅色主题和键盘操作正常。

## Acceptance Criteria

- [ ] AC1：打开公开投稿、管理员新建/编辑群组、板块编辑/新建和板块内添加群组等使用共享 footer 的 Dialog 时，操作区不会固定覆盖表单内容，也不会在 Dialog 两侧露出文字。
- [ ] AC2：长表单仍可通过 Dialog 内容区原生滚动到达操作区；取消、保存/提交和删除/移除的现有行为保持不变。
- [ ] AC3：正式端与原型中，任一未启用或启用但没有公开群组的板块显示空状态时，标题右侧的“n 个群” hint 不向下偏移或与 `.app-empty` 重叠；有群组的轮播板块布局不变。
- [ ] AC4：窄屏断点下 AC1–AC3 同样成立，浅色和深色主题无额外背景/层叠异常。
- [ ] AC5：相关组件测试、原型测试与项目质量门禁通过：`pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm test:e2e`、`pnpm exec vitest run --config prototype/vitest.config.ts`、`pnpm exec playwright test --config prototype/playwright.config.ts`、`pnpm build`。

## Out of scope

- 重构 Dialog 组件结构、重新设计表单操作区或自定义浏览器滚动条。
- 修改原型的组件结构、板块管理的数据加载/成员管理流程，或为无群组板块改变可见性和文案。

## Risks and verification focus

- #27 取消 sticky 后，长表单的操作按钮改为随内容滚动；需在所有复用 footer 的 Dialog、桌面和窄屏实际核验可达性。
- #28 必须覆盖两条空状态路径：未启用板块，以及已启用但公开 API 返回空 `groups` 的板块；原型同步仅改对应视觉规则，不要求复制正式 API 情况。
