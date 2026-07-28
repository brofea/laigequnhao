# admin-moderation PRD

## 目标

实现管理员认证与群聊审核管理功能：安全 Cookie 登录、审核/状态调整/编辑、软删除/恢复/永久删除。管理员可管理全部群聊生命周期。

## 范围

### 1. 管理员认证

- `POST /api/v1/admin/session`：校验密码、签发签名 Cookie、返回 CSRF token
- `GET /api/v1/admin/session`：返回会话状态（authenticated + csrfToken + expiresAt）
- `DELETE /api/v1/admin/session`：清除 Cookie，失效会话
- 认证中间件：验证签名 + 过期 + `Origin` + `X-CSRF-Token`
- 登录失败限流（15 分钟 5 次）、会话 8 小时过期、`HttpOnly/Secure/SameSite=Lax` Cookie

### 2. 管理员群聊管理

- `GET /api/v1/admin/groups`：分页列表，支持 status/deleted 筛选，返回 `AdminGroupDto`（含私有字段）
- `POST /api/v1/admin/groups`：新建群聊，直接写入指定状态
- `PATCH /api/v1/admin/groups/:id`：编辑内容 + 状态调整 + 版本检查（VERSION_CONFLICT）
- 管理员可在四种状态（pending/published/rejected/delisted）间任意调整

### 3. 删除与恢复

- `DELETE /api/v1/admin/groups/:id`：软删除（设置 deleted_at，保留原 status）
- `POST /api/v1/admin/groups/:id/restore`：恢复（清除 deleted_at，恢复原 status）
- `DELETE /api/v1/admin/trash/groups/:id`：永久删除（二次确认，清理 D1 关联数据）
- 回收站列表：`GET /api/v1/admin/groups?deleted=true`

### 4. 管理前端

- `LoginView.vue`：密码输入 → 登录 → 错误提示 → 限流反馈
- `AdminView.vue`：认证守卫 → 群聊列表（状态筛选 + 删除标记筛选）→ 新建/编辑表单 → 软删除/恢复按钮 → 回收站 + 永久删除确认

## 不在范围

- 图片上传/管理（下一步）
- 仪表盘/运行指标（下一步）
- 多管理员/角色/找回密码
- R2 图片关联删除（仅 D1 清理）

## 验收标准

- `AC-01`：未认证用户不能访问任何 `/admin/*` 路由
- `AC-02`：正确密码签发 Cookie，返回 CSRF token
- `AC-03`：错误密码返回通用错误，连续 5 次后限流
- `AC-04`：篡改/过期 Cookie 返回 401
- `AC-05`：缺少 `X-CSRF-Token` 的不安全请求返回 403
- `AC-06`：管理员可查看全部状态群聊（含 pending/rejected）
- `AC-07`：管理员可编辑群聊内容和状态
- `AC-08`：版本冲突返回 VERSION_CONFLICT
- `AC-09`：软删除后公开 API 不返回该记录
- `AC-10`：恢复后回到原业务状态
- `AC-11`：永久删除清理关联标签/加群方式/提交详情/点赞
- `AC-12`：`pnpm lint`、`pnpm typecheck`、`pnpm test` 通过
