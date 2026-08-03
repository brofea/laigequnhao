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

在大学、企业或社区中，新成员想要快速找到新群，老成员希望发掘更多新群，但群聊往往分散在聊天记录、公告栏或私下传播中，缺少统一的发现渠道

本项目希望打造一个部署简单，操作便捷的开源网站解决上述问题，任何新手开发者都可在 **10 分钟内** 在 Cloudflare 上线一个属于自己的版本供你的团体使用

<div align="center">
    <img width="2800" alt="image" src="https://github.com/user-attachments/assets/e8594c6e-aa86-4ca3-94ec-396a4011856f" />
</div>

## 技术栈

| 层       | 技术                                                     |
| -------- | -------------------------------------------------------- |
| 前端     | Vue 3 + Vite + TypeScript + Composition API + Vue Router |
| 样式     | Tailwind CSS + CSS 自定义属性                            |
| 后端     | Cloudflare Workers + Hono + Workers Static Assets        |
| 数据库   | Cloudflare D1 (SQLite)                                   |
| 图片存储 | Cloudflare R2                                            |
| 安全     | 管理员 HMAC 会话 + CSRF 保护 + Turnstile                 |
| 测试     | Vitest + Vue Test Utils + Workers Vitest + Playwright    |
| 构建     | pnpm + ESLint + Prettier + vue-tsc                       |

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

## 快速开始 

本节针对本地开发环境，若要部署到 Cloudflare，请跳过本节，直接阅读下一节

### 0. 前置条件

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9 （`corepack enable pnpm`）
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npx wrangler`）

### 1. 克隆并安装依赖

```bash
git clone git@github.com:brofea/laigequnhao.git
cd laigequnhao
pnpm install
```

### 2. 配置环境变量

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，修改 ADMIN_PASSWORD 为你自己的密码
```

`.dev.vars` 不会提交到 Git（已加入 `.gitignore` 中）

### 3. 初始化本地数据库

```bash
pnpm db:migrate
```

### 4. 启动全栈开发

```bash
pnpm dev
```

访问 http://localhost:5173。需要开发数据时运行 `pnpm seed`；该命令只写本地 D1/R2，重复执行前会拒绝非空数据库，不会隐式清理

`pnpm seed` 默认访问 `pnpm dev` 的 `5173` 单地址；若只启动 `pnpm worker:dev`，请先设置
`SEED_API_BASE=http://127.0.0.1:8788/api/v1`

如需清理本地数据，运行 `pnpm clean` 并完成二次确认。它会清理本地 D1 应用数据和本地 R2 对象，但保留 schema、数据库实例和 `d1_migrations`

纯前端调试使用 `pnpm vite:dev`；只调试本地 Worker 使用 `pnpm worker:dev`。这两个命令都不会连接生产资源

### 资源清理维护

`POST /api/v1/admin/assets/cleanup` 会清理超过 30 分钟、仍未被群组引用的 staged
资源，并重试 `delete_pending`、`delete_failed` 记录。该接口要求有效管理员会话和
CSRF token

当前版本没有部署 Cron 或其他定时调度；这是管理员按需调用的人工维护入口。若后续接入
Cloudflare Cron，应继续复用同一清理服务，并保留 D1/R2 失败可重试和实际成功计数语义

## 快速部署在 Cloudflare

### 四步上线

1. Fork 本仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，搜索 **Workers & Pages → Create application**，连接 GitHub 并选择 Fork 后的仓库
3. 填写 Build command 为 `pnpm build`，填写 Deploy command 为 `pnpm deploy`，关闭 `Builds for non-production branches`
4. 点击 Deploy

完成后，Workers Builds 会安装依赖、构建前端、自动创建或复用 Worker `laigequnhao`、D1 `laigequnhao-prod` 和 R2 `laigequnhao-assets-prod`，执行 migrations，并发布网站

此时访问 URL 应该能看见无群聊的网站首页，但点赞和投稿功能尚未启用，管理端页面也不可用。请继续阅读下一节配置 Runtime secret 以启用

### 配置密码与密钥

⚠️ 所有密码和密钥在填入后无法查看，请务必保存好原值

1. 使用 [1Password 随机密码生成器](https://1password.com/zh-cn/password-generator) 生成两串至少 32 位的随机字符串密码

2. 回到 **Workers & Pages** 页面，在详情页找到 **Settings → Variables and Secrets**，添加四个 Type 为 `Secret` 的变量，Variable name 和 Value 如下：

- `ADMIN_PASSWORD`：自定管理员登录密码
- `SESSION_SECRET`：随机生成字符串，更新后会使所有现有管理员会话失效
- `LIKE_PEPPER`：随机生成字符串

3. 点击 Deploy 按钮的副选项 **Save version**，复制详情页的 URL，继续阅读下一节

### 创建 Turnstile Widget

Cloudflare Turnstile Widget 用于识别机器人并保护网站安全，按照如下步骤完成配置

1. 在 Cloudflare Dashboard 搜索 **Turnstile → Add widget manually**。
2. 填写 widget 名称如 `lgqh-production`，填入 URL，不要填写 `https://`、端口或路径
3. 创建后记录 **Sitekey** 和 **Secret key**
4. 回到 Worker 的 **Settings → Builds → Build variables and secrets**，添加变量  `VITE_TURNSTILE_SITE_KEY`，值为 **Sitekey**
5. 回到 Worker 的 **Settings → Variables and Secrets**，添加 Secret 类变量 `TURNSTILE_SECRET_KEY`，值为 **Secret key**，点击 **Deploy** 重新构建

### 验证部署

按下面顺序打开网站验证：

1. 首页能打开，管理页面 `https://<你的Worker域名>/admin` 可登录
2. 打开 `https://<你的Worker域名>/api/v1/health` 可返回 `"status":"healthy"`
3. 添加一个群，首页点赞可正常记录
4. 打开首页的“添加新群”，底部的安全验证工作正常

日常更新只需向连接的 `main` 分支推送代码，Workers 会自动构建部署。若要修改密码或密钥，请在 **Settings → Variables and Secrets** 中更新并点击 **Deploy** 重新构建

更多运维问题请参考 [Cloudflare 部署维护 Runbook](docs/runbooks/cloudflare-deployment.md)。

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
