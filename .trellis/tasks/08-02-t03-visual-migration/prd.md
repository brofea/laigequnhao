# T03：正式主项目视觉迁移与真实业务接入（已执行）

## Goal

把 T02 已确认的视觉语言、语义结构、组件状态、主题和无障碍约定迁移到正式 Vue 主项目，并接回已有真实 API、认证、路由和共享 DTO。正式代码不依赖隔离原型工程，不引入 `@heroui/react`，不修改后端业务契约。

## Confirmed decisions

- `prototype/` 是唯一视觉真源；正式 `src/` 只做文件位置迁移、Vue Router 拆分、真实 API/认证接线和必要状态接入，保持原型的布局、组件、Dialog、颜色、间距、字体、动画和无障碍结构不变。
- 真实后端范围是“正式前端消费现有能力”：公开群组列表/搜索、投稿、点赞、管理员会话、管理员 CRUD、健康检查和 Dashboard 均沿用既有 `/api/v1/*` 路由与共享 schema。
- 网站标题默认是“来个群号”。标题、品牌、GitHub URL/文案和投稿按钮文案从 `site.config.ts` 消费。
- 公开首页只保留公开发现功能。顶栏左侧只显示品牌，不显示管理端按钮。
- `/admin/login` 是独立管理员登录页；`/admin` 是唯一管理工作台，内部固定包含群组管理、板块管理、运行数据三个板块。设计系统页面不进入正式路由。
- 板块管理仍沿用当前已有板块数据结构和视觉交互；若后续接入正式板块 API，由 T05/T08/T10 按 owner 完成，不在本任务新增后端契约。

## Requirements

- 支持 `system | light | dark` 偏好、持久化、系统媒体监听、首屏主题 bootstrap 和唯一根节点主题标记；深色背景使用深灰，不使用纯黑。
- 正式 CSS 接入 Primitive/Semantic/Component Token；Button、Card、Input、Dialog、Badge、Toast 和响应式管理布局复用 T02 的语义状态与可访问性规则。
- 公开首页使用真实群组 API，保留 URL 搜索、游标加载、点赞、复制、详情和投稿的真实数据流。
- 管理登录使用真实会话与 CSRF；群组管理使用真实筛选、排序、搜索、回收站、创建、编辑、软删除、恢复和永久删除接口。
- 运行数据板块读取真实健康检查和 Dashboard API，不展示固定统计页。
- 后端已有能力接入加载、错误和重试状态；后端暂不具备的能力保留原型区域并使用空数组、disabled、TODO 或 placeholder，不删除 UI。Dialog 具备语义角色、初始焦点、Escape、关闭控件和焦点归还。
- T04–T10 继续消费 T03 正式视觉基础，并保持真实 API、认证、路由和数据契约不回归；跨层缺口交给对应 owner。

## Acceptance criteria

- [x] `/`、`/admin/login`、`/admin` 正式路由可运行；公开顶栏左侧没有管理入口。
- [x] `/admin` 内只有群组管理、板块管理、运行数据三个内部板块；没有设计系统页。
- [x] 主题三态、持久化和首屏初始化已接入；浅色、深色使用语义 Token，深色不是纯黑。
- [x] 公开 API、投稿、点赞、管理员认证/CRUD、健康检查和 Dashboard 已由正式前端 composable 接入。
- [x] 正式代码没有 `Proto`/`Prototype` 命名或 `@heroui/react` 依赖；`git diff -- prototype` 为空。
- [x] 正式构建、类型检查、T03 聚焦单测、定向 ESLint/Prettier 和正式桌面 E2E 已验证。
- [ ] 全仓既有基线问题（T04 显示宽度断言、seed 脚本 lint、外部端口占用）由对应 owner/环境处理，不作为 T03 代码回归。

## Out of scope

- 修改 `functions/`、数据库 migration、后端业务 API 或共享业务 DTO。
- 把设计系统、板块管理或运行数据拆成公开页面或新的顶层路由。
- 引入 React/HeroUI、恢复旧正式模板与新视觉混合实现，或把隔离原型作为生产数据层。
