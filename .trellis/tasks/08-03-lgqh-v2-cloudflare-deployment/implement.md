# T07 Cloudflare 部署架构迁移实施计划

## 当前实施状态（2026-08-03）

已落地：Worker 根入口、Cloudflare Vite Plugin 单进程 `pnpm dev`、官方 `dist/client` 构建输出消费、SPA/API 分流、本地 D1/R2 命令、`pnpm seed`/`pnpm clean` 安全边界、显式 D1/R2 资源编排、远程 migration → deploy 顺序、`secrets.required` 真实配置声明、Preview 默认拒绝、Pages adapter 退役，以及 Workers Vitest/Playwright 入口统一。

已验证：`pnpm build`（构建产物不保留 `.dev.vars`）、`pnpm typecheck`、`pnpm test`（82 tests）、`pnpm test:workers`（104 tests）、`pnpm dev` 的 API/SPA smoke、`pnpm worker:dev` 的本地 D1/R2 binding 和 Wrangler Plugin dry-run 均通过；E2E 曾有一次 68/68 全通过，后续一次为 67/68，唯一移动端板块管理用例单独重跑通过；`pnpm lint` 为 0 errors、42 条既有 warnings。

当前状态：代码实施与本地验证完成，真实 Cloudflare 环境验收待项目所有者执行。当前认证账号没有目标 D1/R2，且 Workers Builds 所需 Runtime secrets 尚未由所有者在 Worker Dashboard 配置；Agent 未获授权执行真实资源创建，因此不把未完成的真实验收描述为代码实现失败。待所有者配置 secrets 后，必须仅通过 Dashboard 的 Fork → Import repository → Save and Deploy 完成第一次成功 Workers Build，再以第二个 main commit 触发第二次 Build 验证资源复用。

## 1. 实施前置和审查门

本文件记录已执行的实施顺序和剩余真实验收门禁。用户已确认本轮修订后的规划可进入实施；代码实施与本地验证已经完成，未完成项只包括项目所有者授权后执行的真实 Cloudflare 两次 Workers Builds 验收。

实施前必须再次确认：

- `docs/PRD/v2/PRD.md` 已是仓库唯一人工审核总 PRD；不再保留旧文件名作为权威称呼。
- T03/T04/T05/T06 的交付和视觉冻结边界不被 T07 接管；T06 acceptance 的 A1、C1、C2、B2 遗留项保留原责任。
- 当前工作区已有父任务规划文档、`package.json` 等未提交修改，实施只编辑本任务明确拥有的文件，不覆盖无关改动。
- 目标账号、Workers Builds 生产分支、Cloudflare API 凭据、必需 vars/Secrets 和默认资源名称已通过安全配置提供；非交互环境缺失时直接失败。
- Cloudflare Vite Plugin 迁移实验已完成并记录“采用官方插件输出”或“功能门禁失败后采用监督器降级”结论；输出目录不同本身不构成降级理由。

## 2. 实施阶段

### 阶段 A：配置和入口实验（无生产写入）

- [ ] 新增 Module Worker 根入口候选，复用 `functions/_lib/app.ts`，先通过 `wrangler deploy --dry-run`。
- [ ] 运行时验证 `app.fetch(request, env, ctx)` 的 Env 类型和 `ExecutionContext` 兼容。
- [ ] 先不删除 Pages adapter；对比 Worker 入口与 `tests/e2e/worker.ts`，确认测试迁移路径。
- [ ] 试装/锁定与当前 Vite 兼容的 `@cloudflare/vite-plugin`，只在本地实验分支验证，不修改视觉文件。
- [ ] 验证插件 `vite dev` HMR、D1/R2 本地 binding、官方生成的 client 目录、`vite preview`、SPA fallback 和 API 同源调用；`dist/client` 等目录只要功能通过就接受。
- [ ] 仅当插件无法满足 HMR、SPA、API、D1/R2、构建或部署门禁时，才实施 Node 监督器降级方案，并固定 5173/8788 端口契约。

验证门：不连接 Cloudflare 远程、不创建资源；必须能够本地访问 `/`、`/admin`、`/api/v1/health`，否则停止进入下一阶段。

### 阶段 B：Worker Static Assets 配置

- [ ] 将 `wrangler.jsonc` 从 `pages_build_output_dir` 改为 `main` + `assets` + D1/R2 bindings。
- [ ] 明确实际 client output 与 Vite Plugin 生成配置的关系；若使用插件，检查 generated Wrangler config，不把 `./dist` 写成硬约束。
- [ ] 设置 `not_found_handling = "single-page-application"`，使用 `run_worker_first` 只让 `/api/*` 进入 Hono，按实验结果补充 `ASSETS.fetch` fallback。
- [ ] 设置 `worker/index.ts` 为唯一生产入口，更新 `Env` 类型以包含必要 Assets binding，并移除 Pages-only 注释。
- [ ] 更新 `functions/tsconfig.json` 或根 TypeScript 配置，让 Worker 入口、共享类型和业务代码都纳入 typecheck。
- [ ] 将 E2E Worker、Workers Vitest 需要的入口统一到生产 Worker adapter，不复制第二个运行时 wrapper。

验证门：`pnpm build`、`pnpm typecheck`、`pnpm exec wrangler deploy --dry-run` 和本地 SPA/API smoke 全部通过。

### 阶段 C：本地开发和资源命令

- [ ] 将 `pnpm dev` 绑定到 Cloudflare Vite Plugin 单进程方案，或实现 `scripts/dev.mjs` 监督 Vite + `wrangler dev` 的降级方案。
- [ ] 将 `pnpm vite:dev` 定义为 frontend-only，并保留只指向本地 Worker 的 proxy；明确无 Worker 时的错误。
- [ ] 将 `pnpm worker:dev` 定义为本地 Worker/D1/R2，替代 `pages:dev`/`pages:dev:local`。
- [ ] 统一 `.wrangler/state` 本地持久化路径，确保 dev、migrate、seed、clean 使用同一 state；不读取生产或 preview binding。
- [ ] 将 `scripts/seed-local.mjs` 重命名/改造为 `scripts/seed.mjs`，默认只访问 loopback，去除隐含全表 DELETE，支持固定 seed 和重复执行失败提示。
- [ ] 新增 `scripts/clean.mjs` 或等效脚本；`pnpm clean` 二次确认后同时清理本地 D1 应用数据和本地 R2 对象，确认界面逐项列出两者，保留 `d1_migrations`、schema 和数据库实例。
- [ ] 更新 `package.json` 命令名、`.dev.vars.example`、seed API base URL 和 README 本地开发段落。
- [ ] 将命令文档分为日常开发、构建部署、高级维护三层；README 主流程只突出 `db:migrate`、`dev`、`seed`、`clean`、`build`、`deploy`。

验证门：首次本地 migrate → dev → seed → 公开读取/R2 图片 → clean → 再 migrate 的循环可重复；任何本地命令访问远程都必须失败。

### 阶段 D：显式远程资源编排

- [ ] 新增资源检查/预配模块（推荐 `scripts/cloudflare-resources.mjs`），集中读取 Worker、D1、R2 的稳定名称。
- [ ] 用 `wrangler d1 list --json`/稳定数据库名查找 D1；用 `r2 bucket info`/列表核对 R2；不采用模糊前缀。
- [ ] 缺失资源只在 `pnpm deploy` 的 production 语境非交互创建；默认 Worker/D1/R2 名称分别为 `laigequnhao`、`laigequnhao-prod`、`laigequnhao-assets-prod`；已有资源复用；名称冲突、类型不符、权限不足和账号不符立即失败。
- [ ] 生成 `.wrangler/deploy/wrangler.generated.json`，将真实 D1 ID 和必要的运行时 binding 放入未跟踪临时配置；不得改写公共源配置或日志。
- [ ] 新增只读 `pnpm cloudflare:check`，不创建、不迁移、不部署；输出资源存在性、migration pending 数量和安全摘要。
- [ ] 为 Wrangler Beta draft binding 增加显式实验开关/研究记录；生产主路径不依赖该 Beta 自动处理 migration 前资源，且不要求 Workers Builds 用户手工绑定。

验证门：使用 CLI mock 或隔离测试覆盖“全存在”“D1 缺失”“R2 缺失”“同名冲突”“权限失败”“生成配置不泄密”六种路径；这些测试不能替代真实 Cloudflare 首次部署验收。

### 阶段 E：migration 和 deploy 编排

- [ ] 将 `pnpm db:migrate` 收敛为本地 binding + `--local` + 统一 `--persist-to`。
- [ ] 将 `pnpm db:migrate:remote` 收敛为稳定 production D1 名称 + `--remote` + 明确远程 guard；不允许被本地 `db:migrate` 间接触发。
- [ ] 新增 `scripts/deploy.mjs`，严格按“build 产物检查 → 账号/资源检查/预配 → generated config → remote migration → wrangler deploy”执行。
- [ ] `pnpm deploy` 不执行 build；Workers Builds 的 Build command 保持 `pnpm build`，Deploy command 设置为 `pnpm deploy`。
- [ ] `pnpm deploy` 在 Workers Builds 非交互执行：无需用户 clone 后运行本地命令、无需手工 binding，自动检查/创建/复用资源、执行 migrations 和 `wrangler deploy`。
- [ ] `pnpm release` 才执行 `pnpm build && pnpm deploy`，并区分本地人工发布与 Workers Builds 两阶段。
- [ ] migration 非零退出或 pending/版本不一致时不调用 `wrangler deploy`；deploy 失败不删除任何资源。
- [ ] 为 production/preview 配置独立 Worker 名称、D1、R2 和变量；非生产命令使用 versions upload 或显式 preview env，不运行 production migration。
- [ ] Preview 默认关闭；若启用，强制使用 `laigequnhao-preview`、`laigequnhao-preview`、`laigequnhao-assets-preview`，绝不绑定 production D1/R2。

验证门：用 fake Wrangler runner 测试执行序列；必须证明 migration 失败时 deploy 调用次数为 0，重复 deploy 不重复创建、不重复 migration、不 seed、不 clean。另设真实隔离 Cloudflare 环境验收，不得用 fake Wrangler 替代。

### 阶段 F：测试、E2E 和文档迁移

- [ ] 更新 Workers Vitest 配置和测试入口，确保真实 migration、D1、R2、compatibility flags 与生产 Worker 入口一致。
- [ ] 更新 Playwright webServer/fixtures/API helper，不再让测试默认依赖 Pages Functions；保留本地隔离 `.e2e-state`。
- [ ] 增加 Worker Static Assets smoke：根页面、SPA refresh、`/api/v1/health`、未知 API 404、R2 头像/二维码、管理员会话和上传路径。
- [ ] 增加命令安全测试：local/remote 误用阻断、clean 二次确认、seed 不清理、deploy 不 build/seed/clean、secret 不进日志。
- [ ] 将命令安全测试更新为 `clean` 二次确认，并断言同时列出本地 D1 应用数据和本地 R2 对象、保留 schema/实例/migration 元数据。
- [ ] 更新 README、部署 runbook、Workers Builds Dashboard 设置、资源清单、vars/Secrets/管理员初始化清单、preview 分支策略、迁移/备份/回滚和故障排查。
- [ ] 明确首次部署七项 post-deploy smoke：health、SPA/深链、公开数据、点赞/二维码等公开交互、管理员认证、管理员业务、R2 资源；Turnstile 投稿 A1 单独报告，不用基础部署成功替代。
- [ ] 由项目所有者准备真实全新或隔离 Cloudflare 环境并在 Dashboard 配置 Runtime secrets，记录第一次成功 Workers Build 的资源创建/migration/deploy 证据；提交第二个 main commit 后再次由 Dashboard 触发 Build，记录相同资源复用和新增 migration 证据。该项不能由 fake Wrangler 或本地 clone、两次本地 `pnpm deploy` 流程替代。
- [ ] 全局搜索并清理 Pages 命令、`pages_build_output_dir`、`localhost:8788` 的不当生产/开发引用和 stale `pnpm pages:deploy` 文档。

验证门：所有项目质量门禁和本任务 smoke 通过；`pnpm lint` 为 0 errors 且不新增 warnings，不要求 T07 清理既有 42 个历史 warnings；视觉基线对照无设计、布局、组件样式或交互变化。

### 阶段 G：切换和退役

- [ ] 在真实全新或隔离 Cloudflare 账号/资源命名空间中运行 `pnpm cloudflare:check`，确认 Worker、D1、R2、Secrets 和 migration 版本。
- [ ] 仅由项目所有者通过 Fork → Import repository → Save and Deploy 完成首次发布；Workers Builds 在远程环境执行 `pnpm build` → `pnpm deploy`，保存资源创建、migration、部署 URL 和七项 smoke 证据；Agent 不执行 clone、本地发布或手工 binding。
- [ ] 提交第二个 main commit 触发 Workers Builds，验证复用同一 Worker/D1/R2，只有未应用 migration 执行。
- [ ] 验证非生产分支默认关闭；若显式启用则只发布隔离 preview Worker，不迁移 production、不写入 production seed。
- [ ] Worker 真实连接通过后删除/退役 Pages 命令和 Pages adapter；不自动删除旧 Pages 项目，保留人工回滚说明。
- [ ] 更新父任务 `lgqh-v2` 的 T07 子任务引用、依赖关系和旧 Pages 文字，确保父子规划不再冲突。

## 3. 计划修改文件和所有权

### 3.1 预期新增

- `worker/index.ts`：生产 Module Worker 根入口。
- `scripts/deploy.mjs`：Workers Builds deploy orchestrator。
- `scripts/cloudflare-resources.mjs`：只读检查、资源复用/预配和 generated config。
- `scripts/clean.mjs`：本地 D1/R2 确认式 clean。
- `scripts/dev.mjs`：仅在 Vite Plugin 方案失败时新增的本地监督器。
- 与 scripts/Worker 适配对应的单元测试、命令 smoke fixture 和 runbook/资源清单。

### 3.2 预期修改

- `package.json`、`pnpm-lock.yaml`：依赖和最终命令矩阵。
- `scripts/build.mjs`：Workers Builds/本地构建入口，清理插件生成的本地 `.dev.vars` 构建副本。
- `wrangler.jsonc`：Worker/Assets/D1/R2/env 配置。
- `vite.config.ts`：Cloudflare Vite Plugin 或明确 fallback proxy 配置。
- `functions/_lib/env.ts`、`functions/_lib/app.ts`、R2 adapter：仅必要的运行时类型/同源 URL 适配。
- `scripts/seed-local.mjs` 或迁移后的 `scripts/seed.mjs`、`.dev.vars.example`。
- `functions/tsconfig.json`、根 TypeScript 配置、`tests/e2e/worker.ts`、`scripts/start-e2e-api.mjs`、Vitest/Playwright 配置。
- `README.md`、`TESTING.md`、新增部署 runbook/资源清单/Secrets 清单。

### 3.3 明确不应写入

- `src/components/**`、`src/views/**`、`src/styles/**`、`prototype/**` 的视觉实现文件。
- 已有 migration 文件；新 migration 只有在本任务发现 Worker 迁移确需配置/兼容字段时才另行评审。
- 生产 Secret、D1 UUID、账户 ID、Cookie、Token、真实用户数据和旧 Pages 项目删除操作。
- 其他 Trellis 任务归档目录和用户未授权的父任务历史工件。

## 4. 验证命令矩阵

### 4.1 静态质量

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
```

### 4.2 业务和运行时

```bash
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm db:migrate
pnpm worker:dev
pnpm cloudflare:check
```

实际端口、环境变量和数据库 state 由最终命令实现记录；测试命令不能连接 production。

### 4.3 Worker/Assets smoke

至少验证：

```text
GET /
GET /admin
GET /api/v1/health
GET /api/v1/groups
GET /api/v1/assets/<known-key>
POST /api/v1/admin/assets
POST /api/v1/admin/session
GET /unknown-spa-route
GET /api/unknown
```

应分别得到 SPA shell、API JSON、R2 object/404、认证/上传结果、SPA fallback 和 API 404；不能以页面能打开替代 API/R2 证据。

## 5. 风险、回滚点和停止条件

| 风险 | 停止条件 | 回滚/替代 |
|---|---|---|
| Vite Plugin 无法通过 HMR、SPA、API、D1/R2、构建或部署门禁 | 功能实验失败 | Node 监督器 + Vite proxy + `wrangler dev`；仅输出目录不同不触发降级 |
| Wrangler 自动预配 Beta 行为与 migration 顺序冲突 | 无法在无远程写入实验中证明 | 显式 `d1 list/create` + `r2 info/create` + generated config |
| D1/R2 同名资源归属不明 | ID、账号或类型不一致 | 立即停止，不改名、不创建第二资源 |
| `pnpm deploy` 迁移失败 | migration 非零退出/版本冲突 | 不 deploy；保留 D1 migration 元数据，按 runbook 修复 |
| Worker deploy 失败 | 上传/绑定/构建失败 | 不删资源，回退上一 Worker version；必要时人工恢复 D1 |
| SPA fallback 截获 API 或 API 返回 HTML | Worker/Assets smoke 失败 | 调整 `run_worker_first`/入口分流并重测 |
| R2 同源 URL/上传读取失败 | R2 smoke 或 E2E 失败 | 保留可选 `R2_PUBLIC_BASE_URL`，不改 R2 生命周期 |
| 需要改视觉层才能通过 | 触及冻结文件/视觉行为 | 停止，记录问题并请求用户重新确认 |
| 生产 Secret 出现在仓库、日志或证据 | 任意泄露 | 停止发布，撤换凭据并清理证据 |

## 6. 交付物

- 单一 Worker/Assets 配置与入口迁移。
- 最终 `pnpm` 命令矩阵、命令 guard 和本地持久化策略。
- D1/R2 资源 check/provision/reuse 编排和 generated binding 配置。
- migration、seed、clean 的本地/远程隔离及测试证据。
- Workers Builds 首次/后续部署配置、preview 分支策略、runbook、资源和 Secrets 清单。
- Worker/Assets、D1、R2、SPA、API、上传和回归测试报告。
- T06 遗留阻塞项不被 T07 误报为已解决；真实投稿仍按 A1 结论记录。
