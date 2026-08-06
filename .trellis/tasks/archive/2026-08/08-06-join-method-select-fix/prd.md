# 加群方式下拉复选与默认值修复 (#5)

## Goal

修复"添加加群方式"下拉的两个问题：下拉展开时对已添加的加群方式显示勾选标记（多选状态），而非仅对最后一次点击打勾；添加群 Dialog 内加群方式默认值为空。

## Background

- 添加加群方式 Select：`src/components/AdminEditForm.vue:530-539`，`v-model="newJoinMethodType"`，`@update:model-value="chooseJoinMethod"`。
- `Select.vue`（138 行）为纯单选：props.modelValue 为 string（行 10-22），无多选/勾选状态支持；菜单模板行 117-135；样式 `src/styles/index.css:1135-1203`。
- 添加逻辑：`addJoinMethod`（`AdminEditForm.vue:205-220`）同类型去重；行内删除按钮 `removeJoinMethod`（行 222-230）。
- 当前 bug：Select 单选选中最后点击的项，菜单中该项打勾（Select 现有的选中态），无法表达"多个已添加方式"。
- issue 评论确认：主页添加群（公开投稿）可能也有同样问题。
- 管理端新建草稿 joinMethods 默认含一条"群号/待填写"（VisualShell.vue:420，由子任务 A 清理）；公开投稿草稿 joinMethods 已为空（VisualShell.vue:398）。

## Requirements

- B-1 扩展 `Select.vue` 支持多选状态模式（multiple）：选项带勾选标记，点击选项切换选中状态（emit 数组），触发下拉后不因点击选项自动收起（点击外部才收起）。
- B-2 `AdminEditForm.vue` 加群方式下拉改用多选模式：选项勾选状态 = `draft.joinMethods` 中是否已含该 type；点击未添加的=添加，点击已添加的=移除（复用 addJoinMethod/removeJoinMethod 逻辑）。
- B-3 添加群 Dialog 内加群方式默认值为空：新建草稿 joinMethods 为空数组（与子任务 A 配合，公开投稿保持现状）。
- B-4 主页公开投稿的加群方式下拉同步使用多选模式（修复评论中提到的同类问题）。

## Acceptance Criteria

- [ ] 管理端添加新群 Dialog：点开"添加加群方式"下拉，已添加的方式（如已有"群号"）显示勾选标记；可同时存在多个勾选项。
- [ ] 点击未添加的加群方式 → 添加并保持菜单展开；点击已勾选项 → 移除该方式。
- [ ] 新建草稿加群方式区域默认无任何预置项（无"空群号"占位）。
- [ ] 主页公开投稿弹窗加群方式下拉同样显示勾选状态且行为一致。
- [ ] 其他使用 Select 的位置（状态筛选、性质/状态选择等）行为无回归。
- [ ] `pnpm vitest run` 通过、lint/typecheck 无错误。

## Out of Scope

- 平台下拉自定义输入（子任务 C 负责，如需复用组件扩展需在父任务 design 统一协调）。

## Dependencies

- 前置：子任务 A（清理默认 joinMethods 占位）。
- 与子任务 C 共享 `Select.vue` 扩展，组件方案在父任务 design.md 统一设计后实现，避免相互覆盖。
