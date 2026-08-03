# 图片上传完整链路执行计划

## 实施顺序

1. **共享配置与浏览器工具**
   - 整理 `shared/contracts/asset.ts` 的用途策略、最终字节/尺寸/像素上限。
   - 新增浏览器压缩适配器和纯逻辑测试：PNG/JPG/WebP 输入、alpha/白底、最长边、质量递减、5 MB 原图限制、WebP 不支持和对象 URL 清理。
   - 风险点：Canvas 的 alpha、`toBlob` 的 WebP 支持和移动端内存；必须保留可见失败状态。

2. **Worker WebP 校验 adapter**
   - 引入并验证 Worker-compatible WASM 解码依赖，封装实际解码和真实元数据读取。
   - 抽取管理员资源路由共用的签名、字节、尺寸、像素和用途校验。
   - 分别配置并测试 multipart 请求体总大小、最终文件实际字节数、宽高和总像素限制；明确原图 5 MB 只在浏览器执行。
   - 固定先请求体/字节、后头部尺寸/像素、最后完整解码的顺序；增加恶意/截断 WebP、非 WebP、超限和合法 WebP 的 Workers 测试。
   - 确认本地 `workerd` 与 Workers Vitest 实际加载 WASM；Cloudflare 远程部署验证暂不作为验收结论。
   - 对真实二维码样本执行扫码验收，不能只断言格式或解码成功。

3. **公开投稿 multipart 与聚合写入**
   - 扩展共享投稿输入和前端 API 客户端，发送 `payload JSON + 单张 logo WebP + Turnstile token`。
   - 更新 submission route/service 解析 multipart、验证 Turnstile、调用 decoder、写 R2、D1 batch 写入 ready asset 与 pending group。
   - 实现 D1 失败后的 R2 补偿删除；补偿删除失败记录 request ID/R2 key 并进入可重试清理状态；无文件的既有纯文本投稿保持兼容。
   - 让 repository 只接受内部可信 asset 记录，不接受客户端 asset ID/URL/尺寸/字节数。

4. **管理端与公开表单接线**
   - `AdminEditForm` 统一接入压缩器：管理模式上传压缩 WebP，公开模式保留单张 Blob/预览直到提交。
   - 管理头像、管理二维码继续写入现有资源接口；公开投稿隐藏/阻止第二张图片输入，避免 multipart 语义和范围膨胀。
   - 清理旧 FileReader/base64 预览与 Blob URL，确保移除、替换、取消和卸载不泄漏资源。

5. **跨层回归与质量门禁**
   - 补充 API、D1/R2、公开投稿、管理创建/更新/替换/移除和错误补偿测试。
   - 运行 `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm test:e2e`、`pnpm build`。
   - 对并行工作区脏文件逐一核对归属；只暂存本任务明确文件，不提交其他代理改动。

## 主要验证矩阵

| 场景 | 必须证明 |
|---|---|
| 透明 PNG Logo | 本地预览和最终 WebP 保留 alpha；后端解码通过；R2 content type 正确 |
| JPG Logo | 本地转换为 WebP；80 KB/128px 策略生效；管理/投稿保存后可读 |
| 二维码 | 管理端转换为白底不透明 WebP；400 KB/1024px 策略和既有 QR asset 生命周期不变 |
| 5 MB 边界 | 原图恰好允许，超过即在浏览器拒绝；后端仍按最终文件独立校验 |
| 非法 WebP | 签名正确但解码失败、截断文件、伪造宽高均被拒绝 |
| 投稿失败 | Turnstile/D1/R2 任一失败不返回成功；D1 失败触发 R2 补偿 |
| 管理替换/移除 | 新旧 Logo/QR 引用计数、delete_pending 和 R2 清理保持一致 |
| 无图片投稿 | 现有纯文本成功路径不回归 |

## 回滚点

- 浏览器工具可单独回退，但不能恢复原图直传；若工具不支持则必须明确阻止上传。
- Worker decoder adapter 与业务校验隔离；WASM 运行时验证失败时停止在该步骤，不进入公开发布。
- 公开 multipart 兼容无文件 JSON 语义，但路由统一按安全 parser 处理，不保留第二套不校验的文件路径。
