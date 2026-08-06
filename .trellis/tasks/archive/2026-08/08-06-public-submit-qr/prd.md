# 主页投稿支持二维码上传 (#20)

## Goal

让主页"添加新群"（公开投稿）支持上传二维码图片，参考管理端新增群组 Dialog 的交互，完整打通前端表单、前端 API、契约、后端存储/审核链路。

## Background

- 公开投稿弹窗：`VisualShell.vue:1371-1400`（public-submit-dialog），草稿初始化 `:383-400`。
- 前端禁用点 4 处（`AdminEditForm.vue`）：115-119（publicMode 过滤 qr 选项）、207（addJoinMethod 拦截）、243-246（readImage 拦截"公开投稿只支持一张头像图片"）、351-356（save 中 qr: []）+ 模板 579（"公开投稿不支持二维码上传。"）。
- 前端 API：`src/features/groups/api.ts:86-100` `submitGroup` 仅 append 一个 logo 文件（filePurpose: "logo"）。
- 契约：`shared/contracts/submission.ts:18-19` 注释"公开投稿最多接收一个 Logo 文件"；`submissionRequestSchema`（23-75）加群方式仅 groupNumber/url 两种，无 qr。
- 后端：`functions/_lib/services/submission-service.ts`（65/116 处 contact 写入；需扩展 qr 图片处理与存储）。
- 管理端对照链路：管理端编辑 qr 方式上传图片走 `readImage` + `stagePendingAdminImages`（VisualShell.vue:768-799）→ admin create（admin-groups.ts）→ 图片对象存储 + joinMethods 带 imageData。
- 用户已确认：完整打通前后端，多文件同时上传（头像 logo + 二维码），契约增加 qr 加群方式，后端链路对齐管理端。

## Requirements

- D-1 前端表单：移除 publicMode 下 qr 的全部 4 处禁用 + 模板占位文案；公开投稿可添加"二维码"加群方式并上传图片（上传 UI/限制参考管理端：PNG/JPEG、保存转白底 JPEG、最大 1MB）。
- D-2 前端 API：`submitGroup` 支持多文件（logo + qr 图片）上传，二维码图片按用途标识（如 filePurpose: "qr" 或独立字段）。
- D-3 契约：`submissionRequestSchema` 增加 qr 加群方式（含图片引用/数据），更新"最多一个 Logo 文件"注释约束。
- D-4 后端：`submission-service` 接收并存储 qr 图片（对齐管理端图片存储链路），提交数据落库时 joinMethods 含 qr 方式。
- D-5 审核流：后台审核/查看投稿时二维码可见（若投稿审核链路有预览需覆盖）。

## Acceptance Criteria

- [ ] 主页"添加新群"弹窗中"添加加群方式"下拉出现"二维码"选项，添加后出现图片上传控件。
- [ ] 选择二维码图片后可预览；可同时存在头像（logo）与二维码。
- [ ] 提交成功后数据入库：joinMethods 含 qr 方式且图片可访问（数据面验证）。
- [ ] 管理端现有二维码流程无回归（管理端不受影响）。
- [ ] 契约单测/后端测试更新覆盖 qr 提交。
- [ ] `pnpm vitest run` 通过、lint/typecheck 无错误。

## Out of Scope

- 投稿审核流的 UI 重设计（仅保证数据与图片链路可用）。
- 二维码合规/安全扫描。

## Dependencies

- 依赖子任务 A（表单基线清理）与 B（加群方式下拉多选，publicMode 下拉同步）完成后接入，避免冲突。
- 后端图片存储链路复用管理端方案（父任务 design.md 给出统一设计）。
