# T10 系统回归、无障碍与发布验收：实施规划

> 范围修订（2026-08-02）：执行阶段先确认 T03 迁移结果与 T02 prototype 的视觉基线一致，再验证正式 `src/` 与 T04–T09 真实 API/认证/Contract/路由/数据完整性；不得把 prototype 通过冒充生产接入，也不重新实现 UI。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务10.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

## 0. 执行前声明

- 当前只完成 planning，不执行 `task.py start`。
- 本文件中的“通过”表示未来的验收条件，不表示当前已经执行。
- 所有命令以执行时的 `package.json`、Wrangler 配置、Playwright 配置和 Trellis Spec 为准。
- 生产 migration、生产部署、真实数据删除和真实密钥操作均不在本规划阶段执行。
- 依赖 T01–T09 未全部完成时，只能收集阻塞信息，不能给出发布结论。

### 0.1 基线清零顺序

在综合回归前建立并追踪以下既有失败；T10 不删除失败测试或用格式化掩盖行为问题：

1. 等待 T04 修复 `shared/domain/config.spec.ts` 与字符串型 `platforms` Contract 的不一致，并复测共享配置调用方。
2. 定位并修复 `AdminGroupDrawer` 暂存资源清理的真实事件链，覆盖未保存关闭、替换和重复关闭。
3. 统一 `useImageProcessor` 的大小限制与错误文案 Contract，保留边界测试。
4. 修复 `scripts/seed-local.mjs` lint 错误和剩余格式失败，记录实际文件归属。
5. 重跑 `pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm test:workers`、`pnpm typecheck` 和 `pnpm build`，将退出码与修复提交写入未来 `acceptance.md`。

## 1. 阶段总览

1. 收集 T01–T09 状态和全部规划证据。
2. 读取正式 Spec、UI 设计、总 PRD、迁移设计和测试工具配置。
3. 冻结发布候选 Commit、测试环境和问题编号。
4. 建立可重复的综合 fixture、固定时钟和测试数据库。
5. 运行 typecheck、lint、format check、build。
6. 运行前端/共享 Vitest 和 Workers Vitest。
7. 运行 Chromium、Firefox、WebKit Playwright 和串并行对照。
8. 建立并审查视觉基线。
9. 执行键盘、焦点、ARIA、对比度、缩放和减少动效验收。
10. 执行响应式、WebKit 移动端、性能、缓存和监听器检查。
11. 执行空库、当前 schema 升级、初始 NULL/seed 宽度、失败路径和部署顺序 migration 演练。
12. 按最小修复原则处理跨任务阻塞问题。
13. 重跑受影响测试、关键套件和发布候选冒烟。
14. 填写 `acceptance.md`、发布清单和最终结论。

## 2. 阶段一：依赖收集和候选冻结

### 2.1 读取和核对清单

- [ ] 读取总任务 PRD 和 `docs/PRD/v2/PRD.md`。
- [ ] 读取 T01 PRD、design、implement 和完成记录。
- [ ] 读取 T02 PRD、design、implement 和完成记录。
- [ ] 读取 T03 PRD、design、implement 和完成记录。
- [ ] 读取 T04 PRD、design、implement 和 migration 记录。
- [ ] 读取 T05 PRD、design、implement 和 Workers 证据。
- [ ] 读取 T06 PRD、design、implement 和浏览器证据。
- [ ] 读取 T07 PRD、design、implement 和首页/搜索证据。
- [ ] 读取 T08 PRD、design、implement 和管理板块证据。
- [ ] 读取 T09 PRD、design、implement 和管理分页证据。
- [ ] 读取已确认 `ui-design.md`。
- [ ] 读取 `.trellis/spec/` 相关索引和公共/前端/Workers/测试规范。
- [ ] 读取 `package.json`、lockfile、Vitest 配置、Workers Vitest 配置。
- [ ] 读取 Playwright 配置、E2E server、测试 fixture 和已有快照目录。
- [ ] 读取 `wrangler.jsonc`、测试 Wrangler 配置和 migration 文件清单。
- [ ] 读取当前 git status、diff、分支、HEAD 和未提交生成物。

### 2.2 依赖状态表

为每个 T01–T09 记录：

- [ ] 任务目录和任务状态。
- [ ] 依赖任务是否完成。
- [ ] design.md 是否完成。
- [ ] implement.md 是否完成。
- [ ] 局部测试命令和真实退出码。
- [ ] 已知 S0、S1、S2、S3。
- [ ] 未提交改动和候选 Commit。
- [ ] 是否可以进入 T10 集成环境。
- [ ] 责任人和阻塞处理路径。

### 2.3 冻结规则

- [ ] 确认候选 Commit 或候选分支。
- [ ] 确认测试数据库、R2、Analytics 和 Turnstile 是隔离环境。
- [ ] 确认测试账号没有硬编码到仓库或报告。
- [ ] 确认生产密钥不进入 shell history、截图、日志和 `acceptance.md`。
- [ ] 建立问题编号前缀，例如 `REG-001`。
- [ ] 记录候选版本的 Node、包管理器、Wrangler 和浏览器版本。
- [ ] 记录时区、locale、字体、系统主题和固定测试时间。
- [ ] 候选冻结后所有代码变化都必须关联问题 ID。

## 3. 阶段二：综合数据和环境

### 3.1 环境初始化

- [ ] 确认 Node 版本与项目约定一致。
- [ ] 确认包管理器与 lockfile 一致。
- [ ] 安装依赖但不擅自升级依赖版本。
- [ ] 确认 `typecheck`、`lint`、`format:check`、`build` 脚本存在。
- [ ] 确认 `test`、`test:workers`、`test:e2e` 脚本存在。
- [ ] 确认测试 migration 脚本和测试 Wrangler 配置存在。
- [ ] 确认 E2E API server 和前端 server 可以独立启动。
- [ ] 确认 Chromium、Firefox、WebKit 浏览器可用；缺失时记录环境阻塞。
- [ ] 确认 D1/R2 测试 binding 与 preview/production binding 不混用。
- [ ] 确认 Turnstile 使用测试配置或显式可控的测试旁路。
- [ ] 确认 Analytics 使用 mock/测试 binding，不读取生产数据。

### 3.2 综合 fixture

- [ ] 建立零群组 fixture。
- [ ] 建立 1、49、50、51、100 和多页群组 fixture。
- [ ] 建立已发布、已下架、回收站群组 fixture。
- [ ] 建立相同发布时间、点赞数、标题和创建时间 fixture。
- [ ] 建立 ASCII、中文、Emoji、ZWJ、组合字符和全角字符 fixture。
- [ ] 建立标题显示宽度 50/51 fixture。
- [ ] 建立简介显示宽度 1000/1001 fixture。
- [ ] 建立多标签、多加入方式、二维码、缺图和图片错误 fixture。
- [ ] 建立零板块、一个空板块、多个板块和未启用板块 fixture。
- [ ] 建立仅含已下架成员的板块 fixture。
- [ ] 建立手动正序、手动倒序和每小时随机板块 fixture。
- [ ] 建立相同 position、重复候选、跨板块重复引用 fixture。
- [ ] 建立搜索有结果、无结果、快速输入、错误和重试 fixture。
- [ ] 建立 Analytics 有数据、空数据和错误 fixture。
- [ ] 建立可编辑管理员、过期会话、非法 CSRF 和版本冲突 fixture。

### 3.3 Fixture 质量门

- [ ] fixture 初始化可重复执行。
- [ ] fixture 清理不影响其他 worker。
- [ ] fixture 不依赖测试执行顺序。
- [ ] fixture 不依赖真实当前小时。
- [ ] fixture 不依赖真实生产数据。
- [ ] fixture 不产生真实密钥、设备哈希或敏感加入信息。
- [ ] fixture 对当前 schema 升级和新库初始化分别有版本标识。
- [ ] fixture 记录所有资源 ID，确保 R2/D1 清理可验证。

## 4. 阶段三：静态检查和构建

按仓库实际脚本执行，并把命令、退出码、版本和报告路径写入未来 `acceptance.md`。

- [ ] 运行 `pnpm typecheck` 或项目实际 typecheck 命令。
- [ ] 运行 `pnpm lint` 或项目实际 lint 命令。
- [ ] 运行 `pnpm format:check` 或项目实际格式检查命令。
- [ ] 运行 `pnpm build` 或项目实际 production build 命令。
- [ ] 检查 TypeScript strict、Vue 类型和 Functions 类型。
- [ ] 检查构建警告并为每个保留警告记录来源、原因、风险和批准。
- [ ] 搜索 `.only`、未批准 `test.skip`、调试日志和临时 mock。
- [ ] 搜索硬编码 localhost、preview 域名、测试账号和密钥。
- [ ] 检查 build 产物没有原型路由和未使用大资源。
- [ ] 检查 CSS Token、深色主题、Logo、图标、R2 URL 和 router fallback。
- [ ] 检查 Pages Functions 产物和 Worker 类型/绑定。
- [ ] 静态检查失败时先记录为问题，不通过降低规则掩盖。

## 5. 阶段四：前端与共享 Vitest

### 5.1 运行策略

- [ ] 单独运行完整 `test` 命令。
- [ ] 以单 worker 或项目等效串行模式运行关键套件。
- [ ] 以 CI 预期并行模式运行完整套件。
- [ ] 连续运行关键套件两次。
- [ ] 收集测试数量、跳过数量、失败堆栈、覆盖范围和耗时。
- [ ] 确认失败不是由旧 localStorage、matchMedia、fake timer 或监听器污染造成。
- [ ] 确认测试结束后没有未处理 Promise 或残留计时器。

### 5.2 主题和共享 Contract

- [ ] 自动/浅色/深色偏好和非法存储回退。
- [ ] 系统主题实时变化和手动主题优先级。
- [ ] `ThemePreference` 与 `EffectiveTheme` 语义一致。
- [ ] `BoardSortMode`、公共群组摘要/详情和板块响应 Contract 一致。
- [ ] 管理分页响应包含 items、totalItems、totalPages 的正确类型。
- [ ] 标题/简介显示宽度和前后端共享常量一致。
- [ ] 错误映射不泄露内部表名、token、R2 key 或设备哈希。

### 5.3 组件和状态

- [ ] GroupCard 两行标题、四行简介、图片失败和点赞独立操作。
- [ ] Carousel 边界、键盘、拖动、滚轮和减少动效。
- [ ] Dialog、QR 层、焦点陷阱、滚动锁定和恢复。
- [ ] `q`、`group`、历史 push/replace 和刷新恢复。
- [ ] 搜索 debounce、IME、竞态、取消和缓存。
- [ ] 首页区域 loading、empty、error、retry 隔离。
- [ ] 管理 pager、URL 规范化、删除退页和排序 tie-break。
- [ ] 表格列隐藏、抽屉动态视口、脏状态和焦点恢复。
- [ ] 板块拖拽/键盘后备、成员操作和乐观回滚。

## 6. 阶段五：Workers Vitest 与数据层

### 6.1 运行和隔离

- [ ] 单独运行完整 Workers Vitest 命令。
- [ ] 为业务套件和 migration 套件使用清晰数据库边界。
- [ ] 确认每个套件初始化和清理数据。
- [ ] 确认测试不共享不可预测的 migration 状态。
- [ ] 记录 Workers runtime、D1 模拟方式和 binding 配置。

### 6.2 认证、权限和安全

- [ ] 未登录读取管理页面数据失败且无旧数据闪现。
- [ ] 会话过期返回既有重新认证行为。
- [ ] 缺 CSRF cookie、缺 CSRF header、不匹配和合法 CSRF 分别验证。
- [ ] 重放 mutation token、过期版本和非管理员写入均被拒绝。
- [ ] 公开响应不含管理字段、内部 token、设备哈希和 R2 key。
- [ ] 错误响应不含 SQL、stack、HMAC、CSRF 或 Turnstile secret。
- [ ] 分享 URL 只包含 canonical origin 和 `group`。

### 6.3 群组和迁移相关 API

- [ ] 群组 CRUD、状态变更、图片资源、标签、加入方式和版本冲突。
- [ ] 回收站、恢复、永久删除、资源收集和共享资源保护。
- [ ] `last_published_at` 新建、发布、重新发布、普通编辑和下架语义。
- [ ] 标题/简介显示宽度 ASCII、中文、Emoji、换行和绕过前端请求。
- [ ] `boards`、`board_groups`、索引、约束和默认板块行为。
- [ ] 板块 CRUD、启用状态、排序模式、手动序、随机稳定性。
- [ ] 板块公开过滤、已发布成员、空板块、零板块和不泄露数量。
- [ ] 板块成员添加、编辑、上移、下移、移动、移除和批量排序原子性。
- [ ] 板块版本冲突不覆盖新数据，客户端可重试。
- [ ] 管理分页固定 50、COUNT 条件、非法页、超页和稳定排序。
- [ ] 公共 cursor、搜索 cursor 与管理 page API 不互相污染。

## 7. 阶段六：Playwright 集成回归

### 7.1 配置核对

- [ ] 记录现有 Chromium 桌面项目和 Chromium 手机项目。
- [ ] 为 Firefox 和 WebKit 增加/启用项目前先确认依赖和 CI 支持。
- [ ] 记录项目实际的 baseURL、API server、前端 server 和启动超时。
- [ ] 记录 trace、截图、视频和失败 artifact 的保存策略。
- [ ] 不用 `test.only`、不删除失败用例、不把 retry 当作通过依据。
- [ ] 运行一次单 worker 串行模式。
- [ ] 运行一次 CI 预期并行模式或等效隔离模式。
- [ ] 连续运行首页、搜索、板块、分页、回收站关键套件两次。

### 7.2 公开首页和搜索

- [ ] 默认首页区域顺序固定且手机不改变。
- [ ] Header、主题、GitHub、提交入口和搜索框存在。
- [ ] Discover 最多 10 条、按发布时间、相同时间按 ID 稳定。
- [ ] Tags 只统计已发布、排序和换行正确。
- [ ] Dynamic Boards 只显示启用板块、空/零板块状态正确。
- [ ] All Groups Grid、旋转排序、cursor、无限滚动、去重和停止条件。
- [ ] 搜索不需 Enter、debounce、IME、URL q、刷新、后退、前进。
- [ ] 搜索标题、简介、标签匹配，已下架不返回。
- [ ] 快速输入只展示最新响应，取消不产生错误提示。
- [ ] 各区域失败可单独重试，不改写 URL、不关闭 Dialog。

### 7.3 卡片、Carousel、Dialog 和分享

- [ ] 卡片头像、标题、平台、四行简介、点赞和点击语义。
- [ ] 点赞不打开 Dialog，多个实例同步，失败精确回滚。
- [ ] 鼠标拖动、触摸、触控板、滚轮、键盘和边界行为。
- [ ] 无溢出时不拦截页面滚动，拖动后不误开卡片。
- [ ] `?group` 直接深链接、卡片打开、关闭、后退和前进。
- [ ] Dialog 完整信息、加入方式、二维码、复制、分享、加载、错误和重试。
- [ ] Escape、关闭按钮、遮罩、焦点陷阱、焦点恢复和滚动锁定。
- [ ] 手机接近全屏、动态视口、安全区和软键盘行为。
- [ ] Clipboard 成功、失败、WebKit 降级和 canonical origin。

### 7.4 管理端

- [ ] 登录、会话、三页面导航、直接访问、刷新、后退和前进。
- [ ] 群组每页 50、第一页/中间页/最后一页、total 和稳定排序。
- [ ] page/q/status/trash/sort/direction URL 保留、复制、刷新和历史恢复。
- [ ] 非法页、超页、筛选变化回第一页和删除退页。
- [ ] Tags/Property/Likes/Platform 按顺序隐藏，Title/Status/Actions 始终保留。
- [ ] 360px 无页面横向溢出，操作菜单仍可用。
- [ ] 新建/编辑抽屉动态高度、内部滚动、安全区、软键盘和脏状态。
- [ ] 板块创建、编辑、启用、关闭、排序模式、删除和默认板块规则。
- [ ] 板块拖拽、键盘/移动端后备、成员表固定高度和内部滚动。
- [ ] 成员添加、编辑、上移、下移、移动、移除、版本冲突和回滚。
- [ ] Analytics 页面原有指标、空数据、错误、重试、主题和手机布局。
- [ ] 回收站清理、恢复不重挂、永久删除、资源生命周期和分页更新。

## 8. 阶段七：人工无障碍和视觉验收

### 8.1 键盘流程

- [ ] 仅用键盘切换主题、GitHub、提交入口和搜索。
- [ ] 仅用键盘选择标签、浏览 Carousel、打开卡片和点赞。
- [ ] 仅用键盘打开 Dialog、复制/分享、使用加入方式和关闭 Dialog。
- [ ] 仅用键盘登录、切换管理页面、筛选、排序和分页。
- [ ] 仅用键盘打开/保存/取消抽屉、创建/编辑板块和确认删除。
- [ ] 仅用键盘使用板块排序后备、成员上移/下移/移除。
- [ ] 检查无键盘陷阱、跳跃焦点、不可达操作和错误 tab 顺序。

### 8.2 焦点、ARIA 和语义

- [ ] Dialog 打开后焦点进入，Tab 循环，关闭后回到触发元素。
- [ ] QR 二级 Dialog 在父 Dialog 之上，关闭子层不关闭父层。
- [ ] 抽屉打开后焦点进入，关闭/保存/失败后焦点可恢复。
- [ ] 删除确认关闭后焦点回到删除动作。
- [ ] 页面历史恢复不丢焦点或把焦点送入隐藏元素。
- [ ] 主搜索、Section、Carousel、Card、Dialog、分页和表格语义正确。
- [ ] 管理导航有 `aria-current`，分页有当前页，排序有 `aria-sort`。
- [ ] 图标按钮、关闭、拖拽后备、重试和状态通知有可访问名称。
- [ ] Loading、ErrorBanner、Toast、空状态和冲突状态被辅助技术感知。
- [ ] 隐藏列内元素不会进入可访问树或键盘顺序。

### 8.3 视觉和响应式

- [ ] 固定数据、固定时钟、固定字体、固定浏览器和固定 locale。
- [ ] 建立公开默认/搜索/板块/详情/提交的浅色和深色基线。
- [ ] 建立管理群组/板块/Analytics/抽屉/分页的浅色和深色基线。
- [ ] 覆盖 loading、empty、error、QR、长文本、未启用板块和零板块。
- [ ] 审查差异并分类，不未经审查更新快照。
- [ ] 浅色/深色/自动主题首屏和切换无明显闪烁。
- [ ] 200% 缩放仍可完成公开和管理核心流程。
- [ ] `prefers-reduced-motion` 下功能不依赖动画结束事件。
- [ ] 360px、390px、平板、桌面和低高度窗口无不可恢复溢出。
- [ ] WebKit 手机检查动态视口、滚动锁定、触摸、软键盘和安全区。

## 9. 阶段八：性能、缓存和稳定性

### 9.1 查询和请求

- [ ] 记录首页首屏请求数和主要响应体。
- [ ] 检查板块公开批量读取无每板块/每成员 N+1。
- [ ] 检查标签聚合、Discover、All Groups、Search 查询使用正确索引/游标。
- [ ] 检查管理 COUNT 与 items 查询条件一致。
- [ ] 检查管理 OFFSET 深页风险并记录数据规模和观察。
- [ ] 检查板块成员候选不一次返回不可控全量数据。
- [ ] 检查 Dialog/二维码按需读取、图片懒加载。
- [ ] 检查搜索、页面切换、Dialog 和拖拽请求取消或旧响应忽略。

### 9.2 前端资源和内存

- [ ] 重复打开/关闭 Dialog 不累计 document/window 监听器。
- [ ] 重复切换搜索不累计 debounce、AbortController 或 IntersectionObserver。
- [ ] 重复进入/离开管理页面不累计 ResizeObserver、matchMedia 和 scroll listener。
- [ ] body scroll lock 计数在嵌套 Dialog/抽屉后恢复为零。
- [ ] DOM 规模不因重复 Carousel、卡片或分页持续增长。
- [ ] 记录内存观察、listener 数量、Observer 清理和已知风险。

### 9.3 缓存和公开数据

- [ ] 板块关闭后公开缓存及时失效。
- [ ] 群组下架后公开首页、搜索、板块和详情不会长期展示。
- [ ] 回收站后分享深链接不可访问。
- [ ] 每小时随机不会被跨小时公共缓存锁死。
- [ ] 管理 API 不进入公共缓存。
- [ ] canonical origin 在本地、preview、production 各自正确。

## 10. 阶段九：migration 演练

### 10.1 空数据库初始化

- [ ] 使用测试 D1 从空状态应用全部 migration。
- [ ] 验证旧表、群组字段、`last_published_at`、boards、board_groups、索引和外键。
- [ ] 验证默认自定板块恰好一个且为空。
- [ ] 验证应用启动、管理员创建群组/板块和公开首页加载。
- [ ] 删除默认板块后刷新、重启、重新部署不会运行时重建。

### 10.2 当前 Schema 升级

- [ ] 建立包含已发布/下架/回收站群组、标签、加入方式、图片、点赞和版本字段的 `0001`–`0003` schema fixture。
- [ ] 加入相同创建时间；不制造或兼容不存在的旧超限文本。
- [ ] 应用新 migration，记录实际命令和退出码。
- [ ] 验证旧数据数量、内容、资源引用和状态保留。
- [ ] 验证现有群组 `last_published_at` 全部保持 `NULL`，不使用 `created_at` 或部署时间推断。
- [ ] 验证 boards、board_groups、默认板块和索引。
- [ ] 验证新代码读取、修改、公开浏览和管理操作。

### 10.3 Seed 宽度与失败

- [ ] 验证 seed 标题/简介全部符合显示宽度 Contract。
- [ ] 验证超限输入被拒绝，不执行静默截断或兼容分支。
- [ ] 模拟 migration 中途失败、索引失败和新增字段/表创建异常。
- [ ] 模拟应用代码先部署、migration 未完成和旧代码运行在新 Schema 上。
- [ ] 记录失败表现、数据安全性、恢复动作和是否需要前向修复。
- [ ] 验证备份/导出可用，不承诺未经验证的一键回滚。
- [ ] 验证部署顺序：备份、binding、migration、结果验证、应用部署、冒烟、观察。

## 11. 阶段十：问题分流和最小修复

### 11.1 分流

- [ ] 为每个失败分配 `REG-xxx`。
- [ ] 标记 S0/S1/S2/S3。
- [ ] 记录浏览器、视口、主题、fixture、时间和复现概率。
- [ ] 判断实现缺陷、测试缺陷、环境缺陷、规格冲突或发布配置缺陷。
- [ ] 指派回原任务、共享层、测试基础设施、T10 或总任务决策。
- [ ] 判断是否允许 T10 直接修复。

### 11.2 允许的 T10 最小修复

- [ ] Contract import/映射或字段版本兼容。
- [ ] 路由 query、history、deep link 或 canonical origin 丢失。
- [ ] CSS Token、z-index、响应式整合、焦点或滚动锁定冲突。
- [ ] 请求取消、竞态、缓存失效、测试 fixture 和并行隔离。
- [ ] migration 部署兼容或经批准的前向修复。
- [ ] 错误映射、日志脱敏和测试配置修复。

### 11.3 必须退回的变更

- [ ] 改变产品字段、默认排序、分页规则、板块状态、首页结构或主题交互。
- [ ] 增加新的 API 语义、用户角色或领域模型。
- [ ] 大规模重构已验收模块。
- [ ] 修改历史 migration。
- [ ] 通过删除测试、扩大全局超时、无条件重试或无审查截图更新获得通过。

### 11.4 修复后门禁

- [ ] 添加或更新最小自动化测试。
- [ ] 运行原失败测试。
- [ ] 运行受影响的前端/Workers/Playwright 套件。
- [ ] 运行关键公开、管理、回收站、分页和深链接套件。
- [ ] 如视觉变化真实且已批准，更新基线并记录理由。
- [ ] 重新检查 S0/S1/S2 计数。
- [ ] 将修复 Commit、测试和复测证据写入 `acceptance.md`。

## 12. 阶段十一：发布候选验收

### 12.1 配置审查

- [ ] 验证 D1 binding、R2 binding、Analytics、Turnstile 和 session/CSRF 配置存在。
- [ ] 验证 preview 与 production 配置不混用。
- [ ] 验证 canonical origin、GitHub URL、站点时区和缓存配置。
- [ ] 只记录配置“存在/已验证/来源”，不记录密钥值。
- [ ] 检查生产包不含环境变量、secret、测试账号或 localhost。

### 12.2 发布候选冒烟

- [ ] 公开打开首页。
- [ ] 公开搜索并打开结果。
- [ ] 打开 Dialog、二维码、复制/分享和点赞。
- [ ] 切换浅色/深色/自动主题。
- [ ] 打开提交表单并验证测试提交路径。
- [ ] 管理登录并访问群组、板块、Analytics。
- [ ] 翻页、编辑测试群组、创建/删除测试板块。
- [ ] 验证默认板块、Discover、公开过滤和回收站关联清理。
- [ ] 退出管理端并确认无敏感内容残留。

### 12.3 最终报告

- [ ] 记录候选 Commit、分支、日期和环境。
- [ ] 记录 typecheck、lint、format、build、Vitest、Workers、浏览器和视觉结果。
- [ ] 记录公开端、管理端、数据、无障碍、响应式、性能和 migration 结果。
- [ ] 记录 S0、S1、S2、S3 数量、修复、批准延期和未解决项。
- [ ] 记录 acceptance、截图、trace、测试报告和 migration 证据路径。
- [ ] 明确是否可以发布。

## 13. 任务级完成定义

- [ ] 所有 T01–T09 依赖项有完成记录且无未处理发布阻塞。
- [ ] `design.md` 和本 `implement.md` 完成并经过 Review。
- [ ] 候选版本、数据、环境、命令和浏览器矩阵可复现。
- [ ] 静态检查、全量 Vitest、Workers Vitest 和必需 Playwright 通过。
- [ ] 视觉基线、键盘、焦点、ARIA、对比度、缩放和减少动效有证据。
- [ ] 性能、缓存、N+1、监听器和内存检查有记录。
- [ ] 空库、当前 schema 升级、初始 `NULL`/seed 宽度、失败和部署顺序 migration 演练有记录。
- [ ] 所有跨任务修复均有最小变更和回归测试。
- [ ] `acceptance.md` 完整且未声称未执行结果。
- [ ] S0 为 0，S1 为 0，未批准延期 S2 为 0。
- [ ] 最终结论符合允许的两种明确文字之一。

## 14. 交接模板

- 候选 Commit：待执行时填写。
- 测试环境：待执行时填写。
- 测试数据库和 fixture 版本：待执行时填写。
- 浏览器版本与视口：待执行时填写。
- 实际命令与退出码：待执行时填写。
- 视觉基线目录：待执行时填写。
- Trace/截图/报告目录：待执行时填写。
- migration 演练记录：待执行时填写。
- S0/S1/S2/S3 统计：待执行时填写。
- 未解决问题：待执行时填写。
- 延期批准：待执行时填写。
- 发布结论：待执行时填写。

## 15. 追加执行核对表

- [ ] Confirm the acceptance report never records a command that was not actually run。
- [ ] Confirm every browser result names the project, browser version, viewport, theme, and locale。
- [ ] Confirm every screenshot result names the fixture, clock, and baseline revision。
- [ ] Confirm every migration result names the starting schema and database isolation mode。
- [ ] Confirm every public endpoint check records both allowed and forbidden data examples。
- [ ] Confirm every admin mutation check records authentication, CSRF, version, and error behavior。
- [ ] Confirm every pagination check records boundary rows 49, 50, 51, and final-page behavior。
- [ ] Confirm every board check records zero, empty, disabled, random, and multi-member states。
- [ ] Confirm every Dialog and drawer check records open, loading, error, close, focus, and scroll state。
- [ ] Confirm every performance check records data volume before making a risk conclusion。
- [ ] Confirm flaky failures are investigated rather than hidden by retries or larger timeouts。
- [ ] Confirm no test data is copied from production without anonymization and authorization。
- [ ] Confirm no secret value appears in logs, traces, screenshots, or handoff notes。
- [ ] Confirm S0 and S1 failures block the next release-gate step。
- [ ] Confirm an S2 deferment includes explicit scope, impact, approver, and follow-up task。
- [ ] Confirm S3 issues remain visible in the unresolved or follow-up section。
- [ ] Confirm cross-task fixes are attached to the smallest owning task when scope is clear。
- [ ] Confirm product-design changes are returned to the original task or total task。
- [ ] Confirm historical migration files are unchanged before release review。
- [ ] Confirm the final report includes negative cases, not only happy-path evidence。
- [ ] Confirm the release candidate is rebuilt after the final blocker fix。
- [ ] Confirm key Playwright suites pass twice after the final rebuild。
- [ ] Confirm migration rehearsal is repeated after the final migration-related change。
- [ ] Confirm the smoke test uses a disposable test record and cleans it up。
- [ ] Confirm production observation is documented as a human plan, not falsely claimed automation。
- [ ] Confirm rollback language distinguishes build rollback from irreversible data migration。
- [ ] Confirm the final conclusion uses one of the two approved exact meanings。
- [ ] Confirm this task remains planning until the user explicitly authorizes implementation。
- [ ] Confirm no child task is created beneath T10 as part of this planning request。
- [ ] Confirm the three planning files together remain at least 1000 lines。
- [ ] Confirm the final status snapshot shows T05–T10 all in planning。
- [ ] Confirm the final task tree shows T01–T10 under the existing parent。
- [ ] Confirm the source PRD files were not rewritten by this planning pass。
- [ ] Confirm implementation changes are limited to future handoff instructions at this stage。
- [ ] Confirm all discovered limitations are visible to the user before the next phase。

- [ ] Confirm the handoff includes the final line-count and planning-status verification。
- [ ] Confirm the next phase starts only after the user reviews the planning handoff。
- [ ] Confirm no child implementation task is auto-started by this checklist。
- [ ] Confirm the release gate remains closed until every required evidence item exists。
- [ ] Confirm the final report preserves failed evidence for audit and retest。

### 15.1 Release evidence completeness

- [ ] Confirm the dependency table is updated immediately before the release conclusion。
- [ ] Confirm the final test run uses the same candidate Commit named in the report。
- [ ] Confirm failed commands retain their original output and are not replaced by summaries。
- [ ] Confirm browser traces can be linked to the corresponding problem ID。
- [ ] Confirm visual diffs can be linked to the corresponding baseline revision。
- [ ] Confirm migration logs can be linked to the starting fixture and recovery note。
- [ ] Confirm all manual checks name the operator, date, environment, and result。
- [ ] Confirm approved deferments include an expiration or follow-up owner。
- [ ] Confirm the release checklist distinguishes verified, failed, blocked, and deferred。
- [ ] Confirm the final status is not changed to completed while any required evidence is missing。
- [ ] Confirm the user receives the exact planning directories and line-count summary。
- [ ] Confirm no implementation branch or code change is implied by this planning handoff。

## T03 接入检查

- [ ] 真实 API server + 前端 server 已验证主题/顶栏与公开、提交、点赞、登录/会话/CSRF、管理 CRUD/资源、T05/T07/T08/T09 数据流。
- [ ] 已验证配置化标题/品牌、GitHub URL/文案和添加新群入口的默认值、变更、外链与提交弹窗路径，且未出现页面硬编码。
- [ ] 主题三态、首屏、Token、响应式、键盘/焦点/Dialog、路由 query 和错误/加载状态均有真实链路证据。
- [ ] prototype 隔离、后端契约不改、跨任务问题 owner 和回归结果已记录；未用 Mock 通过冒充生产接入。

## 16. T03 迁移基线后的有效执行顺序

1. 收集 T02 prototype 完成记录和 T03 visual migration 的正式 `src/` 交接、差异、owner、测试和回滚点。
2. 先验证正式构建/路由不可见 prototype 入口，运行时不 import prototype，不使用 Mock 数据层或原型 storage。
3. 对比 prototype 与正式 src 的页面、Dialog、主题、响应式、焦点、滚动和 reduced-motion 基线。
4. 等待 T04–T09 真实数据接入完成，分别建立 T06/T07/T08/T09 的跨层回归矩阵。
5. 执行真实前端→typed client→API→认证/CSRF/Contract→D1/R2→用户状态链路。
6. 区分并归档视觉迁移缺陷、API/状态缺陷、权限/数据完整性缺陷和测试环境缺陷。
7. 只允许 T10 修复跨任务集成阻塞；页面 UI 重做、领域模型变化和业务规则变化必须退回 owner。
8. 重跑受影响套件、关键 Playwright、视觉对比、migration 和发布冒烟，最终填写 acceptance.md。

### 16.1 新停止条件

- T03 visual migration 未完成或正式 src baseline 尚未得到用户/任务交接确认。
- T06–T09 仍以 prototype Mock 作为通过依据。
- 真实后端接入导致页面需要重新设计，而不是最小 Contract/状态修复。
- 任一任务把 T03 迁移 owner、T04/T05 后端 owner 或 T10 回归 owner 混在同一份无边界修复中。
