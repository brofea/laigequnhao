# T07 实施规划：首页信息架构与搜索重构

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务07.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。实施步骤在后续批准后执行；本轮不运行 `task.py start`，不创建子任务。

## 1. Phase 0：重新压缩上下文并读取依赖

开始实现前重新读取：

- `docs/PRD/v2/PRD.md`、`docs/PRD/v2/子任务07.md`。
- T03/T05/T06 三份规划和实际代码/Contract。
- 当前 HomeView、公开 layout、搜索 composable、cursor/infinite scroll、rotation。
- T06 GroupCard/Carousel/Dialog/route controller。
- T05 PublicBoardsResponse 及公开过滤/排序。
- T04 last_published/summary/status Contract。
- 当前 tag SQL/normalization、API routes、tests/fixtures。

做前置表：依赖任务状态、实际导出名、接口路径、cursor shape、已知回归。若依赖不满足，停止，不用本任务代码绕过。

## 2. Phase A：建立现状清单与接口决策

### A1. 首页审计

- [ ] 记录 HomeView 当前 DOM/组件/路由 query。
- [ ] 记录默认首页区域与现有顺序。
- [ ] 记录搜索框、debounce、IME、q sync。
- [ ] 记录现有 all-groups cursor、rotation slot、hasMore、duplicate handling。
- [ ] 记录无限滚动 sentinel/observer cleanup。
- [ ] 记录 scrollBehavior/keep-alive/cache。
- [ ] 记录现有 loading/error/empty/a11y components。

### A2. 后端审计

- [ ] 查找可复用公开 group summary endpoint。
- [ ] 确认 discover 是否支持 last_published_at、limit 10、published filter。
- [ ] 确认 tag tables、distinct semantics、normalization、indices。
- [ ] 确认 T05 public boards path/Contract/empty/ordering。
- [ ] 确认 all groups/search cursor query binding/rotation fields。
- [ ] 确认 DTO 不含管理和敏感 join fields。

### A3. 决策冻结

- [ ] 独立接口 vs aggregate 接口。
- [ ] debounce duration 与 q replace 时机。
- [ ] default/search cache 与 scroll strategy。
- [ ] duplicate/invalid query parser 规则。
- [ ] T06 group controller 挂载和 ownership。
- [ ] tag click push/typing replace。

### A4. Phase A 质量门

- [ ] 所有代码可回答的问题已通过读取解决。
- [ ] 未决问题都是明确的产品/风险决策。
- [ ] 不需要数据库或未批准后端写接口。

## 3. Phase B：共享 Contract、API client 和错误模型

### B1. Contract

建立/更新：

- `PublicGroupSummary` 复用 T06。
- `DiscoverGroupsResponse`。
- `TagStatsResponse`。
- `PublicBoardsResponse` 复用 T05。
- `PublicGroupsPageResponse`。
- `PublicSearchPageResponse`。

所有 page response 明确 items/nextCursor/hasMore（或现有兼容字段）；不暴露管理状态、下架数量、完整加群方式。错误 Contract 可区分 network/HTTP/parse/invalid cursor/cancel。

### B2. API client

提供集中 methods：

```text
getDiscoverGroups(signal)
getTagStats(signal)
getPublicBoards(signal)
getAllGroupsPage(cursor, signal)
searchGroups(query, cursor, signal)
```

每个 method 负责 URL 参数、encoding、AbortSignal、HTTP error、Zod parse。页面组件不写散落 fetch。query/cursor 以 opaque 传递。

### B3. Public backend extensions

缺 discover 时补最小 `last_published_at DESC, id stable, LIMIT 10` 读能力；缺 tags 时用数据库 aggregate distinct published；不得改变 T04/T05 status/migration。Workers 先写查询测试，再接 client。

### B4. Phase B 质量门

- [ ] shared response parse 覆盖所有接口。
- [ ] public projection 不含 admin fields。
- [ ] query/cursor URL encode 正确。
- [ ] Abort 和 cancellation 不作为用户错误。
- [ ] backend additions 不包含数据库变更/搜索算法重写。

## 4. Phase C：区域状态与 HomeView 骨架

### C1. State model

实现独立 region state：discover/tags/boards/allGroups/searchResults；每个支持 idle/loading/success/empty/error/retrying；page region 增加 items/cursor/hasMore/loadingMore/retryCursor/seenIds。requestKey/AbortController 绑定状态。

### C2. Component tree

建立：

- `HomeView`。
- `SearchHero` 单实例。
- `DefaultHome`。
- `DiscoverSection`。
- `TagsSection`。
- `BoardsSection`。
- `AllGroupsSection`。
- `SearchResultsSection`。
- 可复用 `HomeSectionState`/Grid container。
- T06 单一 `GroupDetailsDialog` mount。

默认顺序硬编码在结构中；zero boards 可不渲染 board section，但不能移动其他 section。搜索 mode 只渲染 search section，hidden all-groups sentinel 必须 disconnect。

### C3. Initial load

default 启动时独立并行 discover/tags/boards/allGroups first page；search mode 不请求 default 全部区域。deep link group 由 T06 独立打开，不等 allGroups first page。

### C4. Phase C 质量门

- [ ] default/search mode 结构和顺序通过 component tests。
- [ ] section loading/empty/error 不互相覆盖。
- [ ] search hero DOM/位置只有一份。
- [ ] Dialog 只挂载一份。

## 5. Phase D：SearchHero、debounce、IME 和 q

### D1. Input state

保存 rawInput、effectiveQuery、isComposing、debounce timer。初始化从 route q 安全 normalize；非 string/重复 q 按 parser 规则；trim 只用于有效 query，显示输入保持产品认可的形式。

### D2. Debounce

复用现有值；输入中取消旧 timer，最后 stable value schedule。query unchanged 不请求。clear 立即 cancel timer/request、remove q、回 default。组件卸载清理。

### D3. IME

compositionstart/update 仅更新可见 raw input，不 set search request/q；compositionend 以 final input 调度一次。Enter 不成为搜索必需，IME candidate Enter 不重复触发。

### D4. URL/history

typing/debounce q 使用 replace；tag click 后一次 push；query helper merge 保留 group。watch route changes 时避免 input→router→watch 循环，用 source/request guard。浏览器 back/forward restore rawInput/mode.

### D5. Phase D tests

- [ ] empty/space/tab/newline default。
- [ ] Chinese/Emoji query。
- [ ] typing sequence only final request。
- [ ] unchanged query no request。
- [ ] composition no interim request, end once。
- [ ] q encode/remove/keep group。
- [ ] typing history not polluted, tag push。

## 6. Phase E：Discover 与 Tags

### E1. Discover

调用 `getDiscoverGroups`，只显示最多 10，空/错/重试独立。使用 T06 GroupCard/HorizontalCarousel，卡片点击交给 T06 route controller，like 使用共享状态。不要分页、随机、轮询或把 discover items 与 all groups 全局去重。

### E2. Tags backend

用 Workers test 验证 `COUNT(DISTINCT group_id)`、published filter、existing normalization、empty label exclusion、count DESC/name ASC、zero result、no N+1 evidence。响应只有 label/groupCount。

### E3. Tags UI

TagsSection 展示全部 tags，响应式自动换行，zero empty、error retry。每个 tag 使用 button/link semantics、accessible name 含 label/count。click 替换 rawInput/search q，进入 search mode，复用 SearchHero flow。

### E4. Phase E 质量门

- [ ] discover order/limit/status/DTO tests。
- [ ] tag aggregate/count/sort/status tests。
- [ ] tag click q/history/keyboard tests。
- [ ] section failure 不影响 boards/all groups/search hero。

## 7. Phase F：Boards 接入

### F1. API consumption

调用 T05 public boards client，完全按后端 board order/groups order。不要在前端重新随机或用管理字段重筛。仅使用公开 group summary；T06 Carousel/Card 复用。

### F2. Empty/zero/error

- response boards=[]：不渲染总板块 section、无错误/虚拟 default。
- board groups=[]：渲染 board title + safe empty message。
- API error：板块 section error + retry；不 reset discover/tags/all groups/search/group Dialog。
- retry 用当前 region 请求，不重置 allGroups cursor。

### F3. Phase F 质量门

- [ ] board order/disabled/filter/empty/zero tests。
- [ ] 每板块 T06 Carousel，无第二套滚动。
- [ ] board API failure is local。
- [ ] no sortMode/version/offline count in DOM。

## 8. Phase G：All Groups Grid、rotation、cursor 和 infinite scroll

### G1. Preserve existing query

读取现有 rotation/epoch/site-timezone/daily-slot/cursor contract，后端复用已有 endpoint。前端 cursor opaque，不 decode/edit；page request 的 query key/slot 不漂移。

### G2. Page state

first page clears/sets items/cursor/seenIds；append preserves server order, ignores same-area duplicate ID, no cross-section global dedupe。hasMore false or no cursor stops.

### G3. Observer/request lock

建立独立 sentinel，observer only in default mode; `loadingMore`/cursor lock prevents same cursor concurrent calls; unmount/mode change disconnect. Failure retains items and retry cursor button; retry does not load first page.

### G4. UI

Grid uses same layout rules as search. Skeleton bottom, end-of-list message, empty first page + submit CTA. T06 Card/like/dialog reuse.

### G5. Phase G quality gate

- [ ] first/next/last/empty/invalid cursor tests。
- [ ] rotation and slot tests unchanged/passing。
- [ ] duplicate and concurrent sentinel tests。
- [ ] load-more failure/retry preserves existing items。
- [ ] hidden search mode observer disconnected。

## 9. Phase H：Search Results Grid 和竞态

### H1. Query binding

调用 `searchGroups(effectiveQuery, cursor)`；server cursor must bind query. query change invalidates sequence/controller, clears items/cursor, starts initial loading. Never append A cursor to B.

### H2. Race

sequence key includes query and increment; abort A if possible, ignore if not. Only matching query+sequence may commit. Test A slow/B fast/B visible/no A flash; clear search prevents A from writing default state.

### H3. UI states

first load grid skeleton; next load bottom skeleton; success 0 shows current query/no-result/add CTA; network/5xx/parse/timeout shows error/retry; load-more error keeps items. All uses T06 GroupCard/Grid/like/Dialog.

### H4. Phase H quality gate

- [ ] title/description/tag search fields preserved。
- [ ] query trim/Unicode/encoding tests。
- [ ] cursor query binding/last page/invalid tests。
- [ ] race/cancel/clear/empty/error/retry tests。

## 10. Phase I：q + group、cache、scroll and like integration

### I1. T06 route controller

Card click only calls T06 controller. T07 background stays default/search. q+group query merge and close behavior covered by T06 controller tests plus Home integration; no duplicate router writes.

### I2. Cache/restore

Choose and implement limited session cache: default region results/allGroups pages and optional LRU search query. Cache keys include query/mode/cursor context; limit entries/bytes, no persistent sensitive data. On browser navigation restore rawInput/results/cursor/scroll according to design; if no cache re-request first page safely.

### I3. Scroll

Use existing Router scrollBehavior/anchor. Do not override T06 Dialog lock/restore. Search transition can scroll search results to sensible position without forcing page top if SearchHero visible. clear search should not jump to unexpected bottom.

### I4. Like

Connect page-level shared liked group state to discover/boards/all/search and T06 Dialog. Merge server count and local state for new page items without overwriting recent optimistic action; failed action rolls all mounted instances back.

### I5. Phase I quality gate

- [ ] q+group open/close/back/forward/clear tests。
- [ ] search/default cache bounded and stale policy recorded。
- [ ] loaded pages/scroll restoration matches design。
- [ ] all visible group instances like-sync。

## 11. Phase J：区域 loading/error/empty/a11y

实现每个 section 的 Skeleton、empty、error、retry：

- discover failure only discover。
- tags failure only tags。
- boards failure only boards。
- allGroups failure preserves other sections。
- search failure does not show default areas or lose q。
- retry does not close Dialog, clear input, reset other cursor, change URL or scroll top。

每个区域 title/aria-labelledby，search role=search，result/status live region 谨慎播报，retry button 含区域上下文；infinite scroll 提供 keyboard fallback。

## 12. Phase K：响应式、主题和性能

### K1. Layout

按 T02/T03 page container/gap 实现：360、390、768、1024、1280、1440；phone search accessible、tag wrap、Carousel container two cards、Grid target two columns、no page horizontal overflow。不要改 T06 内部 breakpoints。

### K2. Theme

Section/search/grid/skeleton/error/empty/CTA 使用 semantic tokens，light/dark/system 正常。不要写死颜色或复写 T03 header.

### K3. Performance

default API region parallel/controlled、search mode avoids default load、tag aggregate server-side、boards single API、no card detail prefetch、fixed image sizes/lazy、observer count bounded、search cache LRU/none explicit、DOM growth strategy recorded。

## 13. Phase L：测试执行

### L1. Workers

发现 last_published/limit/stable/status/DTO；标签 published/distinct/sort/empty/no N+1；all groups rotation/cursor/slot/duplicate/invalid; search fields/status/cursor/query bind/encoding/empty/last page。保留现有 rotation/cursor regression。

### L2. Vitest

mode trim、debounce、IME、URL merge/history、region states/retry、cursor merge/dedupe/lock、race sequence、cache key/scroll policy、tag click、T06 integration boundary。

### L3. Playwright

default order/region failures; discover; tags; boards/empty/zero; all groups infinite; search/IME/history/URL/race/empty/error/retry; q+group; scroll; like; responsive 360–1440; dark mode。

### L4. Screenshots/manual

生成 default/search/zero/empty/error/loading/multi-board/phone/dark screenshots；人工检查 iOS/Android/macOS trackpad/Windows wheel/Chinese IME/slow network/offline/reduced motion/200% zoom。

## 14. 工程命令

按实际 package scripts 执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
pnpm test:e2e
```

脚本不存在时记录实际命令；Playwright 测试如分开运行，列出具体 suite。禁止用全量 skip 替代不稳定测试，需隔离 flaky 并保留报告。

## 15. 停止条件与回滚

停止并回报：

- T05/T06 Contract 或公开过滤不满足。
- 现有 cursor 无法保持 rotation/slot 稳定。
- 标签只能拉全表或发现查询不能 server filter。
- q/group watcher 形成 Router 循环/历史污染。
- A→B race 仍能旧结果闪回。
- 单区失败导致 HomeView render crash。
- page cache/scroll restore 泄露非公开数据或无界增长。
- 需要改数据库、点赞安全模型、T06 底层或搜索相关性。

回滚优先保持旧 HomeView 可恢复；新增 API 为 additive read，失败时局部 section 可降级；不得删除现有 cursor/rotation tests、历史数据或使用 destructive git。

## 16. 最终验收清单

- [ ] T07 planning、未 start、无子任务。
- [ ] 首页固定顺序和 single SearchHero。
- [ ] discover/tags/boards/allGroups 独立状态和 query。
- [ ] search mode/debounce/IME/q/history/race。
- [ ] q+group 与 T06 controller 无重复 URL 逻辑。
- [ ] discover 10/last_published/Carousel。
- [ ] tags aggregate/published/distinct/sort/click。
- [ ] boards order/empty/zero/error。
- [ ] all groups Grid/rotation/opaque cursor/infinite/restore。
- [ ] search Grid/query cursor/empty/error/retry。
- [ ] published security/no N+1/typed client。
- [ ] responsive/theme/a11y/slow network。
- [ ] Workers/Vitest/Playwright/screenshots/manual/regression evidence。
- [ ] T10 cross-feature handoff complete。

## 17. 实施完成报告格式

1. HomeView/Section/SearchHero/Dialog 结构。
2. default/search state machine、debounce、IME、q/group history。
3. discover API/ordering/limit，tags aggregate/count/sort，boards integration。
4. all groups rotation/cursor/infinite/duplicate/restore，search fields/cursor/race。
5. region loading/error/retry/empty、cache/Abort、N+1/performance。
6. responsive/theme/a11y and screenshot/manual results。
7. Workers/Vitest/Playwright/regrssion commands and failures。
8. T10 blockers and unresolved non-goal enhancements。

## 18. 逐项验收场景清单

### 18.1 HomeView 结构

- [ ] 顶栏来自 T03，而非 HomeView 私有副本。
- [ ] SearchHero 只有一个实例。
- [ ] SearchHero 在 default/search 模式位置稳定。
- [ ] 默认模式包含 discover section。
- [ ] 默认模式包含 tags section。
- [ ] 默认模式包含 boards section（有 board 时）。
- [ ] 默认模式包含 all-groups section。
- [ ] 顺序不会因 loading 改变。
- [ ] 顺序不会因 empty 改变。
- [ ] 顺序不会因 error 改变。
- [ ] 搜索模式隐藏默认区域。
- [ ] 搜索模式只显示 search results。
- [ ] Dialog 是单一覆盖层。
- [ ] hidden section 的 IntersectionObserver 已断开。
- [ ] 页面无意外横向滚动。

### 18.2 SearchHero

- [ ] 空 input 进入 default mode。
- [ ] 仅空格进入 default mode。
- [ ] Tab/newline trim 后进入 default mode。
- [ ] 中文 keyword 进入 search mode。
- [ ] Emoji keyword 按当前搜索规则处理。
- [ ] 输入无需按 Enter。
- [ ] debounce 只发稳定最终词。
- [ ] 相同 effective query 不重复请求。
- [ ] clear button 只在有有效输入时出现。
- [ ] clear 保持焦点在 search input。
- [ ] clear 删除 q。
- [ ] clear 保留 group。
- [ ] loading 不改变搜索框尺寸。
- [ ] error 不让搜索框失去输入。
- [ ] mobile keyboard 打开时输入框可见/可用。
- [ ] 200% zoom 下 clear 可触达。
- [ ] 搜索框使用 T03 theme tokens。

### 18.3 IME 和输入竞态

- [ ] compositionstart 标记 composing。
- [ ] compositionupdate 不触发搜索请求。
- [ ] compositionupdate 不写无意义 q 历史。
- [ ] candidate Enter 不重复提交。
- [ ] compositionend 只 schedule 一次。
- [ ] 清空取消 composition 后的旧 timer。
- [ ] A 请求未完成输入 B。
- [ ] B 请求先返回后展示 B。
- [ ] A 迟到响应不覆盖 B。
- [ ] clear 后 A 迟到响应不写 default state。
- [ ] component unmount 取消 timer/controller。
- [ ] 网络 error 不误报为 empty。
- [ ] Contract parse error 进入明确 error。

### 18.4 URL 和历史

- [ ] 初始无 q 是 default。
- [ ] 初始 q 是 search。
- [ ] 非字符串 q 安全处理。
- [ ] 多 q 按统一 parser 处理。
- [ ] q 使用 Router 编码。
- [ ] typing 使用 replace。
- [ ] 连续输入不产生每字符 history。
- [ ] tag click 按设计 push/replace。
- [ ] q 更新不丢 group。
- [ ] q 删除不丢 group。
- [ ] card click 使用 T06 group controller。
- [ ] q+group 背景仍为 search。
- [ ] Dialog close 保留 q。
- [ ] back 恢复上一 q/mode。
- [ ] forward 恢复下一 q/mode。
- [ ] URL watcher 不循环 push。
- [ ] query order 不影响 mode。
- [ ] share link 不带 q。

### 18.5 Discover

- [ ] 只返回 published。
- [ ] 只返回公开摘要。
- [ ] 使用 last_published_at 排序。
- [ ] 相同时间使用稳定 ID 次序。
- [ ] 最多 10 条。
- [ ] 0 条有空状态。
- [ ] 少于 10 条不出现分页。
- [ ] 不使用默认 rotation。
- [ ] 不使用 random。
- [ ] 不轮询。
- [ ] 不预加载完整 join methods。
- [ ] 使用 T06 GroupCard。
- [ ] 使用 T06 Carousel。
- [ ] discover failure 只影响 discover。
- [ ] discover retry 不清 tags/boards/all groups。
- [ ] discover 和其他区域合法重复展示。

### 18.6 Tags

- [ ] 只统计 published groups。
- [ ] delisted 不计数。
- [ ] trash/deleted 不计数。
- [ ] pending/rejected 不计数。
- [ ] 同 group 同 tag 只计一次。
- [ ] 空标签不返回。
- [ ] 既有 normalization 被复用。
- [ ] 不新建同义词/简繁规则。
- [ ] count DESC。
- [ ] 同 count label ASC 稳定。
- [ ] response 不含 group list。
- [ ] zero tags 有空态。
- [ ] tag API failure 只影响 tags。
- [ ] retry 不重置其他 region。
- [ ] tag 有 keyboard focus。
- [ ] Enter/Space 可激活。
- [ ] accessible name 包含 label/count。
- [ ] click 替换 raw input。
- [ ] click 替换而非追加 query。
- [ ] click 进入 search mode。

### 18.7 Boards

- [ ] 使用 T05 public endpoint。
- [ ] API order 原样保持。
- [ ] disabled board 不出现。
- [ ] offline member 不出现。
- [ ] board sortMode 不在 DOM 泄露。
- [ ] board version 不在 DOM 泄露。
- [ ] board offline count 不在 DOM 泄露。
- [ ] zero boards 不显示虚拟 default section。
- [ ] zero boards 不产生错误。
- [ ] empty enabled board 显示 title。
- [ ] empty enabled board 显示安全 empty message。
- [ ] non-empty board 使用 T06 Carousel。
- [ ] group 可合法出现在多个 boards。
- [ ] board failure 不影响 all groups。
- [ ] board retry 不关闭 Dialog。
- [ ] board retry 不清 search q。
- [ ] board retry 不改变 URL。
- [ ] 前端不重算 hourly random。
- [ ] 前端不按标题重新排序。

### 18.8 All Groups

- [ ] Grid 而非 Carousel。
- [ ] 只显示 published。
- [ ] 复用现有 rotation。
- [ ] 复用 epoch/slot contract。
- [ ] first page cursor 正确。
- [ ] next cursor 不解析/修改。
- [ ] page order 保持服务端顺序。
- [ ] same-area duplicate ID 去重。
- [ ] cross-section duplicate 不错误隐藏。
- [ ] observer near bottom load。
- [ ] loadingMore lock 防重复。
- [ ] hasMore false 停止。
- [ ] last page 有结束状态。
- [ ] load-more skeleton 不跳高严重。
- [ ] load-more error 保留已有 items。
- [ ] load-more retry 使用失败 cursor。
- [ ] default mode 才连接 sentinel。
- [ ] phone 达到确认的列数目标。
- [ ] all groups failure 不影响 discover/tags/boards。
- [ ] all groups empty 有 add CTA。

### 18.9 Search Results

- [ ] Grid 而非 Carousel。
- [ ] 搜索 title。
- [ ] 搜索 description。
- [ ] 搜索 tags。
- [ ] 不改既有 ranking。
- [ ] query trim 后发请求。
- [ ] cursor 与 query 绑定。
- [ ] query 改变清空旧 items。
- [ ] query 改变清空旧 cursor。
- [ ] query 改变取消/忽略旧请求。
- [ ] first loading 显示 skeleton。
- [ ] load more 保留已有 items。
- [ ] 0 结果是 empty 而非 error。
- [ ] empty 显示当前 query。
- [ ] empty 提供 add CTA。
- [ ] network error 显示 error。
- [ ] error 提供 retry。
- [ ] invalid cursor 使用统一错误。
- [ ] no repeated same cursor request。
- [ ] hidden default sentinel 不请求。
- [ ] 下架群组不出现。
- [ ] 手机 Grid 不横向溢出。

### 18.10 Cache、scroll 和 Dialog

- [ ] default cache key 不混入 search items。
- [ ] search cache key 包含 normalized query。
- [ ] search cache 有上限/LRU 或明确不缓存。
- [ ] cache 不持久化敏感详情。
- [ ] cache 不让下架数据长期可见。
- [ ] browser back 恢复 q。
- [ ] browser back 结果按设计恢复/重载。
- [ ] default scroll 按设计恢复。
- [ ] search scroll 按设计恢复。
- [ ] clear 不跳到意外底部。
- [ ] T06 Dialog open 不重置 region。
- [ ] T06 Dialog close 不重置 q。
- [ ] q+group direct link 可同时加载。
- [ ] search failure 不阻止 Dialog。
- [ ] Dialog failure 不阻止 search background。
- [ ] clear q 时 group Dialog 按设计保持。
- [ ] like 状态跨 discover/boards/all/search/Dialog 同步。
- [ ] 新 page item 合并本地 like 不覆盖新乐观状态。

### 18.11 容错、响应式和安全

- [ ] discover/tag/board/allGroups 各自 loading。
- [ ] 各自 error/empty/retry。
- [ ] 单区 failure 不白屏。
- [ ] search hero 在所有区域失败时可用。
- [ ] header/submit entry 在区域失败时可用。
- [ ] retry 不刷新整页。
- [ ] retry 不清其他 region。
- [ ] 360px 可用。
- [ ] 390px Carousel/搜索可用。
- [ ] 768px 标签换行。
- [ ] 1024px 版式正确。
- [ ] 1280px section max width 正确。
- [ ] 1440px 无过度拉伸。
- [ ] 200% zoom 可操作。
- [ ] dark theme 可用。
- [ ] reduced motion 不破坏数据加载。
- [ ] public response 通过 shared schema。
- [ ] 页面不使用 v-html 渲染 query/description。
- [ ] 错误不泄露 SQL/表名/stack。
- [ ] API 请求不直接写在展示组件。
- [ ] 页面不依赖前端过滤作为唯一 security。

### 18.12 最终证据包

- [ ] API route/Contract snapshot。
- [ ] discover query test output。
- [ ] tag aggregate query test output。
- [ ] rotation/cursor regression output。
- [ ] search query/race output。
- [ ] component state/URL Vitest output。
- [ ] default homepage Playwright output。
- [ ] search/IME Playwright output。
- [ ] board/error/retry Playwright output。
- [ ] q+group/history/scroll output。
- [ ] responsive/screenshot output。
- [ ] slow network/offline/manual output。
- [ ] T10 cross-feature integration list。
