# PRD: 修复群组头像上传 — 新建/编辑群组时头像不显示

## Goal

修复管理端新建群组或编辑已有群组时，上传头像后头像不显示的问题。同时统一种子脚本和管理端上传的压缩流程。

## Background

### 问题 1（主要）：R2 存储与 Serve 路径不匹配 ✅ 已修复

Miniflare 本地开发中，`wrangler r2 object put --local`（种子脚本）和 `c.env.R2.put()`（Pages Functions）写入不同的持久化目录，Vite 中间件只读其中一套。

**修复**：
- `functions/_lib/app.ts`：添加 `GET /api/v1/assets/:key{.+}` 路由，通过 `c.env.R2.get()` 统一 serve
- `.dev.vars`：`R2_PUBLIC_BASE_URL` → `http://localhost:5173/api/v1/assets`
- 种子脚本改为通过 API 上传（兼容本地 + 远程）

### 问题 2：压缩规格不统一 — 当前待修复

种子脚本（sharp）和浏览器上传（Canvas）使用不同的压缩参数和算法，且服务端限制与客户端不一致。需统一为：
- 共用同一套压缩参数
- 种子脚本和管理端上传使用相同的质量递减策略

## Requirements

### 压缩规格（种子脚本 + 管理端上传共用）

| 参数 | 群头像 (logo) | 二维码 (qr_code) |
|------|-------------|-----------------|
| 长边最大 | 128px | 512px |
| 格式 | WebP（保留透明度） | WebP（不透明） |
| 大小上限 | 80KB | 400KB |
| 起始质量 | 85 | 95 |
| 质量递减 | 每次 -20 | 每次 -20 |
| 最低质量 | 5 | 15 |
| 质量序列 | 85→65→45→25→5 | 95→75→55→35→15 |

压缩算法：从起始质量开始尝试，若输出 > 大小上限则递减质量重试。若最低质量仍超过上限 → 返回压缩失败。

### 约束常量（`shared/contracts/asset.ts`）

```
LOGO_MAX_BYTES = 80 * 1024
LOGO_MAX_DIMENSION = 128
LOGO_START_QUALITY = 85
LOGO_MIN_QUALITY = 5
LOGO_QUALITY_STEP = 20

QR_CODE_MAX_BYTES = 5 * 1024 * 1024  （原始文件上传上限，不变）
QR_CODE_TARGET_BYTES = 400 * 1024
QR_CODE_MAX_DIMENSION = 512
QR_START_QUALITY = 95
QR_MIN_QUALITY = 15
QR_QUALITY_STEP = 20
```

### 种子脚本

- 100 个群
- 20 个必须有头像 + 二维码（各 20 张图片）
- 下载自 loliapi.com（动漫图当作二维码占位图）
- 通过 API 上传（与 admin UI 同路径）

## Acceptance Criteria

1. **AC1**: 浏览器上传 logo（>80KB 原始图），被压缩至 128px/≤80KB 带透明度 WebP，群组创建后头像正常显示。
2. **AC2**: 浏览器上传 QR 码图，被压缩至 512px/≤400KB 不透明 WebP，正常显示。
3. **AC3**: 种子脚本生成 100 群，20 个头像+二维码群正常显示。
4. **AC4**: 种子脚本和浏览器上传使用相同的压缩参数和算法。

## Files to Change

| File | Change |
|------|--------|
| `shared/contracts/asset.ts` | 更新所有常量：LOGO → 128px/80KB，QR → 512px/400KB，添加质量参数 |
| `src/features/admin/composables/useImageProcessor.ts` | 重写 `process()` 为参数化的质量递减压缩 |
| `src/features/admin/components/AdminGroupDrawer.vue` | 更新 processLogo 调用参数 |
| `scripts/seed-local.mjs` | 重写：新压缩参数、100 群、API 上传、Cookie 保持 |
| `functions/_lib/app.ts` | 已有 `GET /api/v1/assets/:key` 路由 ✅ |
| `.dev.vars` | 已有 `R2_PUBLIC_BASE_URL` ✅ |
