# 执行计划：加群方式下拉复选与默认值修复 (#5)

## 实施清单（有序）

1. Select.vue 扩展 multiple 模式（`src/components/Select.vue`）：
   - 新增 prop `multiple?: boolean`；multiple 时 `modelValue: string[]`，emit 数组。
   - 选项勾选标记：已选中项显示勾选 icon（复用现有 Icon 组件）。
   - 点击选项切换选中态且不收起菜单（外部点击/ESC 收起）。
   - 单选模式行为完全不变。
2. 样式：`src/styles/index.css` 补 `.app-select` 勾选标记样式（复用现有 app-icon 体系）。
3. 表单接入：`src/components/AdminEditForm.vue:530-539` 加群方式 Select 改 multiple：
   - 绑定数组（selected = draft.joinMethods 的 type 集合）。
   - `@update:model-value` → 对增量做 add/remove：新增 type 走 addJoinMethod，移除走 removeJoinMethod（按 type 找 id）。
   - publicMode 与管理端共用（qr 选项在子任务 D 解禁后自动出现）。
4. 默认值：确认新建草稿 joinMethods 已为空（子任务 A 完成）后，此处无独立改动；验证公开投稿草稿也为空（现状已是 []）。
5. 回归：其余 Select 使用点（VisualShell 状态筛选、AdminEditForm 性质/状态）行为不变。
6. 验证：`pnpm vitest run`、lint、typecheck；手测加群方式下拉（多勾选、点击切换、菜单不收起）。

## 风险与回滚

- Select 是全局组件，multiple 必须默认 false，绝不改变既有调用签名。
- 勾选交互细节（点击已选=移除）与子任务 A 的占位清理衔接。
- 回滚点：单次提交，Select.vue + 样式 + 表单一处使用点。
