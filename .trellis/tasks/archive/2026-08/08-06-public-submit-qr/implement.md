# 执行计划：主页投稿支持二维码上传 (#20)

## 实施清单（有序）

1. 契约：`shared/contracts/submission.ts`
   - 新增 `SUBMISSION_QR_FORM_FIELD = "qr"` 常量；`submissionRequestSchema` 加 `qr: z.boolean().optional()`；refine 改为 `groupNumber || url || qr`；更新多文件注释。
2. 契约测试：更新/新增 submission schema 测试（仅 qr 可过；无 qr 时仍需群号或链接）。
3. 前端 API：`src/features/groups/api.ts` `submitGroup` 增加 `qrBlob?: Blob` 参数，multipart 追加第二个文件。
4. 前端表单：`src/components/AdminEditForm.vue` 解除 4 处 publicMode qr 禁用 + 模板占位文案；确认 save() 保留 qr imageData。
5. 前端提交：`src/components/VisualShell.vue` `submitPublicGroup` 收集 qr Blob。
6. 后端 route：`functions/_lib/routes/submissions.ts` 解析 filePurpose=qr 文件并走图片校验器。
7. 后端 service：`functions/_lib/services/submission-service.ts` 接收 qr，joinMethods 增加 qr 项，qr 资产走 R2 上传/补偿删除；repo.create 资产参数扩展为多资产（最小改动，保持旧签名兼容）。
8. 后端测试：更新 submission-service / route 相关测试覆盖 qr 链路。
9. 验证：`pnpm vitest run`、lint、typecheck、build；浏览器手测主页投稿（头像+二维码、仅二维码、二维码+群号 三场景）。

## 风险与回滚

- repo.create 资产结构（readyAsset 单值 → 多值）改动面最大：先读 `functions/_lib/repositories/group-repository.ts` 与 `functions/_lib/adapters/r2-adapter.ts` 确认现状再动，保持旧调用兼容。
- 回滚点：契约/前端/后端各自独立提交；若 repo 改动风险高，可拆为"logo 资产路径不变 + qr 独立字段"的最小方案。

## 依赖

- 前置：子任务 A（表单基线）与 B（加群方式下拉多选，publicMode 共用）完成。
