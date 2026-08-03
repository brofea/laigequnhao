# Cloudflare Worker 目录结构

## 目标结构

```text
worker/
└── index.ts
functions/
└── _lib/
    ├── app.ts
    ├── env.ts
    ├── middleware/
    ├── routes/
    ├── services/
    ├── repositories/
    ├── adapters/
    └── observability/
shared/
├── contracts/
├── domain/
└── config/
migrations/
tests/
└── workers/
```

`worker/index.ts` 是把 Worker `fetch` 请求传给 Hono 应用的轻量生产适配器，不包含业务逻辑；`functions/_lib/` 保留路由、service、repository 和 adapter 边界。

## 职责归属

- `routes/`：HTTP 解析、schema 选择、状态码
- `middleware/`：请求 ID、认证、CSRF/Origin、限流、日志和错误映射
- `services/`：领域流程和多资源操作状态
- `repositories/`：参数化 D1 查询和显式行映射
- `adapters/`：R2、Turnstile、Cloudflare Analytics、时钟和 hash
- `observability/`：结构化日志 helper 和脱敏
- 根目录 `shared/`：客户端和服务端均可导入、与运行时无关的契约

路由可以调用 service；service 可以调用 repository 和 adapter。Repository 不得调用路由或其他 repository。Cloudflare binding 通过有类型约束的 `Env` 传入；禁止导入隐藏的全局环境状态。

## 命名

- TypeScript 文件：`kebab-case.ts`
- 路由模块：复数资源名，例如 `groups.ts`
- Repository：`<resource>-repository.ts`
- Service：`<workflow>-service.ts`
- SQL 表名/列名：`snake_case`
- 测试与负责模块对应，并使用 `*.spec.ts`

## 首批参考路径

- `functions/_lib/app.ts`
- `functions/_lib/routes/groups.ts`
- `functions/_lib/services/moderate-group-service.ts`
- `functions/_lib/repositories/group-repository.ts`
- `functions/_lib/middleware/error-handler.ts`
- `shared/contracts/api.ts`

如果获批设计在实现后形成了更合适的具体边界，请更新这些引用。
