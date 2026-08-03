# Cloudflare 部署维护 Runbook

本文档面向维护者，不是第一次部署教程。新用户应先阅读仓库根目录的 README。

## 运行模型

生产只有一个 Workers Builds 目标：

```text
Workers Builds
  ├─ pnpm build
  └─ pnpm deploy
       ├─ 检查/创建/复用 Worker、D1、R2
       ├─ 应用远程 migrations
       └─ wrangler deploy
```

默认资源名称为：Worker `laigequnhao`、D1 `laigequnhao-prod`、R2
`laigequnhao-assets-prod`。`pnpm deploy` 不执行 build、seed 或 clean，也不自动生成
生产 Secret。资源名称冲突、账号不匹配、权限不足或 binding 类型不匹配必须立即失败，不能
创建第二个 Worker 或 Pages 项目。

## 配置分类

| 配置                                                                      | 类型                | 说明                                            |
| ------------------------------------------------------------------------- | ------------------- | ----------------------------------------------- |
| `pnpm build`、`pnpm deploy`、`main`                                       | Workers Builds 设置 | 构建命令、部署命令和生产分支                    |
| `VITE_TURNSTILE_SITE_KEY`                                                 | Build variable      | 公开 Sitekey，编译进前端，不是 Secret           |
| `ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY` | Runtime secret      | 由 Worker Settings → Variables and Secrets 管理 |
| `ENVIRONMENT`、`SKIP_TURNSTILE`、`SECURE_COOKIE`                          | Runtime variable    | 由 Wrangler 生成配置提供                        |
| `DB`、`R2`、`ASSETS`                                                      | Runtime binding     | 由资源编排和 Wrangler 配置提供                  |

缺少 Runtime secret 不得阻止基础 Worker、静态资源、D1/R2 预配和 migration。运行时按功能
降级：管理员/会话依赖 `ADMIN_PASSWORD` 与 `SESSION_SECRET`，点赞依赖 `LIKE_PEPPER`，投稿
依赖 Turnstile Sitekey 和 `TURNSTILE_SECRET_KEY`。不允许使用固定默认 Secret 或部署时生成且
维护者无法保存的 Secret。

## 真实环境验收

真实 Cloudflare 验收由项目所有者通过 Workers & Pages 后台完成。Agent 未获授权访问生产账号
时，不将未执行真实验收描述为代码实现失败；同时，在两次成功 Workers Builds 完成前，不宣称
生产部署已通过。

验收必须连续完成两次后台构建：

1. 第一次通过 Fork → Import repository → `pnpm build`/`pnpm deploy` → Save and Deploy，验证
   新环境资源创建、bindings、全部 migrations、Worker 上线和基础网站访问。
2. 第二次由新的 `main` 提交触发，验证复用相同 Worker/D1/R2，只应用新增 migrations，不重复
   创建资源、不 seed、不 clean。

fake Wrangler 测试只能证明本地编排顺序，不能替代真实 Cloudflare 验收。真实验收应记录构建日志、
资源名称/ID、migration 结果、部署地址以及基础功能结果，但不得记录 Secret、Token、Cookie 或
其他敏感值。

## 故障处理

- migration 失败：立即停止 deploy，保留 D1 migration 元数据，不执行 Worker 发布。
- Worker 发布失败：保留已创建资源，优先回退到上一 Worker version；不自动删除资源。
- Secret 缺失：在 Worker Production Runtime secrets 中补齐对应值；后端功能会按配置恢复，
  不要求重新构建或维护者本地执行 `pnpm deploy`。若缺少的是前端 Build variable
  `VITE_TURNSTILE_SITE_KEY`，补齐后必须由 Dashboard Retry build 或新的 `main` 提交重新编译前端。
- Turnstile 错误：确认前端 Build variable `VITE_TURNSTILE_SITE_KEY` 与 Runtime secret
  `TURNSTILE_SECRET_KEY` 来自同一个 widget，并确认 widget Hostname Management 包含当前域名。
- Preview：默认关闭。若启用，必须使用独立 preview Worker、D1、R2 和 migrations，禁止绑定
  production D1/R2。

## 本地质量检查

提交前按项目 Trellis 规范运行：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
```

lint 的验收条件是 0 errors 且不新增 warnings，不要求本任务一次性清理历史 warnings。任何视觉
回归、API 契约变化、migration 变更或真实 Cloudflare 资源操作，都必须在对应任务记录中说明。
