# contracts-and-config PRD

## 目标

建立完整的类型安全契约层：领域类型与 Zod schema、API 请求/响应 schema、公开与管理 DTO 严格隔离、站点配置 Zod 校验。前端和 Functions 共享同一套契约。

## 范围

### 领域类型（`shared/domain/`）

- `group.ts`：`GroupKind`（`official` | `interest`）、`GroupStatus`（`pending` | `published` | `rejected` | `delisted`）、`JoinMethod`（`group_number` | `url` | `qr_code`）
- `platform.ts`：`PlatformConfig`（id、name、allowedJoinMethods）
- `config.ts`：`SiteConfig`、`RotationConfig`、`ThemeConfig`、`FeaturesConfig`

每个类型同时导出 TypeScript 类型（`z.infer<typeof schema>`）和 Zod schema。

### Zod API 契约（`shared/contracts/`）

**公开 DTO**（`group.ts`）：
- `PublicGroupDto`：id、title、description、kind、platform、tags、status、logoUrl/logoMeta、joinMethods、likeCount、createdAt/updatedAt
- 禁止：联系方式、审核备注、软删除字段、R2 key、voter hash、内部 version

**管理员 DTO**（`group.ts`）：
- `AdminGroupDto`：公开字段超集 + submissionContact、auditNotes、deletedAt、version 等

**访客提交**（`submission.ts`）：
- `SubmissionRequest`：title、kind、platform、groupNumber?、url?、tags（1–5）、description?、notes?、contact?、turnstileToken
- 校验：必填字段、URL 协议（仅 https）、标签数量、文本控制字符

**点赞**（`like.ts`）：
- `LikeToggleResponse`：liked、likeCount

**认证**（`auth.ts`）：
- `LoginRequest`：password
- `SessionResponse`：csrfToken、expiresAt

**分页**（`pagination.ts`）：
- `CursorPage<T>`：items、nextCursor?、rotationWindow
- `ListQuery`：q?、cursor?、limit（默认 24，最大 60）

**健康检查**（`health.ts`）：
- `HealthResponse`：status、version、timestamp

**资产**（`asset.ts`）：
- `AssetUploadMeta`：purpose（`logo` | `qr_code`）、contentType、byteLength、width、height

### 响应信封 Zod schema（`shared/contracts/api.ts`）

- `ApiSuccessSchema<T>`：`{ ok: z.literal(true), data: T, meta?, requestId }`
- `ApiErrorSchema`：`{ ok: z.literal(false), error: { code, message, fieldErrors? }, requestId }`
- `ApiResponseSchema<T>`：`z.discriminatedUnion("ok", [...])`
- 错误码常量：`VALIDATION_FAILED`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`VERSION_CONFLICT`、`RATE_LIMITED`、`TURNSTILE_FAILED`、`DEPENDENCY_FAILED`、`INTERNAL_ERROR`

### 站点配置校验

- Zod schema 校验 `siteConfig`：平台 ID 唯一、轮换时间 `HH:mm` 升序不重复、IANA 时区合法性

### 目录结构

```
shared/
├── domain/
│   ├── group.ts
│   ├── platform.ts
│   └── config.ts
├── contracts/
│   ├── api.ts
│   ├── group.ts
│   ├── submission.ts
│   ├── like.ts
│   ├── auth.ts
│   ├── pagination.ts
│   ├── health.ts
│   └── asset.ts
```

## 不在范围内

- D1 schema / migration
- 运行时 API 实现
- 前端组件

## 验收标准

- `AC-01`：`pnpm typecheck` 通过
- `AC-02`：`siteConfigSchema` 拒绝无效配置（重复平台 ID、非法时间格式等）
- `AC-03`：`PublicGroupDto` 不含 contacts、auditNotes、deletedAt、r2Key、voterHash、version
- `AC-04`：`AdminGroupDto` 包含公开字段超集 + 管理私有字段
- `AC-05`：所有错误码有对应 Zod schema 和常量
- `AC-06`：`CursorPage` 泛型支持任意 DTO
- `AC-07`：`ApiResponseSchema` 通过 discriminatedUnion 区分成功/失败
- `AC-08`：`pnpm lint` 通过
- `AC-09`：Vitest 测试覆盖 schema 校验和 DTO 隔离
