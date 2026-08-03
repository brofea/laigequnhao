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

本节只覆盖第一次使用 Cloudflare 的开发者。部署命令由 Cloudflare Workers Builds 在云端执行；不需要在本地执行 `pnpm deploy`。

### 六步部署基础网站

1. Fork 本仓库。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，打开 **Workers & Pages** → **Create application** → **Import repository**，连接 GitHub 并选择 Fork 后的仓库。
3. 将 Worker 名称设为 `laigequnhao`。
4. 在构建设置中填写：Root directory 为仓库根目录，Build command 为 `pnpm build`，Deploy command 为 `pnpm deploy`，Production branch 为 `main`。
5. 关闭非生产分支 Preview 部署。首次部署只发布 `main`，避免 Preview 误连生产 D1/R2。
6. 点击 **Save and Deploy**。

完成后，Workers Builds 会在云端安装依赖、构建前端、自动创建或复用 Worker `laigequnhao`、D1 `laigequnhao-prod` 和 R2 `laigequnhao-assets-prod`，执行 migrations，并发布网站。基础网站不需要先配置管理员密码、点赞 pepper 或 Turnstile，缺少这些配置不会阻止网站上线。

如果日志提示构建凭据没有 D1 或 R2 权限，再到 Workers Builds 的 Build settings 更换具备 Workers Scripts、D1、R2 编辑权限的 API token；普通用户不需要手工创建或绑定 D1/R2。

### 配置管理员和安全密钥

这几个值不是从同一个地方领取的：管理员密码由你自己设置；`SESSION_SECRET` 和
`LIKE_PEPPER` 用密码管理器分别生成；`TURNSTILE_SECRET_KEY` 则在下一节创建 Turnstile
Widget 后复制。网站上线后，在 **Workers & Pages → laigequnhao → Settings → Variables
and Secrets**，选择 **Production**，点击 **Add → Secret**，逐项添加：

| 名称                   | 值从哪里来                                | 缺少时的影响                   |
| ---------------------- | ----------------------------------------- | ------------------------------ |
| `ADMIN_PASSWORD`       | 你自己设置的管理员密码                    | 管理员登录和管理会话不可用     |
| `SESSION_SECRET`       | 密码管理器生成的至少 32 位随机字符串      | 管理员登录和会话不可用         |
| `LIKE_PEPPER`          | 密码管理器生成的另一个不同随机字符串      | 点赞接口返回“点赞功能尚未配置” |
| `TURNSTILE_SECRET_KEY` | 下一节创建 Widget 后复制的 **Secret key** | 投稿接口返回“投稿功能尚未配置” |

前三项不是 Cloudflare API Key，也不是需要申请的资源；不要使用仓库示例中的固定值。保存后点击
**Deploy**。管理员功能会在同时配置 `ADMIN_PASSWORD` 和 `SESSION_SECRET` 后启用。这里的四个
Runtime secret 都只放在 **Production Runtime secrets**，不要放进 Build variables。

### 创建 Turnstile Widget

投稿需要同一个 Turnstile Widget 提供的一对值：一个公开的 Sitekey 和一个仅后端使用的 Secret key。

1. 在 Cloudflare Dashboard 打开 **Turnstile** → **Add widget**。
2. 填写 widget 名称，例如 `laigequnhao-production`，并在 Hostname Management 填写最终网站域名，例如 `example.com` 或你的 `workers.dev` 域名；不要填写 `https://`、端口或路径。
3. 创建后复制 **Sitekey** 和 **Secret key**。Cloudflare 的 widget 管理界面会同时显示这两个值，参考 [Turnstile 官方文档](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)。
4. 回到 Worker 的 **Settings → Variables and Secrets → Production**，添加 Runtime secret `TURNSTILE_SECRET_KEY`，值为 **Secret key**。
5. 回到 Worker 的 **Settings → Builds → Build variables and secrets**，添加普通 Build variable `VITE_TURNSTILE_SITE_KEY`，值为 **Sitekey**。Sitekey 是公开值，会被编译进前端；不要把 Secret key 填到这里。
6. 保存 Build 设置后，在构建记录中点击 **Retry build**，或向 `main` 推送一次更新，让 Workers Builds 重新编译前端。

如果没有配置 `VITE_TURNSTILE_SITE_KEY`，基础网站仍然可以访问，但投稿表单会明确显示“投稿尚未配置 Turnstile Sitekey”。如果没有配置 `TURNSTILE_SECRET_KEY`，后端会拒绝投稿并返回“投稿功能尚未配置”，不会使用不安全默认值。

### 验证部署

按下面顺序打开网站验证：

1. 首页能打开，刷新 `/admin` 等 Vue Router 深链接不会返回 404。
2. 打开 `https://你的-worker-域名/api/v1/health`，看到健康 JSON 响应。
3. 配置前两项管理员密钥后，打开 `/admin/login`，确认可以登录。
4. 配置 `LIKE_PEPPER` 后，回到首页点赞并刷新页面。
5. 配置 Turnstile 的 Sitekey、Secret key 并重新构建后，打开“添加新群”，完成安全验证并提交一条测试数据。

日常更新只需向连接的 `main` 分支推送代码，Workers Builds 会自动执行同一套构建和部署流程。基础网站、管理员、点赞和投稿分别依赖各自的配置，某项未配置时不会影响其他已配置功能。

需要处理高级 Cloudflare 运维问题时，请参考 [Cloudflare 部署维护 Runbook](docs/runbooks/cloudflare-deployment.md)。

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
