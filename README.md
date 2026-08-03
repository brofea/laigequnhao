<div align="center">
    <!--icon 待添加-->
    <h1>来个群号</h1>
    <p>为高校或大型企业等团体提供群聊发现导航网站。</p>
    <p>一个群号，连接彼此。</p>
    <p>
        <a href="https://www.gnu.org/licenses/gpl-3.0.en.html">
            <img src="https://img.shields.io/badge/license-GPL--3.0-green" />
        </a>
        <a href="https://github.com/brofea">
            <img src="https://img.shields.io/badge/brofea-brofea?label=GitHub&logo=github&color=purple" alt="GitHub Profile">
        </a>
    </p>
</div>

<div align="center">
    <img width="2800" alt="image" src="https://github.com/user-attachments/assets/e8594c6e-aa86-4ca3-94ec-396a4011856f" />
</div>

在大学、企业和社区中，新成员想要快速找到适合自己的群组资源，老成员希望发掘更多有价值的社群并分享给更多人。

但现实中的群聊入口往往分散在聊天记录、朋友圈、公告栏或私下传播中，缺少统一的发现渠道。

本项目希望建立一个公开、易维护、易部署的群组导航页面，让用户能够方便地浏览、搜索和加入感兴趣的群组，同时帮助组织者更高效地管理和运营社区资源。

## 技术栈

| 层     | 技术                                                              |
| ------ | ----------------------------------------------------------------- |
| 前端   | Vue 3 + Vite + TypeScript (strict) + Composition API + Vue Router |
| 样式   | Tailwind CSS + CSS 自定义属性                                     |
| 后端   | Cloudflare Workers + Hono + Workers Static Assets                 |
| 数据库 | Cloudflare D1 (SQLite)                                            |
| 存储   | Cloudflare R2 (图片)                                              |
| 安全   | 管理员 HMAC 会话 + CSRF 保护 + Turnstile                          |
| 测试   | Vitest + Vue Test Utils + Workers Vitest + Playwright             |
| 构建   | pnpm + ESLint + Prettier + vue-tsc                                |

## 项目结构

```
├── src/                    # Vue 前端应用
│   ├── app/                # App.vue, main.ts, router.ts
│   ├── features/           # 功能模块
│   │   ├── admin/          # 管理端 (认证/群聊管理/仪表盘/图片上传)
│   │   └── groups/         # 公开端 (首页/卡片/搜索/提交/点赞)
│   ├── shared/             # 前端共享 (API client/storage/组件)
│   └── views/              # 路由视图
├── worker/                 # Cloudflare Workers Module Worker 根入口
│   └── index.ts            # Hono fetch handler
├── functions/_lib/         # 复用的 Hono 应用 + routes/repositories/services/adapters
├── shared/                 # 前后端共享 (Zod 契约 + 领域类型)
├── migrations/             # D1 数据库迁移
├── tests/
│   ├── workers/            # Workers Vitest 集成测试
│   └── e2e/                # Playwright E2E 测试
├── site.config.ts          # 机构配置 (主题/平台/功能开关)
├── wrangler.jsonc          # Cloudflare Wrangler / Vite Plugin 输入配置
└── .dev.vars.example       # 本地 secrets 模板
```

## 前置要求

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9 （`corepack enable pnpm`）
- [Cloudflare](https://dash.cloudflare.com/)（部署时）
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npx wrangler`）

## 快速开始

日常开发只需要一个终端和一个主要地址：Cloudflare Vite Plugin 在 Vite HMR 中运行 Worker，并使用本地 D1/R2。

### 1. 克隆并安装依赖

```bash
git clone git@github.com:brofea/laigequnhao.git
cd laigequnhao
pnpm install
```

### 2. 配置环境变量

```bash
# 复制模板文件
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，修改 ADMIN_PASSWORD 为你自己的密码
```

`.dev.vars` 不会提交到 Git（已在 `.gitignore` 中）。

### 3. 初始化本地数据库

```bash
pnpm db:migrate
```

### 4. 启动全栈开发

```bash
pnpm dev
```

访问 http://localhost:5173。需要开发数据时运行 `pnpm seed`；该命令只写本地 D1/R2，重复执行前会拒绝非空数据库，不会隐式清理。

`pnpm seed` 默认访问 `pnpm dev` 的 `5173` 单地址；若只启动 `pnpm worker:dev`，请先设置
`SEED_API_BASE=http://127.0.0.1:8788/api/v1`。

如需清理本地数据，运行 `pnpm clean` 并完成二次确认。它会清理本地 D1 应用数据和本地 R2 对象，但保留 schema、数据库实例和 `d1_migrations`。

纯前端调试使用 `pnpm vite:dev`；只调试本地 Worker 使用 `pnpm worker:dev`。这两个命令都不会连接生产资源。

### 资源清理维护

`POST /api/v1/admin/assets/cleanup` 会清理超过 30 分钟、仍未被群组引用的 staged
资源，并重试 `delete_pending`、`delete_failed` 记录。该接口要求有效管理员会话和
CSRF token。

当前版本没有部署 Cron 或其他定时调度；这是管理员按需调用的人工维护入口。若后续接入
Cloudflare Cron，应继续复用同一清理服务，并保留 D1/R2 失败可重试和实际成功计数语义。

## 使用 Cloudflare Workers Builds 部署

真实 Cloudflare 验收由项目所有者在 Cloudflare Dashboard 完成；Agent 不替代所有者访问生产账号，也不要求用户 clone 仓库后本地运行 `pnpm deploy`。`pnpm deploy` 只是 Workers Builds 远程构建环境中的 Deploy command。

### Dashboard 首次部署清单

按以下顺序操作：

1. Fork 本仓库。
2. 打开 Cloudflare **Workers & Pages** → **Create application** → **Get started / Import a repository**。
3. 连接 GitHub，选择 Fork 后的仓库；Worker 名称使用 `laigequnhao`，必须与仓库 Wrangler 配置的稳定名称一致。
4. Build settings 设置：Root directory 为仓库根目录；Build command 为 `pnpm build`；Deploy command 为 `pnpm deploy`；Production branch 为 `main`。
5. Preview 策略设置为关闭非生产部署。若 Dashboard 必须填写 Non-production branch deploy command，使用
   `node -e "console.error('Preview deployments are disabled'); process.exit(1)"`；若确实启用 Preview，则必须另行使用 `laigequnhao-preview`、独立 D1 和独立 R2，不能复用生产资源。
6. 构建认证使用 Workers Builds 的 API token。自动生成的 token 若没有 D1 edit 权限，改用/创建至少拥有 Workers Scripts edit、D1 edit、R2 edit 的账号 token；它是 Dashboard 的 Build setting，不是项目 Build secret。项目没有必填的 Build variable 或 Build secret；可选的 `NODE_VERSION=22` 仅用于固定构建镜像版本，不要在 Build variables/secrets 中填写运行时密码。
7. 选择 **Save and Deploy**，让 Workers Builds 远程执行 `pnpm build` → `pnpm deploy`。不得在本地执行 `pnpm deploy` 来代替这一步。
8. 在首次成功部署前配置下表中的 Production Runtime secrets。若首次向导没有在 **Save and Deploy** 前展示该页面，先通过 Dashboard 建立 Worker，再进入 **Settings → Variables and Secrets** 添加 secrets，点击 **Deploy**，然后在 Dashboard **Retry build** 或再次触发该仓库构建；这仍是后台操作，不需要 clone 或本地命令。缺少必需 secret 的构建不计入真实验收。
9. 完成 Runtime secrets 配置并成功发布后，执行七项 post-deploy smoke。缺少任一必需 Runtime secret 时，只能记录为“代码与资源编排已就绪，生产业务部署未通过”。

Workers Builds 的远程 `pnpm deploy` 会按确定性默认名称检查或创建/复用 Worker `laigequnhao`、D1 `laigequnhao-prod` 和 R2 `laigequnhao-assets-prod`，执行未应用 migrations，再发布 Worker 与 Vite Plugin 生成的静态资源。资源 binding 不要求用户手工创建或绑定。

首次真实验收必须由项目所有者在 Cloudflare 后台连续完成两次成功的 Workers Builds：第一次验证资源创建、全部 migrations 和上线；第二次由第二个 main commit 触发，验证复用同一个 Worker/D1/R2 且只执行新增 migration。这里的“触发”是 Dashboard 连接的仓库构建；`pnpm deploy` 只在远程 Workers Builds 环境中作为 Deploy command 执行，不是让用户本地运行两次 `pnpm deploy`。

如果启用管理分析，另行配置可选的 Runtime secret `ANALYTICS_TOKEN`。`R2_PUBLIC_BASE_URL` 是可选 Runtime variable；未配置时使用同源 Worker 资源 URL。Preview 默认关闭；启用时必须配置独立 preview Worker、D1 和 R2，不得绑定生产资源。

部署后必须验证 health、SPA 深链、公开数据、点赞/二维码等公开交互、管理员登录/CSRF、管理员业务和 R2 上传/读取/清理七项能力。Turnstile 投稿仍需使用生产站点配置单独验收，不能用 Worker 上线代替。

### 首次部署后的管理员初始化

- `ADMIN_PASSWORD` 就是首个管理员凭据；本项目没有额外的管理员 SQL/seed 初始化步骤。
- 首次登录 `/admin/login`，验证会话、CSRF、群组/板块管理和资源上传。
- `ADMIN_PASSWORD` 必须由项目所有者设置；`SESSION_SECRET` 和 `LIKE_PEPPER` 可以在密码管理器中随机生成；`TURNSTILE_SECRET_KEY` 必须来自生产 Turnstile 站点，不能由本项目生成。它们只放 Worker Runtime secrets，不写入仓库、Build secrets 或普通 vars。
- 真实投稿还必须用生产 Turnstile 配置单独验证；缺少该 Secret 时，不能宣称投稿功能已完成。

## 可用命令

### 日常开发

| 命令              | 说明                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| `pnpm db:migrate` | 只对统一本地 D1 state 应用未完成 migrations                                 |
| `pnpm dev`        | 启动 Vite HMR、Worker、本地 D1/R2                                           |
| `pnpm seed`       | 只写本地开发数据和本地 R2；非空数据库默认拒绝                               |
| `pnpm clean`      | 二次确认后清理本地 D1 应用数据和 R2 对象，保留 schema/实例/migration 元数据 |

### 构建部署

| 命令          | 说明                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm build`  | 类型检查并生成 Vite Plugin Worker/Static Assets 产物，不访问远程资源                                  |
| `pnpm deploy` | Workers Builds Deploy command：检查/复用资源、远程 migrations、Worker deploy，不重复 build/seed/clean |

### 高级维护

| 命令                                                                   | 说明                                               |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| `pnpm vite:dev`                                                        | 纯前端调试，不自动连接远程 API                     |
| `pnpm worker:dev`                                                      | 只启动本地 Worker/D1/R2                            |
| `pnpm db:migrate:remote -- --confirm-production`                       | 显式执行生产 D1 未完成 migrations                  |
| `pnpm release`                                                         | 本地人工 `build` → `deploy`                        |
| `pnpm cloudflare:check`                                                | 只读检查生产资源，不创建、不迁移、不部署           |
| `pnpm lint`                                                            | 0 errors 且不新增 warnings；历史 warnings 单独记录 |
| `pnpm typecheck` / `pnpm test` / `pnpm test:workers` / `pnpm test:e2e` | 质量门禁                                           |

首次运行 E2E 前执行 `pnpm exec playwright install chromium`。E2E 会重建工作区内的
`.e2e-state/`，启动本地模拟 D1/R2 和隔离的无头 Chromium，不连接 `lgqh-dev`，也不使用
个人浏览器会话。

## 配置分类

| 名称 | 类型 | 来源/用途 | 首次生产是否必填 |
| --- | --- | --- | --- |
| `pnpm build` / `pnpm deploy` | Build settings | Workers Builds Dashboard 的命令 | ✅ |
| `main` | Build setting | Workers Builds Production branch | ✅ |
| Workers Builds API token | Build setting credential（非 Build secret） | 需能执行 Worker、D1、R2 操作；由 Dashboard 管理 | ✅ |
| `NODE_VERSION=22` | Build variable（可选） | 仅固定构建镜像版本；当前不是必需项 | ❌ |
| 无 | Build secret | 本项目不读取 Build secret；不要把 Runtime secret 填在这里 | ❌ |
| `ADMIN_PASSWORD` | Runtime secret | 管理员首个登录凭据，由所有者填写 | ✅ |
| `SESSION_SECRET` | Runtime secret | 会话签名，可安全随机生成 | ✅ |
| `LIKE_PEPPER` | Runtime secret | 匿名点赞设备 hash，可安全随机生成 | ✅ |
| `TURNSTILE_SECRET_KEY` | Runtime secret | 生产 Turnstile Secret，由 Cloudflare Turnstile 提供 | ✅ |
| `ANALYTICS_TOKEN` | Runtime secret | 管理分析；未配置时分析面板不可用 | ❌ |
| `ENVIRONMENT` | Runtime variable | `wrangler.jsonc`/generated config 固定为 `production` | ✅（由配置提供） |
| `SKIP_TURNSTILE` | Runtime variable | 生产配置为 `false`，本地配置为 `true` | ✅（由配置提供） |
| `SECURE_COOKIE` | Runtime variable | 生产配置为 `true` | ✅（由配置提供） |
| `R2_PUBLIC_BASE_URL` | Runtime variable（可选） | 自定义资源域名；默认同源 URL | ❌ |
| `DB` / `R2` / `ASSETS` | Runtime binding | `pnpm deploy` 检查/生成，不手工绑定 | ✅（自动提供） |
| `CF_WORKER_NAME` / `CF_D1_NAME` / `CF_R2_NAME` | `pnpm deploy` 高级脚本输入（可选） | 仅覆盖确定性资源名，不注入 Worker；普通用户不需要设置 | ❌ |

`CF_DEPLOY_ENV` 和 `CF_SECRETS_CONFIGURED` 均不是本项目配置项，已删除。`CF_DEPLOY_ENV` 不应写入
`wrangler.jsonc`：它是部署控制信号而非 Worker Runtime variable，Preview 应由 Workers
Builds 的分支和 Non-production branch deploy command 控制。后者只是自定义声明，不能证明
Dashboard Runtime secrets 真的存在；真正的必需 Secret 由 `wrangler.jsonc` 的
`secrets.required` 声明，`wrangler deploy` 会在 Worker 缺少这些 secret 时失败，并由项目所有者在 **Settings → Variables and Secrets** 提供。Workers Builds 的 Build variables/secrets 只对构建过程可见，不能代替 Runtime variables/secrets。

Dashboard 字段和执行顺序以 [Workers Builds 配置文档](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Workers Builds 首次连接文档](https://developers.cloudflare.com/workers/ci-cd/builds/) 和 [Workers Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/) 为准。

## 定制部署

修改 `site.config.ts` 以适配你的机构：

```ts
const siteConfig: SiteConfig = {
  name: "你的大学",
  shortName: "简称",
  theme: { primaryColor: "#你的主色", ... },
  platforms: [ /* 你的平台列表 */ ],
  rotation: { timezone: "Asia/Shanghai", times: ["04:01", "16:01"] },
};
```

修改后重新构建部署即可，无需修改业务代码。

## 项目规范

本项目使用 [Trellis](https://github.com/mindfold-ai/Trellis/) 管理开发流程。规范文档位于 `.trellis/spec/`：

- `.trellis/spec/backend/` — 后端开发规范
- `.trellis/spec/frontend/` — 前端开发规范
- `.trellis/spec/guides/` — 通用指南
- `.trellis/workflow.md` — 开发工作流
