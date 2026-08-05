# WebKit 图片压缩改为 PNG 执行计划

## 实施前门禁（已完成）

用户已批准最新规划摘要，任务已通过 `task.py start` 进入 `in_progress`，随后完成产品代码实现。

## 实施步骤

### 1. 统一共享限制和预发布数据库默认值

- 将 `shared/contracts/asset.ts` 的 logo/QR 上限更新为 128KB/1MB、Content-Type 更新为 `image/png`，删除质量阶梯字段/常量和 WebP 资源语义。
- 调整上传请求体上限并添加“1MB 文件 + multipart 边界”回归。
- 将预发布 `migrations/0002_admin_group_management.sql` 的资源默认 Content-Type 更新为 PNG；按用户决定不新增兼容迁移。
- 运行 `pnpm clean -- --yes` 清空本地 D1 应用数据和 R2；确认 schema、实例和 migration 记录保留。

风险点：共享策略会同时影响前端、Worker、seed 和大量夹具；先完成搜索清单，再逐项替换，禁止留下 WebP 运行时契约。

### 2. 改造浏览器压缩器

- `image-compression.ts` 改用单次 `canvas.toBlob("image/png")`，移除质量字段、质量循环、WebP 签名和 data URL fallback。
- 保留解码回退、Canvas alpha/白底、目标尺寸和 Blob URL 清理。
- 输出 Blob、预览 URL、投稿文件名和管理员上传文件名改为 PNG。
- 更新 `image-compression.spec.ts`，覆盖单次编码、MIME/签名、透明度、超限失败和失败不生成预览。

风险点：测试 mock 目前默认返回 WebP，需要先替换为真实/最小有效 PNG，不得只修改期望字符串而让测试失去格式校验。

### 3. 改造前端失败反馈和 API 客户端

- `AdminEditForm.vue` 将压缩错误统一映射为头像/二维码两种 toast 文案，并确保失败不写入 pending Blob。
- 保留成功状态文案和已有 `toast` 事件父子链路；补组件测试验证事件 payload。
- 更新 `src/features/admin/api.ts`、`src/features/groups/api.ts` 和相关测试的 `.png` 文件名、Blob MIME、注释和 schema 断言。
- 更新 input `accept`/提示文案，明确“原图可选格式”和“最终结果为 PNG”。

风险点：不要把“用户原图是 WebP”误删为不支持输入；本任务只取消最终资源和后端上传的 WebP。

### 4. 改造 Worker PNG 校验和资源链路

- 把 `image-validation.ts` 的 WebP parser/validator 改为 PNG parser/validator，检查签名、chunks、IHDR、尺寸、像素、color type/`tRNS` alpha 和 Photon 完整解码。
- 修改 `admin-assets.ts`、`submissions.ts` 的校验调用与错误文案。
- 修改 `asset-service.ts`、`r2-adapter.ts`、必要的数据库写入和 DTO mapper，使 key 为 `.png`、Content-Type 为 `image/png`。
- 保持同源资源 URL、缓存头、R2/D1 staged/ready/delete_failed 语义不变。
- 用全仓搜索清理生产代码中的 `WebP`/`image/webp`/`.webp` 引用；仅保留用户原图输入支持和历史 Trellis 文档，不在最终资源、上传、测试夹具或 seed 输出中保留 WebP 语义。

风险点：PNG 透明度判断和 1MB request cap；先补 validator 单测，再接通路由和 service，避免跨层错误难以定位。

### 5. 改造 seed 和 Worker/契约测试夹具

- `scripts/seed-local.mjs` 改为单次 Sharp PNG 编码、128KB/1MB 限制、PNG Blob/文件名/SQL metadata。
- `scripts/seed-local.test.mjs`、`tests/workers/fixtures.ts`、`tests/workers/helpers.ts` 和所有 Worker 夹具改用可解码 PNG。
- 更新管理员资源、群组、投稿、资源生命周期和共享契约测试中的 key、MIME、错误文案与响应 Content-Type。
- 保留真实 R2 响应体消费和生命周期清理断言。

### 6. 质量门禁和浏览器验证

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

额外检查：

- `rg -n "image/webp|WebP|\\.webp" src shared functions tests scripts migrations` 只允许没有运行时意义的历史说明（理想结果为零）；
- `pnpm clean --yes` 后运行本地 seed，确认 D1/R2 中图片均为 PNG；
- 本机 WebKit 已安装，用临时 project 跑了 35 个 smoke：32 个通过，3 个既有管理员登录表单用例因提交后仍停留 `/admin/login` 失败；Chromium 桌面/移动 70 个全部通过。Firefox 浏览器未安装，未伪造 Firefox 通过。

## 完成定义

- [x] `prd.md`、`design.md`、`implement.md` 和两个 manifest 已完成并经用户批准。
- [x] 前后端、seed、数据库默认值、测试夹具均无 WebP 运行时契约；新资源统一为 PNG。
- [x] 头像/二维码压缩限制、单次编码、透明度、toast、后端校验和 1MB request cap 均有自动化证据。
- [x] lint、typecheck、139+2 个前端测试、129 个 Worker 测试、70 个 Chromium E2E、build 通过；任务相关文件格式通过。全局 format check 仅受未修改的 `tests/e2e/a11y-flows.spec.ts` 影响。
