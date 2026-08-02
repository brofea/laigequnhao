# T09 技术设计：管理端群组分页与响应式表格

> 范围修订（2026-08-02）：本设计把 T03 迁移后的管理表格、分页器、响应式列和抽屉视为既有视觉基线；T09 只设计 page/50/total 数据契约、查询状态、稳定排序、mutation 同步和接入回归。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务09.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计草案。T09 先审计当前 keyset/抽屉/表格和 T08 所有权，再冻结 page API、URL、断点和 responsive drawer。

## 1. 设计原则

管理端分页只有一个真值：传统 page + fixed 50；公开端继续 opaque cursor。Repository 共享筛选条件生成器让 COUNT/items 一致；service 负责 query normalize/page/total; API client/URL adapter 负责可恢复状态；table/drawer 只渲染当前 response。

正确性优先级：

- total 不能与 items 的条件漂移。
- 稳定排序必须把唯一 id 放入最终键。
- page/q/filter/sort URL 与可见数据一致。
- 删除/状态变化后的页码不会停在空页或 page 0。
- 永久列和既有危险操作不能在窄屏消失。
- 公开 cursor 和 T08 board/analytics ownership 不被修改。

## 2. 现状证据审计

实施前读取：

1. 当前 admin groups route/service/repository 和 keyset cursor helper。
2. 当前筛选字段、状态/trash 语义、排序白名单和默认顺序。
3. 当前 groups table columns、sort headers、action menu、row key。
4. 当前 new/edit drawer、form schema、version/conflict、upload/tags/join methods。
5. 当前 URL sync、router scroll、dirty guard、auth/CSRF。
6. T03 tokens/table/drawer/focus/safe-area。
7. T04 GroupRow/Admin DTO/真实 status。
8. T08 AdminLayout/nav ownership（若已落地）。
9. 公开 all-groups/search cursor tests 和共享 cursor files，确认不能删除。
10. D1 query plan/indices/data volume（来自 T01 audit）。

输出高风险文件和 T09 owned surface。若 `group-repository.ts` 同时服务公开 cursor，新增 admin page methods 不可破坏公开 projection。

## 3. API Contract 与 Query Schema

### 3.1 Shared constant

```ts
export const ADMIN_GROUPS_PAGE_SIZE = 50 as const
```

只有一个来源，server/client/tests import，不重复写数字。`AdminGroupPageResponse`：

```text
items: AdminGroupSummary[]
page: number
pageSize: 50
totalItems: number
totalPages: number
```

如项目有 envelope，保持语义/typed parse；不保留管理 nextCursor/previousCursor 作为第二真值。

### 3.2 Query schema

```text
AdminGroupsQuery = {
  page?: positive integer default 1
  q?: existing search string limit
  status?: existing status enum
  trash?: existing trash filter enum
  sort?: existing sort enum
  direction?: asc|desc
}
```

`pageSize` 是未知/非法参数按项目规范 ignore 或 400，但不改变 50。排序字段白名单；page 解析拒绝 0、负数、浮点、abc、empty、overflow、重复冲突按冻结策略处理。

### 3.3 URL adapter

提供纯 `parseAdminGroupsQuery`、`serializeAdminGroupsQuery`、`resetPageOnCriteriaChange`。默认值 parse/serialize 对称；默认 page=1 可以省略；q/filter/sort/direction 参数只更新自身。typing/debounce replace，page/filter/sort click push，非法 canonicalization replace。抽屉不改变 query。

## 4. Repository 查询设计

### 4.1 Shared condition builder

把 q/status/trash 规范化为 typed conditions，再同时用于：

```text
countAdminGroups(conditions)
listAdminGroupsPage(conditions, sort, page=1, pageSize=50)
```

避免复制 where fragments。搜索 join tags 时使用 `EXISTS` 或 `DISTINCT groups.id`，确保 items 和 count 不重复。

### 4.2 Page query

`offset=(page-1)*50`，page 已校验再绑定 SQL。Select 只返回 AdminGroupSummary 必需字段；完整 join methods/image details 按现有 drawer 请求。排序由 whitelist mapping 生成固定 SQL，不能拼任意客户端列名。

### 4.3 Stable order

每个主字段/方向加 `id` 最终次排序。ID 方向应在设计里固定（通常跟主方向，或明确 asc 便于跨页）；NULL first/last 使用显式表达而非 SQLite 隐式。排序和 page query 共享相同 order，避免 COUNT 不受排序影响。

### 4.4 Count/offset limits

COUNT 同条件、不同 page/sort；totalPages `ceil(totalItems/50)`，0→0。评估 status/trash/updated/created/like/title/tag 搜索索引和 OFFSET 深页成本。若需要新索引，停下走总任务批准和前向 migration，不改 T04 history。

## 5. Service/route

Service：normalize query → validate sort/page → count/list → calculate totals → out-of-range policy → typed DTO。推荐超页响应 empty items + total values，front-end replace last valid page；也可以按现有 API policy freeze，但 page field/URL/data 必须一致。Route 继续管理员 auth，GET 不绕过会话，使用 shared response parse/error wrapper。

## 6. Frontend list state

```text
AdminGroupsState = {
  query, normalizedQuery, requestKey, requestStatus,
  items, page, pageSize, totalItems, totalPages,
  error, pendingMutation, drawerState
}
```

requestKey 包含 page/q/status/trash/sort/direction；Abort/sequence 只提交当前 key response。page/filter/sort changes 清旧 items 或保留容器 skeleton（由 UX 选定），禁止 URL page 3 但无提示仍显示 page 2。

### 6.1 Page transitions

- initial route query → request page。
- page click → push page, request。
- criteria change → reset page=1, push/replace according to control, request。
- invalid/out-of-range → response total → replace valid page → request once。
- delete/status/restore/permanent mutation → refetch current query, compute new total, replace page if needed。

### 6.2 Delete back-page helper

纯函数输入 currentPage/totalItems/itemsLength/mutationEffect 后计算目标：

- first page never below 1。
- current page still has items → keep page。
- current page empty and currentPage>1 → min(currentPage,newTotalPages) or new total page。
- zero total → page=1,totalPages=0。

自动 page correction 使用 replace，避免 back 重进 invalid page。

## 7. Pagination component

### 7.1 Pure window algorithm

输入 currentPage/totalPages/viewportMode，输出 page/ellipsis items；小页全显示，中间保留 first/last/nearby，ellipsis unique/noninteractive，mobile 简化为 prev/current/total/next（若空间保留 first/last）。边界/total 0 由 unit tests 固定。

### 7.2 UI/accessibility

`nav aria-label=群组列表分页`；page button label、current `aria-current=page`、prev/next disabled、ellipsis text not focusable。加载期间 pagination disabled；success 后焦点策略需冻结（保留 clicked button 或移动表格标题），live region 轻量播报。

### 7.3 Summary

显示 totalItems、current/total pages；zero only `共0条`，不显示 1/0。分页器在 table 外，不加入 table horizontal scroll。

## 8. Responsive table design

### 8.1 Column config

维护唯一 column metadata：key/label/priority/minWidth/sortable/alwaysVisible。priority hide order fixed：tags → kind/property → likes → platform；always title/status/actions。header and cells consume same visibility state/DOM condition，hidden columns `display:none`/conditional from accessibility tree。

### 8.2 Width mechanism

优先 Container Query 与 AdminLayout container width；若项目支持不足，媒体 queries 与 approved breakpoints。记录四阈值，不以浏览器 window 作为唯一真值。标题 min width/operation width/status width 必须先保留；extreme zoom allows table-local horizontal scroll but normal 360/390 should not。

### 8.3 Sort hidden field

Hidden sortable column may continue sorting; sort control/URL must expose current sort. Do not remove backend sort simply because column hidden. Keep only management summary fields in list response。

## 9. Drawer design

### 9.1 Desktop

Reuse current drawer width, header/close, scroll content, footer actions. Keep existing form schema/validation/upload/tags/join methods/version/dirty guard.

### 9.2 Narrow

At approved breakpoint `width:100%; max-width:none; height:100dvh` or safe fallback; top safe-area/header close fixed, content independently scrolls, sticky footer save/cancel with bottom safe-area, body scroll locked/restored. Use `visualViewport`/dynamic CSS where current support requires, avoid fixed 100vh.

### 9.3 Focus/dirty

Open focus first input; trap Tab; close/overlay/Escape obey dirty guard; beforeunload/router guard preserved; close restore source button or table heading. Nested confirm closes first and does not lose form.

## 10. Mutation synchronization

New/edit/status/trash/restore/permanent operations keep current page query. On success refetch using current query; if item leaves current filters or last item removed calculate page correction. Do not locally insert records that could violate sort. Existing version/conflict semantics remain owned by group service. During list request, mutation response with stale request key cannot commit over newer list.

## 11. Testing design

### 11.1 Workers

0/23/50/51/100/101 boundaries; invalid page/duplicate/pageSize=100; count all filters/search DISTINCT; stable all sort values/directions/NULL; trash/status; auth/sort allowlist/SQL binding; public cursor unchanged。

### 11.2 Vitest

query parse/serialize/default/reset; pagination window/0/edges/mobile; delete-back target; race/current request key; column visibility order/header-cell; drawer viewport/dirty/focus policy。

### 11.3 Playwright

page navigation/URL/refresh/back-forward/overflow; search/filter/sort reset; delete/restore/trash/status page correction; columns at widths; hidden sorting; mobile drawer/keyboard/soft keyboard best effort/dirty/focus; existing groups and T08/analytics route regression。

## 12. Decision gates/risks

必须冻结：

1. actual API route and old keyset compatibility strategy。
2. invalid/out-of-range page response and front-end canonicalization。
3. id tie-break direction and NULL ordering。
4. count implementation for tag search and condition builder reuse。
5. four column visibility thresholds/Container Query support。
6. pagination focus and mobile simplification。
7. narrow drawer breakpoint/visualViewport/safe-area implementation。
8. T08 AdminLayout/owned file boundary。

停止条件：公开 cursor tests fail、COUNT/items drift、stable order absent、page URL/data mismatch, T09 requires DB migration without approval, hidden title/status/actions, or drawer dirty guard broken。

## 13. Delivery mapping

- R09-01–03 → query schema/repository/service/worker tests。
- R09-04–05 → URL/pager/table responsive/keyboard。
- R09-06–07 → drawer/operations/errors/regression。
- public cursor protection → shared helper audit and regression suite。

## T03 接入提示

管理分页是 T03 视觉基础的真实后端消费方：T09 只负责管理 page/50/total 的 API/UI 接入，使用 T03 提供的 Token、ARIA、响应式列和 drawer 规则；不得把管理分页 Contract、状态或 query 反向传播到公开 cursor，也不得使用 prototype fixture 代替真实认证 API。

T09 的页面壳层继续读取 T03/T04 的站点配置；标题、品牌、GitHub 和添加新群入口的变更不应散落在分页模板或管理 query 状态中。
