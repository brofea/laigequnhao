# T03 实施规划：主题系统、设计 Token 与顶栏基础

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务03.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

## 0. 当前执行边界

本文件是未来执行清单，不是本轮实施授权。T03 已创建为 `planning`，本轮不得运行 `task.py start`，不得修改正式前端代码。

- T02 的 `ui-design.md` 尚未用户确认；视觉模板将在实施 T02 时提供。
- T01、T02 未完成前，不得填充最终颜色、字体、圆角、阴影、断点、Logo、GitHub 地址或顶栏视觉偏好。
- 不修改后端、D1、R2、migration、Hono route、repository、service、认证、CSRF 或真实 API。
- 不提前实现 T06 卡片/Carousel/Dialog、T07 首页/搜索、T08 板块、T09 管理分页或大规模页面重构。
- `docs/PRD/v2/子任务01.md` 至 `子任务10.md` 存在用户/并行修改，后续不得覆盖、恢复或回滚。
- 所有真实实现必须先重新读取 T01/T02 当前产物和本任务当前 PRD，再按本清单执行。

## 1. 激活门槛

### 1.1 必须先具备

1. T01 的 `research.md`、`impact-map.md` 和总 PRD 影响结论可审查。
2. T02 已完成，`ui-design.md` 位于正式前端 Spec 目录，状态为用户明确确认。
3. T02 已记录 Token 命名、浅深色映射、响应式、顶栏、无障碍、原型到生产边界和未迁移范围。
4. 用户或正式配置提供真实 GitHub 地址；没有地址不得使用假链接。
5. T01 明确 `src/features/theme/`、`src/style.css`、`tailwind.config.ts`、`index.html`、`site.config.ts`、Header 组件和测试的所有权/合并顺序。
6. 用户明确批准最新 T03 规划摘要；只有后续消息明确批准后才可执行 `task.py start`。

### 1.2 激活前读取和状态检查

未来开始实现前执行：

```bash
python3 ./.trellis/scripts/get_context.py
python3 ./.trellis/scripts/get_context.py --mode phase --step 1.1 --platform codex
python3 ./.trellis/scripts/task.py current --json
git status --short -- docs/PRD/v2 .trellis/tasks src shared functions migrations tests
sed -n '1,260p' .trellis/tasks/08-01-01-lgqh-v2-spec-audit/research.md
sed -n '1,320p' .trellis/tasks/08-01-01-lgqh-v2-spec-audit/impact-map.md
sed -n '1,260p' <T02正式前端Spec目录>/ui-design.md
```

任何依赖、路径、视觉确认状态、配置来源或共享文件归属发生变化，先返回 Phase 1 更新规划，不自行继续。

## 2. 阶段 A：建立实现影响图和配置决策

### A-1 重新盘点实际文件

确认以下文件的当前内容和引用方：

- `src/style.css`
- `tailwind.config.ts`
- `index.html`
- `src/app/main.ts`
- `src/app/App.vue`
- `src/app/router.ts`
- `src/views/HomeView.vue`
- `src/views/admin/AdminView.vue`
- `src/views/admin/LoginView.vue`
- `site.config.ts`
- `shared/domain/config.ts`
- `shared/domain/config.spec.ts`
- `src/shared/browser/storage.ts`
- `src/shared/api/client.ts`
- `src/features/groups/composables/useLikedGroups.ts`
- 现有 Toast、ErrorBanner、LoadingSkeleton、二维码弹窗和管理抽屉

记录真实的 Header、站点配置、存储 key、现有 Tailwind class、主题引用、Router query 和测试入口，不依赖本 PRD 的猜测路径。

### A-2 确定配置语义

在编码前写出决策记录：

- `siteConfig.theme.defaultMode` 是否扩展到 `system`，还是保留旧站点字段并以兼容映射表达 V2 默认 system。
- 无本地偏好时，用户偏好、实际主题和站点配置的优先级。
- GitHub URL 的字段名、schema、真实值来源、缺失时开发/生产行为。
- Logo、网站名和添加群组目标路由的正式配置来源。

推荐方向是让合法配置和用户状态均明确支持 `system|light|dark`，把无本地值的用户偏好设为 `system`；但必须先确认没有其他消费者依赖旧 `light/dark` schema，并用配置测试证明兼容。

### A-3 影响图门禁

如果需要修改 `shared/domain/config.ts`、`site.config.ts`、`src/style.css`、`tailwind.config.ts`、`index.html`、Home/Admin 视图或 Router，必须在 `impact-map.md` 中标注：文件所有者、修改原因、最小范围、与 T02/T06/T07/T08/T09 的冲突、验证命令和回滚点。

## 3. 阶段 B：正式 Token 和 Tailwind

### B-1 从确认 Spec 导入，不自行设计

读取 T02 `ui-design.md` 的 MUST/SHOULD/MAY、浅深色表、字体、间距、圆角、阴影、动效和组件尺寸。逐项建立实现映射表：Spec 名称 → CSS variable → Tailwind semantic key → 消费组件 → 测试。

如果 Spec 仍有未确认值，停在规划；不能用当前 `#2563eb`/`#f59e0b` 或个人偏好代替最终视觉。

### B-2 CSS 自定义属性

在实际确定的样式文件中建立原始/语义/组件层级：

- 页面/表面、文字、边框、分隔线、品牌操作、状态、交互、Skeleton、遮罩。
- 间距、字号、行高、圆角、阴影、动效时长/缓动、z-index。
- 顶栏高度、页面最大宽度、搜索框高度、卡片圆角、Dialog 最大宽度、表格行高等稳定尺寸。

浅色和深色要逐个映射背景、卡片、文字、边框、阴影、Hover、Active、Selected、Focus、Disabled、状态、Skeleton 和遮罩。`color-scheme` 不得继续固定为 `light`。

### B-3 Tailwind 映射和迁移

- 增加语义颜色/尺寸映射到 CSS 变量。
- 保留现有 `brand.primary` / `brand.accent` 兼容别名，确认现有页面仍能构建。
- 新增/修改的 Header 和基础状态只使用语义 Token。
- 不在本阶段批量替换所有页面硬编码颜色；把未迁移清单交给 T06/T07/T08/T09。
- 不引入 UI 框架、图标大库或 Pinia。

### B-4 Token 静态检查

准备 Vitest/脚本检查：必需 Token 存在、浅深色映射成对、命名无重复同义词、Header 无任意十六进制颜色、旧 brand 别名仍解析。Token 展示和实际消费必须共用同一来源。

## 4. 阶段 C：主题模块和浏览器适配

### C-1 主题模块

优先在 `src/features/theme/` 建立单一主题模块，职责包括：

1. `ThemePreference = system|light|dark`。
2. `EffectiveTheme = light|dark`。
3. 初始化、设置偏好、实际主题计算。
4. localStorage 读写和异常回退。
5. MediaQuery 读取、监听、清理。
6. 根节点标记同步。
7. 如确认需要，跨标签页 storage 同步。

组件不得自己读取 storage、监听媒体查询或写根节点；主题控件只调用 `setThemePreference` 并订阅状态。

### C-2 安全 storage

确认主题 key 后集中定义并通过 `src/shared/browser/storage.ts` 或主题专用 adapter 使用。覆盖：

- 无值、合法三态、空/未知/旧值、损坏 JSON、非字符串。
- `localStorage` 不存在、隐私模式、禁用、读写 `SecurityError`、quota 失败。
- 写入失败时内存和 DOM 仍更新。
- 自动模式保存明确的 `system` 字符串。
- 不触碰 `deviceId`/`likedIds` 的 key 和语义。

若修改通用 `setItem`/`removeItem` 使其安全，必须补充现有点赞和 API client 回归；不得将错误吞掉到无法诊断的程度，必要时提供开发环境可观察信号。

### C-3 MediaQuery 适配

封装 `matchMedia("(prefers-color-scheme: dark)")`，首次读取 `matches`，在 system 模式监听 change；支持目标浏览器所需的 listener API，避免无依据的兼容层。手动 light/dark 不被监听覆盖；切回 system 立即读取最新 matches；卸载/HMR 不重复注册。

## 5. 阶段 D：首屏防闪烁

### D-1 方案选择

根据 T01 影响图在 `index.html` 或 Vite 构建注入中选择最小同步 bootstrap。必须让浏览器在 Vue 产生可见内容前获得正确根节点主题。

bootstrap 只能：读取 key、校验三态、读取 system、解析 effective、写根节点标记和必要的 `color-scheme`。禁止 Vue、网络、异步请求、大型模块和业务状态。

### D-2 防漂移

优先共享纯解析函数/常量并用构建时生成或注入 bootstrap；如果技术限制导致小型 inline mirror，必须做 parity 检查，保证 key、合法值、fallback、媒体逻辑、根标记和 color-scheme 与主题模块一致。

### D-3 首屏错误策略

任何异常回退到 `system` 或项目确认的安全实际主题，页面继续加载；不要因坏 storage、matchMedia 不可用或 bootstrap 失败显示空白页面。通过首屏 DOM/慢速人工加载和 Playwright 代表场景确认深色无明显浅色首帧。

## 6. 阶段 E：主题控件和正式顶栏

### E-1 主题控件

按 T02 确认的 UI 形式实现明确的“自动/浅色/深色”选择。覆盖当前偏好文本、图标、菜单/分段/下拉语义、Tab、Enter/Space、适用方向键、Escape、触摸目标、Tooltip/可访问名称和即时反馈。切换不改 URL，不干扰 `q`、`group`、管理页码、筛选和排序。

### E-2 Header 组件

建立共享正式 `SiteHeader` 或等效组件：

- 左：Logo、网站名，延续当前首页导航。
- 右：主题控件、真实 GitHub 外链、添加群组入口。
- 公开首页复用同一组件。
- 登录/管理按架构使用共享品牌/主题壳层或变体，不把公开业务按钮强塞到管理导航。
- Header 不管理搜索、详情、点赞、管理员 session、板块和 analytics。

### E-3 配置接入

从正式 `siteConfig`/配置常量获取网站名、Logo、GitHub URL、添加群组目标。缺 GitHub URL 时开发环境明确警告/失败，不能 fake/hide。外链遵循当前安全策略。

### E-4 宽窄屏

按 `ui-design.md` 实际断点实现：

- 宽屏：Logo/网站名完整；主题/GitHub 图标+文字；`+ 添加新的群组`。
- 窄屏：Logo、原则上网站名；主题/GitHub 图标；`添加群`；不加号、不汉堡、不隐藏。
- 极窄：只压缩间距、Logo 或网站名宽度/视觉截断，不删除核心操作。

检查顶栏高度稳定、安全区、sticky、z-index；不得覆盖 Dialog、Toast 或管理抽屉，不产生页面级横向滚动和文案折行。

### E-5 共享文件冲突

从 HomeView/AdminView 移除或接入现有 Header 时，保留现有搜索、提交、登录、管理 Tab、退出和认证业务；不借机重构页面。T08 后续负责板块导航，T09 负责表格/分页，T03 只提供壳层和 Token。

## 7. 阶段 F：公共状态样式

1. 建立一致 Focus-visible，不能移除 outline。
2. 建立不造成尺寸跳动的 Hover/Active。
3. 建立视觉、指针和原生/ARIA 完整的 Disabled。
4. 建立 Success/Warning/Error/Info 的背景/文字/边框/图标映射，状态不只靠颜色。
5. 提供深浅色 Skeleton base/highlight 和 Loading overlay。
6. 提供 Dialog/Drawer 可消费的遮罩基础和层级约束，不实现 Dialog/Drawer 业务。
7. 通过 `prefers-reduced-motion: reduce` 降级主题过渡、Header、Skeleton、菜单、Hover 位移。

全局样式要小心：不使用宽泛规则破坏所有 button/a/input/table/img/dialog；必要 reset 要有现有页面回归证据。

## 8. 阶段 G：自动化测试

### G-1 配置和纯逻辑

补充 `shared/domain/config.spec.ts` 或对应前端测试，覆盖 `defaultMode` system 兼容决策、GitHub URL、既有平台配置和非法配置。主题单元测试覆盖：

- 无值→system。
- system/light/dark 合法。
- 空、未知、旧值、JSON 损坏、非字符串→system。
- `light`/`dark` 不随 system 变化。
- system 跟随 system light/dark。
- 切回 system 立即采用当前 matches。
- 设置后内存状态/根标记更新，storage 写失败不阻断。
- listener 注册一次、变更更新、卸载清理。
- `matchMedia` 不可用/旧 API 行为。
- storage event，如采用跨标签同步。

### G-2 组件测试

主题控件：三选项、当前偏好、键盘、可访问名称和即时更新。Header：品牌、Logo、GitHub 配置、添加群入口、宽窄文案、窄屏图标、主题切换不改变 Router query。使用 Vue Test Utils/role 语义，不依赖脆弱 CSS 结构。

### G-3 Playwright 主题/首屏

实现以下场景：

1. 清空存储+系统浅色→首次浅色、控件偏好自动。
2. 清空存储+系统深色→首次深色、无明显闪烁。
3. 系统深色+手动浅色→刷新保持浅色、系统变化不覆盖。
4. 系统浅色+手动深色→刷新保持深色。
5. 手动→自动→立即跟随当前系统、后续变化继续跟随。
6. 非法 storage→页面正常、偏好 system、无未处理错误。
7. 检查首次可见 DOM 根节点和 `color-scheme`。

### G-4 Playwright Header/响应式

360、390、768、1024、1280、1440 检查：宽屏文字、窄屏 icon、`添加群`、无加号/汉堡、三操作可用、Logo/网站名规则、无页面级横向滚动、真实 GitHub 外链、添加群目标、主题不改 query。补充 Tab/Enter/Escape/焦点、Tooltip、200% 缩放和 reduced motion 代表场景。

### G-5 现有功能回归

至少回归：首页打开、搜索输入、登录页、管理页、群组提交入口、Toast、ErrorBanner、管理抽屉、二维码弹窗层级、点赞按钮。只修复 T03 导致的功能回归，不承担后续任务视觉改造。

## 9. 阶段 H：截图、构建和质量门禁

生成并记录：顶栏桌面/手机浅色/深色、主题控件浅深色、公开页面基础 Token 浅深色、管理页面基础 Token 浅深色。T02/T03 用户视觉尚未确认前，截图只作审核材料，不成为永久基线。

未来按项目质量规范运行：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

如改动 `shared/` 配置 schema、跨层配置或测试初始化，再运行并记录：

```bash
pnpm test:workers
```

不得以“主题是前端”自动跳过构建、现有测试或配置回归；也不得在无范围理由时重复重跑掩盖不稳定。

## 10. 阶段 I：实现后文档和交接

更新本任务文档或实现说明，准确记录：

- CSS Token、Tailwind、主题模块、bootstrap、Header、测试文件路径。
- 主题 key、默认 preference、root 标记、实际主题解析、监听和非法值回退。
- GitHub 配置来源、添加群组路由、宽窄断点、sticky/z-index。
- 已迁移旧样式、仍未迁移组件和交给 T06/T07/T08/T09/T10 的范围。
- 运行的每条命令、结果、截图位置和人工检查项。
- 任何与 `ui-design.md` 的差异、用户反馈和重新确认记录。

## 11. 风险停止条件

遇到任一条件立即停止并回到 Phase 1：

1. T02 没有用户确认或 Token/顶栏视觉未决。
2. 需要通过假设补齐 GitHub 地址、Logo、颜色、字体或断点。
3. `site.config.ts` 的 `defaultMode` 消费者与 `system` 兼容方案未查清。
4. bootstrap 和运行时模块无法保持同一 key/解析/fallback/根标记。
5. localStorage 异常会使应用崩溃或破坏现有 liked/device 状态。
6. Header 接入要求重构首页、管理、板块、搜索或分页业务。
7. 主题切换修改了 URL、业务状态、认证或后端数据。
8. 窄屏只能靠隐藏主题/GitHub/添加操作或汉堡菜单才能布局。
9. 新增大型 UI/状态依赖、授权不明资产或大规模全局 CSS 破坏旧页面。
10. 并行修改产生冲突且重新读取后无法安全应用；不得使用破坏性 Git 命令解决。

## 12. 最终验收清单

- [ ] T01/T02 依赖与用户确认状态真实可追踪。
- [ ] `ui-design.md` 的 Token/主题/Header MUST 已逐项映射。
- [ ] `defaultMode`/GitHub 配置的兼容决策和测试完整。
- [ ] CSS/Tailwind 三层 Token、浅深色和状态映射完整。
- [ ] 三态主题、持久化、异常回退、system 监听和清理完整。
- [ ] 唯一根节点标记、`color-scheme` 和首屏 bootstrap 一致。
- [ ] Header 三项核心操作、宽窄屏、路由和配置行为完整。
- [ ] Focus/Disabled/状态/Skeleton/遮罩/reduced-motion 完整。
- [ ] 现有公开、登录、管理、提交、Toast、ErrorBanner、抽屉、二维码、点赞流程无回归。
- [ ] Vitest、Playwright、截图、六种视口、200%/键盘/人工对比度验证记录完整。
- [ ] 未实现 T06/T07/T08/T09 的业务范围。
- [ ] 所有命令结果和实际文件边界已记录。

只有用户明确确认最新规划并且全部实施门禁满足后，才可在后续消息中进入激活审查；本轮不得启动任务。

## 13. 最终汇报格式

完成后按以下顺序汇报：

1. Token 实现位置、主题模块、bootstrap、Header 和测试路径。
2. localStorage key、默认偏好、根标记、监听、非法回退和首屏防闪烁方式。
3. 宽屏/窄屏 Header、GitHub 来源、添加群组路由和断点。
4. Vitest/Playwright/构建命令、通过情况、截图和人工检查。
5. 已迁移旧样式、未迁移组件、后续子任务接口和非阻塞问题。
6. 明确确认未修改后端/数据库、未实现板块/卡片/首页/分页、未引入大型 UI 框架、未保留 Mock 逻辑。

成功完成时才使用“正式设计 Token、三态主题系统和全站顶栏已完成，后续前端子任务可基于该视觉基础继续实施”；存在 T02 确认、配置、首屏、回归或边界阻塞时必须逐项列出，不得标记完成。
