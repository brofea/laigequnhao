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

## 无障碍

- 适当使用原生 button、link、form、label 和 `<dialog>`。
- 仅含图标的控件必须有无障碍名称。
- 键盘和屏幕阅读器用户必须通过可见文本或合适的 live region 获得复制、点赞、表单和错误反馈。
- 对话框必须处理初始焦点、焦点归还、Escape 键，并提供可见的关闭控件。
- 状态和性质不能只靠颜色传达。
- 遵守 `prefers-reduced-motion`；排名更新不得产生令人迷失方向的动画。

## 加载与失败状态

每个异步区块都必须定义加载、空、错误、过期和成功状态。单个组件失败时，不得用一个全局错误替换整个管理员仪表盘。

### 异步操作反馈契约

用户主动触发的网络写操作（例如 `POST`、`PATCH`、`DELETE` 或 multipart 上传）必须先提供即时 Pending 反馈，并在 Pending 期间防止同一资源/动作重复提交。Pending 必须按资源或动作隔离，不能用一个全局 busy 锁住整个页面；成功或失败后都必须清理 Pending。

失败必须明确提示。可用安全的 inline 错误或 `app-toasts` warning/danger Toast；不得静默失败，也不得在失败路径显示成功反馈。

成功反馈按操作结果在当前界面的可见程度分级：

| 情况 | 必需反馈 | 示例 |
|---|---|---|
| 成功结果当前界面不明显、操作具有破坏性，或成功后关闭 Dialog | Pending + 成功 Toast | 保存、删除、恢复、永久删除、编辑板块、移出板块 |
| 成功后列表/详情立即出现可识别的结果 | Pending + 界面结果，不重复弹成功 Toast | 板块内添加群组 |
| 高频、低风险且适合立即反映的操作 | 乐观更新 + 失败 Toast；仍需防止同一动作重入 | 点赞/取消点赞 |
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
