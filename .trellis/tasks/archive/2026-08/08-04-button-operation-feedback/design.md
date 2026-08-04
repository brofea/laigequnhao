# 技术设计：数据库交互按钮反馈

## 1. 设计目标

在不修改后端 API 和数据契约的前提下，为正式运行时 `src/` 中需要等待网络或图片处理的按钮补齐即时反馈、重复提交防护和分级结果反馈；同时保持纯本地 UI 控件轻量，不把所有点击都变成等待型交互。

本任务不修改独立 `prototype/`。正式页面的组件边界仍遵循“路由视图/功能容器 → 展示组件 → composable → API 客户端”。

## 2. 状态归属与数据流

`VisualShell` 是公开端与管理端的异步操作编排层，负责把 composable 的结果翻译成组件 props 和 toast；展示组件只接收状态并 emit 用户意图，不直接调用 API。

新增一个小型 keyed pending 状态工具（建议放在 `src/shared/composables/usePendingActions.ts`），提供：

- `isPending(key)`：查询某个资源/动作是否进行中；
- `start(key)` / `finish(key)` 或 `run(key, operation)`：原子地阻止同一 key 重入，并保证 `finally` 清理；
- 使用字符串 key 区分资源和动作，例如 `like:<groupId>`、`group:<groupId>:delete`、`board:<boardId>:remove:<groupId>`。

不使用全局单一 busy。不同群组、板块或成员的独立操作可以并行；同一资源的互相冲突动作在 pending 期间禁用。

异步流程统一为：

```text
点击
  → 先设置 keyed pending
  → 组件立即呈现 loading / aria-busy / disabled
  → await 现有 composable 或 API 编排
  → 成功：更新权威状态，并按操作类型显示成功 Toast、界面结果或持久成功状态
  → 失败：保留可重试界面、恢复状态、warning toast
  → finally 清理 pending
```

现有 `useGroupDirectory`、`useAdminGroups` 和 `useAdminBoards` 的请求 loading 需要避免旧请求的 `finally` 覆盖新请求状态；采用请求序号或“只允许当前请求清理 loading”的保护。该调整只修复状态生命周期，不改变 API、排序、分页或取消语义。

## 3. 组件契约调整

### 3.1 基础和通用组件

- 继续复用 `Button.loading`，不新增第二套全局 spinner。现有 `disabled` 只表达不可操作，`loading` 同时表达进行中和 `aria-busy`。
- 为仍保留定制视觉样式的原生操作按钮（群组卡点赞、管理表格链接按钮、板块成员按钮、添加群搜索结果、分页数字按钮）补齐等价的 `loading`/`disabled`/`aria-busy` 语义和现有 spinner 样式；不因样式差异绕过可访问反馈。
- `Input` 继续使用现有 `status="loading"`。管理端搜索接入 `adminDirectory.loading`，公开端搜索保持现状。
- `Select` 增加可选 loading/disabled 表现，仅管理端状态筛选在触发远程查询时使用；编辑表单中的本地字段不显示网络 loading。
- `Dialog` 增加忙碌时的关闭保护：遮罩、标题栏关闭、Escape 都不能在破坏性请求进行时提前发出 close；保持现有焦点锁定与恢复。

### 3.2 成功反馈策略

- 统一要求是“失败必须明确提示”，不是“成功必须统一 Toast”。成功 Toast 只用于当前界面结果不明显、破坏性操作或成功后关闭 Dialog 的动作。
- 板块内添加群、成员上下移等结果已在当前列表中清晰出现的普通操作，只显示 Pending 和界面变化，不额外弹成功 Toast。
- 点赞使用乐观更新；请求成功不重复 Toast，失败回滚并 Toast。
- 公开投稿成功后渲染持久受理结果（例如 Dialog 内的成功状态），让用户在当前界面持续看到结果；短暂 Toast 不能替代该状态。
- 复制链接/复制群号等无网络或瞬时浏览器操作可以只用成功/失败 Toast，不套用数据库写操作的 Pending 规则。

### 3.3 群组公开端

- `GroupCard` 接收 `likeLoading`（或等价的明确 prop），点赞按钮在请求期间显示 spinner、`aria-busy` 和 disabled；卡片主体打开详情不显示按钮 spinner，因为详情 Dialog 可以立即打开，详情请求由内容区域状态承担。
- 详情 Dialog 的点赞按钮复用同一 `like:<groupId>` key，避免卡片和详情同时对同一群组重复点赞。
- `VisualShell.toggleLike` 先设置 pending，再调用现有乐观更新 composable；成功使用权威 like count，失败保留现有回滚和 warning toast。
- 公开投稿表单把已有 `publicSubmitBusy` 从“仅禁用表单”接通为提交按钮 loading；Dialog 在提交期间仍不可关闭，成功后显示持久受理状态而不是只弹短暂成功 Toast。
- 公开端重试按钮使用目录 loading；标签卡点击不单独转圈，结果区域的列表 loading/skeleton 负责反馈，因为 URL/搜索标题会立即变化。

### 3.4 管理群组端

- `AdminEditForm` 将单一 `busy` 扩展为可区分的 `busyAction`（例如 `save`、`delete`、`remove`），让保存、删除/移除、取消按钮不会同时显示错误动作的 spinner；任一动作进行时表单内其他互相冲突的操作禁用。
- 管理列表将 `groupId + action` pending 从 `VisualShell` 传给 `AdminTable`，覆盖删除、恢复、永久删除；每一行独立反馈，不锁住其他行。
- 永久删除确认逻辑改为等待 `adminDirectory.purge` 完成后再清除 `purgeConfirmGroup`。确认按钮使用 `purgeBusy` loading；Dialog 以 busy 状态屏蔽关闭；失败时保持 Dialog 打开并允许重试。
- 已有成功/失败/版本冲突 toast 保留并统一动作语义；接口返回失败或异常时不得提前关闭编辑 Dialog。
- 管理端搜索、状态筛选、回收站切换、排序和分页复用 `adminDirectory.loading`，在请求期间禁用重复查询；需要单独视觉反馈的触发控件使用 loading，其余由列表/字段状态承担。

### 3.5 板块管理端

- `BoardEditForm` 接收 `busy`，保存板块/创建板块按钮在异步调用期间显示 loading，取消和 Dialog 关闭在 busy 时禁用。
- `BoardManagement` 接收按 board/member/action 索引的 pending 状态，覆盖板块排序、删除确认、添加群、成员移除、成员上移/下移；无关板块和无关成员仍可操作。
- `BoardAddGroupForm` 接收正在添加的 group id，搜索结果按钮在添加请求期间显示 loading 并禁用，成功后再关闭 Dialog；取消在请求期间不可打断。
- 板块写操作失败时显示 warning Toast；编辑/删除/移出等结果不明显或按 Issue 要求的操作显示 success Toast，添加群和成员排序等界面结果清晰的普通操作不重复弹 success Toast；失败时保持当前可重试状态并按现有逻辑重新拉取必要的服务端快照。

## 4. 兼容性与不变项

- 不改 `functions/`、Worker、数据库 migration、共享 API schema 或后端错误码。
- 不改变现有乐观点赞、版本冲突、分页、排序、回收站和资源补偿行为。
- 不给主题切换、打开/关闭 Dialog、tab 切换、板块展开、Carousel 滚动、标签/表单本地编辑、复制/分享、二维码保存和静态 Mock 统计控件添加等待型 loading。
- 复制、分享、二维码保存继续用已有成功/失败 toast；本地图片压缩使用现有 `uploading` 和状态文案，避免重复选择和重复处理。

## 5. 风险、回滚与验证重点

- 主要风险是 pending key 未在异常路径清理、旧请求清空新请求 loading、Dialog 关闭入口绕过 busy 保护，以及移动端表格自定义按钮 spinner 破坏布局。
- 每个 `run` 操作必须有 `finally`；读取 composable 用请求序号验证当前响应；组件测试检查成功、失败、重复点击和卸载/关闭边界。
- 回滚点按基础工具、公开端、管理群组、板块管理分阶段组织；如果某一类自定义按钮的视觉变化不稳定，可退回为保持原样的文本/aria-busy 状态，但不能退回重复提交防护或 Dialog 生命周期修复。
