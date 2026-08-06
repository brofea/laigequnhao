# 执行计划：平台下拉框支持自定义输入 (#4)

## 实施清单（有序）

1. 新建 `src/components/Combobox.vue`：
   - Props: `modelValue: string`、`label?`、`options: SelectOption[]`（或复用 shared 类型）、`placeholder?`、`disabled?`。
   - 结构：可编辑 input + 下拉箭头按钮 + 选项菜单（复用 `.app-select__menu` 样式体系）。
   - 行为：聚焦/点箭头展开；点选项 → 写入 input、收起；直接输入 = 自定义值；清空 = 空字符串。
   - 键盘支持：Esc 收起、Enter 选中高亮项（最小实现即可）。
2. 样式：`src/styles/index.css` 补 `.app-combobox` 相关类（尽量复用 `.app-field`/`.app-select` 视觉变量）。
3. 契约：`shared/contracts/group.ts` `groupCreateSchema`/`groupUpdateSchema` 的 `platform` 从 `z.string().min(1)` 改为 `z.string().max(50)`（放行空字符串）。
4. 表单接入：`src/components/AdminEditForm.vue:457-462` 平台 Select → Combobox。
5. 默认值：管理端草稿 platform 置 ""（VisualShell.vue:411，与子任务 A 协同）；公开投稿草稿保持 "微信"。
6. 验证：`pnpm vitest run`、lint、typecheck；手测平台字段（选列表项、输自定义值、清空保存、编辑回显）。

## 风险与回滚

- 契约 platform 放行空串是全局放宽，需确认公开投稿契约（submission.ts:38 `z.string().min(1)`）不受影响（投稿端仍必填，保持 min(1)）。
- Combobox 外观与 Select 一致性：复用现有样式变量，视觉走查。
- 回滚点：单次提交；契约放宽向后兼容（旧请求仍合法）。
