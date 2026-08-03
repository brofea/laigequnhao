# T07 Cloudflare 部署架构迁移与命令体系技术设计

## 1. 设计结论

生产运行时迁移为一个 Module Worker：Worker 根入口挂载已有 Hono app，Workers Static Assets 托管 Vue 构建产物，D1/R2 通过显式 bindings 注入。Pages Functions 入口和 Pages deploy 命令不再作为生产路径。

资源和 migration 采用“显式安全编排优先，Wrangler Beta 自动预配可选”的设计。原因是 Workers Builds 的 Build command 与 Deploy command 是两个阶段，而 D1 migration 必须发生在 Worker deploy 之前；仅依赖最后一步 `wrangler deploy` 的 Beta 资源预配，无法对 migration 前的资源存在性和生成配置提供稳定保证。

Cloudflare Vite Plugin 是单命令本地开发和官方构建输出的首选方案。其生成的 client 输出目录由插件决定，`./dist` 不是生产硬约束；只要 `pnpm dev`、`pnpm build`、`pnpm deploy`、SPA、API、D1/R2 和 E2E 验收通过，即使产物为 `dist/client` 也必须继续采用插件。只有功能门禁失败时，才允许使用 Node 监督器降级方案。

## 2. 目标运行时数据流

```text
浏览器
  │
  ├─ /api/* ───────────────┐
  │                        ▼
  └─ /、/admin、/assets ─> Worker 根入口
                             │
                             ├─ /api/* → Hono app.fetch(request, env, ctx)
                             │              ├─ D1 DB binding
                             │              └─ R2 binding
                             │
                             └─ 静态资源/SPA fallback → Workers Assets
                                            │
                                            └─ 实际 client output/index.html + assets/*
```

Hono 业务数据流保持：

```text
Worker fetch
  → functions/_lib/app.ts
  → route
  → service
  → repository / adapter
  → D1 / R2
```

Worker 入口只负责运行时适配和静态资源分流，不读取数据库行、不复制权限规则、不创建第二套 API Contract。

## 3. Worker 入口和静态资源边界

### 3.1 目录归属

推荐新增：

```text
worker/
└── index.ts          # 唯一生产 Module Worker 根入口
```

入口导入 `functions/_lib/app.ts` 和 `Env`，实现 `ExportedHandler<Env>` 形状的 `fetch`。`functions/api/[[route]].ts` 作为 Pages adapter 退役；测试入口统一导入 `worker/index.ts`，避免 E2E 继续复制 Worker wrapper。

### 3.2 请求分流

目标请求规则：

| 请求 | 负责人 | 规则 |
|---|---|---|
| `/api/*` | Hono Worker | 所有 API、健康检查、R2 asset route 和管理接口进入 `app.fetch` |
| 精确静态文件 | Workers Static Assets | 不调用 Hono，直接提供 Vite 输出 |
| `/`、`/admin` 等 SPA 导航 | Workers Static Assets fallback | `not_found_handling = "single-page-application"` 返回 `index.html` |
| 未知 `/api/*` | Hono | 返回现有 API 404/error envelope，不得变成 HTML |

独立 Wrangler 配置（不采用插件生成配置时）的概念结构使用：

```jsonc
"assets": {
  "directory": "<actual-client-output>",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

必须用本地 `wrangler dev`/Vite Plugin preview 和部署 smoke 验证未知 SPA path 的实际回退。如果实际 runtime 在 Worker 存在时不按预期回退，入口改为对非 API 显式执行 `env.ASSETS.fetch(request)`，并将 `run_worker_first` 调整为 `true` 或保持 API 选择性规则；不得通过 Hono catch-all 返回静态 HTML。产物目录以插件/构建结果为准，不因目录变化切换双进程。

### 3.3 R2 公开 URL

现有 R2 adapter 依赖 `R2_PUBLIC_BASE_URL`。目标部署默认同源 Worker，因此优先改为生成同源 `/api/v1/assets/<key>` URL，保留显式 `R2_PUBLIC_BASE_URL` 作为有自定义资源域名时的可选配置。这样首次 Workers Builds 部署不需要知道部署后 URL，也不需要把 R2 bucket 直接公开。

该调整只改变 URL 生成边界，不改变 R2 upload/delete/ref_count/cleanup 生命周期；必须补充本地和 Worker smoke，验证 Logo、二维码、读取失败和清理路径。

## 4. Wrangler 配置目标

### 4.1 源配置原则

`wrangler.jsonc` 是唯一源配置，使用 JSONC，不再同时维护 `wrangler.toml`。目标结构概念如下，实际字段以实施时安装的 Wrangler schema 和插件实验结果为准：

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "laigequnhao",
  "main": "./worker/index.ts",
  "compatibility_date": "<审计确认的日期>",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "<actual-client-output>",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "laigequnhao-prod",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "laigequnhao-assets-prod"
    }
  ],
  "vars": {
    "SKIP_TURNSTILE": "false",
    "SECURE_COOKIE": "true"
  },
  "env": {
    "preview": {
      "name": "laigequnhao-preview",
      "d1_databases": [{ "binding": "DB", "database_name": "laigequnhao-preview", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "R2", "bucket_name": "laigequnhao-assets-preview" }],
      "vars": { "SKIP_TURNSTILE": "true", "SECURE_COOKIE": "true" }
    }
  }
}
```

说明：普通 Wrangler 配置文档将 D1 `database_id` 作为常规字段；本方案不把部署者 UUID 提交到公共仓库。实现时由资源编排脚本根据稳定名称取得/创建真实 ID，生成 `.wrangler/deploy/wrangler.generated.json` 供 migration 和 deploy 使用。若采用 Cloudflare Vite Plugin，则优先使用插件生成的 Worker/Assets 配置；若当前 Wrangler 版本不能接受源配置中的 draft D1 binding，则采用“模板源配置 + 运行时生成完整配置”的降级方式，而不是写回公共配置。

### 4.2 环境命名

| 环境 | Worker | D1 | R2 | 自动操作 |
|---|---|---|---|---|
| Local | 不上传远程 Worker | Wrangler 本地持久化 `lgqh-dev` | Wrangler 本地 R2 state | 可 migrate/seed/clean |
| Preview | 默认关闭；显式启用时为 `laigequnhao-preview` | `laigequnhao-preview` | `laigequnhao-assets-preview` | 默认不部署；启用后也不得绑定生产资源 |
| Production | `laigequnhao` | `laigequnhao-prod` | `laigequnhao-assets-prod` | deploy 才可预配、迁移和发布 |

生产分支在 Workers Builds Dashboard 明确设为 `main`。非生产分支使用默认 `wrangler versions upload` 或显式 `wrangler versions upload --env preview`，不调用 `pnpm deploy`，不执行 production D1 migration。

## 5. 资源检查、预配和 binding 生成

### 5.1 主流程

```text
pnpm deploy
  │
  ├─ 检查实际 client output/index.html 和 Worker build 产物已存在
  ├─ 检查目标账号/Worker 名称/环境变量
  ├─ d1 list 或 d1 info：按精确 database_name 查找
  │    ├─ 存在：核对 ID、名称和环境
  │    └─ 缺失：仅在 deploy 语境创建，不删除任何资源
  ├─ r2 bucket info：按精确 bucket_name 查找
  │    ├─ 存在：复用并核对
  │    └─ 缺失：仅在 deploy 语境创建
  ├─ 写入 .wrangler/deploy/wrangler.generated.json
  ├─ wrangler d1 migrations apply <stable database name> --remote --config generated
  │    ├─ 失败：立即退出，不执行 deploy
  │    └─ 成功：继续
  └─ wrangler deploy --config generated
```

`pnpm deploy` 在 Workers Builds 中必须是非交互的：默认 Worker/D1/R2 名称固定为 `laigequnhao`、`laigequnhao-prod`、`laigequnhao-assets-prod`，只有明确的部署环境变量才允许覆盖。它不能提示用户 clone、运行本地命令或手工绑定；缺少 Cloudflare 构建凭据、资源权限或已声明的 Runtime secrets 时，底层 Wrangler 必须失败并输出下一步。仓库不再使用自定义 `CF_DEPLOY_ENV` 或 `CF_SECRETS_CONFIGURED` 开关；`CF_WORKER_NAME`、`CF_D1_NAME`、`CF_R2_NAME` 仅是高级部署脚本的可选名称覆盖，不是必须配置的 Build variable 或 Runtime variable。

硬性真实验收环境为一次全新或隔离 Cloudflare 账号/资源命名空间：第一次 Fork → Import repository → `pnpm build` → `pnpm deploy` 必须创建/复用资源、执行 migration 并上线；提交第二个 commit 后同样触发 Workers Builds，必须复用相同 Worker/D1/R2，仅应用新增 migration。fake Wrangler 只验证编排分支，不计入该验收。

### 5.2 安全不变量

- 只按完整、确定的资源名匹配，不按模糊前缀匹配。
- 同名资源存在但 ID/类型/账号无法核对时失败，不换名、不创建第二份。
- 资源创建前输出目标账号、Worker、D1、R2 和环境；非交互 CI 必须记录安全摘要，不能记录 Secret。
- 资源创建后只写入工作区临时 generated config；不修改已跟踪源配置，不提交 UUID。
- `wrangler d1 migrations apply` 使用稳定数据库名，migration 文件由 `migrations/` 和 `d1_migrations` 共同确定未应用集合。
- migration 失败依赖 D1 官方回滚当前失败 migration 的语义；脚本不继续 deploy。
- deploy 失败不自动删除 Worker、D1、R2 或对象；回滚使用 Worker 版本回滚和已验证的 D1 备份/恢复路径。

### 5.3 Wrangler Beta 自动预配的定位

无 ID draft binding 的 Wrangler 自动预配已被官方文档确认，但仍是 Beta；从 Dashboard/GitHub 触发时 ID 不回写仓库。实现可以保留一个受显式开关控制的实验模式，但生产主路径必须由 `pnpm deploy` 显式检查/创建/复用资源，因为只有它能在 migration 前建立可审计的真实 binding，并满足非交互首次部署。

## 6. Vite 和本地开发设计

### 6.1 首选：Cloudflare Vite Plugin

实施时优先采用：

- `@cloudflare/vite-plugin` 与 Vue plugin 共同注册。
- `vite dev` 在 workerd 中运行 `worker/index.ts`，Vite 继续提供 HMR。
- D1/R2 通过本地 binding 模拟，`.dev.vars` 提供非敏感本地值。
- `/api` 同源访问，移除仅为 Pages 双进程服务的 8788 proxy 和本地 R2 文件中间件。
- `vite preview` 用 Workers runtime 验证构建产物。

插件官方输出会生成独立 Worker 配置和 client build output；必须验证实际生成目录即可被 Workers Static Assets、SPA、API 和部署链路消费。若插件生成 `dist/client`，只要功能验收通过就直接采用，不得仅因目录变化降级。

### 6.2 仅在功能门禁失败时的降级：Node 监督器 + Vite proxy + wrangler dev

只有当插件在真实仓库中无法满足 HMR、SPA、API、D1/R2、构建或部署门禁时，才新增一个轻量 `scripts/dev.mjs`：

```text
pnpm dev
  ├─ vite --host 127.0.0.1 --port 5173
  │    └─ /api proxy → worker:8788
  └─ wrangler dev worker/index.ts --local --port 8788
```

监督器负责启动、转发退出信号和任一子进程失败时退出；主访问地址固定为 5173。`pnpm vite:dev` 只运行 Vite，`pnpm worker:dev` 只运行 8788 Worker。

两种方案的外部命令契约相同，区别只影响开发内部实现；最终采用哪种方案必须在 `implement.md` 的插件门禁后记录。

## 7. 命令设计

| 命令 | 目标环境 | 副作用 | 输入/前置 | 失败行为 |
|---|---|---|---|---|
| `pnpm dev` | Local | 启动 Vite + Worker、本地 state | `.dev.vars`、依赖、migration | 任一服务失败即退出，不降级到远程 |
| `pnpm vite:dev` | Local frontend | 只启动前端 server | 本地 Worker 可选 | API proxy 不可用时明确报错，不 fallback 远程 |
| `pnpm worker:dev` | Local | 启动本地 Worker/D1/R2 | Wrangler config、`.dev.vars` | binding/config 错误即退出 |
| `pnpm db:migrate` | Local | 应用未完成本地 migration | 本地 persist 目录 | 失败退出，保留 migration 元数据和错误 |
| `pnpm db:migrate:remote` | Production remote | 应用未完成远程 migration | 显式 remote guard、目标账号/资源 | 未确认或失败即退出，不 deploy |
| `pnpm seed` | Local | 写入本地测试数据和本地 R2 | 本地 URL、固定/随机 seed | 远程 URL、生产环境、已有数据策略不满足时退出 |
| `pnpm clean` | Local | 清理本地 D1 应用数据和本地 R2 对象 | 二次确认，逐项列出 D1/R2 | 任一确认缺失/目标非 local 即退出；保留 schema、实例和 `d1_migrations` |
| `pnpm build` | Local/Workers Builds | 生成 Vite Plugin/Worker 实际构建产物 | 无远程凭据要求 | 构建失败退出，不迁移/预配 |
| `pnpm deploy` | Production Workers Builds | 预配/复用资源、remote migration、Worker deploy | build 已完成、Dashboard Runtime secrets 已配置 | 任一阶段失败立即停止，不 seed/clean |
| `pnpm release` | 本地手动 Production | `build` 后调用 deploy | 显式人工发布确认 | build 或 deploy 失败即退出 |
| `pnpm cloudflare:check` | 只读 remote | account/Worker/D1/R2/migration 检查 | 登录和目标环境 | 只报告，不创建、不迁移、不 deploy |

测试专用 `db:test:migrate`、E2E 启动脚本和 Workers Vitest 配置可以保留为内部门禁，但不得被 `db:migrate`、`seed` 或 `clean` 复用成生产目标。

命令分三层：

- 日常开发：`dev`、`db:migrate`、`seed`、`clean`。
- 构建部署：`build`、`deploy`。
- 高级维护：`vite:dev`、`worker:dev`、`db:migrate:remote`、`release`、`cloudflare:check` 和测试命令。

README 主流程只突出前两层中的六个核心命令；`clean` 确认界面必须明确显示会清理本地 D1 应用数据和本地 R2 对象，但保留 schema、资源实例及 migration 元数据。不提供普通远程 clean，也不新增 `db:clean` 别名。

## 7.1 首次部署配置和管理员初始化

非敏感 vars 默认值：`ENVIRONMENT=production`、`SKIP_TURNSTILE=false`、`SECURE_COOKIE=true`，以及确定性名称 `laigequnhao`、`laigequnhao-prod`、`laigequnhao-assets-prod`。`R2_PUBLIC_BASE_URL` 仅在使用独立资源域名时提供，默认由同源 Worker 生成资源 URL。

必须由项目所有者在 Worker **Settings → Variables and Secrets** 中人工准备的 Runtime secrets：`ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY`。这些名称由 `wrangler.jsonc` 的 `secrets.required` 声明，官方 `wrangler deploy` 会在 Worker 缺少任一项时失败；仓库不再维护自定义 presence flag，也不把值注入 Workers Builds Build secret。`ANALYTICS_TOKEN` 仅在启用管理分析时需要，缺失时单独标记分析不可用。`SESSION_SECRET` 和 `LIKE_PEPPER` 可以由所有者在密码管理器中随机生成；`ADMIN_PASSWORD` 由所有者设定；`TURNSTILE_SECRET_KEY` 必须来自生产 Turnstile 站点。Secret 不由普通 deploy 自动生成、写入日志或保存进证据。

管理员初始化顺序：确认管理员密码已替换、会话密钥和 pepper 为随机值、Secure Cookie 开启、Turnstile 配对完成、D1 migration 完成、管理员首次登录和 CSRF 成功、R2 上传/读取成功。即使这些基础项通过，Turnstile 投稿前端仍按 A1 单独验收，不能报告全站完成。

部署后七项必验功能固定为：health；根页和 SPA 深链；公开列表/搜索/标签/发现/板块/详情；点赞与二维码/公开资源；管理员登录/会话/CSRF；管理员群组/分页/板块/回收站；R2 上传、Logo/二维码读取、引用计数和清理。Turnstile 投稿 A1 不计入这七项，必须单独报告。

## 8. 迁移兼容和回滚

### 8.1 Pages 到 Worker 的兼容窗口

- `functions/_lib/*` 保持业务实现和 Env binding 名称兼容。
- 先让 Worker 入口、Assets 分流、本地测试和 build 通过，再切换 Workers Builds。
- 迁移期间不让 Pages 和 Worker 作为两个长期生产目标；如必须短暂保留 Pages 作为人工回滚，只记录为一次性切换窗口，不保留自动双发。
- `pages_build_output_dir`、Pages Functions adapter 和 Pages 命令在 Worker smoke 通过后一次性退役，避免两套配置继续漂移。

### 8.2 数据库回滚

- migration 前执行远程备份/确认，使用 D1 官方 migration 失败回滚语义。
- 新 migration 只采用向后兼容的 nullable/新增表策略，先迁移后发 Worker 代码。
- Worker deploy 失败时回退到上一 Worker version；不要自动执行破坏性逆向 migration。
- 数据恢复使用 T06 已验证的 D1 backup/restore runbook，由人工授权，不由普通 `pnpm deploy` 自动执行。

### 8.3 资源回滚

- 不自动删除 Worker、Pages 项目、D1、R2 或 R2 对象。
- 新建资源发现名称冲突、权限不足或 binding 不匹配时停止，保留已创建资源并输出资源名称，供人工核对；不再创建替代目标。

## 9. 视觉和业务边界

- 不编辑 Vue 表现组件、CSS、Tailwind、主题 token、布局、Dialog、Carousel、表单视觉或交互流程。
- 允许的前端改动仅限 API 同源基址、资源 URL、测试 helper、dev proxy 和运行时 adapter；若发现需要视觉变更，停止并回到用户确认。
- 现有 D1/R2 业务语义、上传、二维码、回收站和清理状态机保持不变。
