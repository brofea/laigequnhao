# admin-moderation 技术设计

## 认证流程

```
POST /admin/session { password }
  → 常量时间比较 ADMIN_PASSWORD
  → 限流检查 (login key, 15min/5次)
  → 生成 sessionId = crypto.randomUUID()
  → 签名 = HMAC-SHA256(sessionId, SESSION_SECRET)
  → Cookie: session=<sessionId>.<签名>; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=28800
  → 从 session nonce 派生 CSRF token = HMAC-SHA256(sessionId, SESSION_SECRET + "csrf")
  → 返回 { csrfToken, expiresAt }
```

## 认证中间件

```ts
authMiddleware:
  1. 解析 Cookie 中的 session=<id>.<sig>
  2. 验证签名 = HMAC-SHA256(id, SESSION_SECRET)
  3. 签名不匹配 → 401 AUTH_REQUIRED
  4. Cookie 过期 → 401 AUTH_REQUIRED
  5. 不安全方法 (POST/PATCH/PUT/DELETE):
     a. 验证 Origin === 当前域名
     b. 验证 X-CSRF-Token === HMAC-SHA256(sessionId, SESSION_SECRET + "csrf")
     c. 不匹配 → 403 FORBIDDEN
  6. 通过 → next()
```

## API 路由设计

| 方法 | 路径 | 认证 | CSRF | 说明 |
|---|---|---|---|---|
| POST | /admin/session | 否 | 否 | 登录 |
| GET | /admin/session | 是 | 否 | 会话状态 |
| DELETE | /admin/session | 是 | 是 | 退出 |
| GET | /admin/groups | 是 | 否 | 列表（含私有) |
| POST | /admin/groups | 是 | 是 | 新建 |
| PATCH | /admin/groups/:id | 是 | 是 | 编辑+状态 |
| DELETE | /admin/groups/:id | 是 | 是 | 软删除 |
| POST | /admin/groups/:id/restore | 是 | 是 | 恢复 |
| DELETE | /admin/trash/groups/:id | 是 | 是 | 永久删除 |

## Repository 扩展

在现有 `group-repository.ts` 基础上新增方法：

- `listAll({ status?, deleted?, cursor?, limit })` — 管理员全量列表
- `update(id, fields, version)` — 乐观锁更新，返回新 version
- `softDelete(id)` — 设置 deleted_at
- `restore(id)` — 清除 deleted_at
- `permanentDelete(id)` — D1 batch 删除 groups + group_tags + join_methods + submission_details + likes

## 文件清单

```
functions/_lib/
├── app.ts                                  (更新：注册 admin routes)
├── middleware/
│   └── auth.ts                             (新增：认证+CSRF 中间件)
├── routes/
│   ├── admin-session.ts                    (新增：登录/状态/退出)
│   └── admin-groups.ts                     (新增：管理员群聊 CRUD)
├── services/
│   └── auth-service.ts                     (新增：密码校验/session管理)
└── repositories/
    └── group-repository.ts                 (更新：新增管理员方法)

src/
├── features/admin/
│   ├── api.ts                              (管理员 API 调用)
│   ├── composables/
│   │   ├── useAdminAuth.ts                 (登录状态/CSRF/handle)
│   │   └── useAdminGroups.ts               (列表/编辑/删除)
│   └── components/
│       ├── AdminGroupTable.vue             (群聊列表表格)
│       ├── AdminGroupForm.vue              (新建/编辑表单)
│       └── TrashConfirmDialog.vue          (永久删除确认)
├── views/admin/
│   ├── LoginView.vue                       (更新：完整登录页)
│   └── AdminView.vue                       (更新：管理主页)
└── app/
    └── router.ts                           (更新：添加 admin 路由守卫)
```

## 前端数据流

```
LoginView → useAdminAuth.login(password) → API → Cookie set
  → router.push /admin

AdminView (auth guard: useAdminAuth.isAuthenticated)
  ├─ 状态筛选 (pending/published/rejected/delisted/all)
  ├─ 删除筛选 (active/trash)
  ├─ AdminGroupTable
  │   ├─ 编辑 → AdminGroupForm (modal)
  │   ├─ 软删除 → useAdminGroups.softDelete(id)
  │   ├─ 恢复 → useAdminGroups.restore(id)
  │   └─ 永久删除 → TrashConfirmDialog → useAdminGroups.permanentDelete(id)
  └─ 新建 → AdminGroupForm (modal, create mode)
```

## 安全约束

- Cookie 中不存密码、secret 或 CSRF token 原文
- CSRF token 通过响应 data 返回，前端存内存变量，不存 localStorage
- 错误响应不泄露密码是否正确（统一 AUTH_FAILED）
- 所有管理员路由使用 `Cache-Control: no-store`
