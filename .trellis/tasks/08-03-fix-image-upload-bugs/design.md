# 图片上传完整链路设计

## 1. 边界与目标

本次设计覆盖两条不同的写入路径：

- 管理端：管理员选择头像或二维码后，浏览器先压缩为最终 WebP，再调用现有认证资源接口；群组保存继续使用既有 staged/adopt/ref_count 生命周期。
- 公开投稿：用户最多选择一张头像原图；浏览器只做本地压缩和预览，最终点击提交时将压缩 WebP 与投稿字段、Turnstile token 放进同一个 multipart 请求，服务端一次完成验证、R2 写入和 pending 群组写入。不新增公开临时上传接口，不把公开图片暴露为 staged/adopt 流程。

服务器端不负责 PNG/JPG 转码，但必须独立验证最终 WebP 的真实性和可解码性。

## 2. 配置与契约

在 `shared/contracts/asset.ts` 保留单一配置来源，整理为按用途索引的不可变策略：

- `logo`：最长边 128px、最终最大 80 KB、保留 alpha、质量从 85 递减到 45。
- `qr_code`：最长边 1024px、最终最大 400 KB、白底不透明、质量从 95 递减到 55。
- 原图选择上限：5 MB，仅由浏览器在读取前执行；服务器仍以实际 multipart 字节数和最终用途上限为准。
- 后端另设独立的 multipart 请求体上限（不复用 5 MB 原图常量，且留出 multipart 字段开销），并在读取 FormData 前先拦截明显超限请求；最终文件仍按实际 Blob/Uint8Array 字节数执行用途上限。
- 总像素上限与用途策略绑定：Logo 不超过 `128 × 128`，二维码不超过 `1024 × 1024`；同时检查宽高和乘积，防止整数溢出/解压炸弹。

新增或调整的共享 schema 只描述 JSON 字段和资源 DTO；文件本体保持 `FormData` 边界，不把 Blob/File 放进 Zod JSON schema。

## 3. 浏览器压缩适配器

新增独立的浏览器图片工具（不放入 `shared/`，避免让共享契约依赖 DOM）：

1. 检查文件大小不超过 5 MB，MIME/扩展名属于 PNG、JPEG 或 WebP。
2. 用 `createImageBitmap`，在不支持时回退到带对象 URL 清理的 `HTMLImageElement` 解码。
3. 按原始比例计算最长边，创建目标 Canvas；Logo 保留透明 Canvas，二维码先绘制纯白背景。
4. 以 `image/webp` 调用 `toBlob`，按用途策略递减质量，直到不超过目标字节数；仍超限则返回可见错误，不上传。
5. 返回压缩 WebP Blob、宽高、字节数和预览对象 URL。替换、取消、弹窗卸载时统一 revoke 旧 URL。

`AdminEditForm.vue` 统一调用该工具。管理模式将结果 Blob 传给现有 `/admin/assets` 接口；公开模式只保存一个待提交 Blob 和预览 URL，不发网络请求。

## 4. 后端 WebP 校验与 Worker 解码

把当前 `admin-assets.ts` 中的签名/尺寸校验抽为共享的资源校验模块，输入实际 `Uint8Array` 和用途策略，输出可信的 `{ width, height, byteLength }`。

校验顺序：

1. 检查 multipart 请求总大小，读取实际文件字节，拒绝空文件和超过用途最终上限的内容。
2. 检查 RIFF/WEBP 签名和合理 chunk 结构，并从不需要完整解码的头部读取真实宽高。
3. 先检查用途最长边、总像素和正整数范围；超限时不得进入完整解码。
4. 通过本地 workerd/Workers Vitest 中实际加载的 Worker-compatible WASM 解码器执行完整解码；解码失败返回 `UNSUPPORTED_MEDIA_TYPE`，不写 R2/D1。
5. 只将通过校验的字节交给 R2，固定 `contentType: image/webp`。

Cloudflare Workers 支持预编译 Wasm，但生产 bundle 需要额外体积和内存预算；实现阶段必须在 `workerd` 测试和 `pnpm build` 中验证导入、运行时初始化和失败映射。WASM 解码器放在单一 adapter 中，业务路由不直接依赖库 API。

二维码策略默认采用高质量/无损优先的编码路径；浏览器压缩器在目标大小内按质量阶梯递减，压缩结果必须用真实二维码样本通过可执行扫码器验收。Cloudflare 远程部署验证暂缓，本地 workerd 和 Workers Vitest 是本任务的运行时结论。

## 5. 管理端数据流

```text
原图
  → AdminEditForm 浏览器压缩
  → POST /admin/assets (认证 + CSRF + WebP)
  → D1 staged + R2 image/webp
  → 返回 asset DTO/publicUrl
  → 草稿保存 r2Key / assetId
  → POST /admin 或 PATCH /admin/:id
  → 既有聚合事务 adopt/ref_count
  → 重新读取管理/公开 DTO
```

头像使用 `logoR2Key` 作为稳定关联；二维码使用 `joinMethods[].assetId`。上传成功后的临时预览使用服务端 `publicUrl`，不把 Blob URL 写入请求或数据库。

## 6. 公开投稿数据流

```text
原图（最多 5 MB，单张头像）
  → AdminEditForm 浏览器压缩 + 本地预览
  → POST /submissions multipart { payload JSON, file WebP, filePurpose=logo }
  → Turnstile 验证
  → multipart 文件实际大小/签名/WASM 解码/尺寸/像素校验
  → R2 写入最终对象
  → D1 batch 写入 ready asset(ref_count=1) + pending group + Logo 关联
  → 返回投稿回执
```

公开请求不创建 staged 资源。R2 写入成功后若 D1 batch 失败，调用同一 R2 adapter 做补偿删除；补偿失败按 `DEPENDENCY_UNAVAILABLE` 记录安全错误并保留可诊断 request ID，不能向客户端报告投稿成功。

`submissionRequestSchema` 继续校验逻辑字段；route 负责解析 multipart 的 JSON payload 和文件，service 负责 Turnstile 后的聚合写入。`group-repository.create()` 增加受控的 `ready asset` 写入输入，只允许投稿 service 传入已校验的内部资源对象，不接受客户端的 asset ID、r2 key、宽高或字节数。

## 7. 错误与兼容性

- 客户端：原图超 5 MB、格式不支持、浏览器无法解码/WebP 编码或压缩后超限时保留表单输入并显示错误，不触发提交。
- 管理接口：非 WebP、签名错误、WASM 解码失败、尺寸/像素/字节超限分别映射为 `UNSUPPORTED_MEDIA_TYPE`、`VALIDATION_FAILED` 或 `PAYLOAD_TOO_LARGE`，保持资源接口现有错误信封。
- 公开投稿：Turnstile 失败先结束请求；图片或 R2/D1 失败不创建 pending 群组，遵循现有 4xx/5xx 错误映射。
- 现有管理员 staged 资源、seed 资源、ready 资源读取和删除状态机不变；不需要数据库 migration。

## 8. 回滚与风险

- 新浏览器工具失败时，旧表单不会再把原图直接上传；用户会看到明确错误，后端不会接收非 WebP。
- WASM 解码器导致 Worker bundle/内存超预算时，停止发布并隔离 decoder adapter；不得退回仅签名校验的弱校验实现。
- 公开投稿改为 multipart 后，保留 JSON 字段语义和原有成功回执，纯文本投稿在无文件时继续走同一逻辑。
- R2 补偿删除是外部副作用，测试覆盖 D1 失败和 R2 删除失败两种路径。
