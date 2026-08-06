# Dialog 滚动条圆角冲突修复 (issue 2)

## Goal

Dialog 右侧滚动条为系统矩形，与 24px 圆角（`var(--radius-xl)`）冲突，右下角看起来像直角（Windows 下尤其明显）。

## Requirements

按 issue comment 确定的方案实现（用户已确认，非全局滚动条方案）：

- **外壳与可滚动内容区分离**：`.app-dialog` 外层负责圆角裁切与背景/边框；可滚动内容改为独立内层结构（如 `.app-dialog__scroll`），由内层承载 `overflow-y: auto`。
- 内层内容区上下保留间距，滚动条不延伸到圆角区域。
- **保留原生滚动条**，不隐藏、不自定义滚动条外观（保留原生滚动能力，不隐藏滚动条）。
- 保持现有 footer / header 布局与尺寸语义不变；不破坏焦点锁定（`trapFocus`）与现有交互。
- 窄屏抽屉形态（`@media` 内 `.app-dialog` 变体）同步适配。

## Acceptance Criteria

- [ ] Windows 下 Dialog 内容滚动时，右侧滚动条不再与右下角圆角冲突（不超出圆角区域）
- [ ] 滚动条可见、原生滚动能力保留（不隐藏）
- [ ] 浅色/深色模式下表现一致
- [ ] 群组详情、表单类 Dialog 均正常滚动，footer 固定、header 不随之滚动（行为与现状一致）
- [ ] 窄屏抽屉形态无回归
- [ ] `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 无回归

## Notes

- 方案来源：issue #2 comment（外壳与内容区分离，外层圆角裁切，内层独立滚动 + 上下间距）。
- Lightweight task：PRD-only。
