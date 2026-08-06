# 清理添加新群 Dialog 多余默认值 (#3)

## Goal

删除管理端"添加新群"Dialog 中所有设计期占位符默认值，让新建表单以空值起步；同时让"提交者联系方式"在管理端创建时可填写、创建后不可修改；修复"审核备注"保存被清空的 bug。

## Background

- 管理端新建群草稿：`src/components/VisualShell.vue:408-423`（title="待编辑的新群组"、description="这是管理工作台添加入口的本地编辑样例。"、tags=["待审核"]、joinMethods=[{type:number, value:"待填写"}]）。
- 表单内部默认值：`src/components/AdminEditForm.vue:62-72`（contact="提交者仅在私密审核区可见"、auditNotes="已完成基础内容审核，等待下一次公开复核。"）。
- 加群方式类型占位：`src/components/AdminEditForm.vue:120-124`（link value="https://sample.invalid/new-link"、number value="待填写群号"、qr value="二维码占位区域"）。
- `toAdminPayload`（`VisualShell.vue:645-673`）不包含 contact，且 auditNotes 硬编码 null（行 669）→ 审核备注保存即清空。
- contact 三层现状：表单编辑态 readonly（`AdminEditForm.vue:618-623`）、`groupUpdateSchema`（`shared/contracts/group.ts:301-369`）无 contact、后端 update 不处理 contact、admin-groups.ts create 不传 contact（管理端新建 contact 恒为 null）。
- 后端 create 链路：`functions/_lib/routes/admin-groups.ts:272-296` → `group-repository.ts:579-585`（submission_details 写入 contact=input.contact ?? null、notes=input.notes ?? input.auditNotes）。

## Requirements

- A-1 删除管理端新建群 Dialog 全部占位符默认值（标题/简介/标签/群号/加群链接/审核备注/联系方式占位文案），新建草稿相应字段为空或为空数组。
- A-2 管理端创建模式下"提交者联系方式"输入框可编辑；编辑模式下不可修改（保持现状）。
- A-3 修复 `toAdminPayload`：正确提交 auditNotes，且创建时提交 contact。
- A-4 契约与后端配合：`groupCreateSchema` 增加 contact 字段（可选字符串），admin-groups.ts create 传 contact 与 auditNotes。
- A-5 公开投稿（主页）默认值保持不变（issue 仅针对管理端）。

## Acceptance Criteria

- [ ] 管理端添加新群 Dialog 打开后：标题、简介、标签、群号、加群链接、审核备注均为空；不出现"待编辑的新群组""待填写""sample.invalid""已完成基础内容审核"等占位文案。
- [ ] 管理端新建时联系方式输入框可输入，创建提交后该值入库（submission_details.contact 非空）。
- [ ] 编辑已建群组时联系方式输入框 readonly，且修改其他字段保存后 contact 不被改动。
- [ ] 管理端填写审核备注并保存后，再次打开该群组审核备注值保留（不再被清空为 null）。
- [ ] 主页公开投稿弹窗默认值不变。
- [ ] `pnpm vitest run` 通过、lint/typecheck 无错误。

## Out of Scope

- 编辑态联系方式的可修改性放开（issue 明确要求创建后不可改）。
- 平台默认值（由子任务 C 处理）、加群方式默认空（由子任务 B 处理）。

## Dependencies

- 无前置依赖；先于子任务 B/C/D 执行，保证表单基线干净。
