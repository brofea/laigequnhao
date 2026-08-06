# 研究摘要：添加群组表单系列问题 (#3 #4 #5 #20)

研究时间：2026-08-06，代码基线 branch fix/uiux2（Vue 3 + Vite + Cloudflare Workers）。

## 关键文件与行号锚点

### 表单与弹窗

- `src/components/VisualShell.vue`
  - 公开投稿草稿：`openPublicSubmitDialog()` 383-400（platform "微信"、kind "兴趣"、tags []、joinMethods []、contact ""）
  - 管理端新建草稿：`openAdminCreateDialog()` 408-423（占位：title="待编辑的新群组"、platform="微信"、description="样例…"、tags=["待审核"]、joinMethods=[{type:number,value:"待填写"}]）
  - `submitPublicGroup()` 425-455（调 submitGroup，传 pendingImages.logo）
  - `toAdminPayload()` 645-673（auditNotes 硬编码 null 行 669；不含 contact）
  - `saveAdminCreateGroup()` 768-799（stagePendingAdminImages → adminDirectory.createGroup）
  - 管理端入口按钮 1184-1186；公开投稿弹窗 1371-1400；管理端弹窗 1402-1421
- `src/components/AdminEditForm.vue`（688 行，publicMode 区分公开投稿）
  - draft 默认值 62-72：contact="提交者仅在私密审核区可见"（行 70）、auditNotes="已完成基础内容审核…"（行 71）
  - 平台选项 106-109；joinMethodOptions 110-119（link/number/qr；publicMode 过滤 qr）
  - joinMethodConfig 占位 120-124（link="https://sample.invalid/new-link"、number="待填写群号"、qr="二维码占位区域"）
  - addJoinMethod/chooseJoinMethod 205-220（同类型去重；publicMode 拦截 qr 行 207）；removeJoinMethod 222-230
  - readImage 236+（publicMode 拦截多图行 243-246："公开投稿只支持一张头像图片"）
  - save() 330-359（publicMode 时 qr: [] 行 351-356）
  - 平台 Select 457-462；标签添加 500-521；加群方式 Select 530-539；qr 编辑区 551-580（publicMode 文案行 579）；contact 输入 readonly 618-623；auditNotes 输入 624-629
- `src/components/Select.vue`（138 行）：props 10-22（modelValue: string，无 multiple）；trigger 行 100（role=combobox 仅为 a11y）；菜单模板 117-135；样式 `src/styles/index.css:1135-1203`
- `src/components/Input.vue`（48 行）：无建议列表；`src/components/BoardAddGroupForm.vue:74-117`：搜索过滤+点选模式（非可配置组件）

### 契约

- `shared/contracts/group.ts`：groupCreateSchema 230-298（platform z.string().min(1) 行 254；无 contact）；groupUpdateSchema 301-369（platform 行 325；auditNotes 行 332；无 contact）
- `shared/contracts/submission.ts`：SUBMISSION_LOGO_FORM_FIELD="logo" 行 19；submissionRequestSchema 23-75（platform min(1) 行 38；groupNumber/url refine 行 67-70）
- `shared/domain/config.ts:88-92`：platforms 非空字符串数组

### 后端

- `functions/_lib/routes/admin-groups.ts`：create 272-296（repo.create，auditNotes 传入、contact 不传）；update 462-488
- `functions/_lib/repositories/group-repository.ts`：create 579-585（submission_details 写 contact=input.contact ?? null、notes=input.notes ?? input.auditNotes）；update 695-710（无 contact；notes 可改 744/915/921）
- `functions/_lib/services/submission-service.ts`：submit(34-150) 仅单 logo（ValidatedSubmissionLogo 12-16；readyAsset 86-93；R2 上传 95-103；补偿删除 122-148；joinMethods 拼装 61-64/112-115）
- `functions/_lib/services/public-group-mapper.ts:38-39`：公开 DTO 剥离 submissionContact/auditNotes
- 前端 API `src/features/groups/api.ts:86-100` submitGroup：multipart payload JSON + file "logo.png" + filePurpose "logo"

## 结论要点

1. 平台/联系方式后端契约均自由字符串，限制全在前端。
2. contact 三层（表单/契约/后端）均不支持管理端创建时填写；创建后不可改天然成立。
3. auditNotes 管理端表单可编辑但 toAdminPayload 恒发 null → 保存即清空。
4. Select.vue 无 multiple/可输入能力；项目无现成 combobox。
5. 公开投稿 qr 在 4 处被禁用；submitGroup 仅单文件；后端仅单 readyAsset。
