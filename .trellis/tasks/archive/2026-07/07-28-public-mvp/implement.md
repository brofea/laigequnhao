# public-mvp 实施计划

## 执行顺序（依赖驱动）

### Step 1: D1 Migration + Env 类型

- [ ] `migrations/0001_initial.sql`：6 张表 + 索引 + 外键
- [ ] `functions/_lib/env.ts`：`Env` 接口（DB、R2、SECRETS、SKIP_TURNSTILE 等）
- [ ] `wrangler.jsonc`：添加 D1 binding 和 secrets 占位

### Step 2: Repository 层

- [ ] `functions/_lib/repositories/group-repository.ts`：`listPublished`、`getById`、`create`、行映射到 `AdminGroupDto`
- [ ] `functions/_lib/repositories/like-repository.ts`：`toggleLike`（batch INSERT/DELETE + 更新 like_count）
- [ ] `functions/_lib/repositories/rate-limit-repository.ts`：滑动窗口计数器

### Step 3: Service + Adapter 层

- [ ] `functions/_lib/services/rotation-service.ts`：`computeRotation()` 纯函数 + 单元测试
- [ ] `functions/_lib/services/submission-service.ts`：校验 + Turnstile + 写入 D1 batch
- [ ] `functions/_lib/adapters/hash-adapter.ts`：`sha256(deviceId + pepper)`
- [ ] `functions/_lib/adapters/turnstile-adapter.ts`：`verify(token)` — 本地可跳过
- [ ] `functions/_lib/middleware/rate-limit.ts`：通用滑动窗口中间件

### Step 4: API Routes

- [ ] `functions/_lib/routes/groups.ts`：`GET /api/v1/groups`
- [ ] `functions/_lib/routes/submissions.ts`：`POST /api/v1/submissions`
- [ ] `functions/_lib/routes/likes.ts`：`PUT/DELETE /api/v1/groups/:id/like`
- [ ] 更新 `functions/_lib/app.ts`：注册路由

### Step 5: Workers Vitest 集成测试

- [ ] `tests/workers/groups.spec.ts`：列表/搜索/游标/轮换/私有字段不泄露
- [ ] `tests/workers/submissions.spec.ts`：有效提交/校验拒绝/限流
- [ ] `tests/workers/likes.spec.ts`：幂等/取消/count 一致性

### Step 6: 前端基础设施

- [ ] `src/shared/api/client.ts`：fetch 封装 + Zod 解析 + `X-Device-Id` header
- [ ] `src/shared/browser/storage.ts`：localStorage get/set/remove + JSON parse `unknown` → Zod
- [ ] `src/shared/components/ErrorBanner.vue`：通用错误横幅
- [ ] `src/shared/components/LoadingSkeleton.vue`：卡片骨架屏
- [ ] `src/shared/components/Toast.vue`：复制反馈 toast

### Step 7: 前端功能 Composable

- [ ] `src/features/groups/composables/useGroupDirectory.ts`：游标分页 + URL search + abort
- [ ] `src/features/groups/composables/useLikedGroups.ts`：deviceId + 乐观更新 + 回滚
- [ ] `src/features/groups/composables/useClipboard.ts`：copy + 成功/失败反馈
- [ ] `src/features/groups/api.ts`：`fetchGroups`、`toggleLike`、`submitGroup`

### Step 8: 前端组件

- [ ] `src/features/groups/components/GroupCard.vue`：完整卡片 + 加群按钮 + 点赞
- [ ] `src/features/groups/components/GroupList.vue`：网格 + IntersectionObserver + 空/加载/错误
- [ ] `src/features/groups/components/SubmissionDialog.vue`：表单 + 客户端校验 + 提交

### Step 9: 首页整合

- [ ] `src/views/HomeView.vue`：搜索框 + GroupList + 提交入口 + composable 连接
- [ ] 更新 `src/app/router.ts`（无需改动，路由已有）

### Step 10: Vue 组件测试

- [ ] `GroupCard.spec.ts`：渲染/平台徽章/性质/状态/加群按钮/点赞
- [ ] `SubmissionDialog.spec.ts`：必填校验/标签限制/不安全 URL 拒绝/提交成功
- [ ] `useClipboard.spec.ts`：复制成功/失败反馈

### Step 11: 质量门禁

- [ ] `pnpm lint` 通过
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（Vitest 单元 + Vue 组件）
- [ ] `pnpm test:workers` 通过（Workers Vitest 集成）
- [ ] `pnpm build` 通过

## 验证命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
```
