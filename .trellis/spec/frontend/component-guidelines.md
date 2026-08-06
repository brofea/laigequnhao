# Vue 组件规范

## 组件形态

使用带 `<script setup lang="ts">` 的 Vue 单文件组件。组件只应承担一个主要职责，并接收已整理成领域模型的数据，而不是原始 API 响应。

```vue
<script setup lang="ts">
import type { PublicGroup } from "../../../shared/contracts/group";

const props = defineProps<{
  group: PublicGroup;
  liked: boolean;
}>();

const emit = defineEmits<{
  toggleLike: [groupId: string];
}>();
</script>
```

Props 是只读输入。组件应发出用户意图事件；子组件不得修改 prop、共享对象或响应缓存。

## 组合方式

- 路由视图负责组合页面区块。
- 功能容器负责连接 composable 和展示组件。
- 可复用基础组件通过 slot 和有语义的 variant 扩展，不使用功能专属的布尔参数。
- 一次性元素只有在封装了行为、无障碍能力或重复视觉契约时，才创建包装组件。

## 样式

使用 Tailwind 处理布局和组件级样式。机构颜色、表面色、边框、焦点环和语义状态使用 CSS 自定义属性。Tailwind 无法清晰表达的行为可以使用 scoped CSS。

禁止根据未经校验的运行时字符串动态拼接 Tailwind 类名。必须将有类型约束的 variant 映射为完整、静态的类名字符串。

### Button 组件 slot 内图标对齐契约

共享 `Button` 的默认 slot 内容被包在 `.app-button__label`（inline 元素）内。`Icon.vue` 的 `.app-icon` SVG 没有 vertical-align 规则，若 label 不是 flex 容器，inline SVG 会按文本基线对齐，图标与文字视觉中心错位（如点赞按钮的心形图标与数字不在同一水平线，2026-08 回归记录）。`.app-button__label` 必须保持 `display: inline-flex; align-items: center`，禁止移除或改为纯 inline。

点赞按钮（`.like-button`）的光学微调（用户验收意见，2026-08）：icon 与数字的间距来自 label 的 `gap` 契约（当前 3px），不要在 `.like-button` 上重复设置 gap；label 内容整体 `translateY(1px)`，卡片 icon 再 `translateY(0.5px)`，Dialog 底部点赞按钮（`.dialog-like-button`）icon 单独 `translateY(2px)`。

## 无障碍

- 适当使用原生 button、link、form、label 和 `<dialog>`。
- 仅含图标的控件必须有无障碍名称。
- 键盘和屏幕阅读器用户必须通过可见文本或合适的 live region 获得复制、点赞、表单和错误反馈。
- 对话框必须处理初始焦点、焦点归还、Escape 键，并提供可见的关闭控件。
- 状态和性质不能只靠颜色传达。
- 遵守 `prefers-reduced-motion`；排名更新不得产生令人迷失方向的动画。

## 加载与失败状态

每个异步区块都必须定义加载、空、错误、过期和成功状态。单个组件失败时，不得用一个全局错误替换整个管理员仪表盘。

### Loading 与 Disabled 状态优先级

- 公共 `Button` 的 `loading` 与 `disabled` 是两个独立输入：`loading` 表示请求生命周期和重复提交锁定，`disabled` 只表示业务上不可操作（例如表单无效、权限不足或条件不满足）。
- `loading` 必须在同一渲染周期内输出 `aria-busy="true"` 并阻止重复的鼠标、键盘和组件事件；原生 `disabled` 可以作为实现锁定，但不得因此套用业务 Disabled 的禁止指针或低对比度样式。
- 共享 `useDelayedLoading` 负责约 150ms 的视觉 Loading 延迟。请求开始立即锁定，只有持续到延迟边界才挂载 Spinner；提前完成时 DOM 中不得出现 Spinner。清理或下一轮请求必须清除旧定时器和视觉状态。
- Loading 控件使用普通指针；只有未忙碌的业务 Disabled 控件使用禁止指针，禁止 `wait` 指针。Select 的 loading 只表达忙碌语义，不为状态筛选渲染普通 Spinner；搜索 Input 不得复用目录读取 loading。
- 读取状态只归属于列表/结果容器的 `aria-busy`、骨架或错误区域，不得扩散到搜索框、状态筛选、回收站切换、分页或无关业务按钮。

### Dialog 生命周期

提交、保存、删除、恢复、永久删除和编辑板块等 Dialog 操作在请求完成前保持打开。Dialog 的遮罩、关闭按钮和 Escape 在 `busy` 时必须被锁定并输出忙碌语义，且使用普通指针；失败后清理 pending、保留输入和上下文，允许用户重试。

### Dialog 结构与滚动契约

- `eyebrow` 是可选 prop（`eyebrow?: string`），不传则不渲染副标题元素；调用方按语义传入，禁止在 Dialog 内部硬编码样例文案。
- **文案语言约定**（2026-08）：Dialog 大标题（`title`）使用中文，eyebrow 一律使用英文（如 "Group details"、"Edit group"、"Add group"），避免与中文标题重复；eyebrow 与标题语义重复时（如表单内部已有同义 eyebrow 的 `BoardAddGroupForm`），Dialog 层不传 eyebrow。Dialog 标题不得携带"样例/抽屉"等开发标记后缀。
- 滚动条与圆角冲突的统一解法（issue #2，2026-08）：外壳 `.app-dialog` 负责圆角裁切（`border-radius` + `overflow: hidden`），内层 `.app-dialog__body` 独立滚动（`flex: 1; min-height: 0; overflow-y: auto`）。保留原生滚动条，不隐藏、不自定义外观。

点赞是明确的非乐观例外：响应返回前不改变数字或 `aria-pressed`，慢请求只在 150ms 后把数字位置替换为 Spinner，成功或失败后再更新/保留状态并显示对应 Toast。

### 异步操作反馈契约

用户主动触发的网络写操作（例如 `POST`、`PATCH`、`DELETE` 或 multipart 上传）必须先提供即时 Pending 反馈，并在 Pending 期间防止同一资源/动作重复提交。Pending 必须按资源或动作隔离，不能用一个全局 busy 锁住整个页面；成功或失败后都必须清理 Pending。

失败必须明确提示。可用安全的 inline 错误或 `app-toasts` warning/danger Toast；不得静默失败，也不得在失败路径显示成功反馈。

成功反馈按操作结果在当前界面的可见程度分级：

| 情况 | 必需反馈 | 示例 |
|---|---|---|
| 成功结果当前界面不明显、操作具有破坏性，或成功后关闭 Dialog | Pending + 成功 Toast | 保存、删除、恢复、永久删除、编辑板块、移出板块 |
| 成功后列表/详情立即出现可识别的结果 | Pending + 界面结果，不重复弹成功 Toast | 板块内添加群组 |
| 高频、低风险但需要服务端权威状态的操作 | Pending + 成功/失败 Toast；响应前保持原显示状态 | 点赞/取消点赞 |
| 成功后需要用户继续看到受理结果的流程 | Pending + 持久成功页面或状态；不能只依赖短暂 Toast | 公开投稿 |
| 无网络或瞬间完成的浏览器操作 | 可用成功 Toast；不需要数据库 Pending | 复制链接、复制群号 |

普通数据库操作不得因为“有 Toast”而省略 Pending；也不得因为“有界面变化”而省略失败提示。读取请求使用字段/列表级 loading 和错误状态，通常不弹成功 Toast。

**正确的成功/失败分支：**

```ts
pending.value = true;
try {
  const result = await saveResource();
  if (!result.ok) {
    showToast(result.error.message, "warning");
    return;
  }
  applyServerResult(result.data);
  showToast("保存成功"); // 仅当结果不明显、破坏性或 Dialog 将关闭时
} finally {
  pending.value = false;
}
```

**错误模式：** 点击后立即关闭 Dialog，后台失败只恢复按钮；或所有写操作无差别弹成功 Toast。前者让用户无法重试，后者会让界面已有明确结果的普通操作产生噪音。

## 禁止做法

- 在展示组件中直接调用原始 `fetch`、本地存储或 canvas
- 对访客或管理员内容使用 `v-html`
- 对可变的群聊、标签或加群方式列表使用索引作为 key
- 将平台 SVG 填充色固定为纯黑或纯白
- 静默忽略剪贴板、图片或表单失败
