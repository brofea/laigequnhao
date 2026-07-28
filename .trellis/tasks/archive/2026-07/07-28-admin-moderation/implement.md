# admin-moderation 实施计划

## Step 1: Auth Service + Middleware

- [ ] `functions/_lib/services/auth-service.ts`：`verifyPassword`、`createSession`、`verifySession`、`deriveCsrfToken`
- [ ] `functions/_lib/middleware/auth.ts`：`authRequired` + `csrfProtection` 中间件
- [ ] Web Crypto API：`HMAC-SHA256`、常量时间比较

## Step 2: Admin Routes — Session

- [ ] `functions/_lib/routes/admin-session.ts`：POST/GET/DELETE
- [ ] 登录限流复用 `rate-limit` 中间件

## Step 3: Repository — Admin Methods

- [ ] `group-repository.ts` 新增：`listAll`、`update`、`softDelete`、`restore`、`permanentDelete`

## Step 4: Admin Routes — Groups

- [ ] `functions/_lib/routes/admin-groups.ts`：GET/POST/PATCH/DELETE + restore + trash
- [ ] 更新 `functions/_lib/app.ts` 注册 `/api/v1/admin/*` 路由

## Step 5: Frontend — Admin Auth

- [ ] `src/features/admin/api.ts`：login/logout/checkSession
- [ ] `src/features/admin/composables/useAdminAuth.ts`：isAuthenticated、csrfToken、login、logout

## Step 6: Frontend — Admin Groups

- [ ] `src/features/admin/composables/useAdminGroups.ts`：list/filter/create/update/delete
- [ ] `src/features/admin/components/AdminGroupTable.vue`：表格 + 状态筛选
- [ ] `src/features/admin/components/AdminGroupForm.vue`：新建/编辑表单（含版本号）
- [ ] `src/features/admin/components/TrashConfirmDialog.vue`：永久删除确认

## Step 7: Frontend — Views

- [ ] `LoginView.vue`：完整登录页 + 错误提示
- [ ] `AdminView.vue`：路由守卫 + 群聊管理主页 + 回收站切换
- [ ] `router.ts`：admin 路由认证守卫

## Step 8: 测试

- [ ] `functions/_lib/services/auth-service.spec.ts`：密码/签名/CSRF 单元测试
- [ ] `tests/workers/admin-session.spec.ts`：登录/退出/限流/过期
- [ ] `tests/workers/admin-groups.spec.ts`：CRUD/状态/版本冲突/软删除/永久删除

## Step 9: 质量门禁

- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm build`
