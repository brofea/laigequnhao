# 设计：主页投稿支持二维码上传 (#20)

## 目标链路

```
AdminEditForm.vue（publicMode 解禁 qr）
  → draft.joinMethods 含 qr 方式（imageData Blob）
  → VisualShell.submitPublicGroup → submitGroup(input, logoBlob, qrBlob)
  → POST /submissions（multipart: payload JSON + file(logo) + filePurpose=logo + file(qr) + filePurpose=qr）
  → routes/submissions.ts 解析 multipart → 图片校验器校验 qr 图片
  → submission-service.submit(..., { logo, qr })
  → groupRepo.create(joinMethods 含 qr + 双资产 readyAssets)
```

## 契约变更（shared/contracts/submission.ts）

- `submissionRequestSchema`：
  - 新增 `qr: z.boolean().optional()` 标记字段（二维码图片本体走 multipart 文件，不进入 JSON）。
  - `.refine((d) => d.groupNumber || d.url || d.qr, ...)` —— 仅传二维码也可提交（二维码本身承载群信息）。
  - 更新注释："公开投稿最多接收一个 Logo 文件" → 可接收 logo + 二维码两个文件；新增 `SUBMISSION_QR_FORM_FIELD = "qr"` 常量。
- 前端 `submissionRequestSchema.parse` 在 submitGroup 内使用，qr 标记随 payload 提交。

## 前端（src/features/groups/api.ts + AdminEditForm.vue）

- `submitGroup(input, logoBlob?, qrBlob?)`：qrBlob 存在时 multipart 追加 `file: qrBlob, "qr.png"` + `filePurpose: "qr"`。
- `AdminEditForm.vue` 解禁 4 处（115-119 选项过滤、207 拦截、243-246 readImage 拦截、351-356 save 时 qr: []）+ 模板 579 占位文案。
- publicMode 下 qr 上传 UI 复用管理端 qr 编辑器（上传控件、预览、限制文案），save() 将 qr 的 imageData（压缩后 PNG Blob）保留。
- `VisualShell.submitPublicGroup`（425-455）收集 qr Blob 传入 submitGroup。

## 后端（routes/submissions.ts + submission-service.ts）

- route：multipart 解析按 filePurpose 区分 logo / qr；qr 文件走同一图片校验器（复用现有 logo 校验逻辑，产出 ValidatedSubmissionLogo 同构结构）。
- service：`submit` 增加 `submission?.qr`；joinMethods 拼装增加 `{ type: "qr" }`（value/assetId 由 readyAsset 关联）；qr 资产同样走 R2 上传 + 补偿删除。
- repo.create 资产参数：现为单 `readyAsset`（SubmissionReadyAssetInput），扩展为可传多资产（logo + qr），或 qr 走独立字段——实现时按 repo 现状选择最小改动（若 repo 已有 asset 数组能力则复用，否则扩展为数组并保持兼容）。

## 兼容性

- 契约字段 `qr` 为 optional 标记，旧请求（无 qr 字段、单 logo）完全兼容。
- 后端多文件解析：filePurpose 缺失/未知仍按旧行为（仅 logo 或纯 JSON）。

## 验证

- 契约测试：submissionRequestSchema 增加 qr 用例（仅 qr 无群号可过、qr=false 需群号或链接）。
- 手测：主页投稿传头像+二维码 → 提交成功 → 管理端/公开详情可见二维码；仅传二维码可提交。
- `pnpm vitest run`、lint、typecheck。
