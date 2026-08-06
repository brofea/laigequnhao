# 平台下拉框支持自定义输入 (#4)

## Goal

将平台选择从"仅限配置列表单选"改为"输入框+下拉一体"复合组件：既可从配置的平台列表快捷选择，也可直接输入自定义平台值；管理端添加新群时平台默认值为空。

## Background

- 平台 Select：`src/components/AdminEditForm.vue:457-462`，选项来自 `site.config.ts:40` 静态 `platforms` 列表。
- 后端契约：`shared/contracts/group.ts:254`（create）/`:325`（update）`platform: z.string().min(1)`；`shared/contracts/submission.ts:38` 同样任意非空字符串 → 后端本就接受列表外的值，限制全在前端 Select 单选。
- 现有组件：`Select.vue`（单选，无输入能力）；`Input.vue`（无建议列表）；`BoardAddGroupForm.vue:74-117` 有搜索过滤+点选的近似模式；无现成 combobox 组件。
- 管理端新建草稿 platform="微信"（VisualShell.vue:411）；公开投稿草稿 platform="微信"（VisualShell.vue:388）。
- 用户已确认交互（方案 A）：组件始终是可编辑输入框+下拉箭头，点开下拉快捷选择常用平台，直接打字即自定义值，不设"自定义..."项，外观恒定。

## Requirements

- C-1 新建/复用"输入框+下拉"复合组件（若扩展 Select.vue 需与子任务 B 在父任务 design.md 统一方案）：组件包含可编辑文本输入 + 下拉按钮 + 选项菜单；点选选项将值写入输入框并收起菜单；直接输入文本即自定义值，值可为列表中不存在的项。
- C-2 平台字段改用该组件（`AdminEditForm.vue:457-462`），label/placeholder 保持现有一致风格。
- C-3 管理端添加新群时平台默认值为空；公开投稿（主页）平台默认值保持现状（issue 仅要求管理端）——若交互上允许空平台提交，投稿端默认"微信"不受影响。
- C-4 空平台值的契约确认：`z.string().min(1)` 下空字符串不可提交；管理端新建若平台为空应允许保存（平台可为空）或提示必填——按 issue 描述"平台值可以为空"，创建/更新契约对空值放行（min(1) 改为允许空，或前端传 null/省略）。

## Acceptance Criteria

- [ ] 平台字段为一个输入框+下拉的组合外观（选择前/后外观一致）；点开下拉可看到配置的平台列表并可点击选中。
- [ ] 直接输入列表外的平台名（如"OICQ"）可保存成功，且编辑时回显该值。
- [ ] 管理端添加新群时平台字段为空（无"微信"预置）；公开投稿平台默认值保持"微信"不变。
- [ ] 平台为空时管理端创建/保存不报错（契约放行空值）。
- [ ] 现有 Select 使用点（性质/状态/加群方式/状态筛选）无回归。
- [ ] `pnpm vitest run` 通过、lint/typecheck 无错误。

## Out of Scope

- 加群方式下拉多选（子任务 B）。
- 主页公开投稿平台默认值调整（保持现状）。

## Dependencies

- 与子任务 B 共享 Select 组件扩展，需先在父任务 design.md 确定组件改造方案（各自独立组件 or Select 加 props），按序实现避免文件冲突。
- 契约空值放行改动影响创建/更新 schema，需同步确认公开投稿契约不受影响。
