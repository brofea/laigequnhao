# 图片格式切换与三平台 E2E 验收

## Goal

在网站发布前彻底收敛图片格式契约：头像继续使用透明 PNG，二维码改为 JPEG，并让前端、后端、seed 和 Chromium/WebKit/Firefox 图片流程 E2E 使用同一套规则。完成后通过一次真实本地 seed，将 140 个群组的图片全部成功写入本地存储；验收结束后保留这些数据，不执行清理。

## What I already know

- 当前任务已经实现了 Chromium、WebKit、Firefox 三个图片专用 Playwright project，但成功流程仍按二维码 PNG 验收。
- 头像当前规则为最长边 128px、透明 PNG、最大 128KB、只编码一次；本次保持不变。
- 二维码当前规则为最长边 1024px、不透明 PNG、最大 1MB；本次改为最长边 1024px 的 JPEG，默认质量 0.90，超限后按 0.10 递减并限制尝试次数。
- 头像压缩失败 Toast 必须为 `图像压缩失败`；二维码压缩失败 Toast 必须为 `图像压缩失败，请考虑裁剪图像`，文案不变。
- 后端当前统一按 `image/png`、`.png` 和 PNG 校验处理资源；二维码改为 JPEG 后，后端必须按用途接受并返回正确的 JPEG MIME/扩展名。
- `pnpm seed` 是 `scripts/seed.mjs` 的稳定入口，实际执行 `scripts/seed-local.mjs`。
- 当前 seed 固定规划 140 个群组，所有群组应有头像，二维码按群组加群方式随机生成；脚本目前会吞掉部分下载/上传失败并继续生成 SQL，不能满足“140 图全部成功”的验收要求。
- 旧资源无需迁移或兼容；最终资源不再使用 WebP。seed 可以读取可由 sharp 解码的源图，但不得向 API 或 R2 写入 WebP。

## Assumptions (temporary)

- “140 图”按当前 seed 的数据模型解释为 140 个群组均成功拥有一个头像资源；有二维码加群方式的群组还必须拥有对应二维码资源。若用户指的是固定 140 个二维码，则需要调整 seed 分布和验收计数。
- 三平台图片 E2E 继续覆盖管理端头像/二维码成功链路及两类压缩失败 Toast，不把全量既有业务流程复制到三个引擎。
- 本次不保留旧 PNG 二维码资源的读取兼容层；二维码新的资源记录、URL、R2 key 和响应 MIME 均使用 JPEG 契约。

## Decisions

- “最多压三次”确定为总共编码 3 次，二维码质量序列固定为 `0.90 → 0.80 → 0.70`；三次都超过 1MB 才失败并显示原有 Toast。

## Requirements (evolving)

- 头像：最长边不超过 128px；保持 alpha；只执行一次 PNG 编码；输出不超过 128KB；失败显示 `图像压缩失败`。
- 二维码：最长边不超过 1024px；依次以 JPEG quality `0.90`、`0.80`、`0.70` 编码，超过 1MB 才进入下一次，三次均超限后失败；失败显示 `图像压缩失败，请考虑裁剪图像`。
- 二维码 JPEG 编码前必须铺白底，避免 alpha 丢失造成黑底或不可读；头像不得铺白底。
- 前端不再把 WebP 作为最终格式或兼容格式；上传控件、压缩器和资源 API 的最终输出契约统一为头像 PNG、二维码 JPEG。
- 后端按资源用途校验真实 MIME、文件签名、尺寸和字节上限，并以正确扩展名、`Content-Type` 和数据库元数据保存/返回。
- 三个平台的图片 E2E 必须验证浏览器预览 Blob、上传响应、保存后的最终资源和资源引用；二维码改为 JPEG/MIME 断言，但仍需验证二维码可识别。
- seed 必须在真实本地 API 上完成 140 个群组的头像写入；所有二维码关联也必须完成对应 JPEG 上传和落库。任意一张图片失败都让 seed 失败，不生成“缺图但看似成功”的结果。
- 最终 seed 验收必须记录群组、头像和二维码资源/引用计数，执行成功后保留本地 D1/R2 状态、生成的 `seed-local.sql` 和图片资源，不运行 `pnpm clean`。

## Acceptance Criteria (evolving)

- [x] 已确认总共尝试 3 次，前端、seed、单元测试和 E2E 统一使用 `0.90 → 0.80 → 0.70`。
- [x] 头像在三平台成功流程中输出透明 PNG，最长边 `<=128`，大小 `<=128KB`，保存后资源可读且 alpha 保留。
- [x] 二维码在三平台成功流程中输出 JPEG，最长边 `<=1024`，大小 `<=1MB`，保存后响应为 `image/jpeg`，二维码仍可识别。
- [x] 二维码超过大小上限时按约定质量阶梯重试；所有尝试失败后不上传 Blob，并显示原有二维码 Toast。
- [x] 后端只接受头像 PNG 和二维码 JPEG 的新契约；不保留 WebP 最终资源或旧二维码 PNG 兼容路径。
- [x] `pnpm seed` 一次成功完成 140 个群组、140 个头像资源，以及 78 个二维码关联资源的上传和落库；验收查询无缺失引用，数据在验收后保留。
- [x] Chromium、WebKit、Firefox 图片 E2E 均实际执行且各 4/4 通过；浏览器缺失、服务失败、任一项目失败或 seed 计数不符都会使验收失败。
- [x] 相关 lint、typecheck、Vitest、Worker 测试、三平台 E2E、build 通过；全局 `format:check` 仅剩未修改的 `tests/e2e/a11y-flows.spec.ts` 基线问题，已单独记录。

## Definition of Done

- 质量阶梯语义已确认，前后端、seed、测试和文档没有 PNG/JPEG 契约漂移。
- 三平台图片 E2E 和压缩/Worker 测试覆盖成功、超限重试和失败反馈。
- 真实本地 seed 已完成并留下 140 图验收证据，未清理验收数据。
- Trellis quality check 通过，必要的前端规格文档已更新。

## Out of Scope (explicit)

- 不迁移或兼容发布前不存在的旧 WebP、旧二维码 PNG 资源。
- 不把 JPEG 用于头像；不改变头像一次透明 PNG 的规则。
- 不新增真实 Safari/真实 Firefox GUI 测试，不访问生产 R2/D1。
- 不以 mock、组件测试或只运行 Chromium 替代三平台真实浏览器流程。

## Technical Notes

- 前端入口：`src/shared/browser/image-compression.ts`、`src/components/AdminEditForm.vue`、`src/features/admin/api.ts`。
- 共享契约：`shared/contracts/asset.ts`。
- 后端入口：`functions/_lib/routes/admin-assets.ts`、`functions/_lib/services/image-validation.ts`、`functions/_lib/services/asset-service.ts`、`functions/_lib/app.ts`。
- seed：`scripts/seed.mjs`、`scripts/seed-local.mjs`、`scripts/seed-local.test.mjs`。
- 三平台 E2E：`playwright.config.ts`、`tests/e2e/image-flows.spec.ts`、`tests/e2e/fixtures/`。
- 当前实现和旧验收结果只作为回归基线；本次需求变更后必须重新打开实施清单，不能直接沿用已勾选项。
