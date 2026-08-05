# 图片格式切换与三平台 E2E：实施计划

## 当前阶段

- [x] 用户 review 通过，任务已从 `planning` 进入 `in_progress`。
- [x] 已核对 seed 入口：`pnpm seed` → `scripts/seed.mjs` → `scripts/seed-local.mjs`。
- [x] 已将 seed 的图片处理/上传失败改为 fail-closed，并加入 D1/R2/公开 URL 只读验收。
- [x] 用户确认总共尝试 3 次，质量序列为 `0.90 → 0.80 → 0.70`。
- [x] 用户 review 本次更新后的 `prd.md`、`design.md` 和本实施计划。
- [x] review 通过后执行 `python3 ./.trellis/scripts/task.py start .trellis/tasks/08-05-cross-platform-image-e2e`。

## 实施步骤

### 1. 锁定共享图片契约

- [x] 将 logo/qr_code 的 MIME、扩展名、尺寸和字节限制拆为用途级契约。
- [x] 彻底移除 WebP 的最终输出/输入兼容路径和旧二维码 PNG 假设；清理相关文案、schema、测试和 fixture。
- [x] 保持头像一次透明 PNG、128px、128KB 规则不变。
- [x] 实现二维码最长边 1024px、白底 JPEG、固定 `0.90 → 0.80 → 0.70` 三次质量阶梯和失败边界。

### 2. 更新前端、API 和后端

- [x] 更新 `image-compression.ts`：头像一次 PNG，二维码 JPEG ladder；只返回未超限 Blob。
- [x] 更新 `AdminEditForm.vue` 和 admin API：正确的 accept、preview、filename、MIME 和 Toast。
- [x] 更新 shared schema、admin asset route、image validation、asset service、公开资源响应和 R2 key/metadata。
- [x] 全面删除 hardcoded `image/png` 对二维码的假设。

### 3. 更新 seed 并建立 140 图强门禁

- [x] seed 输出 logo PNG、QR JPEG，并复用 `0.90 → 0.80 → 0.70` 二维码质量参数。
- [x] 任意一张应上传图片处理/上传失败立即失败；禁止 SQL 生成后留下缺图或空关联。
- [x] seed 完成后断言 140 个群组、140 个头像资源，以及所有 QR join method 的 JPEG 资源均存在且可读。
- [x] 在干净本地 state 上真实执行一次 `pnpm seed`；成功后保留 D1/R2、`seed-local.sql` 和生成资源，之后未执行清理。

### 4. 更新测试和三平台 E2E

- [x] 更新压缩器单元测试：PNG/JPEG MIME、`0.90 → 0.80 → 0.70` 参数、超限重试、第三次失败、失败 Toast 和 WebP 删除。
- [x] 更新 shared contract/Worker 测试：用途 MIME、JPEG 校验、扩展名、响应头和生命周期。
- [x] 更新 E2E fixture/assertions/spec：二维码 JPEG signature/MIME/尺寸/字节/解码；保留头像 alpha 和失败请求断言。
- [x] 在 Chromium、WebKit、Firefox 中实际跑通头像、二维码成功和失败流程；三平台图片 spec 各 4/4 通过。

### 5. 质量门禁和文档

- [x] 更新 Playwright 运行说明、Trellis frontend/backend spec 和研究记录；README 原有三浏览器说明已覆盖本次入口。
- [x] 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm test:e2e`、`pnpm build`。
- [x] 运行 `python3 ./.trellis/scripts/task.py validate .trellis/tasks/08-05-cross-platform-image-e2e` 和 Trellis check。
- [x] 复核 git diff；format 仅剩未修改的 `tests/e2e/a11y-flows.spec.ts` 基线问题，未发现本任务新增格式错误或旧最终 WebP/QR PNG 路径。

## 验证命令

规划确认后，先做小范围验证：

```bash
pnpm exec playwright test --list
pnpm test -- src/shared/browser/image-compression.spec.ts shared/contracts/asset.spec.ts
pnpm test:workers -- tests/workers/admin-assets.spec.ts
pnpm test:e2e --project=image-chromium tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-webkit tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-firefox tests/e2e/image-flows.spec.ts
```

最终质量和 seed 验收：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
pnpm seed
```

`pnpm seed` 必须在验收前准备空的本地 D1/R2 和已启动的本地 API；本次实际结果为 `140 groups, 140 logos, 78 QRs`，seed 内部 D1/R2/HTTP readback 全部通过，成功后只做只读审计，未再执行 `pnpm clean`。

## Review gates

- 重新进入实施前：质量尝试次数、140 图含义、JPEG 后端资源契约和“不删除 seed 数据”均已记录。
- 编码后：通过 Trellis check，逐项核对 PRD，特别检查 JPEG MIME/扩展名、WebP 清理和 seed 140 计数。
- 交付前：保留 seed 成功日志和本地计数证据，确保最终资源仍存在；如 commit，只提交当前任务文件和实现文件。

## 回滚点

- 若共享 MIME 拆分影响面过大，可先保留用途映射 helper，再逐个替换调用方；不恢复全局二维码 PNG 契约。
- 若浏览器 JPEG 编码在某引擎失败，保留失败 trace 和预览字节，修正产品压缩器或测试 seam；不跳过该 project。
- 若 seed 远程图片不足 140，切换确定性本地输入并重新从空 state 执行；不接受循环复用少量下载结果作为最终验收。
