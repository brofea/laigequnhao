# 图片格式切换与三平台 E2E：技术设计

## 1. 设计目标

将图片格式按用途拆开：头像始终是透明 PNG，二维码始终是铺白底的 JPEG。压缩器、浏览器预览、multipart 上传、R2 key、D1 元数据、公开资源响应、seed 和三平台 E2E 必须共享同一份用途契约。

## 2. 用途契约

| 用途 | 输出格式 | 最长边 | 大小上限 | alpha | 压缩策略 |
|---|---|---:|---:|---|---|
| `logo` | PNG | 128px | 128KB | 保留 | 一次编码 |
| `qr_code` | JPEG | 1024px | 1MB | 铺白底后编码 | 固定 3 次：`0.90 → 0.80 → 0.70` |

建议共享契约暴露用途对应的 `contentType`、扩展名和压缩参数，避免继续使用一个对两种资源都成立的 `ASSET_CONTENT_TYPE = image/png`。服务器按用途选择解码/校验器：logo 使用 PNG 结构校验，QR 使用 JPEG 解码和尺寸/像素/字节校验，并拒绝用途与 MIME 不匹配的上传。

不做旧资源迁移。由于网站尚未发布，清空现有本地资源后以新契约重新生成即可；R2 key 和 seed 文件名直接使用 `logo/<id>.png` 与 `qr_code/<id>.jpg`。

## 3. 浏览器压缩流程

### 3.1 头像

1. 检查源图并在 Canvas 中按最长边 128px 缩放。
2. 保留源图 alpha，调用一次 `canvas.toBlob(..., "image/png")`。
3. 校验返回 Blob 类型、签名、尺寸和 128KB 上限。
4. 任一失败都抛出压缩错误，由现有表单显示 `图像压缩失败`，不产生 pending upload。

### 3.2 二维码

1. 按最长边 1024px 缩放 Canvas；不带 alpha 的 JPEG 前先绘制白色背景。
2. 依次以 `0.90`、`0.80`、`0.70` 调用 `canvas.toBlob(..., "image/jpeg", quality)`，总共最多 3 次。
3. 每个 Blob 都校验 `image/jpeg`、JPEG 可解码、尺寸和 1MB 上限；未超限立即返回。
4. 前两次超限时降低 0.10 质量；第三次仍超限后抛出压缩错误，表单继续使用现有二维码 Toast `图像压缩失败，请考虑裁剪图像`。
5. 任何失败都不得上传最后一个超限 Blob；压缩器返回的 Blob 类型必须决定后续 multipart filename 和后端用途。

不再把 WebP 列为浏览器输入兼容格式或输出格式；测试 fixture 只使用 PNG/JPEG。

## 4. 服务端与存储数据流

1. 前端 API 上传函数按用途选择 `logo.png`/`qr.jpg` 和对应 Blob MIME。
2. admin asset route 校验 multipart `purpose` 与 MIME 的组合：logo 仅 PNG，qr_code 仅 JPEG；文件签名不能由请求头单独决定。
3. asset service 按用途生成 `.png`/`.jpg` key，并把真实 MIME 写入 staged asset 元数据和 R2。
4. 公开资源 route 从数据库读取资源 MIME（或按已校验用途映射），返回正确 `Content-Type`，不能继续硬编码 `image/png`。
5. adoption、删除、回收和群组 DTO 继续沿用现有生命周期；只替换格式相关的校验和 key/metadata。

需要同步更新 schema、接口测试、Worker 测试和所有假资源。旧 `.webp` 或二维码 `.png` 资源不进入新 contract。

## 5. seed 设计

`scripts/seed-local.mjs` 使用 sharp 生成最终格式，不把 source image 的格式直接上传：

- 每个群组生成一次头像 PNG，最长边 128px、最大 128KB。
- 每个有 `qr_code` 加群方式的群组生成 JPEG QR 版本，最长边 1024px，并复用浏览器的 `0.90 → 0.80 → 0.70` 质量序列和 1MB 上限。
- `uploadViaApi` 按用途发送正确 Blob MIME、filename 和 `purpose`。
- 上传或处理任何一张应存在的图失败时立即使 seed 非零退出，不能继续生成带空资源引用的 SQL。
- SQL 执行后查询并断言 140 个群组、140 个头像引用，以及所有二维码加群方式均有 JPEG 资源；记录各计数、尺寸、字节数和 MIME。
- 验收使用全新本地 state 运行一次，成功后保留 D1/R2 和 `seed-local.sql`，不调用清理命令。

为了满足“140 图全部成功”而不是“下载失败后用较少样本循环复用”，seed 应把有效图片数量不足 140 视为失败，或改用仓库内确定性 fixture/已下载的本地输入；具体取舍在实现前以现有 seed 网络约束和用户确认后的验收可重复性为准。无论输入来源如何，最终写入资源必须全部是 PNG/JPEG 新契约。

## 6. 三平台 E2E 设计

保留 `image-chromium`、`image-webkit`、`image-firefox` 三个图片专用 project 和既有隔离配置。

- 头像成功：预览与最终资源断言 `image/png`、PNG signature、最长边 `<=128`、`<=128KB`，且存在透明像素。
- 二维码成功：预览与最终资源断言 `image/jpeg`、JPEG signature、最长边 `<=1024`、`<=1MB`，通过 sharp 解码后 alpha 全为 255，并由 `jsQR` 验证内容。
- 二维码超限：用可稳定产生大 JPEG 的 fixture/测试 seam 验证恰好调用 `0.90`、`0.80`、`0.70` 三次、最终失败 Toast 和无上传；不要依赖三引擎压缩结果恰好产生相同字节数。
- 两类解码失败：保留精确 Toast、无预览、无 staged asset 上传断言。
- 三引擎项目必须实际执行，浏览器缺失、No tests found、服务启动失败和任一失败都让命令失败。

## 7. 测试分层

- `image-compression.spec.ts`：质量序列、JPEG MIME/质量参数、超限重试、失败边界、头像单次 PNG 和 WebP 移除。
- `asset.spec.ts` 及 Worker 测试：用途 MIME、扩展名、JPEG/PNG 校验、响应头和生命周期。
- `image-flows.spec.ts`：真实浏览器预览 → 上传 → 保存 → 最终资源和二维码识别。
- `seed-local.test.mjs`：输出格式/质量 ladder helper、失败即终止和 140 计数校验；真实 `pnpm seed` 作为最终验收证据，不用测试 mock 代替。

## 8. 回滚与风险

- 实现前保持 task status 为 `planning`，用户确认质量尝试语义后才重新 `task.py start`。
- 若 JPEG 后端校验器引入已有依赖限制，优先复用项目现有 Photon/sharp 能力，不添加第二套图片解码栈。
- 若真实 seed 的远程图片不稳定，验收必须切换为仓库内确定性输入或明确记录环境阻断；不能降低“140 图全部存入”的门槛。
- 若 E2E 质量阶梯难以稳定触发，可对编码器注入受控的测试 seam，但成功链路仍必须走真实 Canvas 和真实 Worker，不得 mock 整条上传流程。
