# 技术设计：Loading 与 Disabled 状态分离

## 1. 状态模型

所有异步按钮按以下矩阵表达状态：

| 状态 | 交互锁定 | 原生 `disabled` | `aria-busy` | 指针 | 禁止操作视觉 | Spinner |
| --- | --- | --- | --- | --- | --- | --- |
| 可操作 | 否 | 否 | 无 | 普通/手型 | 否 | 否 |
| Loading | 是，立即 | 是或由组件事件守卫保证 | `true`，立即 | 普通 | 不套用业务 Disabled 样式 | 延迟约 150ms |
| 业务 Disabled | 是 | 是 | 无 | `not-allowed` | 是 | 否 |

`loading` 和 `disabled` 仍是两个独立输入。为防止原生按钮在请求期间重复触发，`Button` 可以继续把二者合成为原生锁定条件，但必须同时输出可供 CSS 识别的 Loading 标识（优先沿用 `aria-busy`，必要时补充明确的 data/class 状态）。因此“原生锁定”不再等同于“业务 Disabled”。

关键约束是视觉状态不能只靠 CSS 延迟：锁定状态从 `loading=true` 立即生效；视觉状态由共享 `useDelayedLoading` 在 150ms 后才变为真。`loading` 在延迟前恢复为 false 时，Spinner 节点从未挂载。

## 2. 通用 Button

`src/components/Button.vue` 作为默认实现：

- 保持 `loading?: boolean` 与 `disabled?: boolean` 两个 prop，不新增调用方必须理解的第三种业务状态。
- Loading 为真时立即设置原生锁定、`aria-busy="true"` 和 Loading 状态 class/data；业务 Disabled 只设置业务不可操作状态。
- Loading 的 Spinner/处理中辅助文本由共享 `useDelayedLoading` 的 `visualLoading` 控制；`aria-busy` 不延迟，确保辅助技术和重复提交保护从请求开始生效。
- Loading 完成或组件卸载时清理所有延迟状态，避免下一次操作继承旧 Spinner。
- Hover、active、opacity、cursor 等样式以“业务 Disabled 优先、Loading 覆盖通用 disabled 样式”的选择器顺序实现。

### 2.1 共享延迟状态

新增 `src/shared/composables/useDelayedLoading.ts`，只负责 `loading -> visualLoading` 的 150ms 生命周期，不负责网络请求、Toast 或业务 Disabled 判断。公共 Button 和需要显示处理中的文件交互组件复用它；业务页面只传入 loading，不创建自己的定时器或 Spinner。

## 3. 全局样式优先级

审计 `src/styles/index.css` 的所有 `button:disabled`、`:disabled`、`cursor:not-allowed` 和 Spinner 规则：

- 将全局禁止指针限制在“未忙碌的 disabled 控件”，例如通过 `:disabled:not([aria-busy="true"])` 或等价的显式业务状态选择器。
- 为忙碌控件明确指定普通指针，禁止 `cursor: wait` 及任何隐式等待光标。
- 将业务 Disabled 的透明度/低对比度样式与 Loading 样式分开；Loading 可保留可识别的正常按钮对比度。
- Hover/active/focus 规则不能让 Loading 重新获得操作反馈，也不能让真正 Disabled 被误判为可操作。
- `.app-button__spinner` 只由公共 Button/公共文件交互组件渲染；业务模板不得直接使用它。Spinner 是否挂载由 `visualLoading` 决定，不使用“先挂载再透明”的 CSS 伪延迟。`prefers-reduced-motion` 只关闭旋转动画，不能取消 150ms 防闪烁。

## 4. 运行时接线审计

按组件逐项复核，而不是只改通用 Button：

- `GroupCard`：点赞迁移到公共 Button；取消乐观更新，Loading 立即锁定当前按钮且保持普通指针，超过 150ms 后由公共视觉状态把点赞数字位置替换为 Spinner；响应完成后更新状态/数字并显示成功 Toast，失败恢复原状态并显示失败 Toast。
- `AdminTable`：删除、恢复、永久删除等迁移到公共 Button；列表读取 `loading` 只标记表格容器，不扩散为每行 action 的业务 Disabled；行级 action 的重复提交按资源隔离。
- `BoardAddGroupForm`、`BoardManagement`：添加群组、上下移动、移出板块等迁移到公共 Button，条件不满足（首尾项、无权限等）才传 `disabled`；列表读取 busy 不再与每个操作的 Loading 混用。
- `AdminEditForm`、`BoardEditForm`、公开投稿：上传、保存、编辑、删除/恢复和提交分别表达 Loading；表单无效仍是 Disabled；失败保留输入和当前 Dialog。
- `Select`：保留独立 `loading`/`disabled` 交互语义，但移除状态选择和普通筛选的 Spinner；Loading 只锁定并设置 `aria-busy`，保持普通指针。普通筛选 Select 不接收目录全局 loading。
- `Input`：移除 `status="loading"` 的即时 Spinner 路径；搜索框只表达错误/default，列表读取通过结果区域或容器忙碌语义呈现，不能复用无关全局 loading。
- `Dialog`：`busy` 阻止 backdrop、Escape、关闭按钮和提交后的提前关闭；被 busy 锁定的关闭控件输出忙碌标识，避免继承 `not-allowed`。
- 其他纯本地按钮（主题、标签、轮播、清空、Toast 关闭等）只保留普通交互，不虚构网络 Loading；排序/分页等读取控制不再把列表全局 loading 传成业务 Disabled，若需要防重由状态源直接守卫。

## 5. 测试设计

组件层新增/扩展：

- `Button`：loading 与 disabled 的 DOM 属性、状态 class、点击锁定、快请求 Spinner 节点不存在、150ms 后才挂载 Spinner、完成后清理。
- `useDelayedLoading`：假计时器覆盖 149ms 不显示、150ms 显示、提前结束清理、重复 loading 周期互不污染。
- `Dialog`：busy 时关闭/遮罩/Escape 均无效，失败后 busy=false 仍可关闭；忙碌关闭按钮使用普通指针标识。
- `GroupCard`/表格/板块 action：验证所有异步 action 经公共 Button 渲染，资源级锁定、`aria-busy`、普通指针和失败状态；点赞另验成功 Toast、失败 Toast、非乐观更新及 150ms 后数字替换 Spinner。
- `Select`/`Input`：验证状态筛选与搜索请求不会渲染 Spinner，也不会继承目录全局 loading。

端到端层：

- 注入小于 150ms 的成功响应，确认没有突兀 Spinner。
- 注入持续超过 150ms 的响应，确认按钮立即不可重复点击、Dialog 保持打开、出现处理中反馈，释放后状态正确。
- 注入失败响应，确认明确错误 Toast、按钮恢复、Dialog/表单上下文保留并可重试。

## 6. 非目标与回滚

不改变 API、服务端请求协议、Toast 是否启用或已有成功反馈矩阵。若某个非按钮交互必须显示处理中，必须复用共享延迟状态 helper；不能回退到立即 Spinner、CSS 透明占位或用业务 `disabled` 代替 Loading。
