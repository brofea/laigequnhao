# T07 Cloudflare 部署架构迁移与命令体系 PRD

## 0. 文档状态与权威来源

| 项目 | 内容 |
|---|---|
| Trellis 子任务 | `08-03-lgqh-v2-cloudflare-deployment` |
| 所属总任务 | `lgqh-v2` |
| 当前阶段 | 代码实施与本地验证完成；真实 Cloudflare 环境验收待项目所有者通过 Dashboard 执行 |
| 用户指定总 PRD | `docs/PRD/v2/PRD.md` |
| 实际已读取总 PRD | `docs/PRD/v2/PRD.md`，共 1990 行；实施前已完成文件名和引用统一 |
| 目标产品 | “来个群号”网站 V2 |
| 目标运行时 | 单一 Cloudflare Worker + Workers Static Assets + D1 + R2 |

`docs/PRD/v2/PRD.md` 是当前仓库唯一人工审核产品来源。旧子任务 PRD、旧 T07 编号规划、Pages 部署说明和父任务中未同步的旧 T07 文字均不覆盖本任务边界。

## 1. 目标与用户价值

把项目从“Pages + Pages Functions + Vite proxy + 分散 Wrangler 命令”统一为一个可理解、可重复、可安全审计的 Cloudflare Workers 发布模型：

- 生产只有一个 Worker 目标，不继续维护 Pages 项目和独立 Worker 项目两套生产入口。
- Vue 构建产物由 Workers Static Assets 托管，Hono 在独立 Worker 根入口中处理 `/api/*`。
- 开发者使用少量语义清晰的 `pnpm` 命令完成本地全栈开发、本地 D1/R2 迁移、seed、clean、构建和发布。
- Fork 后通过 Workers Builds 的 `pnpm build` + `pnpm deploy` 完成首次部署和后续幂等部署。
- D1/R2 资源检查、首次创建、绑定、migration 和 deploy 有明确顺序；失败不静默创建第二个目标、不删除资源、不写入 Secret。

## 2. 已确认的仓库基线（实施前审计快照）

### 2.1 当前架构

- 当前是 Cloudflare Pages 项目，`wrangler.jsonc` 使用 `pages_build_output_dir: "./dist"`。
- Pages Functions 入口是 `functions/api/[[route]].ts`，只做 `onRequest` 到 `functions/_lib/app.ts` 的转发。
- Hono app、现有 route/service/repository、Zod Contract、D1 migration、R2 适配和鉴权逻辑已经存在，应尽量复用。
- 当前没有独立 Worker 根入口，也没有 `assets` 配置、Workers Static Assets 配置或可靠资源预配脚本。
- 当前 Vite 只构建前端到 `dist`，通过 proxy 将 `/api` 转发到 8788；本地 R2 由 Vite 中间件直接读取 `.wrangler/state`。
- 当前 `package.json` 没有最终 `deploy` 命令；旧 Pages 命令和 README 仍有不一致。
- 当前没有 `.github/workflows` 或其他仓库 CI；Workers Builds 配置在 Cloudflare Dashboard 外部维护。

### 2.2 迁移事实

- 审计起点的 `pnpm exec wrangler` 为 `4.114.0`；实施阶段因 Cloudflare Vite Plugin peer 门禁已升级到 `4.118.0`，实验结果记录在 `research.md`。
- 当前 Pages 配置运行 `wrangler deploy --dry-run` 会被 Wrangler 拒绝；现有 Pages adapter 也不能直接作为 Module Worker。
- 现有 `tests/e2e/worker.ts` 证明应用可以被包成 Module Worker `default.fetch`，但它不应成为生产入口。
- 当前 `pnpm build`、`pnpm typecheck` 成功，`pnpm lint` 0 errors/42 warnings；当前 build 没有 Worker bundle。
- 当前 production D1 ID 是占位符；源配置含有部署者专属的本地/preview D1 UUID，不应继续作为公共生产配置范式。
- 当前 seed 会先上传本地 R2，再执行含全表 DELETE 的生成 SQL；没有独立本地 `clean`。

完整审计、官方来源和最小实验记录见本任务的 `research.md`。

## 3. 目标架构要求

生产目标必须迁移为：

```text
Cloudflare Workers Builds
        │
        ├─ pnpm build
        └─ pnpm deploy
             │
             ├─ 资源检查/缺失时显式预配 D1、R2
             ├─ 生成或解析非敏感绑定配置
             ├─ 执行未应用的远程 D1 migrations
             └─ wrangler deploy
                    │
                    ├─ Worker 根入口：Hono fetch handler
                    ├─ Workers Static Assets：Vue dist
                    ├─ D1 binding：DB
                    └─ R2 binding：R2
```

目标配置语义从：

```text
Pages
+ Pages Functions
+ pages_build_output_dir
```

迁移为：

```text
Worker main
+ Hono fetch handler
+ Cloudflare Vite Plugin 生成的 Static Assets client 输出（目录由官方插件/构建产物确定）
+ D1/R2 bindings
+ wrangler deploy
```

`assets.directory` 必须指向实际构建产物，但 `./dist` 不是不可改变的约束；官方插件生成 `dist/client` 等结构时，只要完整验收通过即可直接采用。

前端视觉设计已经冻结。本任务不改变页面设计、组件样式、布局、动画、主题、Dialog 或交互流程；只允许部署入口、运行时适配、API 同源接线、配置、命令、测试和文档的必要变更。

## 4. 功能与行为要求

### 4.1 Worker 迁移

- 新增统一的独立 Worker 根入口，挂载现有 Hono `app.fetch(request, env, ctx)`。
- 复用现有 route/service/repository/Contract/D1/R2/鉴权逻辑，不因运行时变化重写业务。
- 退役 Pages `onRequest` 专用入口和 Pages 专用生产命令；旧文件的删除或保留必须在 design/implement 中给出明确理由和最终归属。
- `/api/*` 必须进入 Hono；静态资源必须由 Workers Static Assets 提供；Vue Router 的 SPA fallback 必须在本地 Worker runtime 和部署 smoke 中验证。
- `/api/v1/assets/*`、头像、二维码、上传、读取和清理路径必须保持可用。

### 4.2 本地开发

- `pnpm dev` 是默认全栈入口，一个主要访问地址、支持前端 HMR、使用本地 D1/R2，不得误连生产资源。
- 首选 Cloudflare Vite Plugin 的官方单进程方案；其输出目录可采用官方生成结构，不得仅因目录不同而降级。只有插件在真实验收中无法满足 HMR、SPA、API、D1/R2、构建或部署时，才使用一个 Node 监督器启动 Vite 和 `wrangler dev` 的降级方案。
- `pnpm vite:dev` 只启动前端，明确使用代理连接本地 `worker:dev` 或明确标记 API 不可用，绝不自动连生产 API。
- `pnpm worker:dev` 只启动 Worker，使用本地 D1/R2，替代 `pages:dev` 和 `pages:dev:local`。

### 4.3 数据库和数据操作

- `pnpm db:migrate` 只迁移本地 D1，使用统一本地持久化目录，保留 `d1_migrations` 元数据。
- `pnpm db:migrate:remote` 只迁移明确的远程 production D1，主要由 deploy 调用；失败必须中止发布并给出明确下一步。
- `pnpm seed` 只写本地 D1/R2，可控随机或固定种子，重复执行策略明确；不得隐含 clean，不得写远程。
- `pnpm clean` 只清空本地 D1 应用数据和本地 R2 对象，二次确认，保留数据库实例、表结构和 migration 元数据；确认内容必须明确列出 D1/R2 两类清理。
- 不提供普通远程 clean，不删除远程 migration 元数据，不自动 seed 生产数据。

### 4.4 发布和命令

- `pnpm build` 只构建前端和 Worker 需要的产物，不迁移远程数据库、不创建资源、不修改生产配置。
- `pnpm deploy` 作为 Workers Builds Deploy command，必须在非交互环境中按确定性默认名称检查或创建/复用 Worker、D1、R2，生成临时非敏感绑定配置、执行未应用 migrations、执行 `wrangler deploy`；不要求用户 clone 后再运行本地命令，不要求手工绑定资源，不重复 build、不 seed、不 clean。
- `pnpm release` 仅供本地手动发布，语义为 `pnpm build` → `pnpm deploy`，不与 Workers Builds 的 Build command 混淆。

首次部署的硬性端到端流程为：Fork 仓库 → Workers & Pages → Create application → Import repository → Build command `pnpm build` → Deploy command `pnpm deploy` → Save and Deploy。Workers Builds 必须在非交互环境中使用确定性默认名称：Worker `laigequnhao`、生产 D1 `laigequnhao-prod`、生产 R2 `laigequnhao-assets-prod`；名称可由明确的 CI 变量覆盖，但缺少凭据、账号或变量时必须失败并提示，不得改为人工本地流程。
- 最终命令矩阵必须移除或替换 `pages:dev`、`pages:dev:local`、`wrangler pages deploy`、依赖 `pages_build_output_dir` 的命令和会误连远程的本地别名。若保留过渡别名，必须带 deprecated 标记和删除时间。

### 4.5 资源预配和环境隔离

- Local、Preview/非生产分支、Production 三者必须使用清晰边界。
- 公共仓库不得写死部署者专属账户 ID、D1 UUID、Secret 或 token；资源名称可按稳定的环境命名规则进入配置。
- 资源检查采用检查优先、缺失才创建、创建后复用、冲突停止、禁止删除/清空/盲目覆盖。首次和后续 Workers Builds 部署必须覆盖“首次创建/第二次提交复用”的真实隔离 Cloudflare 环境验收；fake Wrangler 只能覆盖编排单测，不能替代真实验收。
- Wrangler 自动预配目前是 Beta；规划必须提供显式幂等预配降级方案，不能把 Dashboard/GitHub 不回写资源 ID 的行为写成稳定保证。
- 生产分支由 Workers Builds 明确绑定 `main`。Preview 默认关闭非生产分支部署；若启用，必须使用独立的 preview Worker `laigequnhao-preview`、D1 `laigequnhao-preview` 和 R2 `laigequnhao-assets-preview`，不得让 preview version 绑定 production D1/R2，且不执行 production migration。

### 4.6 首次部署配置、Secrets 与管理员初始化

Workers Builds 的 Build settings 固定为 `pnpm build` 和 `pnpm deploy`。Workers Builds API token 是 Dashboard 的 Build setting，不属于项目 Build secret；若自动生成 token 不含 D1 edit 权限，所有者必须改用/创建至少拥有 Workers Scripts edit、D1 edit、R2 edit 的账号 token。本项目没有必填 Build variable 或 Build secret；`NODE_VERSION=22` 只是可选 Build variable。`ENVIRONMENT=production`、`SKIP_TURNSTILE=false`、`SECURE_COOKIE=true` 由生成的 Worker Runtime config 提供，确定性 Worker/D1/R2 名称由 `pnpm deploy` 的默认值提供。`R2_PUBLIC_BASE_URL` 仅在使用独立资源域名时配置；默认采用同源 Worker asset URL。

首次成功部署前，项目所有者必须在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中提供 Runtime secrets：`ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY`。这些名称由 `wrangler.jsonc` 的 `secrets.required` 声明，官方 `wrangler deploy` 会在 Worker 缺少任一项时失败；不再使用自定义 `CF_SECRETS_CONFIGURED` presence flag。`SESSION_SECRET` 和 `LIKE_PEPPER` 可安全随机生成，`ADMIN_PASSWORD` 由所有者设定，`TURNSTILE_SECRET_KEY` 必须来自生产 Turnstile 站点。`ANALYTICS_TOKEN` 为管理分析功能的可选 Runtime secret，缺失时只标记分析不可用。Secret 值不得进入 Git、Build secret、命令行参数、构建日志或验收证据，普通 `pnpm deploy` 不自动生成或打印 Secret。

管理员初始化清单：确认 `ADMIN_PASSWORD` 已替换默认值、确认 `SESSION_SECRET`/`LIKE_PEPPER` 为随机值、确认 `SECURE_COOKIE=true`、确认 Turnstile 站点/Secret 配对、完成一次管理员登录并验证 CSRF、确认远程 D1 migrations 已完成、确认 R2 binding 可读写。管理员初始化不通过时，deploy 结果只能标为“基础资源已部署，业务未完成”，不得笼统标记完成。

首次部署后必须立即可用并通过 smoke 的七项能力：

1. Worker health：`/api/v1/health` 返回健康状态并能访问 D1/R2 依赖。
2. SPA：根路径、`/admin` 和刷新后的 Vue Router 深链返回应用 shell，静态资源加载正常。
3. 公开数据：公开列表、搜索、标签、发现新群、板块和详情读取正常。
4. 公开交互：点赞、分享/二维码访问和公开错误边界正常；投稿属于既有 A1 阻塞项，不能用部署成功替代投稿验收。
5. 管理认证：管理员登录、会话 Cookie、CSRF 和会话失效流程正常。
6. 管理业务：群组管理、分页、板块、回收站和健康检查接口正常。
7. R2 资源：上传、Logo/二维码读取、`/api/v1/assets/*` 访问、引用计数和清理路径正常。

上述七项不包含尚未解决的 Turnstile 投稿 A1；A1 必须单独记录为未完成，不得把“基础 Worker 已上线”表述为“产品全部功能已完成”。

### 4.7 命令分层和 README 主流程

命令分为三层，README 普通用户主流程只突出 `db:migrate`、`dev`、`seed`、`clean`、`build`、`deploy`：

| 层级 | 命令 | 语义 |
|---|---|---|
| 日常开发 | `dev`、`db:migrate`、`seed`、`clean` | 本地全栈、本地 D1 migration、本地开发数据、本地 D1 应用数据和 R2 对象清理 |
| 构建部署 | `build`、`deploy` | Workers Builds 的构建阶段与 Deploy command；`deploy` 不重复 build |
| 高级维护 | `vite:dev`、`worker:dev`、`db:migrate:remote`、`release`、`cloudflare:check`、测试命令 | 纯前端/纯 Worker 调试、远程 migration、本地手动发布、只读诊断和质量门禁 |

最终采用 `pnpm clean` 表示“只清理本地 D1 应用数据和本地 R2 对象”；确认提示必须逐项列出两者，明确保留 schema、数据库实例和 `d1_migrations`。不提供普通远程 clean，也不新增 `db:clean` 别名，避免普通用户面对两套语义。

## 5. 非目标

- 不继续维护 Pages 作为第二个生产目标。
- 不新增独立 Worker 项目与 Pages 项目并行发布。
- 不重写现有 Hono 业务逻辑、D1 schema、R2 生命周期、认证、CSRF、Contract 或业务规则；除非 Worker 入口适配确实需要最小接口变更。
- 不修改 Vue 页面结构、组件样式、Tailwind/CSS、主题、Dialog、Carousel、布局、动效或用户交互。
- 不把 Pages Functions 的底层 Workers Runtime 描述为当前已经存在独立 Worker。
- 不自动创建第二个 Worker、第二个 Pages 项目、未知资源或远程数据副本。
- 不执行生产 seed、远程 clean、批量导入或未授权真实业务写入 smoke。
- 不在本轮实现 DNS、Zone、自定义域名、证书、Turnstile widget 或产品功能扩展。
- 不以 Cloudflare Beta 自动预配、Dashboard 默认行为或未经实验的插件行为作为无条件承诺。

## 6. 验收标准

### A. 架构与路由

- [ ] 生产配置存在独立 Worker `main` 和 Workers Static Assets 配置，不再使用 `pages_build_output_dir`；Assets 输出目录采用 Cloudflare Vite Plugin 的实际官方产物，不以 `./dist` 作为硬约束。
- [ ] 生产只有一个 Worker 目标；仓库搜索和文档审计不再存在主动的 Pages deploy 流程。
- [ ] `/api/v1/health`、公开 API、管理员 API、D1 读写、R2 上传/读取/清理在独立 Worker 本地和部署 smoke 中通过。
- [ ] `/`、`/admin`、刷新后的 Vue Router 路径和无匹配 SPA 路径正确返回应用 shell；`/api/*` 不被 SPA fallback 截获。
- [ ] Pages adapter 已删除或明确退役，生产入口只保留一个 Hono Worker adapter；没有无理由的业务重写。

### B. 命令体系

- [ ] `pnpm dev` 一条命令启动全栈本地开发、HMR、本地 D1/R2 和唯一主要访问地址。
- [ ] `pnpm vite:dev`、`pnpm worker:dev` 的职责和端口清晰，前端-only 模式不会误连远程。
- [ ] `pnpm db:migrate`、`pnpm seed`、`pnpm clean` 的本地边界可通过自动化测试和命令 smoke 证明。
- [ ] `pnpm build` 不做远程副作用；`pnpm deploy` 不重复 build、不 seed、不 clean。
- [ ] `pnpm deploy` 与 `pnpm release` 的职责不同，README 和 Workers Builds 设置完全一致；Workers Builds 不需要用户 clone 后再运行本地命令或手工绑定。
- [ ] 旧 Pages 命令、重复 migrate/seed/dev/deploy 命令和 stale README 引用已删除或有带期限的兼容说明。

### B1. Workers Builds 首次/后续端到端验收

- [ ] 由项目所有者在真实 Fork 仓库上通过 Workers & Pages → Create application → Import repository 配置 Build command `pnpm build`、Deploy command `pnpm deploy` 并 Save and Deploy；缺失 Runtime secret 的失败尝试不计入验收。
- [ ] 首次部署在 Workers Builds 非交互环境中使用确定性默认名称自动创建或复用 Worker、D1、R2，自动完成 bindings、migrations 和 `wrangler deploy`；不要求 clone、本地命令或手工 binding。
- [ ] 在全新或隔离 Cloudflare 账号/资源命名空间完成第一次成功的 Workers Builds，记录资源创建、migration、Worker 上线和七项 post-deploy smoke；fake Wrangler 不得作为唯一证据。
- [ ] 对仓库提交第二次变更后再次由 Cloudflare Dashboard 触发 Workers Builds，证明复用相同 Worker/D1/R2，仅应用新增 migrations，不重复创建资源、不 seed、不 clean；不得用本地两次 `pnpm deploy` 替代。

### C. 资源与迁移安全

- [ ] 首次 deploy 在明确目标账号、Worker 名称、D1/R2 名称后可以检查并缺失才创建资源；已有资源稳定复用。
- [ ] 资源名称冲突、资源类型不匹配、账号不匹配、权限不足、绑定不匹配时立即失败，不创建第二个目标。
- [ ] 资源预配、binding 生成、远程 migration、Worker deploy 的时序有自动化验证和可读日志。
- [ ] migration 只执行尚未应用的文件；迁移失败时 deploy 不执行；D1 migration 元数据保留。
- [ ] 生产源文件不包含部署者专属 UUID、账户 ID、Secret、Cookie 或 token；Secrets 不出现在日志和证据中。
- [ ] Preview 默认关闭非生产分支部署；若开启，则使用独立 preview Worker/D1/R2，不执行 production migration，不绑定 production D1/R2。

### C1. 配置与初始化

- [ ] 首次部署所需 vars、Secrets、Cloudflare API 权限、管理员初始化步骤和缺失 Secret 的功能影响有清单。
- [ ] 部署后七项基础能力逐项通过 smoke；缺失 Turnstile 或 Analytics 等可选/必要 Secret 时，结果准确标记为部分完成并说明不可用功能。

### D. 质量与兼容

- [ ] Cloudflare Vite Plugin 的官方单进程方案已完成真实最小实验并优先采用；只有功能验收失败时才允许降级，不能仅因 `dist/client` 等输出目录不同而降级。
- [ ] 已区分官方已确认能力、Wrangler Beta 能力和待验证假设；Beta 不被写成无条件保证。
- [ ] `pnpm lint` 达到 0 errors 且不新增 warnings；不要求 T07 清理既有 42 个历史 warnings。`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm test:e2e`、`pnpm build` 通过，或每个阻塞项有明确归属和用户确认。
- [ ] 视觉回归证明本任务没有改变冻结的页面、组件、样式、布局和交互视觉。
- [ ] README、部署 runbook、资源清单、环境变量/Secrets 清单、首次部署、后续部署、失败、重试、回滚和 A1/已知阻塞记录齐全。

## 7. 规划阶段完成定义

- `research.md` 完成仓库事实、官方能力、最小实验和冲突记录。
- `design.md` 完成目标 Worker、静态资源路由、Vite/本地开发、命令、资源预配、环境隔离和回滚设计。
- `implement.md` 完成按阶段执行清单、文件所有权、验证命令、门禁、风险和回滚点。
- `implement.jsonl`、`check.jsonl` 至少包含真实的 Spec/研究上下文条目，不保留 seed-only 示例行。
- 本轮不运行 `task.py start`，不实施业务代码；后续必须由用户明确批准最终规划后才能进入执行阶段。
