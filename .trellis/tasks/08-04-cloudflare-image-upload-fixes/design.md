# Cloudflare 图片上传与展示修复技术设计

## 1. 设计结论

本任务继续使用现有单一 Worker、D1、R2 和共享 Zod 契约，不新增数据库表或替代安全服务。修复分为四条互相衔接的链路：

1. 将同源 R2 资源路径视为合法的公开资源 URL，修复生产上传响应在 R2 写入后因 schema 解析失败而返回 500 的问题。
2. 增强浏览器图片适配器的 WebKit 能力探测和编码回退，明确拒绝 HEIC，保证 PNG/JPEG/WebP 在 iOS Chrome/Safari 上有可见成功或失败状态。
3. 把管理员和公开投稿的图片写入都延迟到保存/提交动作；选择图片只生成本地预览，不提前写 R2。
4. 从前端、共享契约、Worker 路由、运行时配置、Wrangler 配置、文档和测试中删除 Turnstile。

不改变最终 WebP 校验、D1/R2 资源生命周期、管理员会话/CSRF、投稿限流和失败补偿语义。

## 2. 生产 URL 与 R2 读取边界

### 2.1 资源 URL 契约

`R2_PUBLIC_BASE_URL` 继续作为可选自定义资源域名覆盖；未配置时由 `createR2Adapter` 生成同源 `/api/v1/assets/<encoded-key>`。

共享资源契约新增单一 `assetPublicUrlSchema`（命名以实现时现有代码风格为准），允许两种形式：

- 绝对 HTTP(S) URL：用于自定义 R2 域名和现有测试环境；
- 以 `/api/v1/assets/` 开头的同源路径：用于生产默认配置。

`assetInfoSchema.publicUrl`、管理员资源 DTO 和公开资源元数据统一复用该 schema，避免一处允许相对路径、另一处又拒绝相对路径。任意其他路径、空字符串或不安全协议继续拒绝。

这样生产流程变为：

```text
R2.put(key)
  → getPublicUrl(key) = /api/v1/assets/<key>
  → assetInfoSchema 通过
  → 返回 201
```

不把 Worker 当前域名硬编码进配置，也不要求部署脚本事先知道域名。

### 2.2 公开读取路由

保留 `functions/_lib/app.ts` 的 `/api/v1/assets/:key{.+}` 路由，并补齐生产等价测试：

- 先向测试 R2 写入最小合法 WebP；
- 请求 `/api/v1/assets/<key>`，读取完整响应体；
- 断言状态码、字节内容、`Content-Type: image/webp`、`Cache-Control` 和 `X-Content-Type-Options`；
- 请求不存在 key，断言 404；
- 测试管理员上传接口在没有 `R2_PUBLIC_BASE_URL` 时返回 201，并且返回的相对 URL 能直接被同一个 Worker 读取。

如果本地 workerd 测试通过但真实 Cloudflare 的同源 GET 仍失败，生产 smoke 必须记录实际状态码和最终 URL，再单独检查 Workers Static Assets 的 `run_worker_first` 路由，而不回退到把 R2 bucket 公开暴露。

## 3. 浏览器图片处理设计

### 3.1 输入边界

`src/shared/browser/image-compression.ts` 继续作为唯一浏览器图片适配器：

```text
File/Blob
  → 文件大小 + MIME/扩展名校验
  → createImageBitmap（可用且可关闭时）
  → HTMLImageElement + object URL 回退
  → Canvas 缩放/白底策略
  → WebP 编码能力探测
  → 质量阶梯
  → Blob URL 预览
```

- PNG/JPEG/WebP 按现有用途策略处理；HEIC 在输入校验阶段明确拒绝，不把 HEIC 送入 Canvas 或后端。
- `createImageBitmap` 成功但返回对象没有可调用 `close` 时，释放函数使用安全 no-op；不能因为清理方法缺失而让已经生成的预览变成失败。
- HTMLImageElement 回退必须在所有分支清理原图 object URL；输出预览 URL 由调用方拥有并负责 revoke。

### 3.2 WebP 编码回退

封装一个单一 `encodeCanvas` 适配器：

1. 首选 `canvas.toBlob("image/webp", quality)`；
2. 回调返回空 Blob、类型不是 `image/webp` 或调用抛错时，尝试 `canvas.toDataURL("image/webp", quality)`；
3. 将 data URL 转回 Blob，并再次检查 MIME/字节有效性；如果浏览器实际只生成 PNG/JPEG，则返回稳定的 `ENCODE_UNSUPPORTED`，不上传伪 WebP；
4. 只把通过 WebP 检查的候选结果交给质量阶梯和目标大小判断。

适配器不引入 HEIC 解码器，也不在前端引入第二套图片库。测试用 mock 明确覆盖 toBlob 成功、空 Blob、错误 MIME、toDataURL 回退和完全不支持。

## 4. 保存/提交时上传设计

### 4.1 草稿状态

表单选择图片后只保存：

- 本地预览 URL；
- 待上传 WebP Blob；
- 图片用途；
- 对应二维码 method ID（如有）。

已存在资源的 `logoR2Key`、`assetId` 在保存前保持原值；本地预览仅覆盖渲染，不把 Blob URL 写入 API payload 或数据库。

新增一个有类型约束的 pending image 输入/输出契约，避免父组件通过隐式字段猜测待上传资源。其核心形状为：

```text
PendingAdminImages {
  logo?: Blob
  qr: Array<{ methodId: string; blob: Blob }>
}
```

具体类型放在前端功能层，不能放进 `shared/contracts`，因为它包含 DOM `Blob`。

### 4.2 管理员保存流程

```text
选择图片
  → 本地压缩/预览（零网络、零 R2）
  → 点击保存
  → 顺序上传 pending logo/QR 到 /admin/assets，获得 staged asset
  → 将新 r2Key/assetId/publicUrl 写入待提交 DTO
  → 创建或更新群组聚合
  → 成功：staged 资源由既有事务 adopt 为 ready
  → 失败：按已返回的 asset ID 调用 purge；purge 失败保留既有可重试清理状态
```

上传协调放在已有管理员功能 API/容器边界，而不是在选择文件的 `change` 事件中调用网络。表单负责草稿与预览，父层负责“上传 staged → 提交聚合 → 失败清理”的事务编排。

要求：

- 保存期间禁用重复提交并显示状态；取消/关闭不触发上传；
- 新建群组或编辑群组都执行同一套 pending 资源协调；
- 版本冲突、校验失败、网络失败均清理本次新建 staged 资源；
- 未替换的旧资源不重复上传；替换/移除仍交给现有 group repository 的 ref_count 和清理状态机处理。

### 4.3 公开投稿流程

```text
选择头像
  → 本地压缩/预览（零网络、零 R2）
  → 点击提交
  → multipart { payload JSON, logo WebP }
  → 后端 WebP 校验
  → R2 写入 + D1 ready asset/group 原子聚合
  → 成功返回投稿回执；失败按现有补偿删除
```

公开投稿继续支持无图 JSON、无图 multipart 和带一张 logo 的 multipart。删除 `turnstileToken` 字段及独立 multipart token 后，不改变表单字段、图片安全校验、投稿限流和回执语义。

## 5. Turnstile 移除范围

### 前端

- 删除 `TurnstileWidget.vue`、`src/shared/turnstile.ts` 及运行时 Sitekey 导出；如文件只剩 Turnstile 配置则删除 `src/config/runtime.ts`，否则保留其他配置并移除相关项。
- `AdminEditForm` 的 `save` 事件删除 token 参数和安全验证区块；公开提交按钮只检查表单和图片是否仍在处理中。
- `VisualShell`、`features/groups/api.ts` 和前端测试移除 token 组装/断言。

### 后端与共享契约

- `submissionRequestSchema` 删除 `turnstileToken`；multipart parser 删除 `turnstileToken` 字段合并和冲突检查。
- 投稿路由删除 Turnstile adapter、配置检查、远程 siteverify 请求及相关依赖不可用响应；保留输入校验、图片验证、限流、R2/D1 和错误映射。
- 删除 `functions/_lib/adapters/turnstile-adapter.ts` 和 Env 中的两个 Turnstile 字段。

### 配置与文档

删除 `VITE_TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`、`SKIP_TURNSTILE` 的示例、Wrangler vars、生产配置生成、worker-dev 配置、README、runbook、测试配置和测试断言。`SUBMISSION_LIMIT_PER_HOUR` 保留。

## 6. 兼容性、迁移与回滚

- 不需要 D1 migration；旧的 `logo_r2_key`、二维码 asset 关联和 R2 对象继续由现有 mapper/生命周期读取。
- 修改共享 URL schema 后，前端可消费相对资源路径，管理员/公开 DTO 语义保持字段名不变。
- 若 WebKit toDataURL 回退仍不支持 WebP，页面显示明确错误并阻止上传；不得退回原图直传或将 PNG 伪装成 WebP。
- 若延迟上传协调失败，优先回退到“选择后本地预览、保存时上传”的完整设计，不回退到选择即上传；清理接口失败由既有 delete_failed 路径承担重试。
- Cloudflare 真实 smoke 需要在本地质量门禁后执行，验证资源 URL、R2 GET、管理员保存和公开投稿，不能仅以本地测试代替。
