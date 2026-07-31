# T02 技术设计：设计语言规范与视觉样例

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务02.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

## 1. 设计状态与决策前提

| 项目 | 决策 |
| --- | --- |
| 任务 | `02-lgqh-v2-ui-design-language` |
| 状态 | 仅完成规划；不得运行 `task.py start` |
| 依赖 | T01 `01-lgqh-v2-spec-audit` 的 `research.md`、`impact-map.md` 及用户可审查的视觉模板 |
| 真实数据 | 禁止连接真实 API、D1、R2、认证或正式 localStorage 业务键 |
| 正式页面 | 只读参考；不得在 T02 原型阶段重构 `HomeView.vue` 或 `AdminView.vue` |
| 正式 Token | 只能先形成候选方案；用户确认前不宣称冻结 |
| 原型入口 | 候选方案已列出，最终方案等待 T01 影响图确认 |

本设计把 T02 拆成“视觉决策层、设计契约层、隔离样例层、验证层”。四层之间的依赖关系如下：

```text
用户模板/参考材料
        ↓ 许可证与特征审查
视觉决策记录（采用/调整/参考/放弃）
        ↓
ui-design.md（Token、主题、布局、组件、状态、无障碍）
        ↓
隔离的固定数据视觉样例
        ↓
Vitest/组件检查 + Playwright 交互检查 + 多视口/人工检查
        ↓
用户四轮评审 → 明确确认 → 后续正式前端任务
```

未获得模板或 T01 隔离结论时，流程只能停在前两层的规划和待输入清单，不得用自拟风格填补空缺。

## 2. 当前仓库证据

### 2.1 样式和入口

- `src/app/main.ts` 创建 Vue 应用、注册 Vue Router、加载 `@/style.css` 并挂载 `#app`。
- `src/app/router.ts` 当前只有 `/`、`/admin/login` 和 `/admin` 三条生产路由。
- `src/style.css` 目前声明 Tailwind 三层，并只有 `--color-primary`、`--color-accent` 两个根级颜色变量，`color-scheme` 为 `light`。
- `tailwind.config.ts` 将 `brand.primary` 和 `brand.accent` 映射到 CSS 自定义属性，说明 CSS 变量可作为候选运行时视觉来源，但当前尚未形成完整 Token 系统。
- `vite.config.ts` 已有本地 R2 只读资源中间件和 `/api` 代理；原型不得借用这两个真实业务边界完成模拟请求。

### 2.2 现有公开端和管理端

- `src/views/HomeView.vue` 当前负责搜索、群组列表、提交 Dialog、Toast 和正式 API 驱动的首页容器。
- `src/views/admin/AdminView.vue` 当前负责管理员检查、群组加载、编辑抽屉、回收站永久删除、群组/仪表盘 Tab 和正式管理员 API。
- `src/features/groups/components/` 已存在 `GroupCard.vue`、`GroupList.vue`、`QrCodeDialog.vue`、`SubmissionDialog.vue`。
- `src/features/admin/components/` 已存在 `AdminGroupTable.vue`、`AdminGroupDrawer.vue`、`AdminGroupSearch.vue`、`AdminStatusFilters.vue`、`TrashConfirmDialog.vue` 等组件。
- `src/shared/components/` 已存在 `Toast.vue`、`ErrorBanner.vue`、`LoadingSkeleton.vue`，但不能默认认为它们已经满足 V2 视觉契约；样例可以以隔离副本或候选展示方式呈现，不得未经审计批量修改正式实现。

### 2.3 测试和运行方式

- `package.json` 已有 `test`、`test:e2e`、`build`、`lint`、`format:check`、`typecheck` 等脚本。
- `playwright.config.ts` 当前同时启动本地 API 服务和 Vite 服务，使用 Chromium 桌面及 Pixel 5 移动项目。原型测试应避免触发写入 API；必要时使用独立的原型测试启动方式或显式拦截全部业务 API。
- `.trellis/spec/guides/testing-strategy.md` 要求 Vue 组件用 Vitest + Vue Test Utils，浏览器关键路径用 Playwright，并要求测试使用可访问 role 优先，而不是实现细节选择器。
- 仓库没有发现 Storybook、设计系统预览目录、用户模板资产或现成视觉截图基线。

## 3. 技术边界

### 3.1 T02 拥有的边界

T02 可以拥有：

1. 前端 Spec 目录中的 `ui-design.md`。
2. 经 T01 影响图确认安全的独立视觉样例目录。
3. 样例专用固定数据、纯视觉辅助函数和本地状态模型。
4. 样例专用页面、入口、测试和审核截图。
5. 设计 Token 草案；只有用户最终确认后，后续 T03 才能决定哪些 Token 进入正式 `src/style.css` / Tailwind 映射。

### 3.2 T02 不拥有的边界

T02 不拥有正式生产页面、正式 API、共享业务 Contract、D1/R2、认证/CSRF、正式路由语义、搜索/分页/状态机、正式管理操作和真实 localStorage 业务键。样例中的搜索、点赞、复制、拖动、删除确认和分页仅是本地体验演示。

### 3.3 共享文件冲突保护

以下文件属于高风险共享文件，T02 默认只读：

- `src/app/router.ts`
- `src/app/main.ts`
- `src/style.css`
- `tailwind.config.ts`
- `src/views/HomeView.vue`
- `src/views/admin/AdminView.vue`
- `playwright.config.ts`
- 现有 `src/features/**` 正式组件

如果 T01 证明必须触碰其中任意文件，必须在 `impact-map.md` 写明归属、最小改动、实现顺序、回滚方式和与 T03/T06/T07/T08/T09 的合并边界；本任务不得因为“方便展示”直接改写。

## 4. 原型隔离方案

### 4.1 选择条件

最终入口必须同时满足：

- 可通过项目文档命令在浏览器运行。
- 不进入正式生产导航。
- 生产构建不会把原型作为默认用户可达路径暴露。
- 不调用真实业务 API、不使用真实管理员会话、不写正式存储。
- 固定数据和视觉状态可重复，截图不依赖后端当前数据。
- 不引入与现有 Vue/Vite/Tailwind 不相容的重量级 UI 框架。
- 后续可以整体删除，或把经过确认的纯视觉部分有边界地提取到 T03/T06 等任务。

### 4.2 候选方案比较

| 方案 | 优点 | 风险/门槛 | 当前处理 |
| --- | --- | --- | --- |
| 独立原型目录 + 开发时隔离入口 | 与正式业务文件边界清楚，固定数据易管理 | 需要 T01 确认 Vite 入口/开发守卫，不得被生产构建暴露 | 首选候选 |
| 独立 Vite 多页面入口 | 页面结构清楚，适合全量视觉样例 | Pages 静态部署可能暴露入口，必须有生产排除策略 | 仅在 T01 证明安全时采用 |
| `import.meta.env.DEV` 保护的预览路由 | 复用现有 SPA 运行时和 Tailwind | 需验证构建消除、路由注册和测试不会污染正式导航 | 候选，不得直接假定安全 |
| 已有 Storybook 类环境 | 组件状态展示自然 | 当前仓库未发现 Storybook，引入重依赖违反原 PRD | 不采用，除非 T01 发现已有环境 |

入口方案在 T01 影响图完成前只记录为候选；最终 `ui-design.md` 必须记录实际路径、启动命令、访问方式和为什么不会进入生产。

### 4.3 入口安全检查

原型实现完成后必须验证：

1. 生产路由列表没有原型导航入口。
2. 原型访问不会经过管理员认证，也不会伪造认证成功。
3. 原型网络请求中没有 `/api/v1` 写请求、D1、R2 上传或真实资源写入。
4. 原型不读写正式 `localStorage` 键；主题状态使用样例专用内存或命名空间。
5. `pnpm build` 后不能通过正式用户可见导航发现原型。
6. 删除原型目录不会破坏正式首页、管理端或正式 Playwright 场景。

## 5. 设计文档契约

### 5.1 `ui-design.md` 的章节契约

文档必须按以下顺序组织，避免后续 Agent 在不同章节重复猜测：

1. 元信息：版本、状态、主要模板、确认日期、用户确认状态。
2. 设计目标：视觉感受、信息密度、公开端/管理端一致性、与 V2 PRD 的关系。
3. 模板分析：采用、调整、放弃和授权。
4. Design Token：颜色、字体、间距、圆角、阴影、尺寸、动效和层级。
5. 主题映射：浅色、深色、自动模式、首屏防闪烁注意事项。
6. 页面布局：容器、顶栏、Section、Grid、Carousel、管理端布局。
7. 响应式：断点、顶栏、卡片、Grid、管理列、Dialog 和抽屉。
8. 组件规范：顶栏、搜索、Section、卡片、Dialog、Carousel、标签、按钮、表单、状态提示、表格和板块容器。
9. 状态规范：Hover、Active、Focus、Selected、Disabled、Loading、Empty、Error、Success。
10. 无障碍：对比度、焦点、触摸目标、键盘、动效和图标标签。
11. 原型说明：路径、命令、入口、模拟数据、隔离方式和已知限制。
12. 后续实现要求：MUST/SHOULD/MAY、何时需要用户再次确认和不得重新决定的内容。

### 5.2 规则优先级

- `MUST`：语义颜色 Token、三态主题、顶栏窄屏文案、卡片字段、最多四行简介、管理列隐藏顺序、Dialog 基础行为、无障碍最低要求。
- `SHOULD`：推荐卡片/Section 间距、阴影层级、渐变遮罩和动效节奏；调整必须说明原因。
- `MAY`：装饰动画、空状态插图、Carousel 渐变遮罩等非核心表达。

模板的页面结构永远不能覆盖 V2 已冻结的信息架构；视觉来源只能改变视觉表达和交互反馈规则。

## 6. Token 与主题技术模型

### 6.1 三层 Token

原始 Token 只表达设计基础量；语义 Token 负责主题映射；组件 Token 负责可审查组件尺寸。页面组件只能消费语义/组件 Token，不得散落任意色值、间距、圆角和阴影。

```text
primitive.color.blue.500 ─┐
primitive.space.4         ├─ semantic.accent / semantic.surface / semantic.text
primitive.radius.md       ┘                  ↓
                                      component.card.radius
                                      component.header.height
                                      component.dialog.maxWidth
```

实际颜色、字体和阴影数值必须来自用户确认模板和 T01 审计，不得在模板缺失时伪造最终值。候选 Token 可先用表格说明名称、用途、浅/深映射和审核状态。

### 6.2 颜色和状态映射

至少建立以下语义组：

- 层级：`background`、`surface`、`surface-raised`、`surface-muted`、`overlay`。
- 文字：`text-primary`、`text-secondary`、`text-muted`、`text-inverse`、`text-link`。
- 边框：`border-default`、`border-muted`、`border-strong`、`border-focus`。
- 操作：`accent`、`accent-hover`、`accent-active`、`accent-foreground`。
- 状态：`success`、`warning`、`danger`、`info`，以及 Hover、Active、Selected、Disabled、Focus ring。

每个颜色要记录用途、浅色值、深色值、对比度检查、是否可用于文字/背景/边框，并说明状态不可只靠颜色区分。

### 6.3 字体、间距、圆角、阴影、动效

- 字体记录家族、系统回退、页面标题、Section 标题、卡片标题、正文、辅助文字、标签、按钮、表格和数字层级；不提交授权不明字体文件。
- 间距使用有限等级，映射到页面边距、Section、卡片、表单、按钮、图标文字和表格单元格。
- 圆角定义小控件、按钮/输入框、普通卡片、大卡片、Dialog 和圆形图标按钮，并明确哪些组件禁止完全圆形。
- 阴影至少覆盖无阴影、轻浮层、卡片 Hover、顶栏/粘性元素、Dialog 和拖拽状态；深色不直接复用浅色阴影值。
- 动效定义快速反馈、展开关闭、Dialog、Carousel、拖拽、Toast 的时长/缓动，并定义 `prefers-reduced-motion` 下只保留必要状态变化的降级规则。

### 6.4 主题运行时边界

T02 只验证主题表现，不实现 T03 的正式主题持久化和首屏脚本。样例的 `system`、`light`、`dark` 应在本地状态中展示：

```text
preference(system|light|dark)
        ↓ 浏览器 prefers-color-scheme（仅样例）
resolvedTheme(light|dark)
        ↓
根节点主题标记 / CSS 语义 Token
```

必须覆盖页面、卡片、文字、边框、阴影、交互态、状态色、Skeleton、遮罩和二维码区域；不要把二维码位图通过主题滤镜改变可读性。

## 7. 响应式布局模型

### 7.1 断点原则

断点以内容最小可用宽度和操作目标为依据。`ui-design.md` 必须同时记录页面级断点和组件级容器规则，避免把一个设备尺寸硬套到所有组件。

### 7.2 页面、顶栏和主要区域

- 页面容器记录最大宽度、桌面/平板/手机边距、超宽屏留白和安全区。
- 顶栏宽屏保留 Logo、网站名、主题图标+文字、GitHub 图标+文字和 `+ 添加新的群组`；窄屏保留 Logo/网站名，主题/GitHub 可只显示图标，添加按钮显示“添加群”，不折叠为汉堡菜单。
- 搜索框切换结果时位置和主要尺寸稳定，避免 Loading 或内容状态让首屏上下跳动。
- 公开首页区域顺序不能因响应式隐藏核心功能而打乱；可调整尺寸和排列，但不得删除核心公开功能。

### 7.3 Carousel、Grid、Dialog 和管理端

- Carousel 手机至少露出两张卡片；记录卡片宽度范围、间距、左右内边距、下一张露出、箭头条件、渐变边缘、鼠标/触摸/滚轮/键盘行为。
- Grid 记录手机、平板、桌面和超宽列数及最小卡宽，手机目标至少两列。
- Dialog 记录桌面最大宽度、手机接近全屏、内容滚动、底部操作区、焦点边界和安全区；管理抽屉记录桌面宽度和窄屏全屏规则。
- 管理表格在完整桌面显示所有列；中等宽度按标签、性质、点赞、平台顺序隐藏；窄屏只保留标题、状态、操作，并通过全屏抽屉保留详情操作。

## 8. 组件技术契约

### 8.1 公开端

| 组件 | 样例必须证明的行为 |
| --- | --- |
| 顶栏 | 宽/窄屏布局、主题入口、GitHub 入口、添加群组入口、焦点和无横向溢出 |
| 主搜索框 | Placeholder、输入、Focus、Loading、清除、错误、位置稳定 |
| Section | 标题/说明/操作区、空状态位置、Grid/Carousel 容器 |
| GroupCard | 头像、标题、平台、四行简介、点赞；无加群按钮/群号/二维码/复制；点赞不触发打开 |
| GroupDialog | 完整内容、多个加群方式、二维码、分享反馈、长内容滚动、关闭、焦点和手机全屏 |
| Carousel | 拖动、点击抑制、横向滚轮、边界、箭头、键盘、触摸和下一张露出 |
| 标签卡片 | 名称/数量、Hover/Focus/Selected、超多标签和展开预留 |

### 8.2 通用和管理端

| 组件 | 样例必须证明的行为 |
| --- | --- |
| 按钮 | 主/次/文本/危险/图标/紧凑，以及默认/Hover/Active/Focus/Disabled/Loading |
| 表单 | 输入、多行、Select、Checkbox、Switch、标签编辑、字符计数、错误、帮助 |
| Toast/ErrorBanner/Skeleton | 成功、错误、警告、信息、加载、深色、手机位置 |
| 管理表格 | 表头、行高、Hover/Selected、状态、排序、操作、分页、空/加载、列隐藏 |
| 板块容器 | 拖拽手柄、标题、启用/排序、成员数、添加/编辑/删除、成员表滚动、空/未启用、拖拽态 |

组件样例只拥有本地展示状态；正式事件和 DTO 不得被样例偷偷复用，以免后续 Agent 把原型逻辑误认为生产契约。

## 9. 样例页面、数据和本地状态

### 9.1 页面结构

样例首页需同时提供默认首页、搜索结果、详情 Dialog、管理群组、管理板块和设计系统展示；如果采用单页状态切换，必须让用户能直接从文档入口访问每个状态，不依赖后端或复杂操作才能到达。

### 9.2 固定数据模型

模拟数据应包含：

- 群组 ID、标题、简介、平台、头像状态、点赞数、liked 状态。
- 多种标题长度：短、接近 50 宽度单位、中文、英文、Emoji、超长词。
- 多种简介：短、超过四行、接近 1000 宽度单位、长内容滚动。
- 多个加群方式、二维码占位展示、分享反馈所需的安全模拟链接。
- 标签名称和数量，超过一屏的标签集合。
- 板块：启用、未启用、空板块、成员较多板块、已发布和已下架成员。
- 管理表格：状态、排序值、标签/性质/点赞/平台列、至少三种宽度展示。
- 加载、空、错误、头像缺失/失败、删除确认和 Toast 状态。

数据必须是版本固定的本地 fixture，不使用 `Date.now()`、随机数、真实后端返回或开发者机器时区生成视觉内容。

### 9.3 交互状态机

```text
主题偏好: system | light | dark
搜索: idle → filtering → results | empty | error
详情: closed ↔ open
点赞: idle → liked / unliked（仅本地展示）
分享: idle → copied / failed（模拟反馈）
Carousel: idle ↔ dragging → settled
板块: collapsed ↔ expanded；drag-idle ↔ dragging
删除: idle → confirm → cancelled / confirmed（仅本地反馈）
```

卡片打开详情必须由卡片主体语义行为触发；点赞控件必须阻止冒泡。搜索和分页只改变 fixture 的本地视图，不调用正式 composable 或 API client。

## 10. 验证设计

### 10.1 Vitest/组件验证

至少设计以下可观察断言：

1. `system`、`light`、`dark` 样例能解析为对应主题表现。
2. 组件只引用语义/组件 Token，Token 展示页列出所有必需类别。
3. 原型入口和各主要视图可渲染。
4. Dialog 可以打开、关闭并显示焦点边界。
5. 标签点击替换本地模拟搜索词。
6. 点赞按钮不会触发卡片打开。
7. 管理列隐藏配置遵守“标签、性质、点赞、平台”顺序并保留“标题、状态、操作”。

测试应按项目既有 Vitest + Vue Test Utils 方式编写，优先 role/label 语义查询，不断言不可见的内部实现细节。

### 10.2 Playwright 验证

原型测试至少覆盖：入口可打开；浅深色切换；桌面/手机首页；卡片打开 Dialog；分享反馈；Carousel 横向操作；窄屏列隐藏；板块成员表内部滚动；没有真实业务 API 请求。

如果现有 `playwright.config.ts` 的双 webServer 会启动真实 API，必须通过隔离入口、请求拦截或单独的原型配置确保上述“无真实 API”断言成立；不得通过关闭核心门禁掩盖错误。

### 10.3 视口和截图

至少检查 360、390、768、1024、1280、1440；另检查 200% 缩放、横屏/窄高度、超长中英文和 Emoji。审核截图至少包括：桌面首页浅色/深色、手机首页浅色/深色、搜索结果、Dialog 桌面/手机、管理群组、板块管理和设计系统展示页。

截图是用户评审材料；在视觉方向确认前不登记为永久正式视觉基线。

### 10.4 无障碍人工检查

自动测试之外逐项人工确认：文字对比度、键盘焦点、图标名称、卡片键盘操作、Dialog 焦点边界、状态非颜色表达、触摸目标、表头层级、深色焦点、减弱动效和放大文字后的主要内容。

## 11. 兼容、风险和回滚

| 风险 | 影响 | 预防/回滚 |
| --- | --- | --- |
| 模板未提供或授权不明 | 无法真实分析或提交资产 | 停在分析框架；只用项目已有/明确可用资源；记录未确认状态 |
| T01 尚未确认共享文件 | 原型入口或 Token 与后续任务冲突 | 不锁定路径；等待 `impact-map.md`，所有共享文件只读 |
| 原型被暴露到生产 | 模拟数据和交互污染用户体验 | 开发隔离、生产构建检查、导航检查、删除验证 |
| 样例误用正式 API/会话 | 触发真实写入或安全风险 | 固定 fixture、请求审计、API 拦截、禁止真实 localStorage |
| Token 草案直接进入正式页面 | 造成全站视觉回归 | 候选 Token 明确标记；由 T03 另行接管正式接入 |
| 重型模板依赖引入 | 依赖和构建复杂度上升 | 不复制模板源码；优先现有 Vue/Vite/Tailwind；超过边界即停止 |
| 视觉截图过早冻结 | 后续模板确认后大量返工 | 截图只作评审材料，不作永久基线 |
| 管理端信息密度过高 | 窄屏操作不可用 | 固定列隐藏顺序、抽屉规则、代表性宽度验证 |
| 深色模式只做机械反色 | 对比度和层级退化 | 语义 Token 双主题逐项审查，包含 Skeleton/遮罩/焦点 |

回滚优先采用删除整个隔离原型目录和撤销样例入口；不得使用 `git reset`、`git restore` 或覆盖其他任务文件解决冲突。

## 12. 后续任务接口

| 后续任务 | T02 提供的接口 | T02 不替其完成的内容 |
| --- | --- | --- |
| T03 主题/Token/顶栏 | 用户确认后的 Token、主题映射、顶栏响应式规则 | 正式 `src/style.css`、Theme composable、首屏脚本和生产顶栏 |
| T06 卡片/Carousel/Dialog | GroupCard 字段/状态、Carousel 行为、Dialog 布局和焦点规则 | 正式 API、URL 深链、真实点赞/分享和生产组件实现 |
| T07 首页/搜索 | 页面区域顺序、Grid/Carousel/搜索视觉和状态 | 正式数据加载、cursor、URL 搜索和区域容错 |
| T08 板块管理 | 板块容器、成员表、拖拽/排序视觉规则 | 真实 CRUD、权限、版本冲突和 API |
| T09 管理分页 | 管理表格列、分页器、抽屉、窄屏状态 | 页码 API、total count、URL query 和删除退页 |
| T10 系统回归 | 视觉样例的审核清单、无障碍清单和截图范围 | 生产全量回归、迁移演练和最终发布验收 |

T02 结束后，所有正式实现任务必须引用 `ui-design.md` 的 MUST 规则；任何偏离必须记录理由并重新触发相应用户确认。

## 13. 规划完成条件

本设计文档在模板和 T01 影响图缺失时只作为候选技术设计，不代表实现已获准。只有依赖、入口、资产授权、Token 来源、生产隔离、测试隔离和用户确认门槛全部明确后，才允许进入后续实施审查；即使满足这些条件，也必须等待用户对最新规划摘要明确批准，才能运行 `task.py start`。
