# Worker 部署与运行时配置规范

## 场景：首次 Workers Builds 部署与功能级配置降级

### 1. Scope / Trigger

- 触发原因：生产目标从 Pages Functions 迁移为独立 Cloudflare Module Worker、Workers Static Assets、D1 和 R2。
- 适用范围：`pnpm build`、`pnpm deploy`、Workers Builds、Worker bindings、D1 migrations、R2 资源和运行时 Secret。
- 目标：基础网站首次可部署，业务功能按真实配置启用；不得让缺少业务 Secret 阻断资源创建、migration 或基础 Worker 发布。

### 2. Signatures

- Build command：`pnpm build`；只生成 Cloudflare Vite Plugin 产物，不访问远程资源，不执行远程 migration。
- Deploy command：`pnpm deploy`；消费构建生成的 Wrangler 配置，检查/创建/复用生产 Worker、D1、R2，执行远程未应用 migrations，再执行 `wrangler deploy`。
- 前端公开配置：当前无投稿验证服务的 Build variable。
- Worker Runtime secrets：`ADMIN_PASSWORD?: string`、`SESSION_SECRET?: string`、`LIKE_PEPPER?: string`。
- Worker Runtime variables：`ENVIRONMENT`、`SECURE_COOKIE`、`SUBMISSION_LIMIT_PER_HOUR`；生产值由生成的 Wrangler 配置提供。

### 3. Contracts

- 默认生产资源名称必须确定且幂等：Worker `laigequnhao`、D1 `laigequnhao-prod`、R2 `laigequnhao-assets-prod`；已有资源复用，权限、账号或资源类型不匹配时失败并说明原因。
- `wrangler.jsonc` 不得用 `secrets.required` 阻断首次部署，也不得写入 Secret 值、账户专属 UUID 或部署者专属账号配置。
- `pnpm deploy` 不得自动 seed、clean、生成无法由部署者保存的生产 Secret，也不得重复执行已由 Build command 完成的构建。
- 缺少管理员/会话配置时，管理员登录和会话不可用；缺少 `LIKE_PEPPER` 时点赞不可用；投稿使用服务端限流和图片校验，不依赖外部验证服务；基础静态网站和不依赖该配置的 API 仍可用。
- 缺少功能 Secret 的 API 响应使用标准信封、`DEPENDENCY_UNAVAILABLE` 和 HTTP 503，并包含不泄露 Secret 的“尚未配置”说明。
- Preview 默认关闭；如启用，必须绑定独立 Preview Worker、D1 和 R2，不得使用生产 D1/R2。
- `pnpm dev` 由 Cloudflare Vite Plugin 提供单进程本地 Worker/HMR；Vite 配置必须提前注入 Vue compiler，避免热更新在插件 `buildStart` 前读取空 compiler。
- `pnpm seed` 只复用用户已经启动的 loopback API：默认使用 `http://localhost:5173/api/v1`，只启动 `pnpm worker:dev` 时通过 `SEED_API_BASE` 指向 `http://127.0.0.1:8788/api/v1`；不得自动启动或停止开发服务。

### 4. Validation & Error Matrix

| 条件 | 结果 |
|---|---|
| Build command 未生成 Vite Plugin Wrangler 配置 | `pnpm deploy` 立即失败，提示先完成远程 Build，不创建资源 |
| 缺少 `ADMIN_PASSWORD` 或 `SESSION_SECRET` | 基础部署继续；管理员相关 API 返回 503 `DEPENDENCY_UNAVAILABLE` |
| 缺少 `LIKE_PEPPER` | 基础部署继续；点赞 PUT/DELETE 返回 503 `DEPENDENCY_UNAVAILABLE` |
| 缺少 `SUBMISSION_LIMIT_PER_HOUR` | 基础部署继续；投稿限流回退到安全默认值 1 |
| D1/R2 缺失且构建凭据有权限 | 按确定性名称创建资源，再建立临时非敏感 binding |
| D1/R2 已存在 | 复用资源和 binding，不重复创建 |
| 远程 migration 失败 | 立即停止，不执行 Worker deploy；保留 migration 元数据和已创建资源 |
| Worker/R2/D1 权限不足、名称冲突或账号不匹配 | 立即失败，输出资源和权限下一步；不得偷偷创建第二套生产资源 |
| `pnpm seed` 无法连接本地 API | 在任何 D1/R2 写入前以非零退出结束，提示先启动 `pnpm dev` 或设置 loopback `SEED_API_BASE`；不自动拉起服务 |

### 5. Good / Base / Bad Cases

- Good：首次 Workers Build 无 Runtime secrets 也创建/复用资源、完成 migrations、发布 SPA；随后在 Dashboard 添加 Secret，管理员、点赞或投稿分别恢复。
- Base：第二次 `main` 提交再次触发 Workers Build，复用相同 Worker/D1/R2，只应用新增 migration，不 seed、不 clean。
- Bad：首次部署前强制要求四个 Secret，先失败一次再 Retry；把 Sitekey 放入 Runtime secret，或把 Secret key 编译进前端 bundle；本地命令连接生产资源。
- Bad：开发服务器只监听 `localhost`，seed 却固定请求 `127.0.0.1`；或 seed 为了“方便”偷偷启动一个后台 Vite/Worker，导致端口、日志和进程生命周期不可控。

### 6. Tests Required

- 配置测试：生成 Wrangler 配置不含 `secrets.required`、Secret 值、生产资源 UUID；Assets directory 取 Vite Plugin 实际输出，而非硬编码 `./dist`。
- Worker 测试：缺少管理员、点赞配置分别断言 HTTP 503、`DEPENDENCY_UNAVAILABLE` 和“尚未配置”文案；投稿在无外部验证配置时仍断言限流、图片校验和聚合行为不变。
- 本地质量：`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm build`、`pnpm lint`；lint 必须 0 errors 且不新增 warnings。
- 真实验收：项目所有者通过 Dashboard 连续触发两次 Workers Builds；第一次验证资源创建、migration、Worker/SPA 上线，第二次验证资源复用和新增 migration。fake Wrangler 或本地两次 `pnpm deploy` 不能替代真实验收。
- 本地开发 smoke：启动 `pnpm dev` 后修改任一 `.vue` 文件，HMR 不得抛出 `invalidateTypeCache`/null；未启动 API 时执行 `pnpm seed` 必须输出可操作提示并保持 D1/R2 不变。

### 7. Wrong vs Correct

#### Wrong

```jsonc
{
  "secrets": {
    "required": ["ADMIN_PASSWORD", "SESSION_SECRET", "LIKE_PEPPER"]
  }
}
```

这会让基础 Worker 在业务 Secret 尚未配置时直接无法首次发布。

#### Correct

```ts
const adminSecrets = getAdminAuthSecrets(c.env);
if (!adminSecrets) {
  return c.json(
    dependencyUnavailable(requestId, "管理员功能尚未配置：请设置 ADMIN_PASSWORD 和 SESSION_SECRET。"),
    503,
  );
}
```

把配置检查放在对应功能的运行时边界，既不制造默认 Secret，也不影响基础网站和其他已配置功能。
