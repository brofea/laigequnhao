# T03 技术设计：正式视觉迁移与业务边界

## 1. 运行时边界

```text
site.config.ts
  ├─ document.title / SiteHeader 配置
  └─ theme bootstrap → document.documentElement[data-theme] → CSS semantic tokens

路由视图
  ├─ / → 公开 API composables → /api/v1/groups、投稿、点赞
  ├─ /admin/login → 会话 API
  └─ /admin → 认证 API + 群组 CRUD / Dashboard API
                 ├─ groups：真实群组管理
                 ├─ boards：当前板块结构与交互
                 └─ stats：真实健康检查与运行统计
```

正式组件只接收整理后的领域 DTO、Props 和事件；API 解析继续由现有客户端与 Zod schema 完成。公开和管理页面不得从 `prototype/` 运行时导入，但组件模板和 CSS 必须以 `prototype/` 为唯一视觉真源，仅允许做机械命名迁移和业务数据适配。

## 2. 路由与信息架构

- `/`：公开首页，左侧品牌链接、主题、GitHub、公开投稿和群组发现。
- `/admin/login`：独立登录页，不显示公开投稿入口。
- `/admin`：唯一管理工作台。侧栏/内部导航的类型为 `groups | boards | stats`，设计系统展示删除，不产生独立路由。
- 管理工作台的群组操作必须携带现有会话/CSRF；主题和 GitHub 控件可复用公共顶栏，但不把管理员入口放到公开顶栏。

## 3. 主题设计

- `ThemePreference = "system" | "light" | "dark"`，`EffectiveTheme = "light" | "dark"`。
- `src/features/theme/bootstrap.ts` 在应用入口前读取持久化偏好、系统媒体查询并写入 `document.documentElement[data-theme]`，避免首屏闪烁。
- `useTheme` 负责运行时切换和持久化；CSS 以根节点主题属性映射语义 Token，页面壳层不自行覆盖主题状态。
- 主题切换只改变本地偏好和根节点，不写 URL、不调用后端、不改变业务状态。

## 4. 真实业务接入

| 区域 | 现有能力 | 正式实现 |
| --- | --- | --- |
| 公开发现 | `/api/v1/groups` | `useGroupDirectory`，URL `q`、游标、加载/错误/空状态 |
| 投稿 | `/api/v1/submissions` | `SubmissionDialog`，提交成功反馈和表单错误 |
| 点赞/复制 | 点赞 API、Clipboard adapter | `useLikedGroups`、`useClipboard`，失败反馈 |
| 管理会话 | `/api/v1/admin/session` | `useAdminAuth`，登录、检查、退出、CSRF |
| 群组管理 | `/api/v1/admin` CRUD | `useAdminGroups`，筛选/排序/回收站/版本冲突 |
| 运行数据 | `/api/v1/admin/health`、`/dashboard` | `StatsPage`，健康状态、KPI、热门群组 |

本任务不修改后端路由、数据库和共享业务契约；发现缺口时记录给 T04–T10 对应 owner。

## 5. 视觉与无障碍复用规则

- 原样迁移 `prototype/` 的语义 Token、轻量 Neumorphism 表面、深灰深色背景、响应式列和状态表达；不得将阴影作为唯一状态信号，也不得借迁移之名重新设计。
- Button、Input、Dialog、Badge、Toast 使用原生可访问元素；焦点可见、键盘操作、Escape、初始焦点与焦点归还必须保留。
- 表格、管理侧栏和运行数据保持低强度表面；加载、空、错误和重试为独立状态。
- 正式生产不保留原型固定统计页或设计系统页；板块与运行数据必须位于同一管理工作台。

## 6. 验证与交接

- 代码审计：正式源码无 `Proto`/`Prototype` 和 `@heroui/react`；`prototype/` 零改动。
- 自动化：类型检查、构建、T03 聚焦单测、定向 ESLint/Prettier、公开首页/API、管理员登录/三个工作台板块和移动板块行为 E2E。
- T04–T10：继续在各自任务书中提示消费正式 Token/主题/顶栏/焦点基础，并沿用真实 API、认证、路由和数据契约。
