# assets-and-operations 技术设计

## 浏览器端 WebP 转换流程

```
用户选择文件 (JPG/PNG/WebP)
  → FileReader → HTMLImageElement
  → Canvas drawImage(原始尺寸)
  → canvas.toBlob("image/webp", quality)
  → 显示预览 (Blob URL)
  → 显示尺寸 (w×h) + 体积 (KB)
  → 体积检查 (≤100KB logo / ≤300KB qr_code)
  → 通过 → POST /api/v1/admin/assets (FormData)
  → 服务端验证 → R2.put → D1 INSERT → 返回 AssetInfo
```

## API 设计

### `POST /api/v1/admin/assets`

```
Content-Type: multipart/form-data
Fields:
  - file: Blob (image/webp)
  - purpose: "logo" | "qr_code"
  - width: number
  - height: number
  - byteLength: number
  - groupId: string (可选，关联群聊)

服务端:
  1. 认证 + CSRF
  2. 提取 file bytes
  3. 验证 RIFF/WEBP 签名 (bytes[0-3] === 0x52,0x49,0x46,0x46 + bytes[8-11] === 0x57,0x45,0x42,0x50)
  4. 验证体积限制 (logo ≤100KB / qr_code ≤300KB)
  5. 验证 contentType === "image/webp"
  6. 生成 key = `${purpose}/${crypto.randomUUID()}.webp`
  7. R2.put(key, bytes)
  8. D1 INSERT INTO assets
  9. 如果 groupId → UPDATE groups SET logo_r2_key = key, logo_url = publicUrl
  10. 返回 AssetInfo
```

### `DELETE /api/v1/admin/assets/:id`

```
服务端:
  1. 认证 + CSRF
  2. SELECT r2_key FROM assets WHERE id = ?
  3. R2.delete(r2_key)
  4. D1 DELETE FROM assets WHERE id = ?
  5. 返回 { ok: true }
```

### `GET /api/v1/admin/health`

```json
{
  "ok": true,
  "data": {
    "api": "ok",
    "d1": "ok",
    "r2": "ok",
    "version": "0.1.0",
    "deployedAt": "2026-01-01T00:00:00Z"
  }
}
```

每个子检查独立 try/catch，失败返回 `"unavailable"`。

### `GET /api/v1/admin/dashboard`

```json
{
  "ok": true,
  "data": {
    "statusCounts": { "pending": 3, "published": 42, "rejected": 1, "delisted": 2 },
    "pendingCount": 3,
    "totalLikes": 1280,
    "recentSubmissions": 7,
    "topLiked": [{ "id": "...", "title": "...", "likeCount": 99 }]
  }
}
```

纯 D1 查询，不依赖外部服务。

### `GET /api/v1/admin/analytics?range=7d`

使用 Cloudflare GraphQL Analytics API，通过只读 token 代理查询。Token 在服务端 Secrets 中。

## 文件清单

```
src/
├── features/admin/
│   ├── composables/
│   │   ├── useImageProcessor.ts       (新增: Canvas WebP 转换)
│   │   └── useDashboard.ts            (新增: health/dashboard/analytics)
│   └── components/
│       ├── ImageUploader.vue          (新增: 拖拽上传 + 预览)
│       ├── AdminDashboard.vue         (新增: 仪表盘总布局)
│       ├── HealthPanel.vue            (新增: 健康状态)
│       ├── BusinessPanel.vue          (新增: 业务指标)
│       └── AnalyticsPanel.vue         (新增: 流量分析)
│   └── AdminGroupForm.vue             (更新: 集成 ImageUploader)

functions/_lib/
├── routes/
│   ├── admin-assets.ts               (新增: POST/DELETE)
│   ├── admin-health.ts               (新增: GET health)
│   ├── admin-dashboard.ts            (新增: GET dashboard)
│   └── admin-analytics.ts            (新增: GET analytics)
├── services/
│   └── asset-service.ts              (新增: 上传/验证/清理)
└── adapters/
    ├── r2-adapter.ts                 (已有, 可能需要更新)
    └── analytics-adapter.ts          (新增: CF Analytics 代理)
```

## 前端数据流

```
AdminView
  ├─ [Tab: 群聊管理] 现有功能
  │   └─ AdminGroupForm → ImageUploader → useImageProcessor → API
  └─ [Tab: 运行数据]
      └─ AdminDashboard
          ├─ HealthPanel → useDashboard.fetchHealth()
          ├─ BusinessPanel → useDashboard.fetchDashboard()
          └─ AnalyticsPanel → useDashboard.fetchAnalytics(range)
```
