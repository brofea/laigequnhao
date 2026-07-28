# assets-and-operations PRD

## 目标

实现管理员图片上传（浏览器端 WebP 转换 + R2 存储）、健康状态检查、业务指标面板、Cloudflare Web Analytics 集成。仅管理员可访问。

## 范围

### 1. 浏览器端 WebP 转换

- `src/shared/composables/useImageProcessor.ts`：Canvas API 图片转换
- 接受 WebP、PNG、JPG/JPEG 输入
- JPG → 有损 WebP；PNG → 保留透明通道的有损 WebP；WebP → 可直接使用或重新压缩
- 展示预览、尺寸（宽/高）、体积（KB）
- 前端阻止超限（Logo ≤100KB、二维码 ≤300KB），禁用上传按钮
- 透明背景不被强制填充
- 原始文件不离开浏览器

### 2. 管理员图片上传 API

- `POST /api/v1/admin/assets`：接收最终 WebP + 元数据
- 服务端二次验证 WebP 签名（RIFF）、尺寸、体积
- 生成系统 R2 key，写入 R2
- 写入 D1 `assets` 表
- 关联更新 `groups` 的 logo_r2_key / logo_url
- `DELETE /api/v1/admin/assets/:id`：删除资源

### 3. 管理员图片上传 UI

- `src/features/admin/components/ImageUploader.vue`：拖拽/选择文件 → 预览 → 确认上传
- 集成到 `AdminGroupForm.vue`：群聊编辑时可上传 Logo
- 实时显示压缩后预览、尺寸、体积

### 4. 健康检查 + 指标面板

- `GET /api/v1/admin/health`：API 连通、D1 查询（SELECT 1）、R2 检查（head）、版本号、部署时间
- `GET /api/v1/admin/dashboard`：D1 业务指标
  - 四种状态数量（pending/published/rejected/delisted）
  - 待审核数、总点赞数、新增提交趋势（近 7 天）
  - 各群聊点赞排名 Top 10
- `GET /api/v1/admin/analytics`：Cloudflare Web Analytics 代理
  - 读取只读 Analytics Token
  - 查询 24h/7d/30d 浏览量、独立访客、趋势
  - 可用 Core Web Vitals（LCP/FID/CLS）
- 仪表盘组件：`AdminDashboard.vue` + `HealthPanel.vue` + `BusinessPanel.vue` + `AnalyticsPanel.vue`
- 各面板独立失败，不隐藏其他有效数据

## 不在范围

- 公开端二维码展示（后续阶段）
- 图片 CDN 配置
- 站点配置在线修改

## 验收标准

- `AC-01`：浏览器端 JPG→WebP、PNG→WebP 转换预览正确
- `AC-02`：透明 PNG 转 WebP 后保留透明通道
- `AC-03`：超限（>100KB Logo / >300KB QR）前端禁用上传
- `AC-04`：服务端二次验证 WebP 签名 + 体积
- `AC-05`：上传后 D1 保存 key/尺寸/体积，R2 存储 WebP
- `AC-06`：健康检查返回 API/D1/R2 状态 + 版本号
- `AC-07`：仪表盘展示四种状态计数和趋势
- `AC-08`：Analytics 面板展示 24h/7d/30d 数据，Token 不泄露
- `AC-09`：单个面板失败不影响其他面板
- `AC-10`：`pnpm lint`、`pnpm typecheck`、`pnpm test` 通过
