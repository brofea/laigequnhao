# 执行计划：清理添加新群 Dialog 多余默认值 (#3)

## 实施清单（有序）

1. 前端草稿：`src/components/VisualShell.vue:408-423` `openAdminCreateDialog()` 清理占位默认值：
   - title/description/tags/joinMethods 置空（joinMethods: []）。
   - platform 置空（待子任务 C 换 Combobox，此处先置 ""）。
   - id 保留唯一 id（去掉 "admin-create-sample" 语义名，如 `admin-create-${Date.now()}`）。
2. 表单默认值：`src/components/AdminEditForm.vue:62-72`：
   - contact：管理端创建模式（非 publicMode 且 !props.group?.contact）→ ""；编辑模式仍显示现有值（保持 readonly 逻辑）。
   - auditNotes：默认 ""（无占位文案）。
3. 加群方式类型占位：`AdminEditForm.vue:120-124` joinMethodConfig value 改为空（"", "", ""）。
4. contact 可编辑：`AdminEditForm.vue:618-623` 创建模式下 input 去掉 readonly（编辑模式保留）。
5. payload：`VisualShell.vue:645-673` `toAdminPayload`：
   - auditNotes 传表单实际值（不再硬编码 null）。
   - 创建（create 场景）携带 contact。
6. 契约：`shared/contracts/group.ts` `groupCreateSchema` 增加 `contact: z.string().max(200).optional()`；确认 auditNotes 字段存在。
7. 后端：`functions/_lib/routes/admin-groups.ts:272-296` create 调用传入 `contact: payload.contact ?? null`（auditNotes 确认已传）。
8. 验证：`pnpm vitest run`、lint、typecheck；手测管理端新建 Dialog（无占位文案、联系方式可输）、编辑态联系方式 readonly、保存后审核备注保留。

## 风险与回滚

- 编辑模式 contact 显示：现 draft.contact 硬编码"提交者仅在私密审核区可见"（行 70），本次需改为显示真实值（若 props.group.contact 存在）——注意不要把占位文案带入编辑态。
- auditNotes 提交链路涉及 create/update 两处，均需验证。
- 回滚点：单次提交，改动集中在前端 + 契约 + 一个路由文件。
