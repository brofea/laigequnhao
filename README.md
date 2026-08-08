<div align="center">
    <!--icon 待添加-->
    <h1>来个群号</h1>
    <p>为高校或大型企业等团体提供群聊发现导航网站。</p>
    <p>一个群号，连接彼此。</p>
    <p>
        <a href="https://github.com/brofea/laigequnhao/actions/workflows/ci.yml">
            <img src="https://github.com/brofea/laigequnhao/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI Status">
        </a>
        <a href="https://www.gnu.org/licenses/gpl-3.0.en.html">
            <img src="https://img.shields.io/badge/license-GPL--3.0-orange" />
        </a>
        <a href="https://github.com/brofea/laigequnhao/releases">
            <img src="https://img.shields.io/github/v/tag/brofea/laigequnhao" alt="Newest Tag">
        </a>
        <a href="https://github.com/brofea">
            <img src="https://img.shields.io/badge/brofea-brofea?label=GitHub&logo=github&color=purple" alt="GitHub Profile">
        </a>
    </p>
</div>

在大学、企业或社区中，新成员想要快速找到新群，老成员希望发掘更多新群，但群聊往往分散在聊天记录、公告栏或私下传播中，缺少统一的发现渠道

本项目希望打造一个部署简单，操作便捷的开源网站解决上述问题，任何新手开发者都可在 **30 分钟内** 在 Cloudflare 上线一个属于自己的版本供你的团体使用

若要在 Cloudflare 部署一个属于你的版本，我们准备了 [快速部署保姆级教程](docs/cloudflare-start.md)

<div align="center">
    <img width="1000" alt="image" src="https://github.com/user-attachments/assets/aae89d5a-eb20-402d-be31-e02bc6abbc71" />
    <img width="1000" alt="image" src="https://github.com/user-attachments/assets/aeb0636e-56a4-481b-8b6a-39297bc8201b" />
</div>

## 设计语言

项目以 [HeroUI v3](https://heroui.com/) 的组件设计为基础，结合 [Neumorphism 新拟物主义](https://zh.wikipedia.org/wiki/%E6%96%B0%E6%93%AC%E7%89%A9%E8%A8%AD%E8%A8%88) 进行 Vue 化改造

强调柔和阴影、清晰层级、圆润边界与克制的动效，保持现代感的同时兼顾可读性、操作反馈和深浅色切换下的一致体验

## 技术栈

| 层       | 技术                                                     |
| -------- | -------------------------------------------------------- |
| 前端     | Vue 3 + Vite + TypeScript + Composition API + Vue Router |
| 样式     | Tailwind CSS + CSS 自定义属性                            |
| 后端     | Cloudflare Workers + Hono + Workers Static Assets        |
| 数据库   | Cloudflare D1 (SQLite)                                   |
| 图片存储 | Cloudflare R2                                            |
| 安全     | 管理员 HMAC 会话 + CSRF 保护 + 服务端投稿限流            |
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

## 快速部署在 Cloudflare

本节针对有经验的开发者，如果你是新手请阅读 [快速部署保姆级教程](docs/cloudflare-start.md)，如果你是为了搭建本地开发环境的开发者，请跳过本节阅读下一节

### 四步上线

1. Fork 本仓库
2. 在 [Cloudflare Dashboard](https://dash.cloudflare.com/) **Workers & Pages** 中连接仓库
3. 填写 Build command 为 `pnpm build`，填写 Deploy command 为 `pnpm deploy`
4. 点击 Deploy 并启用 URL

### 配置密码与密钥

在 Worker 详情页找到 **Settings → Variables and Secrets**，添加三个 Type 为 `Secret` 的变量：

- `ADMIN_PASSWORD`：自定义的管理员登录密码
- `SESSION_SECRET`：至少32位的随机字符串，可用 [1Password 随机密码生成器](https://1password.com/zh-cn/password-generator) 生成，更新会使所有管理员会话失效
- `LIKE_PEPPER`：至少32位的随机字符串，生成方式同上

### 验证部署 & 定制部署

按下面顺序验证配置：

1. 首页能打开，`/admin` 管理页面可登录
2. 访问 `https://<你的Worker域名>/api/v1/health` 返回 `"status":"healthy"`
3. 在首页添加新群，管理页面可以看到，将群状态改为已上架后主页可以看到
4. 群可正常点赞

日常更新只需向连接的 `main` 分支推送代码，Workers 会自动构建部署，若要修改密码或密钥，可在 **Variables and Secrets** 中更新密码

修改 `site.config.ts` 以适配你的机构，针对中国大陆用户 `.workers.dev` 域名被 DNS 污染，参考 [快速部署保姆级教程](docs/cloudflare-start.md)

## 快速开始

本节针对想要贡献此仓库的开发者，快速配置开发环境的指南，如果你想将网站部署上线，请阅读上一节

### 前置条件

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 9 （`corepack enable pnpm`）
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（`npx wrangler`）

### 克隆并安装依赖

```bash
git clone git@github.com:brofea/laigequnhao.git
cd laigequnhao
pnpm install
```

### 配置环境变量

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，修改 ADMIN_PASSWORD 为你自己的密码
```

`.dev.vars` 不会提交到 Git（已加入 `.gitignore` 中）

### 初始化本地数据库

```bash
pnpm db:migrate
```

### 启动全栈开发

```bash
pnpm dev
```

访问 http://localhost:5173。需要开发数据时运行 `pnpm seed`；该命令只写本地 D1/R2，重复执行前会拒绝非空数据库，不会隐式清理

如需清理本地数据，运行 `pnpm clean` 并完成二次确认。它会清理本地 D1 应用数据和本地 R2 对象，但保留 schema、数据库实例和 `d1_migrations`

或是使用两条命令：纯前端调试使用 `pnpm vite:dev`，只调试本地 Worker 使用 `pnpm worker:dev`

### 资源清理维护

`POST /api/v1/admin/assets/cleanup` 会清理超过 30 分钟、仍未被群组引用的 staged
资源，并重试 `delete_pending`、`delete_failed` 记录。该接口要求有效管理员会话和
CSRF token

当前版本没有部署 Cron 或其他定时调度；这是管理员按需调用的人工维护入口。若后续接入
Cloudflare Cron，应继续复用同一清理服务，并保留 D1/R2 失败可重试和实际成功计数语义

## 可用命令

### 三平台图片 E2E

Playwright 图片流程默认在 Chromium、WebKit 和 Firefox 三个桌面引擎中运行。首次执行前安装匹配的浏览器：

```bash
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e tests/e2e/image-flows.spec.ts
```

只调试某一个引擎时使用对应 project：

```bash
pnpm test:e2e --project=image-chromium tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-webkit tests/e2e/image-flows.spec.ts
pnpm test:e2e --project=image-firefox tests/e2e/image-flows.spec.ts
```

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

## Trellis 工作流

本项目使用 [Trellis](https://github.com/mindfold-ai/Trellis) Harness 框架来协调 Agent 之间、开发者之间以及 Agent 和开发者之间的交互，具体使用方式如下：

### Task 概念

Trellis 将一次开发工作抽象为一个 Task，一个 Task 的工作流程如下

```
Start：读取项目上下文和 Spec
        ↓
Plan：澄清需求，形成 Task 和 PRD
        ↓
Execute：按 PRD 和 Spec 实现
        ↓
Check：验证代码、测试和规范
        ↓
Finish：提交、归档 Task、记录会话
```

项目的 `.trellis` 文件夹中是 Trellis 的核心工作文件夹，最主要的目录如下

```
.trellis/
├── spec/                          # 项目规范
└── tasks/                         # 任务目录
    ├── {MM-DD-task-name}/         # 活跃任务
    │   ├── prd.md                 # 需求文档
    │   ├── design.md              # 复杂任务的技术设计
    │   └── implement.md           # 复杂任务的实施计划
    └── archive/                   # 已经结束的任务归档
```

### 使用 Trellis 开发

此仓库已经为 Codex、OpenCode 以及所有适配 `.agents` 和 `.claude` 目录的 Agent 配置了 Trellis Skill 以及脚本插件 Hook 等内容，你可以直接使用 Trellis 开始开发，参考提示词如下：

1. Start：`/trellis:start` 或 `读取项目上下文和 Spec`
2. Plan：`创建一个任务，形成 PRD，（这里写你的需求），有不明确的地方和我 Brainstorm`
3. Execute：`/trellis:continue` 或 `开始实现`
4. Check：`/trellis:continue` 或 `开始验收`
5. Finish：`/trellis:finish` 或 `归档并结束任务`

⚠️ 此仓库 CI 要求所有无未归档任务文件夹，请归档所有任务后再提交 PR

此外搭配 [GitHub CLI](https://cli.github.com/) 使用效果更佳，例如要解决某个 Issue，Plan 提示词可以是：

```
执行 gh issue view <Issue 编号> -c 了解开发任务
创建一个任务，形成 PRD，不明确的地方和我 Brainstorm
```

更多信息请参考 [Trellis 官方中文文档](https://docs.trytrellis.app/zh)
