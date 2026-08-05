# WebKit 图片压缩改为 PNG 技术设计

## 1. 设计结论

本任务把最终图片格式从 WebP 一次性切换为 PNG，不保留 WebP 读取、上传、DTO 或资源迁移兼容。网站尚未发布，既有本地资源由 `pnpm clean` 清空；本地 seed 重新生成 PNG 资源。

统一链路如下：

```text
用户原图
  → 前端校验与解码
  → Canvas 等比缩放/透明度处理
  → 单次 canvas.toBlob("image/png")
  → PNG 字节 + 本地预览
  → 保存/投稿时上传
  → 后端 PNG 结构、尺寸、像素、透明度和完整解码校验
  → D1 staged + R2 image/png
```

不改变保存/提交时上传、staged/adopt、引用计数、失败补偿和清理状态机。

## 2. 共享资源契约

`shared/contracts/asset.ts` 继续作为前后端唯一策略源：

| 用途 | 最长边 | 最大像素 | alpha | 最大文件 |
|---|---:|---:|---|---:|
| `logo` | 128px | 128×128 | 保留 | 128KB |
| `qr_code` | 1024px | 1024×1024 | 禁止，白底 | 1MB |

- `contentType`、资源 DTO、上传元数据统一使用 `image/png`。
- `ASSET_UPLOAD_REQUEST_MAX_BYTES` 调整为大于 1MB 文件和 multipart 边界的值，建议保留明确的边界余量，例如 1.1MiB 或 1.2MiB；测试不得只验证最终文件上限而忽略请求体上限。
- 删除 WebP 专属 quality 常量和策略字段；保留原图 5MB 读取上限，除非实现中的浏览器行为证据要求改变。
- `assetUploadLimitsSchema` 继续检查用途、字节数、宽高和像素数；alpha 需要在服务端对真实 PNG 结构检查，不能只信任客户端元数据。

由于项目尚未发布，`migrations/0002_admin_group_management.sql` 的资源默认 Content-Type 可直接改为 `image/png`；实现前运行 `pnpm clean --yes` 清空本地 D1 应用行和 R2 对象。无需新增 WebP 迁移或双格式回滚路径。

## 3. 浏览器压缩适配器

### 3.1 单次编码

`src/shared/browser/image-compression.ts` 保留现有解码回退、等比缩放、ImageBitmap 清理和 Blob URL 生命周期，但改动编码边界：

1. `canvas.toBlob(resolve, "image/png")` 只调用一次，不传质量参数，不做质量阶梯。
2. 回调为空、抛错、返回非 `image/png` 或 PNG 签名无效时，抛出统一压缩错误；不回退 WebP，不把其他 MIME 伪装成 PNG。
3. 候选文件超过用途上限立即失败，不再尝试降低质量或重新编码。
4. 头像 Canvas 使用 alpha；二维码先铺纯白底，再使用不带 alpha 的 PNG 编码。

### 3.2 UI 反馈

`AdminEditForm` 在头像和二维码压缩失败时清理本次失败状态并发出已有 `toast` 事件：

- 头像：`图像压缩失败`
- 二维码：`图像压缩失败，请考虑裁剪图像`

表单内的状态文案可以继续保留“正在处理/已准备好”等非错误状态，但压缩错误必须由父容器现有 toast 展示；失败不得写入 pending Blob、不得生成预览、不得触发保存/提交上传。

### 3.3 输入和文件名

原图仍可接受 PNG/JPEG/WebP（输入 WebP 只是用户原图格式，不是最终输出），HEIC 继续明确拒绝。`accept` 不需要把最终格式和原图格式混为一谈；最终 Blob、公开投稿 multipart 文件名、管理员资源文件名统一使用 `.png`。

## 4. Worker PNG 校验与存储

### 4.1 PNG 结构

将 `functions/_lib/services/image-validation.ts` 从 WebP 专用解析改为 PNG 专用解析，或提取命名明确的 PNG helper：

- 校验 8 字节 PNG 签名；按 chunk 边界读取，拒绝截断、越界和无 IHDR/IDAT 的文件。
- 从 IHDR 读取宽高、bit depth 和 color type；拒绝零尺寸、超出用途最长边或像素上限的文件。
- 通过 color type 和 `tRNS` chunk 判断透明度：头像允许 alpha，二维码禁止 alpha；二维码透明输入必须在服务端拒绝，即使客户端声明为 opaque。
- 用现有 Photon 完整解码 PNG，确认解码宽高与 IHDR 一致、像素数据完整；不引入新的服务端图片库。
- 暴露 `validatePngUpload` 和 PNG 结构类型，路由、投稿服务和测试不再引用 `validateWebpUpload`/`parseWebpStructure`。

### 4.2 路由、Service 和 R2

- 管理员资源上传和公开投稿均调用 PNG 校验；错误消息改为 PNG 语义。
- `asset-service` 生成 `${purpose}/${id}.png`，D1 `content_type`、DTO 和返回值使用 `image/png`。
- `r2-adapter` 默认上传 Content-Type 改为 `image/png`，公开资源 GET 继续透传保存的 PNG 元数据。
- `/api/v1/assets/<key>` 的读取、缓存头和同源 URL 行为保持不变，仅响应类型和测试字节改为 PNG。
- 不对 WebP 做读取分支、迁移、fallback 或历史数据兼容。

## 5. 本地 seed

`scripts/seed-local.mjs` 使用 Sharp 生成与前端策略一致的 PNG：

- logo：128px、128KB、保留 alpha，调用一次 `.png().toBuffer()`；
- QR：1024px、1MB、白底不透明，调用一次 `.png().toBuffer()`；
- 删除质量递减循环及 WebP 参数；
- 上传 Blob 的 MIME、文件名、R2 key 后缀和 `assetUpsertSql` 的 `content_type` 全部改为 PNG。

`scripts/seed-local.test.mjs` 的样例 key、URL、staged SQL 和幂等断言同步改为 `.png`/`image/png`。本地旧数据不迁移，执行 `pnpm clean --yes` 后重新 seed。

## 6. 测试设计

- 前端压缩单测：验证 PNG MIME/签名、一次 `toBlob`、logo alpha、QR 白底、两种新大小边界、超限失败、无预览 URL和 ImageBitmap/输入 URL 清理。
- 前端组件/API 单测：验证头像与二维码错误 toast 文案，以及公开投稿/管理员上传使用 `.png` 文件名和 `image/png` Blob。
- 共享契约单测：验证新上限、PNG Content-Type 和 URL key 的 `.png` 示例。
- Worker 单测：使用真实可解码 PNG 覆盖 logo alpha、QR opaque、尺寸/像素/字节边界、透明 QR 拒绝、伪造/截断 PNG 拒绝、R2 `Content-Type: image/png` 和完整响应体。
- 投稿与管理员群组测试：校验全链路写入的 `.png` key 和 `image/png` 元数据，资源引用/清理语义保持原有断言。
- Seed 测试：校验生成 SQL 的 PNG key/MIME 和 staged upsert 幂等性。
- 浏览器 smoke：在已有 Playwright 配置基础上补充 WebKit/Firefox project 或提供明确的可选项目命令；至少运行现有 Chromium 流程，不能把仅单测通过当作 Safari 验收。

## 7. 风险、回滚与边界

- PNG 通常比 WebP 大；头像和二维码上限已按需求提高，但二维码 1MB 会放大 multipart 请求体和服务端内存压力，因此必须同步测试 request cap。
- PNG color type/`tRNS` 解析若过宽会允许透明二维码，若过严会误拒绝合法头像；使用真实 PNG 样本和 Photon 解码双重测试。
- Safari 的 PNG Canvas 编码属于标准浏览器能力；若编码失败，按需求直接 toast，不恢复 WebP 或原图直传。
- 回滚只能回滚本任务代码并再次清空/重建本地数据；不设计线上 WebP 兼容回滚，因为项目尚未发布且用户明确取消该兼容。
