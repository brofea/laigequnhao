# 实施计划：统一按钮 Loading 与 Disabled 状态

## 阶段 1：建立基线与状态清单

1. 重新扫描 `src/**/*.vue` 中所有 `<Button>`、`<button>`、`:disabled`、`aria-busy`、`cursor-not-allowed` 和 Spinner。
2. 为每个按钮标注：纯本地操作、网络读取、网络写入、Loading 来源、业务 Disabled 条件、成功/失败反馈和是否处于 Dialog。
3. 对照实际状态源检查 `usePendingActions`、`useGroupDirectory`、`useAdminGroups`、`useAdminBoards`：明确哪些是资源级写操作 pending，哪些只是列表读取 busy，禁止读取状态扩散到搜索/筛选/无关按钮。
4. 以 PRD 中的状态矩阵为准确认调用方没有把 `loading` 同时传给 `disabled` 作为业务语义；仅保留公共组件内部的即时锁定。

## 阶段 2：修复公共组件与全局样式

1. 新增共享 `useDelayedLoading`，用真实延迟状态区分“立即交互锁定”和“150ms 后视觉 Loading”。
2. 修改 `Button.vue`，保留分离的 `loading`/`disabled` API，Spinner/处理中提示只由延迟后的视觉状态挂载。
3. 修改 `Select.vue` 与 `Input.vue`：Select 的 loading 只负责锁定/忙碌语义而不渲染普通筛选 Spinner；Input 去掉目录 loading 到搜索框的即时 Spinner 路径。
4. 修改 `src/styles/index.css`，重排 `button:disabled`、`.app-button:disabled`、表格/分页/选择器/上传按钮的选择器优先级；确保 Loading 普通指针、业务 Disabled 禁止指针，禁止等待指针。
5. 为延迟 helper、Button、Select/Input 和样式边界补充组件测试，先固定公共契约再改调用方。

## 阶段 3：修复所有运行时按钮调用方

1. 修复 `Select`、`Dialog` 的 busy 接线和关闭控件语义。
2. 修复 `VisualShell` 的状态源接线：搜索框、状态筛选、回收站、分页和表格不得复用无关目录全局 Loading；列表容器保留 `aria-busy`。
3. 将 `GroupCard`、`AdminTable`、`BoardAddGroupForm`、`BoardManagement` 的异步原生按钮迁移到公共 Button（保留必要的视觉 class/variant），删除业务模板中的 Spinner 和重复 disabled/Loading 组合。
4. 复核 `AdminEditForm`、`BoardEditForm`、上传、登录/投稿等通用 Button 调用，移除 Loading 同时传入业务 `disabled` 的误用；非按钮文件控件复用公共延迟状态组件。
5. 复核纯本地按钮，避免无网络操作被错误加上 Loading；复核错误 Toast、成功 Toast、点赞非乐观更新和 Dialog 关闭时机不被状态重构破坏。

## 阶段 4：回归验证与规范沉淀

1. 扩展 `src/components/async-feedback.spec.ts` 或拆出明确的 Button/Select/Input 状态测试，覆盖快/慢/失败/重复点击和 150ms 边界。
2. 在 Playwright 中加入慢请求、快请求、搜索/状态筛选无 Spinner、点赞 Loading + Toast + 数字替换、板块/群组操作普通指针、Dialog 失败保留上下文和重试场景；优先复用现有 admin/public route interception。
3. 更新 `.trellis/spec/frontend/component-guidelines.md` 与 `.trellis/spec/frontend/quality-guidelines.md`，写入 Loading/Disabled 优先级、150ms 延迟、Dialog 生命周期和测试要求。
4. 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、相关 `pnpm test:e2e` 与 `pnpm format:check`；逐项对照 PRD 验收清单。

## 实施约束

- 不修改后端 API/数据库，不关闭 Toast，不用全局样式例外掩盖错误状态。
- 不使用 destructive git 操作；只编辑当前任务涉及的组件、样式、测试和规范文件。
- 如果发现按钮业务语义不明确，优先依据现有成功/失败反馈和调用方状态源判断，并在任务记录中标明假设。
