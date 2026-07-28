# project-foundation PRD

## 目标

搭建"来个群号"项目骨架，建立工程基础：项目初始化、路由框架、函数入口、代码质量工具链，所有命令通过后可进入业务代码开发。

## 范围

### 项目初始化

- 使用 pnpm 初始化项目
- 安装 Vue 3、Vite、TypeScript（strict 模式）
- 配置 `tsconfig.json`（含路径别名 `@/` → `src/`、`@shared/` → `shared/`）
- 配置 `vite.config.ts`（Vue 插件、路径别名、代理 `/api` 到本地 Wrangler）

### 路由

- Vue Router：`/`（首页占位）、`/admin`（管理员占位）、`/admin/login`（登录占位）
- 路由级懒加载

### 样式

- Tailwind CSS v4（若 v4 不可用则使用 v3 稳定版）
- CSS 自定义属性注入 `site.config.ts` 中的主题 token（主色、强调色、明暗初始值）
- `tailwind.config` 引用这些 CSS 变量
- 全局基础样式重置

### Pages Function 入口

- 创建 `functions/api/index.ts`：Hono 应用，挂载 `/api/v1`，统一错误处理和请求 ID 中间件
- 创建 `functions/api/[[route]].ts`：Cloudflare Pages Functions 入口文件，导入 Hono 应用
- 返回健康检查端点 `GET /api/v1/health`

### 代码质量工具链

- ESLint flat config（含 Vue、TypeScript 规则）
- Prettier 配置
- Vitest 配置（含 `@vue/test-utils` 和 `@cloudflare/vitest-pool-workers`）
- Playwright 配置（e2e 目录、基础浏览器设置）
- 统一 `package.json` scripts：
  - `lint`：`eslint .`
  - `typecheck`：`vue-tsc --build --force`
  - `test`：`vitest run`
  - `test:e2e`：`playwright test`
  - `build`：`vite build`
  - `dev`：`vite dev`

### 基础文件

- `src/App.vue`：根组件，含 `<router-view>`
- `src/main.ts`：创建 app、挂载 router
- `src/pages/HomePage.vue`：首页占位
- `src/pages/admin/AdminPage.vue`：管理页占位
- `src/pages/admin/LoginPage.vue`：登录页占位
- `src/router/index.ts`：路由定义
- `src/style.css`：Tailwind 指令 + CSS 变量注入
- `site.config.ts`：机构配置（含主题 token、平台列表等）
- `shared/`：空目录，后续放置共享 schema
- `functions/_lib/`：空目录，后续放置 service/repository/adapter
- `functions/api/`：Pages Functions
- `migrations/`：SQL 迁移目录，含 `.gitkeep`
- `tests/e2e/`：Playwright 测试目录
- `public/`：静态资源目录
- `.gitignore`：排除 `node_modules`、`.wrangler`、`dist`、`.env`

## 不在范围内

- D1 数据库连接与 schema
- R2 配置
- 实际 API 端点（除 `/api/v1/health`）
- 认证逻辑
- 任何业务组件
- 图片处理
- Cloudflare Turnstile

## 验收标准

- `AC-01`：`pnpm install` 无错误完成
- `AC-02`：`pnpm lint` 通过（零错误）
- `AC-03`：`pnpm typecheck` 通过（零错误）
- `AC-04`：`pnpm test` 通过（至少运行一个占位测试）
- `AC-05`：`pnpm build` 成功生成 `dist/`
- `AC-06`：`pnpm dev` 启动开发服务器，可通过浏览器访问首页和管理页
- `AC-07`：`GET /api/v1/health` 返回 JSON 健康检查响应
- `AC-08`：`site.config.ts` 类型安全，IDE 提供自动补全
