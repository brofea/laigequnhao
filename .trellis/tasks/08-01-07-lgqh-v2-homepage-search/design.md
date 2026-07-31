# T07 技术设计：首页信息架构与搜索重构

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务07.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计草案。T07 只编排公开首页和搜索，不复制 T06 组件逻辑或 T05 板块逻辑；实际文件、接口字段和 cursor 以实现前审计为准。

## 1. 设计目标

把首页拆为稳定的页面状态机和独立区域数据源：默认模式呈现发现/标签/板块/全量目录，搜索模式呈现搜索结果；q/group Router 状态可组合；区域失败可局部恢复；列表 cursor 在槽位/查询变化中不被错误拼接。

核心约束：

- SearchHero 只有一个实例，默认/搜索模式复用。
- GroupCard、Carousel、Dialog、group route controller 来自 T06；T07 只传入数据和容器。
- boards public API 来自 T05；T07 不过滤管理字段之外的安全数据、不重算随机。
- 公开数据由后端过滤 published；UI 过滤只是表现层。
- 每个请求由 typed API client 统一解析，组件不直接 fetch/any。

## 2. 现状审计清单

实施前读取：

1. 当前 HomeView、布局、公开 route 和页面 query。
2. 当前 group list/grid、旋转排位、cursor 编码/签名/slot。
3. 当前 search composable、debounce、IME、URL sync、abort。
4. 当前 infinite scroll/intersection observer、scrollBehavior 和缓存。
5. T03 header/theme/layout/token。
6. T05 public board API、DTO、stable random、empty board。
7. T06 GroupCard/Carousel/Dialog/group route controller。
8. T04 public summary、last_published_at 和 status filter。
9. 当前 tags schema/query/normalization。
10. Vitest/Workers/Playwright fixtures、mock clock、network intercept。

输出“复用/扩展/替换”表：当前模块、文件、行为、T07 影响、回归测试、不可破坏的契约。

## 3. 页面组件架构

目标树：

```text
PublicLayout (T03 Header)
└── HomeView
    ├── SearchHero (single instance)
    └── HomeContentMode
        ├── DefaultHome
        │   ├── DiscoverSection
        │   ├── TagsSection
        │   ├── BoardsSection
        │   └── AllGroupsSection
        └── SearchMode
            └── SearchResultsSection
    └── GroupDetailsDialog (single T06 container)
```

`HomeSection` 可提供 title/content/loading/empty/error/retry/aria 标题，但不要让过度抽象掩盖不同区域分页和缓存差异。默认和搜索内容可以卸载或隐藏，必须清理隐藏列表的 sentinel/observer。

## 4. 页面状态机

### 4.1 输入与模式

```text
rawInput = visible input string
effectiveQuery = rawInput.trim()
mode = effectiveQuery === '' ? 'default' : 'search'
```

初始化以 route query q 为源，非法/多值参数按项目 query parser 规范化。用户 typing 先更新 rawInput，debounce 后提交 effective query。模式真值由有效 query 与 route/controller 统一，不能由是否点击 Enter 决定。

### 4.2 区域状态

定义可复用状态：

```text
RegionState<T> = {
  status: idle | loading | success | empty | error | retrying,
  data: T | null,
  error: PublicError | null,
  requestKey: string,
  abort?: AbortController
}
PageState = {
  discover, tags, boards, allGroups, searchResults,
  activeMode, rawInput, effectiveQuery, groupRoute
}
```

cursor region 增加 items、nextCursor、hasMore、loadingMore、loadMoreError、seenIDs。区域独立，单个 retry 只换 requestKey/abort 和自身状态。

### 4.3 Mode transitions

```text
default -> search: cancel/ignore default-only prefetch as designed, clear search cursor, request search
search -> search: replace query key, clear items/cursor, cancel old, request new
search -> default: cancel search, restore cached default or request first page
any -> group overlay: T06 route controller, background mode unchanged
```

Dialog overlay 不应因区域请求失败关闭，也不应在模式 watcher 中重复初始化。

## 5. API 编排方案

### 5.1 Client boundary

集中 typed client 提供：

- `getDiscoverGroups(signal)`。
- `getTagStats(signal)`。
- `getPublicBoards(signal)`。
- `getPublicGroupsPage(cursor, signal)`。
- `searchPublicGroups(query, cursor, signal)`。

每个调用：构造 URL → fetch/AbortSignal → HTTP error normalize → shared Zod parse → domain result。取消错误作为 silent，不展示错误 banner。Contract parse failure 记录并进入 error。

### 5.2 Independent vs aggregate

优先独立接口以实现 section-level retry；如果现有架构已提供首页聚合，可让 discover/tags/boards 同一聚合但前端将各字段映射为独立状态。全量和搜索始终是 cursor endpoint。聚合失败时不能让 search hero 失效；可采用局部聚合重试或完整聚合重试并标注影响范围。

### 5.3 首屏并行

默认模式并行启动 discover/tags/boards/allGroups first page，渲染各自 skeleton/结果。搜索模式不无谓加载全部默认区域；若要为清空搜索预取，必须有限、可取消、不能压过搜索请求。

## 6. Discover 设计

### 6.1 Query contract

使用 `published`、`deleted_at IS NULL`/现有公开 filter，`ORDER BY last_published_at DESC, id`，limit 10。等价时间/NULL 语义由 T04 设计确认；不能用 created_at 或 default rotation。仅选 `PublicGroupSummary` 字段。

### 6.2 UI

`DiscoverSection` 使用 T06 GroupCard + HorizontalCarousel，零条有空态，少于 10 全部显示，超过 10 不加载更多。section retry 只重试 discover，不清 tags/boards/allGroups。

### 6.3 Conflict checks

发现群与 board/all group 重复是合法的；只在同一 discover items 内按 ID 去重。点赞共享 store 按 group ID 合并服务端 count 与本地状态。

## 7. Tags 设计

### 7.1 Query

用 SQL 聚合当前 published group tags：`COUNT(DISTINCT group_id)`，沿用现有 tag normalization，排除 empty tag 和非公开 group。排序 `groupCount DESC, label ASC`，仅返回 label/groupCount。

### 7.2 UI

TagsSection 是一个大卡/section，展示全部有效标签，响应式换行。zero tags 有空态；错误有区域 retry。标签 item 是可聚焦 button/link，Enter/Space 调用统一 `setSearchFromTag(label)`。

### 7.3 Tag click

从 default mode 通常用 `router.push` 一次；输入框设为 label，effective query 进入 search，清空旧 cursor。若已有 q（未来复用），替换而非追加，不能产生 `#` 或 ID 语义。

## 8. Boards 设计

直接消费 T05 `PublicBoardsResponse`：API 返回的 enabled board 顺序、groups 顺序和 empty board 语义是唯一来源。前端不显示 sortMode/version/member total/offline count，不重新过滤作为唯一安全层，不按 title 排序，不重算 hourly random。

`BoardsSection`：

- response boards length=0 时整个 section 不渲染。
- each board title + T06 Carousel if groups nonempty。
- enabled empty board title + safe empty message。
- API failure title/region error + retry。
- duplicate group across boards allowed。

## 9. All Groups 设计

### 9.1 Query preservation

先确认现有 endpoint 的 cursor payload 是否包括 epoch/slot/timezone/order/query signature。T07 只传 opaque cursor，不 decode/modify。前端 first page/next page 维持同一 query key/slot；跨 slot 的行为交给 server cursor。

### 9.2 State/merge

`AllGroupsState` 保存 items、nextCursor、hasMore、loadingMore、seenIds。append only server order；同一区域重复 ID 忽略并记录诊断；不要对跨区域重复做全局去重。所有群组使用 Grid + T06 Card。

### 9.3 Infinite scroll

IntersectionObserver sentinel 独立于 search sentinel。请求锁防止相同 cursor 并发；hasMore=false/没有 cursor 停止；load-more failure 保留已有 items，显示 retry button，重试失败 cursor。模式切换 disconnect observer。

## 10. Search 设计

### 10.1 Search contract

继续使用 title/description/tags 和现有 match/ranking；新增首页不改变相关性。`search(query, cursor)` query 必须是 trimmed effective query，server response cursor 与 query 绑定；前端只保存 opaque cursor。

### 10.2 Debounce/IME

使用审计后的现有 debounce；compositionStart 设置 `isComposing`，compositionUpdate 只显示 raw input，compositionEnd 清除并 schedule once。Enter 在 IME candidate 选择期间不提交额外请求；搜索本身不依赖 Enter。

### 10.3 Request race

每个 query key 生成 request sequence/AbortController。开始 B 时 abort/ignore A；响应必须同时匹配 request key 和 sequence；clear search invalidates all search sequences。B 先回、A 后回向量必须测试。

### 10.4 Loading/error/empty

首次 query 显示 grid skeleton；已有 query 切换时可以保留结构但不能把旧结果标成新 query，优先清 items/显示 loading。success 0 为 empty + current query/add CTA；network/5xx/parse/timeout 为 error + retry。load-more error 不清已有 items。

## 11. URL/History/Scroll

### 11.1 Query merge

提供 query helper：set/remove q、merge group through T06 controller、encode via Router. q 更新只影响 q，group/合法参数保留；clear q 仍保留 group。重复 q 按项目 parser 规范化。

### 11.2 History

- typing/debounce q 使用 replace。
- tag click 使用一次 push（设计推荐）。
- browser back/forward watcher 同步 rawInput/mode/results。
- group open/close完全交给 T06 controller，T07 不重复 push/replace。

### 11.3 Scroll/cache

按页面会话有限缓存：default sections + allGroups loaded pages；search cache 可选 LRU/不缓存。记录 default/search scroll position，搜索模式进入避免页面跳到底部，clear 恢复策略按 design。Dialog lock/restore 不被 mode watcher 覆盖。Router scrollBehavior 和 component key 需协同。

## 12. Error/empty/accessibility design

每 section 使用标题/aria-labelledby、loading/empty/error/retry；retry button 包含区域名。搜索容器 role=search，结果/状态使用适度 aria-live，不对每张图片播报。无限滚动提供键盘可点击 load-more fallback；新增 items 不抢焦点。区域失败不阻止 header/search/submit entry。

## 13. Responsive/performance

Home layout 使用 T02/T03 page container/gap；所有 breakpoint 一致。Carousel 容器交给 T06，T07 只保证宽度。Grid 目标 mobile two columns、tablet/desktop rule，页面不能横向溢出。Skeleton 尺寸匹配内容，头像 lazy/fixed，search 模式不加载默认全部，board/tags/discover 不 N+1，详情只由 T06 按需请求。

## 14. Tests

### 14.1 Unit

模式判定、trim、debounce、IME、URL merge、history policy、cursor merge/dedupe/load lock、region state/retry、cache key、race sequence。

### 14.2 Workers

Discover published/last_published/limit/stable ID/DTO; tags aggregate/distinct/status/sort/zero/no N+1; all groups current rotation/cursor/slot/duplicate/invalid; search fields/status/cursor/query binding/UTF encoding/empty/last page。

### 14.3 Playwright

Default order/region failure; discover; tags; boards/empty/zero/random; all groups paging; search/IME/URL/history/race/empty/error/retry; q+group; scroll recovery; responsive 360–1440; dark mode and existing like/detail/share regression。

## 15. Decision gates and risks

实施前冻结：

1. independent vs aggregate homepage API。
2. debounce duration and q update replace timing。
3. default/search cache and scroll restoration exact behavior。
4. public all-groups cursor slot contract。
5. tag query normalization/reuse and count index。
6. page route query parser for duplicate/invalid values。
7. partial board API failure representation。
8. T06 controller integration ownership for group query。

阻断包括：公开 API 可能返回非 published、cursor 不带 query/slot 且无法稳定分页、T06/T05 Contract 不兼容、区域错误导致全页重置、Router watchers 循环、标签聚合只能拉全表、或必须改数据库。

## 16. Delivery mapping

- R07-01–03 → HomeView/mode/section architecture。
- R07-04–06 → search/IME/query/history/scroll。
- R07-07–11 → public API client/region data/cursor。
- error/performance/security → independent state, abort, typed projection, tests。
- AC-07-04 → complete Playwright/Workers/Vitest and T10 handoff。
