# assets-and-operations 实施计划

## Step 1: Browser WebP Processor

- [ ] `src/features/admin/composables/useImageProcessor.ts`: Canvas API 转换 + 元数据提取
- [ ] 支持 JPG→WebP、PNG→WebP、WebP→WebP 三条路径
- [ ] 透明 PNG 保留 alpha
- [ ] 返回 `{ blob, width, height, byteLength, previewUrl }`

## Step 2: Image Uploader Component

- [ ] `src/features/admin/components/ImageUploader.vue`: 拖拽/选择 + 预览 + 体积/尺寸显示
- [ ] 超限禁用上传 + 错误提示
- [ ] Props: `purpose: "logo" | "qr_code"`, `groupId?: string`

## Step 3: Asset API Routes + Service

- [ ] `functions/_lib/routes/admin-assets.ts`: POST/DELETE
- [ ] `functions/_lib/services/asset-service.ts`: upload/validate/cleanup
- [ ] 更新 `functions/_lib/adapters/r2-adapter.ts` 添加 `validateWebpSignature`
- [ ] 注册到 `app.ts`

## Step 4: Health + Dashboard + Analytics Routes

- [ ] `functions/_lib/routes/admin-health.ts`: GET
- [ ] `functions/_lib/routes/admin-dashboard.ts`: GET (D1 聚合查询)
- [ ] `functions/_lib/routes/admin-analytics.ts`: GET (CF Analytics 代理)
- [ ] `functions/_lib/adapters/analytics-adapter.ts`: GraphQL query builder
- [ ] 更新 `functions/_lib/env.ts` 添加 `ANALYTICS_TOKEN`
- [ ] 注册到 `app.ts`

## Step 5: Admin Dashboard UI

- [ ] `src/features/admin/composables/useDashboard.ts`: fetch health/dashboard/analytics
- [ ] `src/features/admin/components/AdminDashboard.vue`: Tab 布局
- [ ] `src/features/admin/components/HealthPanel.vue`: 三状态卡片
- [ ] `src/features/admin/components/BusinessPanel.vue`: 计数 + 图表
- [ ] `src/features/admin/components/AnalyticsPanel.vue`: 时间范围选择 + 数据展示
- [ ] 更新 `AdminView.vue`：添加 Tab 切换

## Step 6: 集成 ImageUploader 到 AdminGroupForm

- [ ] `AdminGroupForm.vue` 添加 Logo 上传 slot
- [ ] 编辑模式下显示已上传 Logo 预览 + 替换/删除

## Step 7: 测试

- [ ] `useImageProcessor.spec.ts`: Canvas 转换 + 透明 + 体积限制
- [ ] `tests/workers/admin-assets.spec.ts`: 上传/验证/删除

## Step 8: 质量门禁

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
