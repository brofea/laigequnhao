# 修复主页群组卡片点赞按钮图标与数字不对齐

## 背景

用户报告：主页群组卡片的点赞按钮（`app-button`）中，爱心图标和点赞数字不在同一水平线上。

## 根因分析（已确认）

- 原型 `PrototypeGroupCard.vue` 的点赞按钮是裸 `<button class="like-button">`，`display: inline-flex; align-items: center`，图标与数字作为 flex 子元素严格居中，无此问题。
- 生产版 `GroupCard.vue:80-98` 改用共享 `Button` 组件后，slot 内容被包进 `<span class="app-button__label">`（`Button.vue:57`，inline span）。
- `.app-icon`（`Icon.vue` 的 SVG）在 `src/styles/index.css` 中没有任何样式规则，保持默认 `display: inline` + `vertical-align: baseline`。
- 因此在 inline 的 label 里，16px SVG 的底边与数字文字基线对齐，图标整体高出、视觉中心与数字不共线 → 回归。

## 修复方案

在 `.app-button__label` 上恢复 flex 居中：

```css
.app-button__label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transform: translateY(1px);
}
```

- 仅影响 label 内部的 inline 子元素（点赞按钮的图标+数字、loading 态的 Icon+Spinner），使它们共享同一中心线。
- 文本-only 的 label（如 `AdminEditForm` 上传按钮）视觉不变。
- `Button` 组件自身的 `icon` prop / icon-only 用法是 `.app-button` 的直接 flex 子元素，不受影响。

用户复查后要求：数字保持按钮中线不动，仅心形图标做光学下沉；图标与数字之间保留间距（`.like-button` 的 gap 因 label 包裹失效，间距契约上移到 label）；用户手动微调后最终值为 gap 3px、label 内容下移 1px、卡片 icon 0.5px、Dialog 底部点赞按钮 icon 2px：

```css
.like-button .app-icon {
  transform: translateY(0.5px);
}
/* 群组详情 Dialog 底部点赞按钮 */
.dialog-like-button .app-icon {
  transform: translateY(2px);
}
```

## 验收标准

1. 桌面视口下，主页群组卡片点赞按钮内，爱心图标与数字的垂直中心差 ≤ 1px。
2. 卡片点赞按钮：label 内容中心低于按钮中心 1px、图标与数字间距 3px（用户手动微调值）；Dialog 底部点赞按钮图标低于文字 2px（用户手动微调值）。
3. 修复不影响其他 `Button` 用法（icon prop、icon-only、loading）的既有渲染。
4. `pnpm lint`、`pnpm typecheck` 通过；既有测试不回归。
