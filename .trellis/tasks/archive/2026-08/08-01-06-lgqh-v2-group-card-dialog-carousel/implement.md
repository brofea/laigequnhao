# T06 实施规划：群组卡片、Carousel 与详情弹窗

> 范围修订（2026-08-02）：实施阶段默认已有 T03 迁移后的正式卡片、Carousel、Dialog 视觉/交互骨架；不得重复搭建 UI。执行重点是替换 Mock/本地状态为真实 DTO、API、Router、点赞、分享、安全和测试，并只修复接入造成的回归。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务06.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。以下步骤用于未来实现；本轮不运行 `task.py start`，不修改正式前端代码。

## 1. 实施前上下文压缩与读取

开始实现前再次读取：

- `docs/PRD/v2/PRD.md`、`docs/PRD/v2/子任务06.md`。
- T02 `prd/design/implement` 和已确认 `ui-design.md`。
- T03 主题/token/header 规划和实际 `src/style.css`、Tailwind 配置。
- T04 Contract、显示宽度、公开 group DTO。
- 当前 Group 卡片、列表、`useLikedGroups`、device ID/localStorage。
- QR Dialog、copy helper、Toast、image fallback、Router query、Dialog/Drawer 基础。
- 公开详情 endpoint、API client、Playwright/Vitest helper。

在实现计划中记录每个现有模块“复用/改造/替换”的理由，避免重复组件。

## 2. Phase A：审计和决策冻结

### A1. 组件/数据清单

- [ ] 当前所有公开群组展示入口列出。
- [ ] 当前卡片 DOM、CSS、字段和点击行为记录。
- [ ] 当前点赞 composable、设备 ID、storage key、乐观回滚记录。
- [ ] 当前 QR/复制/Toast 和错误反馈记录。
- [ ] 当前 Router query parser 和历史 helper 记录。
- [ ] 当前公开详情读取/安全过滤记录。
- [ ] 当前 body scroll lock/focus trap/Escape 实现记录。

### A2. 视觉/交互决策

- [ ] T02 视觉样例实际文件/输入已收到。
- [ ] Card width/gap、两卡手机规则、Dialog max width/phone safe area 确定。
- [ ] Carousel snap mode、arrow visibility、scroll step 确定。
- [ ] drag threshold、wheel conversion 和 boundary release 确定。
- [ ] natural Tab 或 roving tabindex 只选择一种。
- [ ] dialog open/close animation 和 reduced-motion 规则确定。

### A3. API 决策

- [ ] 确认是否复用已有公开详情接口。
- [ ] 如新增，确定最小 route、request/response Contract 和 published filter。
- [ ] 确认 canonical origin/base path 来源。
- [ ] 确认 group ID 校验和 unavailable 的统一文案。

### A4. Phase A 质量门

- [ ] 没有 unresolved 的产品/视觉/安全决策。
- [ ] 没有把首页数据编排混入 T06 的计划。
- [ ] 没有把完整敏感加群方式放入列表 DTO 的方案。

## 3. Phase B：Contract 与组件骨架

### B1. Public DTO

复用/整理 `PublicGroupSummary` 和 `PublicGroupDetails`，字段白名单写入共享 Contract。完整详情包含完整 description、sorted join methods、like state 所需公共字段；不包含 version、管理 status、R2 key、device hash 或删除信息。

### B2. GroupCard 骨架

建立或改造 `GroupCard`：

- props 只接摘要、like state/pending、layout。
- emits `open-details`、`toggle-like`。
- 主体使用合法交互 DOM。
- 独立 `GroupLikeButton` 阻止冒泡。
- 使用 Token、固定头像容器、标题两行和简介四行 CSS 截断。
- 不直接调用 router/API/storage。

### B3. Tests first

先写卡片 Vitest：字段、line-clamp class、click/Enter/Space、like isolation、avatar error、accessible name、long text、theme class。每个失败用例对应一个要求，不以快照覆盖所有语义。

### B4. Phase B 质量门

- [ ] 卡片不含加群/QR/分享。
- [ ] 卡片只产生事件，不持有第二套状态。
- [ ] 无嵌套 button 和 focus 语义错误。
- [ ] 卡片单元测试通过。

## 4. Phase C：点赞和多实例同步

### C1. 复用现有逻辑

把卡片/Dialog 的 like event 连接现有 composable/store：复用 device ID、liked IDs、API、optimistic update、rollback、Toast。不要修改 pepper、匿名身份或后端算法。

### C2. 状态传播

选定共享 store/event contract：同 group ID 的多个卡片和 Dialog 收到同一成功状态；失败在所有可见实例回滚。确认不会与现有 `likedIds` storage key 冲突。

### C3. Tests

- [ ] 卡片点击 like 不打开 Dialog。
- [ ] keyboard/touch like 不打开 Dialog。
- [ ] optimistic success updates card/Dialog/other card。
- [ ] failure restores count/state and shows error。
- [ ] Dialog open 时 like 不改变 group URL。

## 5. Phase D：HorizontalCarousel 基础

### D1. DOM/CSS

实现业务无关容器：overflow-x、scroll-snap、aria label、card slot、可选 controls。按 T02 决定 `mandatory`/`proximity`，保证手机至少两卡可见。边缘提示/箭头使用 Token。

### D2. Scroll state

封装 `hasOverflow/atStart/atEnd` 测量、scroll event、ResizeObserver、children change、font/resize 后重测。使用 epsilon 避免浮点误判；卸载清理 listeners/observers。

### D3. Control behavior

滚动一步以 card/viewport 的冻结设计为准。无 overflow 不渲染或隐藏 controls，边界 button disabled，focus/keyboard 与滚动状态同步。

### D4. Vitest

覆盖无溢出、左/中/右边界、children resize、arrows、scroll step、cleanup、keyboard and focus. 必须有测试证明不修改业务数据。

## 6. Phase E：手势、Wheel 和键盘

### E1. Mouse/Pointer drag

实现 pointer down/move/up/cancel：记录起点，超过冻结阈值标记 drag，使用 capture/scrollLeft，interactive child 不启动 drag，drag 后抑制当前一次 click，cleanup 必须可靠。

### E2. Touch

优先浏览器原生横向滚动；touch-action 不阻断 pan-y/pinch。移动端测试轻触打开、横向滑动不打开、纵向手势让页面滚动。

### E3. Wheel

添加最小必要容器级 handler：

1. 无 overflow 放行。
2. Ctrl/Meta 放行。
3. deltaX 保留原生。
4. deltaY 转换仅在中间且有对应空间。
5. 边界放行页面。
6. Dialog 内部不被背景 Carousel 监听。

明确 passive 选项和 cleanup，写 Vitest 后再连接 DOM。

### E4. Keyboard

按决策实现 natural Tab 或 roving tabindex。ArrowLeft/Right、Home/End（如批准）滚动和聚焦目标；不劫持 input/textarea/contenteditable。focus ring 使用 T03 Token。

### E5. Phase E 质量门

- [ ] drag threshold vectors 通过。
- [ ] drag 后一次 click suppression，后续 click 恢复。
- [ ] pointercancel/组件销毁不残留状态。
- [ ] wheel boundary releases page。
- [ ] touch 不锁死纵向页面。
- [ ] reduced-motion 下 scroll 不依赖动画完成回调。

## 7. Phase F：详情 Dialog 与公开数据

### F1. Dialog shell

复用正式 Dialog 或补齐 `role=dialog/aria-modal/title/focus trap`。建立 header/title/close、scrollable content、footer/actions 区。确认遮罩点击边界、Escape 和层级。

### F2. Data states

实现 summary-immediate、loading skeleton、success、error/retry、unavailable/not-found、cancelled。旧详情不能残留到新 group；关闭和 ID 切换都 abort/ignore 旧请求。

### F3. Details

接入完整标题/简介/平台/like/join methods；纯文本安全渲染并保持换行。按原有 admin 配置顺序显示一到多个加群方式；zero join methods 有安全空态。QR、外链协议、复制和 Toast 复用现有能力。

### F4. Minimal API only if needed

若不存在合适详情 API，增加最小 GET by ID：public published filter、public projection、shared Zod response、匿名读取、Workers test。禁止借此实现搜索/board API、写接口或 DB 变更。

### F5. Phase F 质量门

- [ ] 详情只显示当前 URL group 的公开内容。
- [ ] 快速 A→B 请求不会旧响应覆盖。
- [ ] 非公开 ID 统一安全反馈、不泄露状态。
- [ ] QR/clipboard/error 子状态不破坏 Dialog。

## 8. Phase G：URL controller、history、分享

### G1. Query controller

实现集中 `useGroupDetailsRoute`：解析 group、校验 ID、保留其他 query、push/replace、back/forward watcher、direct entry marker、same ID de-dupe。route 是 Dialog 真值，不能只读本地 isOpen。

### G2. Open/close cases

测试/实现：

- `/` card click → `/?group=id` push。
- `/?q=term` card click → `/?q=term&group=id`。
- 页面内 back → query 无 group，Dialog 关，q 保留。
- forward → Dialog 重开。
- 直接 `/?group=id` → auto open，close replace `/`。
- `/?q=term&group=id` direct close → `/?q=term`。
- invalid/unavailable → safe error + clearable group。

### G3. Share

使用 site config/current canonical public origin + base path，URL API 设置 group 并删除 q/page/filter/admin/debug/session。Clipboard API/项目 helper 成功 Toast、拒绝错误、不关闭 Dialog、重复点击状态稳定。

### G4. Phase G 质量门

- [ ] history 不依赖 history.length。
- [ ] same ID 不重复 push/request。
- [ ] direct close 不离站。
- [ ] query merge 不丢 q。
- [ ] share link 可直接 re-open same group，且不带敏感参数。

## 9. Phase H：焦点、滚动锁定、响应式主题

### H1. Focus

保存触发元素，open 后 focus close/首项，Tab trap，Escape/close/overlay 恢复。deep link 无 trigger 时 fallback 到搜索框/主 heading。二级 QR close 返回触发按钮，不能跳到背景。

### H2. Scroll lock

使用现有 body lock 优先；保存 scrollY、滚动条补偿和原样式，close restore。移动端测试 iOS/Android safe-area、soft keyboard、low-height landscape；二维码二级层不提前 unlock。

### H3. Responsive/theme/motion

按 T02/T03 Token 实现 desktop max width、mobile near-fullscreen、scrollable description、bottom action safe-area、dark/light/system、reduced motion。头像/QR 不反色，Skeleton/error/focus 对比度合格。

### H4. Phase H 质量门

- [ ] keyboard Tab never enters background。
- [ ] close restores trigger/fallback focus。
- [ ] body scroll/position restored。
- [ ] mobile low height and safe area usable。
- [ ] dark/reduced motion/200% zoom pass。

## 10. Phase I：测试矩阵执行

### I1. Vitest

逐项运行 card、drag、scroll、wheel、keyboard、URL、detail request、share、focus/scroll lock 等 suite。使用 fake timers/DOM mocks 只模拟必要环境；浏览器全局在 import 时不应报错。

### I2. Playwright

运行 desktop/mobile contexts：card fields/click/like、Carousel drag/touch/wheel/arrow/keyboard/boundary、Dialog full detail/QR/copy/close/focus/lock/long text/mobile/dark、history/deep link/share/security。clipboard、network response 和 reduced motion 使用可复现 fixtures。

### I3. Screenshot/visual

生成 360、390、768、1024、1280、1440 的 card/carousel/dialog light/dark/loading/error/long-description/QR 截图。视觉基线是否长期提交交由 T10，但 T06 必须保存可复核结果。

### I4. Manual devices

在可用设备验证 iOS Safari、Android Chrome、macOS trackpad、Windows wheel、keyboard、200% zoom、reduced motion、长简介和多 Carousel 纵向浏览；缺失设备记录风险。

## 11. Phase J：回归与交接

回归现有公开首页、搜索、infinite scroll、like storage/API、QR、copy、Toast、theme/header、route guards 和 admin unaffected。T07 handoff 包含：GroupCard props/events、Carousel props/events、Dialog mount point、route controller、query merge 规则、public detail Contract、like store 连接、loading/error boundaries。

## 12. 工程命令与质量门

按实际 `package.json` 执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
pnpm test:e2e
```

若脚本名称不同以仓库为准；若未新增详情 API，记录无需 Workers 改动；若没有 E2E script，记录 Playwright 实际命令。失败区分环境、flaky、测试缺陷和产品缺陷，不能用跳过覆盖。

## 13. 停止条件

停止并回报：

- T02 视觉输入缺失导致关键布局无法冻结。
- T03 Token/overlay/focus 基础未完成。
- 公开详情 API 无法做 server-side published filter。
- 复用现有 Dialog 会破坏焦点/滚动锁定而替换方案超出范围。
- Router history 无法区分 direct entry 与 in-page push。
- Wheel/touch 方案会锁死页面滚动或破坏输入/缩放。
- 卡片列表必须携带完整敏感 join data 才能显示详情。
- 浏览器/Playwright 结果与真实设备行为存在未解释差异。

不得通过关闭 a11y 测试、放宽非公开 filter、用 local isOpen、硬编码域名或引入重量级库绕过。

## 14. 最终验收清单

- [ ] T06 仍为 planning，未运行 start。
- [ ] 未创建子任务，未改数据库/管理端/首页数据编排。
- [ ] Card 统一、两行标题、四行简介、like isolation 完整。
- [ ] Carousel 原生滚动、snap、drag/touch/wheel/keyboard/boundary/resize 完整。
- [ ] Dialog 正式语义、details/join/QR/copy/loading/error/race 完整。
- [ ] group query、push/replace/history/deep-link/query-preserve 完整。
- [ ] share canonical URL/clipboard feedback 完整。
- [ ] focus trap/restore、scroll lock、mobile safe area、dark/reduced motion 完整。
- [ ] public security filter 和必要 Workers test 完整。
- [ ] Vitest/Playwright/screenshots/manual checks/e2e regression 结果记录。

## 15. 实施完成报告格式

1. 组件路径、API、公开 DTO 和复用模块。
2. Card 信息结构/截断/like 同步。
3. Carousel snap、drag threshold、Wheel、keyboard、resize 和 mobile 结果。
4. Dialog 数据状态、join methods、QR、focus、scroll lock、phone layout。
5. Router open/close/history/direct entry/query merge 和 canonical share URL。
6. 公开详情 API、状态过滤和不泄露字段。
7. Vitest/Playwright/Workers/截图/人工设备结果。
8. T07 接入清单与 T10 剩余风险。

## 16. 逐项验收场景，不得折叠为单一快照

### 16.1 Card 内容和结构

- [ ] Carousel 场景使用正式 GroupCard。
- [ ] Grid 场景使用同一 GroupCard。
- [ ] 头像固定尺寸并有失败占位。
- [ ] 头像加载不会改变卡片高度。
- [ ] 标题显示但不超过两行。
- [ ] 标题原始值未被 JavaScript 截断。
- [ ] 中文标题边界可渲染。
- [ ] Emoji 标题边界可渲染。
- [ ] 长英文单词不会撑破卡片。
- [ ] 平台有文本或 accessible name。
- [ ] 简介最多四行。
- [ ] 简介 CSS 截断不修改详情来源。
- [ ] 简介换行和 Emoji 不破坏布局。
- [ ] 点赞数较大时操作区不跳动。
- [ ] 卡片不显示群号。
- [ ] 卡片不显示 QR。
- [ ] 卡片不显示加群按钮。
- [ ] 卡片不显示分享按钮。
- [ ] 卡片不显示管理状态。
- [ ] 卡片主体有可见 focus。
- [ ] accessible name 包含群组标题和打开详情语义。
- [ ] DOM 不嵌套 button。

### 16.2 Card 输入与点赞

- [ ] 点击主体只发出一次 open event。
- [ ] Enter 主体打开详情。
- [ ] Space 主体打开详情且不滚动页面。
- [ ] 点击 like 不发出 open event。
- [ ] Enter like 不发出 open event。
- [ ] Space like 不发出 open event。
- [ ] touch like 不发出 open event。
- [ ] optimistic like 更新当前 card。
- [ ] optimistic like 更新 Dialog。
- [ ] 同 group 的第二张 card 同步。
- [ ] like 网络失败恢复数量。
- [ ] like 网络失败恢复 active state。
- [ ] like 失败显示统一反馈。
- [ ] like 失败不关闭 Dialog。
- [ ] like 不修改 group query。
- [ ] 复用现有 device ID。
- [ ] 不生成新的 like storage key。
- [ ] localStorage 异常不会让卡片崩溃。

### 16.3 Carousel 初始和滚动状态

- [ ] 子项为空时无错误。
- [ ] 子项不足一屏时不显示假箭头。
- [ ] 有溢出时 hasOverflow 正确。
- [ ] 初始左边界 atStart 正确。
- [ ] 中间位置两个边界均正确。
- [ ] 右边界 atEnd 正确。
- [ ] 浮点 scrollLeft 不造成边界闪烁。
- [ ] card 数量变化后重测。
- [ ] 容器宽度变化后重测。
- [ ] 浏览器 resize 后重测。
- [ ] 字体加载导致尺寸变化后状态正确。
- [ ] ResizeObserver 组件卸载后清理。
- [ ] scroll listener 组件卸载后清理。
- [ ] controls 状态与 scroll state 一致。
- [ ] 不同 Carousel 实例状态不互相污染。

### 16.4 Carousel 手势

- [ ] pointer 位移小于阈值仍可点击。
- [ ] pointer 位移达到阈值才标记 dragging。
- [ ] 横向 pointer drag 修改 scrollLeft。
- [ ] pointerup 清理 dragging。
- [ ] pointercancel 清理 dragging。
- [ ] drag 后只抑制当前一次卡片 click。
- [ ] drag 后下一次轻点仍可打开。
- [ ] drag 内部 like 不被误触。
- [ ] drag 内部链接不被误触。
- [ ] 触摸横向滑动可滚动。
- [ ] 触摸纵向手势可滚动页面。
- [ ] touch-action 不使用全局 none 锁死页面。
- [ ] 触控板 deltaX 不被重复转换。
- [ ] 无溢出 Wheel 不 preventDefault。
- [ ] 中间位置 deltaY 可按设计转换。
- [ ] 左边界继续向左释放页面。
- [ ] 右边界继续向右释放页面。
- [ ] Ctrl Wheel 不被拦截。
- [ ] Meta Wheel 不被拦截。
- [ ] Dialog 内纵向 Wheel 不被背景拦截。
- [ ] wheel listener passive 配置正确。
- [ ] wheel listener destroy 后清理。

### 16.5 Carousel 键盘和无障碍

- [ ] Carousel 有区域 accessible name。
- [ ] 选择的 Tab 策略在设计和 DOM 中一致。
- [ ] ArrowLeft 上一张/向左。
- [ ] ArrowRight 下一张/向右。
- [ ] Home 行为符合设计。
- [ ] End 行为符合设计。
- [ ] input 内方向键不被劫持。
- [ ] textarea 内方向键不被劫持。
- [ ] 目标卡片滚入可见区。
- [ ] focus ring 不被 overflow 裁掉。
- [ ] 左右按钮有 accessible name。
- [ ] 左边界左按钮禁用/隐藏符合设计。
- [ ] 右边界右按钮禁用/隐藏符合设计。
- [ ] 无溢出不显示误导按钮。
- [ ] reduced-motion 不依赖 smooth scroll 完成回调。

### 16.6 Dialog 数据与内容

- [ ] 摘要数据可立即显示基本标题。
- [ ] 缺详情时显示 Skeleton。
- [ ] Skeleton 期间 close 可用。
- [ ] 成功显示完整标题。
- [ ] 成功显示完整简介。
- [ ] 成功显示平台。
- [ ] 成功显示 like。
- [ ] 成功显示一个 join method。
- [ ] 成功显示多个 join methods。
- [ ] join methods 顺序保持后端配置顺序。
- [ ] zero join methods 有安全空态。
- [ ] 长简介在内容区滚动。
- [ ] 换行按纯文本显示。
- [ ] URL 文本不会注入 HTML。
- [ ] 外链协议经过白名单。
- [ ] QR 失败不隐藏其他方式。
- [ ] 详情失败显示错误而非空白。
- [ ] 详情失败可重试。
- [ ] 详情不可公开显示统一安全文案。
- [ ] 不显示管理 status/version。
- [ ] 不显示 R2 key/device hash。

### 16.7 Dialog 竞态和缓存

- [ ] A 请求返回后显示 A。
- [ ] A 尚未返回切换 B 后只显示 B。
- [ ] A 迟到响应不能覆盖 B。
- [ ] 关闭后 A 迟到响应不能重新打开。
- [ ] group query 改变会取消/忽略旧请求。
- [ ] AbortController 或 request sequence 被测试。
- [ ] 同 ID 重复点击不重复请求。
- [ ] 已缓存详情可复用。
- [ ] 缓存按 group ID 隔离。
- [ ] unavailable 响应清除对应缓存。
- [ ] 缓存不进入不必要的长期 localStorage。

### 16.8 URL、历史和分享

- [ ] `/` 点击 card 用 push。
- [ ] `/?q=x` 点击 card 保留 q。
- [ ] 页面内 back 清除 group。
- [ ] 页面内 forward 重开 Dialog。
- [ ] 直接 `/?group=id` 自动打开。
- [ ] 直接深链 close 用 replace。
- [ ] 直接深链 close 不离开站点。
- [ ] `/?q=x&group=id` direct close 保留 q。
- [ ] group 为空显示安全处理。
- [ ] group 非法不发无意义详情请求。
- [ ] group 重复参数按设计安全处理。
- [ ] 同一 group 不重复 push。
- [ ] URL query 顺序不影响状态。
- [ ] 外部 query 不被无关清除。
- [ ] share 使用 canonical origin。
- [ ] share 遵守 base path。
- [ ] share 只含 group。
- [ ] share 不含 q/page/filter/admin/debug/session。
- [ ] clipboard success toast 正确。
- [ ] clipboard denial error 正确。
- [ ] clipboard unsupported 有降级/错误反馈。
- [ ] 重复 share 不产生异常 Toast 风暴。
- [ ] share 后 Dialog 保持打开。
- [ ] 复制链接新页面可重开同一 group。

### 16.9 Focus、滚动和响应式

- [ ] 打开保存原触发卡片。
- [ ] 打开后焦点移入 Dialog。
- [ ] Dialog 有标题关联。
- [ ] Tab 不进入背景页面。
- [ ] Shift+Tab 不进入背景页面。
- [ ] Escape 关闭最上层 QR。
- [ ] 第二次 Escape 关闭详情 Dialog。
- [ ] overlay 内容外点击关闭。
- [ ] content 点击不误关闭。
- [ ] close button 始终可见。
- [ ] 页面内关闭恢复原 card focus。
- [ ] direct deep link 关闭聚焦 fallback。
- [ ] body lock 保留 scrollY。
- [ ] Dialog close 恢复 scrollY。
- [ ] scrollbar compensation 不造成明显跳宽。
- [ ] QR 层不提前解除 body lock。
- [ ] 360px 手机可操作。
- [ ] 390px 手机至少两卡可见。
- [ ] 768px 平板无溢出。
- [ ] 1024px 桌面 Dialog 合理。
- [ ] 1280px/1440px Dialog 不无限扩张。
- [ ] 手机 Dialog 接近全屏且有安全区。
- [ ] 低高度横屏 close/action 可达。
- [ ] 200% zoom 不丢关键操作。
- [ ] dark mode 对比度正确。
- [ ] reduced motion 功能仍完整。

### 16.10 最终证据

- [ ] Card Vitest 报告。
- [ ] Carousel Vitest 报告。
- [ ] URL/share Vitest 报告。
- [ ] Detail race/cache Vitest 报告。
- [ ] Public detail Workers 报告（如新增接口）。
- [ ] Desktop Playwright 报告。
- [ ] Mobile Playwright 报告。
- [ ] Security deep-link 报告。
- [ ] Visual screenshot 清单。
- [ ] iOS/Android/trackpad/wheel 人工验证清单。
- [ ] T07 handoff contract 和挂载说明。
- [ ] T10 需要重复的 cross-feature 场景清单。
- [ ] 视觉样例与实现差异有记录。
- [ ] 非公开详情错误文案不泄露内部状态。
- [ ] 生产 origin 与 preview origin 的生成规则有证据。
- [ ] Router watcher 与 Dialog cleanup 没有循环更新。
- [ ] 全局 listener 数量和销毁行为已复核。
- [ ] 详情关闭不会重置搜索输入或页面滚动。
- [ ] T07 可在不复制组件逻辑的前提下接入。

## T03 接入检查

- [ ] 组件消费 T03 Token/焦点/Dialog 基础并通过真实 API/DTO 驱动，未接入 prototype Mock。
- [ ] 组件及公共弹窗消费配置化的标题/品牌、GitHub 和添加新群入口，未新增硬编码展示值。
- [ ] `group` query、点赞、分享、公开过滤和错误状态的真实数据流有测试与 T07/T10 交接记录。
- [ ] 未重写 T03 主题运行时或顶栏；任何共享样式差异均有 owner 和回归证据。
