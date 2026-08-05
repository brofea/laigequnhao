# 统一按钮 Loading 与 Disabled 状态设计

## Goal

修复上一轮异步按钮反馈引入的状态混淆：全局统一检查运行时前端的按钮、选择器触发器和 Dialog 控制，明确区分“请求处理中（Loading）”与“业务上不可操作（Disabled）”，让快速请求无突兀 Spinner，慢请求有清晰反馈，且任何写操作都不能重复提交。

本任务只覆盖正式运行时 `src/` 与对应测试；`prototype/` 不属于本次产品运行时范围。

## Requirements

- R1 状态契约：通用 `Button` 以及需要异步反馈的原生按钮必须分别接收/表达 `loading` 与 `disabled`。`loading` 负责请求生命周期和重复提交锁定，`disabled` 只表示表单无效、权限不足、条件不满足等业务不可操作原因；不得把一个 prop 同时当成两种语义。
- R2 即时锁定：进入 Loading 的同一渲染周期内，按钮必须阻止鼠标、键盘和组件事件的重复触发，并提供 `aria-busy="true"`；业务 Disabled 继续提供原生不可用语义。
- R3 指针与视觉优先级：Loading 按钮的鼠标指针保持普通状态，不得出现 `not-allowed` 或 `wait`；只有真正业务 Disabled 的按钮才显示禁止指针。全局 `button:disabled`、`.app-button:disabled`、`:disabled` 和 `cursor-not-allowed` 规则不得覆盖 Loading 状态。
- R4 延迟视觉反馈：交互锁定立即生效，但 Spinner/处理中视觉提示延迟约 150ms；请求在延迟前完成时不显示 Spinner，也不留下闪烁或错误的忙碌视觉残留。延迟不影响 `aria-busy` 和重复提交防护。
- R5 统一异步提示：慢请求显示加载图标或处理中提示；失败必须明确提示并恢复按钮状态。普通操作成功后界面变化已足够明显时不重复弹成功 Toast；成功不明显、破坏性操作或成功会关闭 Dialog 时显示成功 Toast，沿用既有异步反馈矩阵。点赞按最新产品决定采用 Loading + 成功/失败 Toast，不做乐观更新。
- R6 全局覆盖：审计并修复 `Button`、`Select` 触发器、点赞、公开投稿、管理表格、板块管理、上传、分页、Dialog 控制及其他运行时原生按钮，避免只修一个页面或只修 `.app-button`。
- R7 Dialog 生命周期：提交、保存、删除、恢复、永久删除、编辑板块等 Dialog 操作完成前不得关闭；失败后保留 Dialog 和用户输入/上下文，解除 Loading 后允许重试。请求期间被动关闭控件也必须使用 Loading 的普通指针语义。
- R8 测试与规范：补充通用按钮组件测试、原生异步按钮回归测试和至少一条快请求/慢请求、失败保留 Dialog 的 Playwright 交互测试；把状态优先级和 150ms 视觉延迟写入前端组件/质量规范。
- R9 视觉状态必须真实延迟：不能只依赖 `v-if="loading"` 加 CSS 动画或只修改指针选择器。公共 Loading 组件必须维护独立的视觉 Loading 状态；请求开始立即锁定，只有持续超过约 150ms 才挂载 Spinner/处理中提示，请求提前结束时整个 Spinner 节点都不得出现。
- R10 读取状态隔离：`useGroupDirectory`/`useAdminGroups` 的列表读取 `loading` 只能驱动列表容器的忙碌语义和必要的结果区域，不得直接传给搜索框、普通状态筛选 Select、回收站切换或无关业务按钮，避免一个全局请求状态扩散成整页 Loading 闪烁。
- R11 公共组件统一：业务页面不得自行渲染 `app-button__spinner`、自行实现 Loading 指针或用 `loading && disabled` 拼接业务状态。异步按钮统一使用公共 Button；文件选择等非 `<button>` 的异步交互使用公共交互组件或共享延迟状态 helper；纯本地按钮可保留原生实现。

## Acceptance Criteria

- [ ] `Button` 同时支持 `loading` 与 `disabled`，Loading 时立即锁定且 `aria-busy="true"`，业务 Disabled 时不触发操作且显示禁止指针；两者视觉/语义互不污染。
- [ ] Loading 期间所有相关按钮的 computed cursor 为普通指针，不含 `not-allowed`/`wait`；真正 Disabled 按钮仍保持禁止指针；代码中不存在会误伤 Loading 的全局 `button:disabled` 规则。
- [ ] 请求持续少于 150ms 时不显示 Spinner；请求持续至少约 150ms 时显示 Spinner/处理中提示，结束后提示被清理；交互锁定从请求开始即生效。
- [ ] Button 的 Spinner 由独立视觉状态控制，不存在“请求开始即挂载、再靠 CSS 隐藏”的实现；快请求 DOM 中没有 Spinner，慢请求才出现。
- [ ] 运行时所有用户主动触发的网络写操作均有即时锁定、明确失败提示和按既有矩阵决定的成功反馈；点赞等待响应后再更新数字/状态，并显示成功或失败 Toast。
- [ ] 管理状态 Select 不显示 Spinner；公开/管理搜索框不再复用目录全局 `loading`，筛选和普通状态切换不会因无关读取请求闪烁。
- [ ] 业务页面中不存在异步操作直接渲染 `app-button__spinner` 的绕过公共组件实现；板块、群组操作和点赞均通过统一公共按钮状态契约。
- [ ] 所有相关 Dialog 在请求完成前保持打开；失败场景保留用户上下文并可再次提交，成功场景按产品反馈契约关闭或展示结果。
- [ ] 组件测试覆盖 loading/disabled 分离、重复点击、忙碌无障碍属性、150ms 边界及 Spinner 清理；E2E 覆盖慢请求、快请求和 Dialog 失败生命周期。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、相关 Playwright 回归及 `pnpm format:check` 按项目既有基线通过；若有既存格式问题，需明确记录而不掩盖本任务回归。

## Notes

- 已确认的根因：`src/components/Button.vue` 当前用 `disabled="props.disabled || props.loading"` 做即时锁定，但 Spinner 由 `props.loading` 直接挂载；`src/styles/index.css` 的全局 `button:disabled { cursor: not-allowed; }` 又无法区分 Loading。
- 已确认的公共组件问题：`Select.vue` 直接用 `loading` 挂载 `app-field__spinner`，`Input.vue` 的 `status="loading"` 直接挂载搜索 Spinner；这两个组件都没有把交互锁定与视觉 Loading 分开。
- 已确认的状态扩散问题：`VisualShell.vue` 把 `publicDirectory.loading`/`adminDirectory.loading` 直接传给搜索 Input；把 `adminDirectory.loading` 同时传给状态 Select、回收站 Button、分页和表格；`AdminEditForm.vue`/`BoardEditForm.vue` 又把 `isBusy` 同时传给 Select `loading` 和各字段/Button 的 `disabled`。
- 已确认的业务绕过：`GroupCard.vue`、`AdminTable.vue`、`BoardAddGroupForm.vue`、`BoardManagement.vue` 和上传控件仍在业务模板中直接渲染 `app-button__spinner`，并在同一条件下设置 `disabled`；这些将统一迁移到公共交互组件，不再逐页补 CSS。
- 已确认的 Dialog 风险：`Dialog.vue` 已用 `busy` 阻止关闭，但遮罩/关闭按钮没有忙碌标识，因此会被通用 Disabled 指针规则误判；本任务会补齐忙碌状态表达并验证失败后上下文保留。
- 不修改后端 API、数据库和 Toast 全局开关；本任务聚焦按钮状态契约、样式优先级、组件接线和交互测试。
- 不接受仅靠 CSS `animation-delay` 隐藏已挂载 Spinner 的方案作为唯一实现；计划采用共享 `useDelayedLoading`（150ms）驱动公共 Button 及必要的文件交互组件，保证快请求时 Spinner 节点根本不渲染。
- 点赞是本任务的明确例外反馈：按钮请求期间即时锁定，视觉 Loading 延迟 150ms；慢请求时替换数字为 Spinner，响应完成后更新数量并 Toast，失败时恢复原显示状态并 Toast。
