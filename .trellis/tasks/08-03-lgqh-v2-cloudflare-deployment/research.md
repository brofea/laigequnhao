# T07 Cloudflare 部署架构迁移事实与能力审计

## 1. 审计范围与结论口径

本报告只记录仓库事实、官方文档已确认能力和本地最小实验结果。旧子任务 PRD、旧编号任务和父任务中尚未落地的 T07 文字只作为历史线索，不覆盖本任务的产品边界。

审计开始时用户指定的唯一人工审核总 PRD 路径是 `docs/PRD/v2/PRD.md`，仓库实际文件曾使用错误文件名。在进入实施前已将文件更正为 `docs/PRD/v2/PRD.md`，并更新当前任务、父任务和源 PRD 内的引用；后续不再保留两套权威称呼。

## 2. 仓库当前事实

### 2.1 运行时和入口

- 当前产品是 Cloudflare Pages：`wrangler.jsonc` 使用 `pages_build_output_dir: "./dist"`，没有 `main`、`assets` 或独立 Worker 根入口。
- `functions/api/[[route]].ts` 只有 Pages `onRequest` 适配器，转发到 `functions/_lib/app.ts` 的 Hono 默认实例。
- `functions/_lib/app.ts` 已包含全部 Hono 路由、D1/R2 业务和 `/api/v1/assets/*` R2 读取路由；这部分可以复用，不应因为运行时迁移而重写业务层。
- `tests/e2e/worker.ts` 已有 Module Worker 形状的 `default.fetch` 包装器，但它属于 E2E 测试入口，不是生产入口。
- `pnpm build` 当前只产出 Vue 静态资源到 `dist/`，没有 Worker bundle 或生成的 Worker 配置。

### 2.2 Vite 和本地开发

- `vite.config.ts` 当前注册 Vue 插件、Vite `/api` 到 `http://localhost:8788` 的 proxy，以及直接读取 `.wrangler/state` 的本地 R2 文件中间件。
- 当前没有 `@cloudflare/vite-plugin` 依赖。
- 当前默认 `pnpm dev` 只启动 Vite；Pages Functions 需要另一个 `wrangler pages dev` 命令。

### 2.3 Wrangler 和资源配置

- 本地/顶层 D1 为 `lgqh-dev`，当前配置写死账号相关 database UUID；preview 复用同一个远程 D1/R2；production D1 的 `database_id` 是占位符 `production`。
- production R2 名称是 `laigequnhao-assets-prod`，但仓库没有可靠的创建、存在性核对或绑定生成脚本。
- `wrangler.toml` 不存在；唯一生产配置文件是 `wrangler.jsonc`。
- 审计起始时 `pnpm exec wrangler` 为 `4.114.0`；Cloudflare Vite Plugin 1.50.0 的真实构建门禁要求 `^4.118.0`，已升级并验证 `4.118.0`。

### 2.4 命令、迁移、seed 和 clean

- `package.json` 仍有 `pages:dev`、`pages:dev:local`、含义混淆的 `db:migrate`、`db:migrate:local`、`db:migrate:preview`、`db:migrate:prod`。
- 工作区当前差异已移除旧的 `pages:deploy` 命令，但 README 仍引用 `pnpm pages:deploy`，文档与命令已不一致。
- `scripts/seed-local.mjs` 依赖 `localhost:8788` Pages API，先下载外部图片并通过 API 上传本地 R2，再生成 `seed-local.sql`。生成 SQL 会删除业务表数据和 `rate_limits` 后再插入随机数据；因此当前 seed 隐含 destructive clean，且 R2 对象清理不与 SQL 删除绑定。
- 仓库没有独立的 `scripts/clean` 或本地 clean 命令。`db:test:reset` 只供测试且通过 DROP 表破坏 migration 结构，不可作为开发 clean 命令。
- 当前迁移为 `migrations/0001_initial.sql` 至 `0004_board_management.sql`，D1 migration 元数据由 Wrangler 维护；T06 证据已覆盖空库、升级、重复执行、中断恢复和回滚演练。

### 2.5 测试与 CI

- Vitest 使用 jsdom；Workers Vitest 使用 `@cloudflare/vitest-pool-workers`、`wrangler.test.jsonc`、隔离本地 D1/R2 和 `readD1Migrations`。
- Playwright 启动 `scripts/start-e2e-api.mjs`，用 `wrangler dev tests/e2e/worker.ts` 在 8788 提供 API，再用 `pnpm dev` 在 5173 提供前端。
- E2E 用例中仍有硬编码 `http://localhost:8788/api/v1` 的直接 API 地址，需要在迁移中统一为同源或测试 helper 配置。
- 仓库没有 `.github/workflows` 或其他 CI 配置；Workers Builds 的构建触发和分支设置属于 Cloudflare Dashboard 外部配置，本任务必须在 README/runbook 中给出明确值。

## 3. 官方能力核对

### 3.1 Workers Builds

官方文档确认 Workers Builds 对每次提交执行 Build command，再执行 Deploy command；非生产分支默认使用 `wrangler versions upload` 生成 preview version。Deploy command 可以配置为 `pnpm deploy`，并使用仓库 `package.json` 中的 Wrangler 版本。

来源：

- <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>

结论：目标的 `pnpm build` + `pnpm deploy` 形状可行；生产分支应显式绑定 `main`，非生产分支不能默认执行生产迁移和生产 deploy。

### 3.2 Workers Static Assets 和 SPA

官方文档确认独立 Worker 可以使用 `main` 加 `assets.directory`，静态资源与 Worker 一次部署；`assets.not_found_handling = "single-page-application"` 可将未匹配静态路径回退到 `index.html`；`run_worker_first` 可以按 `/api/*` 选择性让 Worker 先处理请求。

来源：

- <https://developers.cloudflare.com/workers/static-assets/>
- <https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/>

结论：`/api/*` 与静态资源可以由同一个 Worker + Assets 配置承载；SPA fallback 和 R2 API 路由必须在本地 Worker runtime 与部署 smoke 中验证，不能只看配置字符串。

### 3.3 Wrangler 自动资源预配

官方 Wrangler 配置文档和 2025-10-24 changelog 均确认：D1、R2 等无资源 ID 的 draft binding 可以触发自动预配；但能力仍标记为 Beta。官方还明确指出：从 Dashboard/GitHub 部署时，资源会创建，但生成的资源 ID 只在 Dashboard 可见，不会回写仓库。

来源：

- <https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning>
- <https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/>

结论：无 ID draft binding 的配置解析可行，但不能把 Beta 预配当成生产迁移前置的稳定契约，也不能依赖它把 ID 写回公共仓库。生产 `pnpm deploy` 应提供显式、幂等、可审计的资源核对/创建降级方案；Beta 只作为可选实验路径。

### 3.4 D1 migrations

官方确认 migrations 按文件版本顺序应用，已应用版本记录在 D1 的 `d1_migrations` 表中；`wrangler d1 migrations apply` 只应用未完成的迁移，失败迁移会回滚并保留此前成功版本。官方建议 migration 使用稳定的数据库名称而不是易变化的 binding 名称。

来源：

- <https://developers.cloudflare.com/d1/reference/migrations/>
- <https://developers.cloudflare.com/d1/wrangler-commands/>

结论：部署编排可以在资源存在性确认后执行远程 migration，失败即停止后续 `wrangler deploy`。migration 失败不应触发 Worker 发布；代码必须保持新增 schema 的兼容窗口。

### 3.5 R2 资源

官方确认 R2 bucket 需要显式创建或通过 Wrangler 资源管理，绑定使用 bucket name；`r2 bucket list` / `r2 bucket info` 可用于核对，创建命令支持 `--update-config` 和 `--binding`。

来源：

- <https://developers.cloudflare.com/r2/reference/wrangler-commands/>
- <https://developers.cloudflare.com/r2/get-started/workers-api/>

结论：可以实现按确定名称检查、缺失才创建、名称冲突或权限失败即停止的显式流程；不提供远程 clean 或删除流程。

### 3.6 Cloudflare Vite Plugin

官方确认 `@cloudflare/vite-plugin` 已 GA，能让 `vite dev` 在 workerd 中运行 Worker 并保留 Vite HMR；Vue 官方 Workers guide 也采用该插件。插件会在 build 输出中生成 Worker 配置和 client 资源目录，输入配置不必写死 `assets.directory`，其生成目录可能是 `dist/client` 等官方约定结构。

来源：

- <https://developers.cloudflare.com/workers/vite-plugin/>
- <https://developers.cloudflare.com/workers/framework-guides/web-apps/vue/>
- <https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/>

结论：插件是 `pnpm dev`、`pnpm build`、`pnpm deploy` 单一工作流的首选方案。`dist/client` 等官方输出目录本身不是降级理由；只有插件在真实仓库中无法同时满足 HMR、SPA、API、D1/R2、构建和部署验收时，才允许采用“Node 监督器 + Vite proxy + wrangler dev”的降级方案。

### 3.7 Workers Builds 配置与 Runtime secrets

官方 Workers Builds 文档确认 Build variables/secrets 只对构建过程可见，不会自动成为 Worker Runtime variables；运行时 vars/secrets 应在 Worker **Settings → Variables and Secrets** 配置。官方 Secrets 文档同时确认，在 Wrangler 配置声明 `secrets.required` 后，`wrangler deploy` 和 `wrangler versions upload` 会在 Worker 缺少必需 secret 时失败。

来源：

- <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- <https://developers.cloudflare.com/workers/configuration/secrets/>

结论：`ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY` 的真实配置由项目所有者在 Dashboard 提供，仓库只声明名称；不需要也不应维护 `CF_SECRETS_CONFIGURED`。`CF_DEPLOY_ENV` 不是 Worker 运行时配置，不写入 `wrangler.jsonc`；Production/Preview 应由 Workers Builds 分支命令及 Wrangler `--env` 配置控制。Build API token 是 Dashboard 构建凭据，不属于项目 Build secret；其权限必须覆盖 Worker、D1 和 R2 的实际操作。

## 4. 本地最小实验

### 实验 A：当前 Pages 配置不能直接用 Workers deploy

命令：

```bash
pnpm exec wrangler deploy --dry-run --config wrangler.jsonc --outdir .trellis/tasks/08-03-lgqh-v2-cloudflare-deployment/research/current-pages-dry-run
```

结果：Wrangler 4.114.0 报错：`It looks like you've run a Workers-specific command in a Pages project. For Pages, please run wrangler pages deploy instead.`

判定：确认当前仓库配置仍是 Pages 目标；不能把 Pages Functions 直接描述为独立 Worker。

### 实验 B：现有 Pages adapter 不能直接作为 Module Worker

用 draft config 指向 `functions/api/[[route]].ts` 运行 `wrangler deploy --dry-run` 时，Wrangler 报告该入口没有 default export，并按 Service Worker 格式构建，随后因 Node 外部导入失败。

判定：必须新增真正的 Module Worker 根入口；不能仅把 `pages_build_output_dir` 替换成 `assets.directory` 而保留 Pages `onRequest` 入口。

### 实验 C：draft D1/R2 binding 可被 Wrangler dry-run 解析

使用独立 draft config，配置 `main` 指向现有 Module Worker 形状的 E2E wrapper，仅声明：

```jsonc
"d1_databases": [{ "binding": "DB" }],
"r2_buckets": [{ "binding": "R2" }]
```

命令：

```bash
pnpm exec wrangler deploy --dry-run \
  --config .trellis/tasks/08-03-lgqh-v2-cloudflare-deployment/research/wrangler-provision-draft.jsonc \
  --outdir .trellis/tasks/08-03-lgqh-v2-cloudflare-deployment/research/provision-dry-run
```

结果：成功 bundle，输出 `env.DB D1 Database` 和 `env.R2 R2 Bucket`，并因 `--dry-run` 正常退出；没有连接远程账号，也没有证明资源会被创建。

判定：当前 Wrangler CLI 能解析 draft bindings；官方 Beta 预配的真实创建、Dashboard/GitHub 资源绑定和迁移前顺序仍不能由该实验保证。

### 实验 D：当前构建基线

命令：

```bash
pnpm build
pnpm lint
pnpm typecheck
```

结果：build、typecheck 成功；lint 0 errors、42 warnings。build 只输出 `dist/index.html`、JS/CSS 和 favicon，没有 Worker bundle。

### 实验 E：Cloudflare Vite Plugin 官方输出

安装 `@cloudflare/vite-plugin@1.50.0` 后，首次用 Wrangler 4.114.0 构建会因 peer 版本门禁失败；升级到 Wrangler 4.118.0 后执行：

```bash
pnpm build
pnpm exec wrangler deploy --dry-run \
  --config dist/laigequnhao/wrangler.json \
  --outdir .trellis/tasks/08-03-lgqh-v2-cloudflare-deployment/research/plugin-dry-run
```

结果：构建成功，生成 `dist/client/index.html`、静态 assets、Worker bundle 和 `dist/laigequnhao/wrangler.json`；生成配置的 `assets.directory` 为 `../client`，对应实际 `dist/client`。Wrangler dry-run 成功识别 `env.DB`、`env.R2` 和 `env.ASSETS`，没有远程写入。

判定：官方 Vite Plugin 的 `dist/client` 输出满足目标目录语义；目录变化不是降级理由。后续 `pnpm deploy` 必须消费插件生成配置或等价的实际 client output，不得硬编码 `./dist`。

### 实验 F：实施后的本地运行与部署安全门

实施后实际验证：

- `pnpm dev` 使用 Cloudflare Vite Plugin 单进程启动；`/api/v1/health` 返回 200，`/admin` 和未知 SPA 路径返回 HTML，未知 `/api/*` 返回 404 JSON/文本，不连接远程资源。
- `pnpm worker:dev` 仅启动 Worker，并显示本地 D1/R2/Assets bindings；它不负责静态前端页面，页面由 `pnpm dev` 提供。
- `pnpm exec wrangler deploy --dry-run --config dist/laigequnhao/wrangler.json` 成功读取 `dist/client`，识别 `env.DB`、`env.R2` 和 `env.ASSETS`，没有远程写入。
- `pnpm build` 结束后会移除 Cloudflare Vite Plugin 为本地 preview 生成的 `dist/<worker>/.dev.vars`；构建产物不保留本地 Runtime secret 文件。
- `pnpm cloudflare:check` 在当前认证账号中发现目标 D1/R2 尚不存在并明确报告 `No resources were created`；`pnpm db:migrate:remote` 未带确认参数时会在远程写入前失败。当前没有执行 `pnpm deploy`，因为它是会创建/复用远程资源并执行远程 migration 的 Workers Builds Deploy command。
- `pnpm test`：82 tests；`pnpm test:workers`：104 tests；`pnpm test:e2e` 曾完整通过 68/68，后续一次运行有 1 个移动端既有板块 UI 用例偶发超时（67/68），该用例单独重跑通过。

### 真实 Cloudflare 首次部署验收状态

该验收不能用上述 fake/dry-run 结果替代。当前环境虽已通过 Wrangler OAuth 认证，但目标 D1/R2 列表为空，且 Workers Builds 所需的四个 Runtime secrets 尚未由项目所有者在 Worker Dashboard 配置。Agent 未获授权在生产/隔离 Cloudflare 环境执行资源创建，因此没有伪造“首次资源创建/上线/二次复用”结论，也不把未执行真实验收描述为代码实现失败。当前代码和部署脚本状态为“代码实施与本地验证完成，真实 Cloudflare 环境验收待所有者执行”。

待实际执行的唯一验收记录必须包含：项目所有者在 Dashboard 完成 Runtime secrets 配置后，通过 Fork → Import repository → Save and Deploy 触发第一次成功的 Workers Build，由远程 `pnpm build` → `pnpm deploy` 完成资源创建、四条 migrations 和七项 post-deploy smoke；第二个 main commit 再由 Dashboard 触发第二次 Workers Build，记录相同 Worker/D1/R2 名称复用及仅执行新增 migration。若要在当前账号执行，需先由部署者确认隔离资源命名和 Secrets 配置，不能把本地默认值当作生产凭据，也不能用本地两次 `pnpm deploy` 替代。

## 5. 规划影响

1. 生产迁移必须先显式确认/预配 D1/R2，再执行 migration，再执行 `wrangler deploy`；不得把资源自动预配寄托在最后一步 `wrangler deploy`。
2. 源码不提交部署者专属 D1 UUID；由确定性资源名、生成配置或 Workers Builds 绑定完成运行时绑定。
3. Preview 分支必须使用独立 preview D1/R2 或只上传 preview version；不得调用生产 migration。
4. 当前 Hono 路由、service、repository、Contract 和业务测试复用；迁移边界只增加 Worker adapter、Assets 路由、配置、命令、安全 guard 和测试。
5. T07 的实施前置已完成权威 PRD 文件名统一；后续不得重新引入旧 Pages 生产目标。
6. Wrangler 版本门禁已从 4.114.0 更新为插件要求的 4.118.0；实施时应锁定当前兼容版本，不能回退到 4.114.0。
