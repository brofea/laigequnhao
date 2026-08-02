# T06 技术设计：群组卡片、Carousel 与详情弹窗

> 范围修订（2026-08-02）：视觉结构和交互样例由 T02 `prototype/` 提供，正式迁移由 `08-02-t03-visual-migration` 负责；本设计只规划迁移后正式组件的真实数据、路由、安全、状态和测试接入，不重复设计页面布局。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务06.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计草案，依据 T02/T03/T04 规划和 T06 源 PRD；实现前必须用仓库现状冻结文件路径、组件 API 和视觉参数。

## 1. 设计目标

T06 提供三类可复用能力：统一摘要卡片、业务无关的原生横向 Carousel、URL 驱动的公开群组详情 Dialog。设计把视觉容器、数据加载、点赞状态、Router 状态、公开安全和可访问性分开，避免 T07 再次实现一套行为。

核心不变量：

- 卡片只显示公开摘要，不持有详情请求或 Router 真值。
- Carousel 不理解群组，不自动轮播，不无限循环，不依赖实例随机。
- Dialog 的 open state 与 `group` query 一致。
- 详情来源只返回当前公开群组；旧请求不能覆盖当前 URL。
- 任何关闭方式都更新 URL、焦点和滚动锁定。

## 2. 实施前现状审计

必须实际读取并记录：

1. `src/features/groups` 当前卡片、列表和 composable。
2. `useLikedGroups.ts` 及设备 ID/localStorage 逻辑，避免碰撞已有 `likedIds` key。
3. 当前二维码 Dialog、复制工具、Toast 和外链安全函数。
4. Vue Router 创建、query parser、页面布局和 route transition。
5. 当前 public group DTO、详情接口/route/service/repository。
6. 图片组件、WebP 失败占位和 lazy loading 约定。
7. T02 的 `ui-design.md`、卡片/Dialog/Carousel 样例。
8. T03 的 theme/token、overlay/z-index、focus、motion 变量。
9. 当前 Dialog/Drawer 基础组件是否已有 focus trap、body lock、Escape。
10. Vitest、Playwright 的 viewport、mobile context、clipboard 和 browser history helper。

如果现有组件已满足某一项，优先包裹/修复而非重复新建；如果视觉样例尚未进入仓库，设计把样例输入列为实现前置，不自行冻结最后视觉数值。

## 3. 组件架构

### 3.1 `GroupCard`

纯展示/交互组件：

```text
props:
  group: PublicGroupSummary
  liked: boolean
  likeCount: number
  likePending?: boolean
  layout?: 'carousel' | 'grid'

emits:
  open-details(groupId)
  toggle-like(groupId)
```

卡片不调用 Router、fetch 或 storage；页面/feature composable 连接 emits。主体使用合法的非嵌套交互 DOM；可采用一个可聚焦 card surface + 独立 `button`，或使用不包裹内部 button 的结构。Enter/Space 由主体处理，Space 必须阻止页面滚动。

### 3.2 子组件

可以拆出 `GroupAvatar`、`GroupPlatformBadge`、`GroupLikeButton`，但需避免每卡片创建全局监听。头像固定 aspect/尺寸、lazy、失败占位；辅助文本不重复朗读标题。平台同时有文本/accessible name。点赞事件阻止冒泡，并复用现有 composable。

### 3.3 `HorizontalCarousel`

建议 API：

```text
props:
  ariaLabel
  showControls?
  scrollStep?: 'card' | 'viewport'
  snapMode?: 'mandatory' | 'proximity'

slots:
  default cards

expose/events:
  scrollState { hasOverflow, atStart, atEnd, dragging }
```

组件只控制滚动容器、snap、resize、pointer/wheel/keyboard和按钮。它不负责 query、group data、like 或 Dialog。

### 3.4 `GroupDetailsDialog`

纯 Dialog 层接收：

```text
props:
  groupId
  summary?: PublicGroupSummary
  details?: PublicGroupDetails
  loadState
  likeState
  error?

emits:
  close
  retry
  toggle-like
  share
  join-method-action
```

页面容器/route controller 负责传入当前 URL 对应的数据。Dialog 不自行决定 push/replace，以便 T07 复用。

### 3.5 Route controller

建立 `useGroupDetailsRoute` 或等效集中模块：

- 读取/校验 `group`。
- 判断页面内 push 来源和直接深链接来源。
- 打开使用 `router.push`，保留其他 query。
- 页面内关闭优先 `router.back`，深链接关闭 `router.replace` 清除 group。
- 处理 browser back/forward、重复 ID、无效 ID。
- 生成 canonical share URL。

不能在每个 card 里拼接 query；不能只用本地 `isOpen`。

## 4. 卡片视觉/布局设计

### 4.1 内容模型

`PublicGroupSummary` 复用现有 public DTO；字段至少为 id、avatar、title、platform、description、likeCount、liked/设备状态所需信息。卡片不需要完整 join methods、QR 或管理状态。

标题由 T04 已验证的最大 50 display-width 输入保证数据合法，视觉用两行 CSS line clamp；简介数据保持原文，视觉用四行 line clamp。详情数据必须来自完整字段，不能从 clipped DOM 恢复。

### 4.2 极端文本

CSS/DOM 处理：

- `overflow-wrap: anywhere` 或项目安全等效处理长连续英文/URL。
- line clamp 用 CSS，不用 JS substring。
- 固定头像容器和内容 min-height 减少布局跳动。
- 大点赞数使用现有 formatter，预留宽度避免操作区跳动。
- Emoji/中日韩混合由浏览器渲染，业务宽度已经在 T04 处理。

### 4.3 响应式

最终 gap/card width 从 T02 样例读取。设计必须验证 360、390、768、1024、1280、1440：手机 Carousel 至少显示两卡和下一卡提示，Grid 容器可在后续 T07 控制；卡片本身不依赖某个首页 section。

## 5. Carousel 交互设计

### 5.1 原生滚动

滚动区使用 `overflow-x: auto`、`scroll-snap-type`、`scroll-snap-align`，默认不隐藏可访问的滚动语义。触摸使用原生惯性，`touch-action` 不能锁死 pan-y。禁止自动播放、无限 clone、定时器和第三方重量级 Carousel runtime。

### 5.2 Scroll state

用 scroll event（必要时 throttle）和 ResizeObserver 计算：

```text
hasOverflow = scrollWidth > clientWidth + epsilon
atStart = scrollLeft <= epsilon
atEnd = scrollLeft + clientWidth >= scrollWidth - epsilon
```

子项变化、字体加载、viewport resize、容器宽度变化后重新测量。组件卸载清理 scroll、resize、pointer、wheel listeners。

### 5.3 Mouse drag

以 pointer capture/项目现有手势 helper 实现：记录起点和 scrollLeft，横向位移超过设计阈值标记 dragging，更新 scrollLeft；pointerup/cancel 清理。dragging 状态只抑制当前手势的一次卡片 click，不能把后续点击永久禁用。内部 like button 按下不应进入 Carousel drag，需判断 target/interactive element。

具体阈值在实现前用视觉/设备试验冻结，测试固定该值；过小会把点击误判拖动，过大会让手势迟钝。

### 5.4 Touch

优先让原生 `overflow-x` 处理，不复制惯性算法。若 pointer helper 参与 click suppression，保证纵向位移交给页面。真实 iOS/Android 设备补人工验证，Playwright mobile context 验证基本触摸语义。

### 5.5 Wheel

Wheel handler 只在必要时 `preventDefault`：

1. 当前容器有横向 overflow。
2. 不是 ctrl/meta zoom。
3. pointer 位于该 Carousel。
4. Dialog 内部纵向滚动不复用该 handler。
5. 事件主方向可转换且对应方向仍有空间。

中间位置可将 `deltaY` 转为受控 `scrollLeft`；边界继续滚动时不 preventDefault，让页面接管。deltaX 触控板保留原生，不重复转换。无 overflow 完全放行。监听配置必须和 preventDefault 配套，并在 destroy 清理。

### 5.6 Keyboard

根据 T02/无障碍审计选 natural Tab 或 roving tabindex，只选一种。ArrowLeft/Right 控制目标卡片/滚动步长，不劫持 input/textarea/contenteditable；Home/End 若实现一起测试。目标滚入可视区，focus ring 使用 T03 Token。

### 5.7 Controls/提示

有 overflow 才显示箭头/边缘提示；atStart/atEnd 禁用对应按钮；无 overflow 不拦截 Wheel/不显示假控件。滚动步长以一个卡片或可视宽度减 overlap，由 T02 样例冻结。渐变使用 Token。

## 6. Dialog 设计

### 6.1 语义

优先复用现有可访问 Dialog；若无，则实现 `role=dialog`、`aria-modal=true`、`aria-labelledby` 和描述关联。关闭按钮固定可见，标题为群组标题或“群组详情：标题”。遮罩和内容点击边界清晰，不用普通 fixed div 冒充。

### 6.2 数据状态

```text
idle/summary-only -> loading details -> success
                             -> error/retry
                             -> unavailable/not-found
```

卡片摘要可以立即显示；完整详情缺失时打开 Skeleton，不能显示上一群组的完整 join methods。加载时 URL 保持 group、焦点仍在 Dialog、关闭可用。关闭或 group 改变取消旧请求。

### 6.3 竞态

使用 AbortController、请求序列号或已有 query cancellation：只有当前 route `groupId` 对应的响应才能更新 state。快速点击 A→B，A 的迟到响应不能覆盖 B；关闭后 A 的响应不应重新打开 Dialog。不可公开响应清理短期缓存。

### 6.4 内容与 Join methods

完整简介按纯文本、保留换行和安全字符，内容区纵向滚动。加群方式按管理配置顺序；支持 zero/one/many，不重新排序。QR 作为二级 Dialog 或嵌入展示由 T02 样例和现有实现决定；二级打开时 focus/scroll lock 层级必须正确。外链只允许项目既有协议白名单，复制复用共享工具。

### 6.5 Focus/scroll

打开保存 `document.activeElement`（在浏览器生命周期内），移焦点到 close/首个控件；实现 focus trap。关闭恢复 card；深链接无 trigger 时恢复搜索框/主标题。body lock 保存原 scrollY、overflow/padding compensation，关闭恢复；二级 QR 不提前解锁。移动端处理 safe-area、软键盘、低高度横屏、iOS body lock。

### 6.6 Motion/theme

overlay/z-index/background/border/focus/errors/skeleton/QR 全部使用 T03 semantic tokens。`prefers-reduced-motion` 下取消/缩短 Dialog、smooth scroll、like/Skeleton 动画，但状态和可操作性保留。

## 7. Router 与分享设计

### 7.1 Query 状态

读取 query 时只接受项目认可的 ID 格式；空、重复冲突或非法 ID 进入安全错误状态。打开/关闭只修改 `group`，使用 Router 的 query merge 保留 `q` 等公开参数。

### 7.2 History

- 页面内卡片打开：push 新记录。
- 页面内关闭：优先 back；若 back 来源无法可靠判断，用 replace 清理 group，需避免误离站。
- 直接深链接：标记 direct entry，关闭用 replace 清理 group。
- 浏览器 back/forward 由 route watcher 驱动 Dialog；不额外 push。
- 同一 group 不重复 push；快速 route 变化以 URL 为真值。

不能用 `history.length` 判断来源；使用模块内 entry marker、Router state 或页面初始化记录。

### 7.3 Canonical share URL

从 siteConfig/canonical origin/当前部署公开 origin 生成绝对 URL，路径遵循 base path。用 URL API 设置 `group`，清除 q、page、filters、debug、admin、session 等全部其他 query。复制前确认 group 是当前已公开详情；Clipboard 失败显示错误，不关闭 Dialog。

## 8. 公开详情数据设计

### 8.1 现有接口优先

如果当前已有 `GET group/:id` public endpoint，复用 repository/service 和公开 DTO，补充 shared Zod Contract 和状态安全测试。若没有，最小新增只读按 ID route，不能扩展 search/board/API。查询条件必须 status=published、deleted/purge 排除，管理 fields 投影白名单。

### 8.2 Cache

只做短期内存/session cache（按 group ID）且不放完整敏感数据到长期 localStorage。不可公开响应清缓存。列表摘要可作为 immediate skeleton/placeholder，完整详情按需加载。

### 8.3 Like sync

详情和卡片共享现有 `useLikedGroups`/store 或提供明确受控 event。请求成功更新所有当前实例，失败统一回滚；不能新增另一个设备 ID、key 或后端算法。

## 9. 测试矩阵

### 9.1 Unit/Vitest

- card fields、line clamp class、keyboard/click separation、avatar failure、accessible name。
- drag threshold、pointer cancel、one-click suppression、listener cleanup。
- scroll state overflow/start/end/resize/children、arrow disabled、keyboard step。
- wheel no overflow/middle/boundary/deltaX/ctrl/Dialog/cleanup。
- URL push/replace/query merge/direct entry/back-forward/invalid/same id/share URL。
- detail loading/success/error/abort/race/cache/unavailable。
- share origin/query/clipboard success/failure/repeat。

### 9.2 Playwright

- card in carousel/grid, 2-card mobile, title/description clamp, like isolation/sync。
- mouse drag, touch context, trackpad/wheel, boundary page scroll, arrows, keyboard, reduced motion。
- Dialog details, multiple join methods, QR, copy, Escape/overlay/close, focus trap/restore, scroll lock, long content, mobile fullscreen, dark mode。
- history page-open/back/forward, direct deep link, q+group, share link re-open, unavailable IDs and security。

### 9.3 API/Workers

Only if new detail endpoint is required: published success, all non-public states hidden, invalid ID, anonymous access, shared response parse, public projection and join method order.

## 10. 风险与决策门

实现前冻结：

1. T02 最终 card/Dialog/Carousel 尺寸、snap mode、mobile safe area。
2. 当前 Dialog/QR/focus trap/body lock 能力的复用边界。
3. natural Tab vs roving tabindex。
4. drag threshold、wheel conversion ratio、scroll step。
5. `router.back` 与 direct-entry marker 的可靠实现。
6. canonical origin/base path 的配置来源。
7. 当前 public detail endpoint 是否足够，若不足新增最小 route 的确切路径。
8. mobile真实设备覆盖范围和截图基线归属 T06/T10。

若任一方案会把敏感 join data 推入列表、破坏浏览器历史、锁死页面滚动、造成旧请求覆盖或需要修改数据库，停止并回报。

## 11. 交付映射

- R06-01–04 → component props/slots/emits and shared DTO。
- R06-05–06 → card/Carousel interaction and tests。
- R06-07–09 → Dialog, Router, focus and scroll lock。
- security section → public detail route/DTO and state filtering。
- AC-06-05 → Workers/API evidence, full Vitest/Playwright and T10 handoff。

## T03 接入提示

组件设计以 T03 的语义 Token、状态属性、可见焦点和主题根节点为唯一正式视觉来源；真实详情/点赞/分享数据通过现有或批准的 typed API 边界进入组件，不允许原型 fixture 进入生产。记录 T06 与 T03 的文件所有权，避免覆盖公共样式和顶栏。

组件若渲染公共标题、品牌或操作入口，必须消费 T03/T04 的站点配置（标题默认“来个群号”、GitHub URL/文案、添加新群目标），不得复制常量或 prototype 文案。

## 12. 迁移后设计修订：从 UI 构建转为真实数据接入

T02 prototype 是视觉和交互参考，T03 visual migration 是正式 `src/` 的迁移 owner。T06 的设计边界调整为：

- `prototype/` → T03 迁移后的正式组件：只做路径、props、事件、状态和视觉差异审计。
- 正式组件 → typed API client：接入公开摘要、公开详情、点赞和错误 Envelope。
- Router → Dialog controller：接入 `q`/`group` 合并、历史、深链接和关闭。
- API response → public projection：在 server/Contract 层过滤非公开字段，前端不承担唯一安全过滤。
- 现有点赞/复制/QR 工具 → 详情交互：复用身份、协议、安全和 Toast，禁止复制 prototype 本地逻辑。

### 12.1 设计决策门

- 如果 T03 迁移组件的 DOM/事件 API 与 prototype 不同，以正式组件 API 为准，保留 T02 的可观察行为。
- 如果公开详情 API 已存在，优先复用并补安全/错误测试；只有缺少最小详情读取时才提出最小 API 变更。
- 如果后端字段缺失、状态投影不安全或需要数据库变更，记录 owner 为 T04/T05/总任务，不在 T06 越界扩展。
- 如果 Router controller 已由 T03 或现有代码提供，T06 只接入，不建立第二套 query 状态源。

### 12.2 设计验收重点

- 对比 T02 视觉基线与正式 `src/` 迁移结果，确认卡片、Carousel、Dialog 的行为未丢失。
- 以真实响应覆盖 loading、empty、error、not-public、retry、like rollback 和 share failure。
- 以真实路由覆盖卡片打开、直接深链接、q 共存、返回/前进和关闭。
- 以公开字段快照和 Workers 测试证明安全投影，而不是只检查浏览器文字。
