# T03 技术设计：主题系统、设计 Token 与顶栏基础

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务03.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

## 1. 设计状态与依赖

| 项目 | 决策 |
| --- | --- |
| 任务 | `03-lgqh-v2-theme-header-foundation` |
| 当前阶段 | 仅规划；保持 `planning`，不得运行 `task.py start` |
| 依赖 | T01 审计/影响图；T02 用户确认后的 `ui-design.md` 和视觉样例 |
| 正式目标 | CSS/Tailwind Token、三态主题、首屏初始化、正式顶栏、公共基础状态 |
| 不拥有 | 后端、数据库、API、卡片、Carousel、Dialog、首页信息架构、板块、管理分页 |
| 未决输入 | T02 的具体 Token 值；真实 GitHub 地址；T01 的最终共享文件所有权 |

T03 的核心设计原则是“一个主题状态源、一个根节点标记、一个 Token 运行时来源、一个正式顶栏边界”。页面组件不能各自解释主题，首屏脚本不能与运行时模块维护两套不一致判断，后续功能不能重新定义品牌颜色或响应式顶栏。

## 2. 已验证的仓库事实

### 2.1 当前前端结构

- `src/app/main.ts` 创建 Vue 应用、注册 Router、加载 `@/style.css` 并挂载 `#app`。
- `src/app/App.vue` 当前只渲染 `RouterView`。
- `src/app/router.ts` 当前生产路由是 `/`、`/admin/login`、`/admin`。
- `src/style.css` 目前只有 Tailwind 层、`--color-primary`、`--color-accent` 和 `color-scheme: light`。
- `tailwind.config.ts` 目前只把 `brand.primary` / `brand.accent` 映射到 CSS 变量。
- `index.html` 当前没有 Vue 挂载前的主题初始化脚本。

### 2.2 当前配置和存储

- `site.config.ts` 通过 `siteConfigSchema` 校验站点配置，当前主题字段为 `primaryColor`、`accentColor`、`defaultMode: "light"`，没有 GitHub URL。
- `shared/domain/config.ts` 当前 `defaultMode` schema 只接受 `light` / `dark`；`shared/domain/config.spec.ts` 已有配置校验测试。
- `src/shared/browser/storage.ts` 的 `getItem` 会解析并校验 JSON、失败时删除值；`setItem` 和 `removeItem` 当前可能直接抛出存储异常。
- `src/features/groups/composables/useLikedGroups.ts` 和 `src/shared/api/client.ts` 仍使用 `deviceId`/`likedIds`，主题 key 必须独立，不能重命名或污染这些业务状态。

### 2.3 当前页面和组件

- `src/views/HomeView.vue` 自己渲染公开 Header、Logo/名称、提交按钮和搜索框。
- `src/views/admin/AdminView.vue` 自己渲染管理 Header、Tab、退出按钮和管理容器。
- `src/shared/components/Toast.vue`、`ErrorBanner.vue`、`LoadingSkeleton.vue` 已存在，是公共基础状态的候选消费方，但本任务不提前重写它们的业务行为。
- `src/features/admin/composables/useAdminAuth.ts`、`useAdminGroups.ts` 和正式编辑/抽屉组件属于管理业务边界，顶栏不得接管其状态。

### 2.4 规范和测试

`.trellis/spec/frontend/directory-structure.md` 已预留 `src/features/theme/`，要求浏览器边界封装在适配器/composable；`.trellis/spec/frontend/architecture.md` 要求站点主题进入根节点 CSS 变量、机构值来自 `site.config.ts`，禁止组件硬编码；`.trellis/spec/guides/testing-strategy.md` 要求 Vue 组件用 Vitest + Vue Test Utils、浏览器关键路径用 Playwright，优先按 role 查询。

## 3. 分层架构

```text
site.config.ts + ui-design.md
        ↓ 站点配置 / 已确认设计契约
shared/domain/config.ts + src/features/theme/constants.ts
        ↓ 类型、schema、Token key、存储 key
src/shared/browser/storage.ts + media-query adapter
        ↓ 安全浏览器能力
src/features/theme/theme.ts / useTheme.ts
        ↓ preference、effectiveTheme、根节点同步
src/app/main.ts + index.html bootstrap
        ↓ 首屏和运行时一致
src/shared/components/SiteHeader.vue + theme control
        ↓
HomeView / 登录壳层 / AdminView 的有限接入
```

依赖方向保持前端架构规范：页面/组件消费主题状态和语义 Token；主题模块不依赖业务 API、D1、Functions、管理员会话或群组 DTO；根节点初始化不依赖 Vue、网络或异步生命周期。

## 4. 配置兼容设计

### 4.1 站点配置与用户偏好分离

现有 `siteConfig.theme.defaultMode` 是站点配置，T03 的 `ThemePreference` 是当前用户偏好，`EffectiveTheme` 是运行时解析结果。三者不能共用一个含义：

```text
siteConfig.theme.defaultMode  # 无本地偏好时的站点默认偏好
ThemePreference               # system | light | dark，用户可持久化选择
EffectiveTheme                # light | dark，当前实际显示
```

V2 明确要求默认用户偏好为 `system`，因此实现前要决定是否把 `themeConfigSchema.defaultMode` 扩展为 `system|light|dark` 并把根配置改为 `system`。该变更只能在 T01 确认 `site.config.ts` 的实际消费者后进行；当前搜索未发现 Functions 使用它，但仍需运行完整类型/配置测试确认。

如果保留 `defaultMode` 作为旧站点配置字段，则必须明确兼容映射：合法值仍能解析，用户无本地值时按 V2 规则默认 `system`，不能出现配置“light”导致用户偏好语义被误判的双重来源。

### 4.2 GitHub 地址

当前配置没有 GitHub 字段。推荐在既有 `SiteConfig` 中增加经 schema 校验的 `githubUrl` 或等效前端配置项，并由 T01/产品输入提供真实值。配置没有真实值时：

- 开发环境给出可发现的配置错误。
- 生产不能渲染无效链接、模板作者链接或假地址。
- 不通过后端 API 获取，也不在组件内重复硬编码。

实际字段名、是否必填以及部署配置来源必须在实施前记录到 `ui-design.md` 和 `impact-map.md`。这不是新增后端契约。

## 5. Token 运行时模型

### 5.1 三层关系

```text
primitive tokens
  ├─ color scale / space / type / radius / shadow / motion / z-index
  ↓
semantic tokens
  ├─ background / surface / text / border / accent / status / focus
  ↓
component tokens
  ├─ header height / search height / card radius / dialog width / table row height
```

原始 Token 只作为语义映射输入；组件和页面不应大量直接使用 primitive。语义 Token 是主题切换的唯一 CSS 消费面；组件 Token 只为稳定尺寸建立，不为一次性局部间距创建变量。

### 5.2 语义 Token 集合

必须从已确认 `ui-design.md` 导入具体值并保持名称一致，至少包括：

- `background`、`surface`、`surface-raised`、`surface-muted`、`input`、`overlay`。
- `text-primary`、`text-secondary`、`text-muted`、`text-inverse`、`text-link`、`text-disabled`。
- `border-default`、`border-muted`、`border-strong`、`border-focus`、`divider`。
- `accent`、`accent-hover`、`accent-active`、`accent-foreground`、`secondary`。
- `success`、`warning`、`danger`、`info` 的背景、文字和边框关系。
- `interactive-hover`、`interactive-active`、`selected`、`focus-ring`、`disabled`。
- `skeleton-base`、`skeleton-highlight`、`loading-overlay`。

每个语义 Token 需要对应浅色/深色值、用途、对比度检查和是否允许用于文字/背景/边框。二维码图片不能接受会破坏识别的主题滤镜。

### 5.3 Tailwind 兼容

在 `tailwind.config.ts` 增加语义映射，同时保留现有 `brand.primary` / `brand.accent` 兼容别名，避免一次性破坏旧组件。Tailwind class 只负责消费 CSS 变量；不要把浅色和深色重复写成两套独立 class，也不要在配置中重复保存最终颜色值。

### 5.4 公共状态 Token

焦点、Hover、Active、Disabled、Success、Warning、Error、Info、Skeleton、遮罩和动效都必须拥有语义值。状态不能只靠色相区分，组件还需使用文字、图标、边框、形状或原生状态。Focus ring 不得被 reset 删除；Disabled 不得只通过透明度表达。

## 6. 主题状态设计

### 6.1 状态类型和不变量

```ts
type ThemePreference = "system" | "light" | "dark";
type EffectiveTheme = "light" | "dark";
```

不变量：

- `preference === "light"` 时 `effectiveTheme === "light"`。
- `preference === "dark"` 时 `effectiveTheme === "dark"`。
- `preference === "system"` 时 `effectiveTheme` 来自当前媒体查询。
- 用户看到的控件选项表达 `preference`，不能用 `effectiveTheme` 代替。
- 主题切换不修改 Vue Router URL、`q`、`group`、管理页码、筛选或排序。

### 6.2 推荐模块职责

实际路径优先为 `src/features/theme/`，可拆为：

- `constants.ts`：存储 key、根标记、类型相关常量、必要配置。
- `theme.ts` 或 `useTheme.ts`：唯一的偏好/实际主题状态、设置、监听和生命周期。
- `storage.ts` 或 `src/shared/browser/storage.ts` 的安全扩展：只负责浏览器存取，不理解业务主题之外的数据。
- `media-query.ts`：封装 `matchMedia`、兼容 listener API 和可替换测试边界。
- `theme-bootstrap.ts`：生成或维护首屏最小初始化规则，不能导入 Vue。

不要为主题引入 Pinia 或新的全局状态库；不要让每个 ThemeControl 自己读写 localStorage、注册媒体监听或修改 `document.documentElement`。

### 6.3 初始化、设置和清理

推荐公开的语义操作：

```ts
themePreference: Ref<ThemePreference>
effectiveTheme: ComputedRef<EffectiveTheme>
setThemePreference(preference: ThemePreference): void
initializeTheme(): () => void
```

是否使用 composable、单例 service 或现有架构形式，需在 T01 影响图确认后定稿，但必须保证全局监听/根节点同步只有一个负责人。`initializeTheme` 可重复调用时不得重复注册监听，销毁时必须移除监听。

### 6.4 持久化错误边界

存储 key 例如 `lgqh:theme-preference`，实际名称必须在实施前搜索确认并写入文档。读取：不存在或合法 `system/light/dark` 之外的值都回退 `system`；JSON 损坏、`SecurityError`、隐私模式和 quota 问题都不应让应用崩溃。写入失败时内存状态和当前 DOM 仍立即更新。

现有 `getItem` 已能处理 schema 解析失败，但 `setItem`/`removeItem` 需要安全化或主题自己使用防御性 adapter。若改造共享 storage，必须回归 `likedIds`；不得顺手重构 `deviceId`。

### 6.5 系统媒体监听

`system` 模式创建/使用一个 `MediaQueryList`，首次取 `matches`，监听 change；手动模式不被覆盖，切回 system 立即读取当前 matches。兼容 `addEventListener/removeEventListener` 与目标浏览器需要的旧 API，但只添加有证据的兼容代码。`matchMedia` 不存在时使用文档规定的安全实际主题，并保持应用可启动。

如果 T01 认为跨标签页同步在本项目范围内稳定可行，监听 `storage` 事件并忽略当前页不需要重复处理的写入；否则记录延期，不制造无必要的全局同步复杂度。

## 7. 首屏主题设计

### 7.1 两阶段一致性

```text
index.html 内联/构建注入 bootstrap
  → 读取 key / 校验 preference / 解析 system
  → 写 document.documentElement 的唯一主题标记
  → 浏览器加载 CSS
  → Vue 主题模块接管同一 preference/effectiveTheme
  → 监听系统和用户操作
```

bootstrap 必须同步、最小、无网络、无 Vue、无动态大型依赖、错误安全。它不能使用一套不同的 key、合法值、系统 fallback 或根标记。

### 7.2 去漂移策略

优先采用共享常量/纯解析函数和构建期生成的内联脚本，使 `index.html` 使用的逻辑来自同一实现；若 Vite 构建注入会引入过高复杂度，则采用边界很小的内联镜像，并为 key、合法值、fallback、根标记和首屏行为建立 parity 测试。不能同时存在未经测试的两套主题判定。

### 7.3 元数据

根据 T02 Spec 决定同步 `meta[name="color-scheme"]` 或根节点的 `color-scheme`。当前 `src/style.css` 固定 `color-scheme: light`，实现时必须清理该错误固定值，确保原生表单控件与有效主题一致。

## 8. 顶栏组件设计

### 8.1 边界和复用

建立公开端正式 `SiteHeader` 或等效共享组件，负责：

- Logo/网站名展示与首页导航。
- 三态主题控件。
- GitHub 外链。
- 添加群组入口。
- 桌面/窄屏布局、焦点、Tooltip 和安全区。

它不负责搜索、详情、点赞、管理员会话、板块数据和 Analytics。公开 `HomeView` 应复用统一组件；登录页和管理端可以复用共享品牌/主题基础或使用变体，但不能强行把公开业务按钮插入管理业务导航。

### 8.2 配置来源

- 网站名称、Logo、GitHub URL 来自 `siteConfig` 或 T01 确认的正式前端配置。
- 添加群组使用当前现有提交入口，保持其路由/弹窗语义。
- 不在 Header 中硬编码机构名称、临时 GitHub 地址或模板品牌。
- 缺失 GitHub 配置时开发环境显式报错/可发现；生产不能出现无效 href 或静默移除产品要求的操作。

### 8.3 路由行为

Logo/网站名延续现有首页导航，是否清除 query 按现有路由规范；主题切换只改主题状态；GitHub 打开正式外链；添加按钮进入现有提交流程。无论当前 URL 有 `q`、`group`、管理页码、筛选或排序，切主题不应改变 URL。

### 8.4 响应式布局

| 宽度状态 | 必须保留/显示 |
| --- | --- |
| 宽屏 | Logo、网站名、主题图标+文字、GitHub 图标+文字、`+ 添加新的群组` |
| 中间态 | 依据 T02 断点压缩间距/Logo/网站名，不折行、不遮挡 |
| 窄屏 | Logo、原则上网站名、主题图标、GitHub 图标、`添加群`；禁止单独加号、汉堡菜单和功能隐藏 |

极窄只按已确认 Spec 处理 Logo 缩小、网站名最大宽度/视觉截断或间距压缩；不能临时删除主题、GitHub 或添加入口。顶栏高度稳定，安全区、z-index 和 sticky 行为遵循 T02；如 sticky，不能覆盖 Dialog、Toast 或管理抽屉。

## 9. 公共状态和动效设计

### 9.1 Focus/交互

所有按钮、链接、输入、图标按钮、菜单项和可点击卡片使用一致可见 Focus-visible。Hover/Active 只改变变量、颜色、阴影或不影响布局的属性，不通过改变边框宽度制造跳动。Disabled 需要原生 disabled/ARIA、视觉弱化和不误导的 Hover 行为。

### 9.2 Skeleton/遮罩

提供可被后续 Toast、ErrorBanner、LoadingSkeleton、Dialog/Drawer 使用的基础 Token，不提前实现所有业务布局。Skeleton 在深色可辨识；遮罩不遮断 Dialog/Drawer 层级；状态不只用颜色。

### 9.3 动效降级

通过 `@media (prefers-reduced-motion: reduce)` 或等效方式降级主题过渡、顶栏按钮、Skeleton、菜单开关和 Hover 位移。避免整个页面长时间颜色过渡造成主题切换二次闪动。

## 10. 与后续任务的接口

| 后续任务 | T03 提供 | T03 不做 |
| --- | --- | --- |
| T06 | Token、公共状态、卡片/Dialog/Carousel 可消费的主题和焦点基础 | 卡片、Carousel、详情、深链、真实点赞/分享 |
| T07 | Header、页面容器、搜索框可消费的视觉基础 | 首页区域、搜索、cursor、区域容错 |
| T08 | 管理端基础壳层/主题/焦点/状态 Token | 板块导航、CRUD、拖拽、成员表 |
| T09 | 表格/分页/抽屉可消费的行高、状态、响应式基础 | 页码 API、列逻辑、抽屉业务 |
| T10 | 主题、顶栏和基础状态的截图/回归契约 | 最终全系统视觉验收 |

T03 不能把业务组件硬编码成自己的视觉分支；后续任务必须引用已确认 Token，若要偏离 MUST 规则应重新触发产品/设计确认。

## 11. 测试设计

### 11.1 纯逻辑/存储测试

覆盖：无值→system、合法三值、空/未知/旧值/JSON 损坏/非字符串→system、有效主题解析、写入失败仍更新内存、根节点标记、手动主题不受系统变化、system 跟随系统、切回 system 立即读取、监听注册/清理不重复、`matchMedia` 不可用、storage 事件（如实现）。

配置测试覆盖 `defaultMode` 的新语义/兼容值、GitHub URL 缺失/非法/合法和不破坏现有平台配置。

### 11.2 Vue 组件测试

主题控件覆盖三选项、当前偏好语义、键盘/可访问名称、即时切换；Header 覆盖 Logo/网站名、GitHub 配置、添加群入口、宽窄文案和主题切换不改路由。必要时用 `@vue/test-utils` 模拟 `matchMedia`、localStorage 和 Router。

### 11.3 Playwright

至少覆盖：

1. 清空存储+系统浅色→首次浅色/偏好自动。
2. 清空存储+系统深色→首次深色/无明显闪屏。
3. 系统深色+选择浅色→刷新仍浅色，系统变化不覆盖。
4. 系统浅色+选择深色→刷新仍深色。
5. 手动主题切回自动→立即跟随当前系统，后续系统变化实时跟随。
6. 非法 storage→页面正常、偏好自动、无未处理错误。
7. 首屏 DOM/截图在 Vue 可见内容前已有正确根标记。
8. 360、390、768、1024、1280、1440 顶栏布局和文字/icon 变化。
9. GitHub 正确外链、添加群组进入现有入口、主题切换保持当前 query。
10. 200% 缩放、焦点、键盘、无横向溢出和 reduced motion 的代表场景。

### 11.4 回归范围

最少验证：首页打开、搜索输入、登录、管理、群组提交入口、Toast、ErrorBanner、管理抽屉、二维码弹窗层级和点赞按钮。T03 不需要修复后续任务的视觉差异，但必须修复自己的全局样式/根布局引入的功能破坏。

## 12. 风险、兼容和回滚

| 风险 | 处理 |
| --- | --- |
| T02 未确认/Token 值不明 | 停止生产实现；不自行填色，等待 `ui-design.md` |
| `defaultMode` 旧 schema 与 system 冲突 | 先审查消费者，扩展 schema/配置并补测试，保留合法旧值兼容策略 |
| GitHub 地址未提供 | 不填假地址；配置项和开发错误可先规划，真实值补齐后才验收 |
| 首屏脚本与运行时漂移 | 共享常量/纯函数或 parity 测试；首屏失败回退 system |
| localStorage 禁用 | 内存状态照常切换；安全 adapter 吞掉异常并测试点赞回归 |
| 主题监听重复 | 单例负责人、生命周期清理、重复初始化测试 |
| Header 与 T08/T09 冲突 | T03 只提供壳层/视觉；在 impact map 标注共享文件和合并顺序 |
| 全局 CSS 破坏旧页 | 局部语义 class、保留旧别名、逐页回归，不使用宽泛 reset |
| 窄屏隐藏核心操作 | 固定断言三个操作可达，改为压缩/截断而非删除 |
| 顶栏层级覆盖 Dialog/Drawer | 定义 z-index 层级并在现有二维码/抽屉 E2E 回归 |

回滚优先按文件所有权撤销 T03 的 Token/主题/顶栏改动并恢复旧别名；不得使用 `git reset`、`git restore`、`git checkout` 或覆盖其他任务工作区的破坏性操作。

## 13. 规划完成条件

本设计文档在 T02 未确认、模板未提供和 T01 影响图未完成时只是有证据的候选技术设计。只有依赖、配置语义、Token 来源、首屏方案、Header 所有权、GitHub 配置、存储边界、测试隔离和后续集成顺序均明确后，才可进入激活审查；即便满足，也要等待用户对最新规划摘要明确批准，才能运行 `task.py start`。
