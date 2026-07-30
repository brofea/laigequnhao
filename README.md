# 来个群号

为高校或大型企业等团体提供群聊发现导航网站

**一个群号，连接彼此。**

## 技术栈

| 层     | 技术                                                              |
| ------ | ----------------------------------------------------------------- |
| 前端   | Vue 3 + Vite + TypeScript (strict) + Composition API + Vue Router |
| 样式   | Tailwind CSS + CSS 自定义属性                                     |
| 后端   | Cloudflare Pages Functions + Hono                                 |
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
├── functions/              # Cloudflare Pages Functions
│   ├── api/                # [[route]].ts 入口
│   └── _lib/               # Hono 应用 + routes/repositories/services/adapters
├── shared/                 # 前后端共享 (Zod 契约 + 领域类型)
├── migrations/             # D1 数据库迁移
├── tests/
│   ├── workers/            # Workers Vitest 集成测试
│   └── e2e/                # Playwright E2E 测试
├── site.config.ts          # 机构配置 (主题/平台/功能开关)
├── wrangler.jsonc          # Cloudflare Wrangler 配置
└── .dev.vars.example       # 本地 secrets 模板
```

## 前置要求

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9 （`corepack enable pnpm`）
- [Cloudflare](https://dash.cloudflare.com/)（部署时）
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npx wrangler`）

## 快速开始

支持本地开发，同时支持连接远端 Cloudflare D1/R2 进行云端测试。

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

### 3. 初始化数据库

本地开发使用：

```bash
pnpm db:migrate:local
# 可用如下命令生成本地种子数据
pnpm seed:local
```

云端测试使用：

```bash
pnpm db:migrate:dev
```

### 4. 启动前端

```bash
pnpm dev
```

访问 http://localhost:5173 查看首页

### 5. 启动后端

运行前请在另一个终端保持前端运行

本地开发使用：

```bash
pnpm pages:dev:local
```

云端测试使用：

```bash
pnpm pages:dev
# D1/R2 配置文件在 wrangler.jsonc
```

此时 API 运行在 http://localhost:8788，Vite 会自动转发 `/api` 请求。

### 资源清理维护

`POST /api/v1/admin/assets/cleanup` 会清理超过 30 分钟、仍未被群组引用的 staged
资源，并重试 `delete_pending`、`delete_failed` 记录。该接口要求有效管理员会话和
CSRF token。

当前版本没有部署 Cron 或其他定时调度；这是管理员按需调用的人工维护入口。若后续接入
Cloudflare Cron，应继续复用同一清理服务，并保留 D1/R2 失败可重试和实际成功计数语义。

## 使用 Cloudflare 服务快速部署

### 1. Fork 本项目到 GitHub

将项目推送到你自己的 GitHub 仓库。

### 2. 在 Cloudflare Dashboard 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → **创建** → **Pages** → **连接到 Git**
3. 选择你的 GitHub 仓库
4. 构建设置：
   - **构建命令**：`pnpm build`
   - **输出目录**：`dist`
   - **Node.js 版本**：22

### 3. 创建 D1 数据库

```bash
# 创建生产数据库
npx wrangler d1 create laigequnhao-prod

# 在 wrangler.jsonc 中更新 database_id 为实际值
# 创建预览数据库
npx wrangler d1 create laigequnhao-preview

# 运行迁移
pnpm db:migrate:prod
```

在 Cloudflare Dashboard → Workers & Pages → D1 中绑定数据库到 Pages 项目。

### 4. 创建 R2 存储桶

```bash
npx wrangler r2 bucket create laigequnhao-assets-prod
npx wrangler r2 bucket create laigequnhao-assets-preview
```

在 Dashboard 中绑定 R2 到 Pages 项目。

### 5. 设置 Secrets

```bash
# 为生产环境设置 secrets
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put LIKE_PEPPER
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put R2_PUBLIC_BASE_URL

# 预览环境同理，加上 --env preview
npx wrangler secret put ADMIN_PASSWORD --env preview
```

### 6. 自定义域名（可选）

在 Pages 项目 → 自定义域 中绑定你的域名。

### 7. 部署

推送代码到 `main` 分支即可自动部署。也可以在本地手动部署：

```bash
pnpm build
pnpm pages:deploy
```

## 可用命令

| 命令                    | 说明                     |
| ----------------------- | ------------------------ |
| `pnpm dev`              | 启动 Vite 开发服务器     |
| `pnpm build`            | 类型检查 + 构建          |
| `pnpm lint`             | ESLint 检查              |
| `pnpm format`           | Prettier 格式化          |
| `pnpm typecheck`        | TypeScript 类型检查      |
| `pnpm test`             | 运行单元测试 + 组件测试  |
| `pnpm test:workers`     | 运行 Workers 集成测试    |
| `pnpm test:e2e`         | 运行 Playwright E2E      |
| `pnpm db:migrate:local` | 本地 D1 迁移             |
| `pnpm db:migrate:dev`   | 远端开发 D1 迁移         |
| `pnpm db:migrate:prod`  | 生产 D1 迁移             |
| `pnpm seed:local`       | 生成本地种子数据（需先启动 `pages:dev:local`） |
| `pnpm pages:dev`        | 启动 Pages Functions（远程 D1/R2） |
| `pnpm pages:dev:local`  | 启动 Pages Functions（本地 D1/R2） |
| `pnpm pages:deploy`     | 部署到 Cloudflare Pages  |

首次运行 E2E 前执行 `pnpm exec playwright install chromium`。E2E 会重建工作区内的
`.e2e-state/`，启动本地模拟 D1/R2 和隔离的无头 Chromium，不连接 `lgqh-dev`，也不使用
个人浏览器会话。

## 环境变量

| 变量                   | 说明                      | 必填        |
| ---------------------- | ------------------------- | ----------- |
| `ADMIN_PASSWORD`       | 管理员登录密码            | ✅          |
| `SESSION_SECRET`       | 会话签名密钥              | ✅          |
| `LIKE_PEPPER`          | 匿名设备 ID 哈希 pepper   | ✅          |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile 密钥 | ✅          |
| `R2_PUBLIC_BASE_URL`   | R2 自定义域名             | ✅          |
| `ANALYTICS_TOKEN`      | CF Analytics 只读 Token   | ❌          |
| `SKIP_TURNSTILE`       | 本地跳过 Turnstile        | 本地 `true` |

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

本项目使用 Trellis 管理开发流程。规范文档位于 `.trellis/spec/`：

- `.trellis/spec/backend/` — 后端开发规范
- `.trellis/spec/frontend/` — 前端开发规范
- `.trellis/spec/guides/` — 通用指南
- `.trellis/workflow.md` — 开发工作流
