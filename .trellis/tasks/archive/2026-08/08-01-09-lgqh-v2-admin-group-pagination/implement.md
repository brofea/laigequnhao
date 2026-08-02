# T09 实施规划：管理端群组分页与响应式表格

> 范围修订（2026-08-02）：执行前先验收 T03 已迁移的表格、分页器和抽屉；不得重做视觉层，后续步骤以真实 page/50/total API、URL、筛选、排序、删除退页、认证/CSRF、资源抽屉和测试为主。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务09.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。以下步骤在后续批准后执行；本轮不运行 `task.py start`，不改业务源码。

## 1. Phase 0：上下文恢复与边界锁定

实现前再次读取：

- `docs/PRD/v2/PRD.md`、`docs/PRD/v2/子任务09.md`。
- T03/T04/T08（如已落地）规划与实际 AdminLayout/组页面。
- 当前 groups route/service/repository/keyset cursor、search/filter/sort。
- 当前 table columns/headers/actions、new/edit drawer、dirty guard、upload/tags/join methods。
- auth/CSRF/version/conflict/trash/restore/permanent delete。
- T01 数据规模/index audit、公开 all-groups/search cursor/tests。
- T02/T03 table/drawer/responsive/token inputs。

输出 T09 owned files；明确不编辑公开 cursor helper、board/analytics pages、T08 layout/nav。若 T08 尚未完成，最小接入并保留后续复用点。

## 2. Phase A：API 和查询设计

### A1. Contract/constant

建立唯一 `ADMIN_GROUPS_PAGE_SIZE=50` 和 `AdminGroupPageResponse`。Query Schema 解析 page/q/status/trash/sort/direction；page default 1，方向白名单，sort whitelist，现有 search length/状态/trash 语义保留。pageSize unknown/invalid behavior 在 design 冻结且永不改变 50。

### A2. Shared condition builder

把 filters 规范化为 typed condition builder，供 count/items 共用。审计当前 search joins/tags；使用 EXISTS/DISTINCT 防止重复。确认 trash/normal/all semantics。写一个 query condition fixture matrix。

### A3. Stable order

每个 sort field 映射固定 SQL，并加 ID tie-break；显式 NULL order。确认排序方向和默认排序。不要拼接客户端列名，所有 params bind。

### A4. Page service

Service normalize → count/items → calculate totalPages → out-of-range response；`totalItems=0` totalPages=0，page field/URL policy一致。评估 OFFSET index/performance；需要 migration 只报告批准，不自行改。

### A5. Phase A gate

- [ ] count/items 条件来自同一 builder。
- [ ] page size 单一常量。
- [ ] sort/page validation 和 tie-break 已冻结。
- [ ] public cursor helper 不被 page API 复用破坏。

## 3. Phase B：Workers API 实施和测试优先

### B1. Worker tests first

先写空/23/50/51/100/101 fixtures，断言 items/page/pageSize/totalItems/totalPages。添加 invalid page/duplicate/pageSize=100 tests。每种 filter/search/tag count 与 sort value/direction/NULL tests。

### B2. Repository

实现/扩展 `countAdminGroups`、`listAdminGroupsPage`，参数化 OFFSET、shared conditions、stable order、AdminRow mapping。只取 list fields，不把完整 join methods/QR 放进 response。影响的现有 keyset method 先保留供公开调用。

### B3. Service/route

Route 继续管理员 auth、error wrapper、shared response parse。管理 API 返回 page response，移除 page 的 cursor 字段（若旧消费者需兼容，按 design 版本策略），不改公开 route。

### B4. Phase B gate

- [ ] Workers basic/count/filter/sort/security pass。
- [ ] 公开 cursor regression pass。
- [ ] API response page field 与 items 条件一致。
- [ ] SQL injection search fixture safe。

## 4. Phase C：前端 Query/URL/请求状态

### C1. URL adapter

实现 parse/serialize/normalize：default page=1、existing q/status/trash/sort/direction、unknown handling、canonical replace。criteria changes page=1；page click push；typing debounce replace；抽屉不改变 query。

### C2. Request state

建立 groups list state query/requestKey/status/items/page/size/total/error/drawer. requestKey 包含全部 URL 条件；Abort/sequence prevents stale page/search responses. On URL init request exact page—avoid visible first-page flash if possible.

### C3. Page transition

- page click: push + request.
- search/filter/sort change: reset page=1 + update URL + request once.
- same values: no request/history.
- invalid query: normalize replace.
- out of range: empty response+total → replace last valid or page1 zero → request once.

### C4. Phase C tests

Vitest URL parse/serialize/reset/history; race page2/page3; query condition changes; Playwright direct page/refresh/back/forward/invalid/out-of-range。

## 5. Phase D：Pagination pure algorithm and UI

### D1. Pure function

实现 `getPaginationItems(current,total,mode)`，items page/ellipsis，total 0/1/5/middle/edges/mobile. No duplicate first/last/current; ellipsis not clickable; boundaries disabled。

### D2. Component

`nav aria-label=群组列表分页`，prev/next/first/last/current, summary total/current pages。Loading disable controls; mobile no overflow and preserves current/total/prev/next. Hidden/disabled semantics keyboard accessible。

### D3. Focus/live

冻结 click 后焦点保持 button 或移至 table heading；loading complete lightweight live status。`aria-current=page` only current item；ellipsis out of accessibility tree.

### D4. Phase D gate

- [ ] pure algorithm all boundary tests。
- [ ] desktop/mobile Playwright page window。
- [ ] 0 records no 1/0。
- [ ] pager outside table horizontal scroller。

## 6. Phase E：List UI、filters、sort and reset

### E1. Loading/empty/error

Keep page header/filter controls; table skeleton matches visible columns; page change preserves container height; initial/error/retry state maintains URL. Do not show page2 URL with silent page1 data.

### E2. Criteria controls

保留 search/status/trash/sort/direction existing controls/labels. On criteria change, one normalized request page1; search IME/debounce unchanged; hidden sortable column remains selected in URL/control. Clear filter keeps user choice until explicit clear.

### E3. Merge and cache

Do not cache across session unless bounded query key; if existing keep invalidation. Response success from server replaces list. New/edit mutation does not locally insert if sort/filter could change; refetch current query.

### E4. Phase E gate

- [ ] Search/filter/sort reset page1.
- [ ] Existing labels/status/trash semantics pass。
- [ ] Error/retry URL/data consistency pass。
- [ ] No public cursor changed。

## 7. Phase F：Mutation and delete back-page

### F1. Post-mutation refetch

On create/edit/status/trash/restore/permanent success, refetch current page/query and total. If item leaves current filters or last page empty, compute target and router.replace. Do not force local row placement.

### F2. Delete-back pure helper

Write unit tests for current page/items/old total/new total: first page stays 1; current page with remaining item stays; last page empty → previous valid; zero total → page1/0. Replace URL to avoid browser back entering invalid page.

### F3. Conflict/requests

Existing group mutation version/CSRF/dirty flows remain. List refresh response with stale requestKey cannot commit over a new criteria state. Open drawer retains URL conditions; drawer close restores source focus.

### F4. Phase F gate

- [ ] Delete final item on page N backs to valid page。
- [ ] Trash/restore/status leave filter and back。
- [ ] First page never page0。
- [ ] Browser back does not re-enter empty page。

## 8. Phase G：Responsive columns

### G1. Column metadata

Create one config consumed by header/cells/visibility/accessibility: title always, status always, actions always, tag hide #1, property/kind #2, likes #3, platform #4. Existing extra columns classified via T01 evidence, not silently dropped。

### G2. Breakpoints

Use approved container query/media rules; record real thresholds based on operation/status/title min widths. At each stage hide only next priority, not all secondary columns; header and cells same visibility。

### G3. Hidden sort

If hidden column remains sort field, expose current sort in top control/aria; no backend change. Hidden cells/th not in accessibility tree. Extreme 200% may allow table-local horizontal scroll; normal phone relies on columns.

### G4. Phase G gate

- [ ] desktop all columns。
- [ ] stage1 tags hidden。
- [ ] stage2 tags/property hidden。
- [ ] stage3 tags/property/likes hidden。
- [ ] stage4 adds platform hidden。
- [ ] title/status/actions always visible。
- [ ] headers/cells/accessibility synchronized。

## 9. Phase H：Narrow full-screen drawer

### H1. Shared drawer

Reuse current new/edit drawer; add responsive mode only. Desktop remains approved width. Mobile approved breakpoint uses width 100%, max-width none, dynamic height 100dvh or safe fallback, top header/close, independent scroll content, sticky footer safe-area。

### H2. Keyboard/viewport

Use dynamic CSS/visualViewport as current browsers require; test title/description/tags/join methods/image with soft keyboard. Bottom save/cancel not covered; current input scrolls into view. Body lock preserves list scroll and restores on close.

### H3. Dirty/focus

Keep Escape/overlay/router/beforeunload guards; nested confirm first; focus trap/open first input/close restore source button or table heading. No style change may bypass dirty guard。

### H4. Phase H gate

- [ ] phone new/edit full screen。
- [ ] close/save visible/accessibility。
- [ ] content scroll and safe area。
- [ ] background lock/restore。
- [ ] soft keyboard best effort + manual evidence。
- [ ] dirty and focus regress。

## 10. Phase I：Playwright and visual matrix

### I1. Pagination/URL

0/50/51 records, click page, prev/next, window/ellipsis, direct page3, refresh, back/forward, search/filter/sort reset, invalid/out-of-range, totals。

### I2. Mutations

delete last row/page back; trash/restore/status leave current filter; create/edit server refresh; version conflict; existing permanent delete/CSRF/dirty。

### I3. Responsive

360/390/768/1024/1280/1440 columns, table scroll, sort hidden, pager, operation menus, full drawer, mobile keyboard approximation, dark/reduced motion/200%。

### I4. Existing/ 공개 regression

groups search/filter/sort/create/edit/trash/restore/permanent/image/tags/join methods; T08 boards/analytics route if present; public all-groups/search cursor tests.

### I5. Screenshots/manual

Generate page1/middle/last/filter/error/column stages/mobile pager/new/edit dirty screenshots; manually verify iOS Safari/Android Chrome/desktop/keyboard/screen reader basics/50 rows.

## 11. Engineering commands

按 `package.json` 实际 scripts 执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
pnpm test:e2e
```

若脚本名称不同，记录实际命令；不因 page task 跳过公开 cursor regression。测试失败需归类并保留输出。

## 12. Stop conditions and rollback

Stop/report：COUNT/items 条件漂移；稳定排序无法证明；公开 cursor 被修改；T08 layout/nav 被覆盖；标题/status/actions 在任何正常宽度隐藏；drawer dirty/soft keyboard broken；需 DB migration/认证/CSRF/state machine change。

Rollback additive client/API first; keep old keyset method until public consumers proven unaffected; do not destructive git, history migration edit, or delete production data。

## 13. Final checklist

- [ ] T09 planning、未 start、无子任务。
- [ ] fixed 50/page response/COUNT/total/offset。
- [ ] page/query URL/history/reset/out-of-range。
- [ ] stable sort and no cross-page dup/omission。
- [ ] delete/trash/restore/status back-page。
- [ ] responsive priority and permanent columns。
- [ ] narrow full-screen drawer/dynamic viewport/safe area/dirty/focus。
- [ ] auth/CSRF/versions/existing mutations preserved。
- [ ] public cursor and T08/T10 handoff regressions。
- [ ] Workers/Vitest/Playwright/build/screenshots/manual results。

## 14. Completion report format

1. route/query/response/page-size/COUNT/OFFSET/out-of-range。
2. sort fields/tie-break/NULL and page stability。
3. URL/history/reset/delete-back behavior。
4. pagination algorithm/ARIA/mobile。
5. column thresholds/permanent columns/hidden sort。
6. drawer breakpoint/dynamic viewport/safe-area/keyboard/dirty/focus。
7. existing group/T08/analytics/public cursor regression。
8. Workers/Vitest/Playwright/manual/screenshot evidence。

## 15. 逐项验收场景清单

### 15.1 API 基础分页

- [ ] 0 records returns items=[]。
- [ ] 0 records returns page=1。
- [ ] 0 records returns pageSize=50。
- [ ] 0 records returns totalItems=0。
- [ ] 0 records returns totalPages=0。
- [ ] 23 records page1 returns 23。
- [ ] 23 records totalPages=1。
- [ ] 50 records page1 returns 50。
- [ ] 50 records totalPages=1。
- [ ] 51 records page1 returns 50。
- [ ] 51 records page2 returns 1。
- [ ] 51 records totalPages=2。
- [ ] 100 records page1/page2 each return 50。
- [ ] 101 records page3 returns 1。
- [ ] Missing page defaults 1。
- [ ] page=1 is accepted。
- [ ] page=2 is accepted。
- [ ] page=0 follows approved 4xx policy。
- [ ] page=-1 follows approved 4xx policy。
- [ ] page=1.5 follows approved 4xx policy。
- [ ] page=abc follows approved 4xx policy。
- [ ] empty page follows approved 4xx policy。
- [ ] overflow page follows approved safe policy。
- [ ] duplicate page follows approved policy。
- [ ] pageSize=100 never returns 100。
- [ ] pageSize=25 never changes server size。
- [ ] response page and URL policy agree。
- [ ] response conforms to shared schema。

### 15.2 COUNT 和筛选

- [ ] no filter count matches items query。
- [ ] q filter count matches items query。
- [ ] status published count matches items query。
- [ ] status delisted count matches items query。
- [ ] trash-only count matches items query。
- [ ] normal-only excludes trash。
- [ ] combined q/status/trash uses same conditions。
- [ ] tag-related search counts group once。
- [ ] multiple matching tags do not duplicate item。
- [ ] sorting does not change totalItems。
- [ ] page does not change totalItems。
- [ ] empty search normalization matches list query。
- [ ] status enum uses domain value not display Chinese。
- [ ] unknown status is rejected safely。
- [ ] invalid trash filter is rejected safely。
- [ ] invalid sort field is rejected safely。
- [ ] invalid direction is rejected safely。
- [ ] SQL-like q stays bound parameter。
- [ ] count does not execute once per item。
- [ ] count plan/index evidence recorded。

### 15.3 稳定排序和跨页

- [ ] updated_at equal values use ID tie-break。
- [ ] created_at equal values use ID tie-break。
- [ ] like_count equal values use ID tie-break。
- [ ] title equal values use ID tie-break。
- [ ] status equal values use ID tie-break。
- [ ] asc order is deterministic。
- [ ] desc order is deterministic。
- [ ] NULL order is explicit。
- [ ] repeated identical request has identical page1。
- [ ] repeated identical request has identical page2。
- [ ] page1/page2 have no duplicate ID。
- [ ] page1/page2 have no omitted ID in fixture。
- [ ] last page has expected remainder。
- [ ] changing sort resets page1。
- [ ] hidden sort column still has visible control state。
- [ ] stable sort does not alter public cursor。
- [ ] old public rotation tests still pass。

### 15.4 URL 解析和历史

- [ ] default page omission parses as 1。
- [ ] page serializes consistently。
- [ ] q parses and serializes safely。
- [ ] status parses and serializes safely。
- [ ] trash parses and serializes safely。
- [ ] sort parses and serializes safely。
- [ ] direction parses and serializes safely。
- [ ] default values may be omitted consistently。
- [ ] page click uses approved push strategy。
- [ ] search typing uses replace/debounce。
- [ ] filter change resets page=1。
- [ ] sort field change resets page=1。
- [ ] sort direction change resets page=1。
- [ ] page change preserves q。
- [ ] page change preserves status。
- [ ] page change preserves trash。
- [ ] page change preserves sort/direction。
- [ ] clear q resets page1。
- [ ] invalid URL uses replace canonicalization。
- [ ] duplicate params do not throw。
- [ ] direct page3 loads page3 without page1 flash where possible。
- [ ] refresh page3 restores page3。
- [ ] browser back restores prior page/query。
- [ ] browser forward restores next page/query。
- [ ] drawer open does not change list query。
- [ ] drawer close does not change list query。
- [ ] theme change does not reset page。

### 15.5 Pagination UI

- [ ] Pager has navigation landmark。
- [ ] Pager has accessible label。
- [ ] previous button exists。
- [ ] next button exists。
- [ ] first page entry exists when window allows。
- [ ] last page entry exists when window allows。
- [ ] current page is unique。
- [ ] current page has aria-current。
- [ ] page labels include target number。
- [ ] previous disabled on first page。
- [ ] next disabled on last page。
- [ ] zero results disables navigation。
- [ ] zero results does not show 1/0。
- [ ] small total shows all pages。
- [ ] middle total shows ellipsis window。
- [ ] near-start window has correct ellipsis。
- [ ] near-end window has correct ellipsis。
- [ ] ellipsis is not focusable。
- [ ] ellipsis is not clickable。
- [ ] desktop summary shows totalItems。
- [ ] desktop summary shows current/total pages。
- [ ] mobile summary remains understandable。
- [ ] mobile pager does not overflow。
- [ ] loading disables page controls。
- [ ] successful page load preserves sensible focus。
- [ ] status/live message does not announce each row。
- [ ] pager is outside table horizontal scroll。

### 15.6 List state and races

- [ ] initial load has table skeleton。
- [ ] page transition keeps container height reasonably stable。
- [ ] filter transition has loading state。
- [ ] sort transition has loading state。
- [ ] page2 slow/page3 fast ends on page3。
- [ ] stale page2 response cannot overwrite page3。
- [ ] stale search response cannot overwrite new q。
- [ ] page leave aborts/ignores request。
- [ ] repeated same URL does not duplicate request。
- [ ] retry uses current normalized query。
- [ ] initial error preserves q/filter/sort URL。
- [ ] page error does not silently show prior page as new page。
- [ ] retry success updates total/page correctly。
- [ ] cancellation is not user error banner。
- [ ] parse error is distinguishable from empty。
- [ ] response request key includes all conditions。

### 15.7 删除、回收站、恢复、状态

- [ ] deleting non-last item refetches current page。
- [ ] deleting last item on page>1 computes previous valid page。
- [ ] deleting last item on page1 stays page1。
- [ ] deleting last total item shows empty state。
- [ ] page correction uses router.replace。
- [ ] browser back does not re-enter invalid page。
- [ ] move-to-trash leaves normal list when filter normal。
- [ ] move-to-trash updates total。
- [ ] restore leaves trash list when filter trash-only。
- [ ] restore updates total。
- [ ] status change leaving current filter removes row after refetch。
- [ ] status change can trigger page back。
- [ ] permanent delete retains existing confirm flow。
- [ ] mutation failure does not locally remove row。
- [ ] version conflict keeps existing conflict UX。
- [ ] create does not locally insert unsorted fake row。
- [ ] edit sort-field change refetches current page。
- [ ] mutation response cannot overwrite newer list request。

### 15.8 Responsive column order

- [ ] Wide desktop shows title。
- [ ] Wide desktop shows platform。
- [ ] Wide desktop shows property/kind。
- [ ] Wide desktop shows tags。
- [ ] Wide desktop shows likes。
- [ ] Wide desktop shows status。
- [ ] Wide desktop shows actions。
- [ ] First shrink hides tags only。
- [ ] First shrink retains property/likes/platform。
- [ ] Second shrink hides tags and property。
- [ ] Second shrink retains likes/platform。
- [ ] Third shrink hides tags/property/likes。
- [ ] Third shrink retains platform。
- [ ] Fourth shrink hides tags/property/likes/platform。
- [ ] Fourth shrink retains title/status/actions。
- [ ] Header and cells share same visibility。
- [ ] Hidden headers leave accessibility tree。
- [ ] Hidden cells leave accessibility tree。
- [ ] Title min width remains readable。
- [ ] Status text remains readable。
- [ ] Actions remain discoverable。
- [ ] Hidden sort is shown in control/URL。
- [ ] Breakpoints are based on approved container/viewport rules。
- [ ] 360px has no page-level overflow。
- [ ] 390px has no page-level overflow。
- [ ] 200% zoom has safe local table scroll if needed。
- [ ] No user column preference is invented。

### 15.9 Narrow drawer

- [ ] Desktop new drawer retains approved width。
- [ ] Desktop edit drawer retains approved width。
- [ ] Mobile new drawer fills available width。
- [ ] Mobile edit drawer fills available width。
- [ ] Drawer uses dynamic viewport/safe fallback。
- [ ] Top title remains visible。
- [ ] Close button remains visible。
- [ ] Form body scrolls independently。
- [ ] Bottom save remains accessible。
- [ ] Bottom cancel remains accessible。
- [ ] Bottom safe-area padding applied。
- [ ] Background page scroll locked。
- [ ] Background list scroll restored on close。
- [ ] iOS dynamic toolbar does not hide actions。
- [ ] Android toolbar does not hide actions。
- [ ] Keyboard input scrolls into view。
- [ ] Keyboard does not cover save。
- [ ] Title edit works in mobile drawer。
- [ ] Description edit works in mobile drawer。
- [ ] Tags edit works in mobile drawer。
- [ ] Join methods edit works in mobile drawer。
- [ ] Image upload works in mobile drawer。
- [ ] Escape respects dirty state。
- [ ] Overlay close respects dirty state。
- [ ] Router navigation respects dirty state。
- [ ] beforeunload guard remains。
- [ ] Focus enters drawer on open。
- [ ] Tab does not enter background。
- [ ] Close restores source button/table heading focus。
- [ ] Nested confirmation closes in correct order。

### 15.10 Security and existing regressions

- [ ] Unauthenticated list blocked。
- [ ] Expired session follows existing handler。
- [ ] GET does not expose data publicly。
- [ ] Existing writes still require CSRF。
- [ ] Sorting input is allowlisted。
- [ ] page is validated before SQL。
- [ ] SQL values are bound。
- [ ] Errors do not expose SQL/table/stack/token。
- [ ] Management data is not public cached。
- [ ] Group create still works。
- [ ] Group edit still works。
- [ ] Status change still works。
- [ ] Trash still works。
- [ ] Restore still works。
- [ ] Permanent delete still works。
- [ ] Image upload still works。
- [ ] Tags still work。
- [ ] Join methods still work。
- [ ] AdminLayout/nav still works if T08 present。
- [ ] Boards page is not overwritten。
- [ ] Analytics page is not overwritten。
- [ ] Public all-groups cursor still works。
- [ ] Public search cursor still works。
- [ ] No public response shape changed。

### 15.11 Evidence package

- [ ] Query Schema snapshot。
- [ ] Response Contract snapshot。
- [ ] COUNT/items condition evidence。
- [ ] SQL plan/index evidence。
- [ ] Stable sort fixture output。
- [ ] Invalid/out-of-range page output。
- [ ] Delete-back helper output。
- [ ] Pager pure function output。
- [ ] Column visibility matrix。
- [ ] Drawer viewport/device notes。
- [ ] Workers Vitest output。
- [ ] Vitest URL/pager/race output。
- [ ] Playwright page/URL/filter/sort output。
- [ ] Playwright column/drawer output。
- [ ] Public cursor regression output。
- [ ] T08/T10 integration handoff。

### 15.12 Extended pagination and responsive acceptance matrix

- [ ] Empty dataset returns page 1 with totalItems 0 and the agreed empty convention。
- [ ] One item on page 1 displays one row and no misleading next-page control。
- [ ] Exactly 50 items display on page 1 with a next-page control。
- [ ] Exactly 51 items display 50 rows on page 1 and one row on page 2。
- [ ] Multiple pages display the configured fixed page size in every full page。
- [ ] A short final page displays only its remaining rows。
- [ ] TotalItems equals the rows matching every active filter, not the unfiltered table。
- [ ] TotalPages is mathematically consistent with totalItems and pageSize 50。
- [ ] Repeated requests with the same sort and filters return the same boundary rows。
- [ ] Identical primary sort values use the documented stable unique-id tie-break。
- [ ] Ascending and descending sort reverse only the intended primary direction。
- [ ] Unsupported sort fields fall back to the documented safe default。
- [ ] Unsupported direction values fall back to the documented safe default。
- [ ] Negative page values normalize to page 1。
- [ ] Zero page values normalize to page 1。
- [ ] Non-numeric page values normalize to page 1。
- [ ] Excessively large page values normalize without an empty misleading screen。
- [ ] A page beyond the final page redirects or reloads to the agreed normalized page。
- [ ] Changing query resets page to 1 before the request is sent。
- [ ] Changing status resets page to 1 before the request is sent。
- [ ] Changing trash state resets page to 1 before the request is sent。
- [ ] Changing sort resets page to 1 before the request is sent。
- [ ] Changing direction resets page to 1 before the request is sent。
- [ ] Browser back restores page, query, status, trash, sort, and direction together。
- [ ] Browser forward restores the same complete list state。
- [ ] Refresh reconstructs the list from URL state rather than stale local state。
- [ ] Copying a list URL to a new tab produces the same request and visible state。
- [ ] Deleting the final row on a non-first page moves back to the previous valid page。
- [ ] Deleting a non-final row keeps the current page when it remains valid。
- [ ] Restoring an item updates the count and page validity without losing the filters。
- [ ] Permanent deletion updates the count and preserves the fixed page size。
- [ ] A failed deletion leaves the row, count, and current page unchanged。
- [ ] A failed restore leaves the row, count, and current page unchanged。
- [ ] A delayed old page response cannot overwrite a newer filter request。
- [ ] A request cancellation does not surface as a user-visible server error。
- [ ] Loading state is local to the list region and does not block unrelated admin shell actions。
- [ ] Empty state is distinct from a failed request and includes the correct reset/action。
- [ ] Error state includes retry while retaining URL criteria。
- [ ] Always-visible columns remain Title, Status, and Actions at every supported width。
- [ ] Tags hide before Property, Property before Likes, Likes before Platform。
- [ ] Column hiding does not change row action semantics or accessible names。
- [ ] The table never creates page-level horizontal scroll at supported mobile widths。
- [ ] Narrow viewport opens a full-screen edit drawer with safe-area padding。
- [ ] Drawer content height follows the visual viewport when the mobile keyboard opens。
- [ ] Drawer footer/actions remain reachable above the keyboard。
- [ ] Drawer close restores focus to the triggering row/action。
- [ ] Dirty drawer close requires the existing confirmation behavior。
- [ ] Browser back from a drawer follows the agreed route/history contract。
- [ ] Create, edit, status, trash, restore, and permanent delete remain functional in the drawer。
- [ ] Image upload and preview behavior remains functional in narrow layouts。
- [ ] Tag editing remains functional in narrow layouts。
- [ ] Join-method editing remains functional in narrow layouts。
- [ ] Validation errors are associated with fields and announced to assistive technology。
- [ ] Focus never escapes the drawer while it is modal。
- [ ] Escape closes only the topmost modal/drawer when it is safe to close。
- [ ] Dark mode preserves table, pager, drawer, focus, and error contrast。
- [ ] Reduced-motion mode removes nonessential drawer and pager transitions。
- [ ] 200 percent zoom keeps title, status, action, and pager controls operable。
- [ ] Keyboard-only users can sort, paginate, edit, and delete without a pointer。
- [ ] Screen readers receive row position and action context without duplicated labels。
- [ ] The public cursor-based all-groups API remains unchanged by the admin page API。
- [ ] The public search cursor API remains unchanged by the admin page API。
- [ ] Board management routes are not modified by the group pagination implementation。
- [ ] Analytics route and data behavior are not modified by the group pagination implementation。
- [ ] T08 can consume the group drawer insertion contract without taking ownership of pagination state。
- [ ] T10 receives URL matrix, viewport matrix, and known-risk notes before regression execution。
- [ ] Every failure has severity, reproduction, expected behavior, actual behavior, owner, and retest evidence。
- [ ] No unresolved S0 or S1 issue remains at handoff。

### 15.13 Query and URL contract review record

- [ ] Document the exact query parameter names consumed by the admin list。
- [ ] Document default values when `page` is absent。
- [ ] Document default values when `q` is absent or blank。
- [ ] Document default status when the status parameter is absent。
- [ ] Document default trash scope when the trash parameter is absent。
- [ ] Document default sort field and direction。
- [ ] Document whether blank values are removed or canonicalized in the URL。
- [ ] Document whether unknown parameters are preserved or dropped。
- [ ] Document whether URL normalization uses replace or push history。
- [ ] Document the canonical URL after invalid page normalization。
- [ ] Document the canonical URL after changing a filter。
- [ ] Document the canonical URL after changing sort direction。
- [ ] Document the route behavior when opening a drawer from a list URL。
- [ ] Document the route behavior after saving a drawer。
- [ ] Document the route behavior after canceling a dirty drawer。
- [ ] Document the route behavior after browser back from a drawer。
- [ ] Document the route behavior after browser forward to a drawer。
- [ ] Verify server and client use the same page-size constant of 50。
- [ ] Verify the API response exposes totalItems and totalPages with explicit numeric types。
- [ ] Verify item rows and counts use one shared filter builder。
- [ ] Verify deleted/trash scope is applied consistently to rows and count。
- [ ] Verify search normalization is shared by API and UI tests。
- [ ] Verify sort field allow-list is shared by API validation and query construction。
- [ ] Verify direction allow-list cannot inject arbitrary SQL fragments。
- [ ] Verify page arithmetic cannot overflow the database offset representation。
- [ ] Verify large page requests are bounded before database access。
- [ ] Verify count queries do not include pagination limits or offsets。
- [ ] Verify list queries do include the same visibility and tenant conditions as count。
- [ ] Verify the unique-id tie-break is explicit in every supported sort query。
- [ ] Verify no public cursor endpoint imports the admin page helper。
- [ ] Verify no admin page endpoint changes public cache keys。
- [ ] Verify stale response protection compares request criteria, not only request order。
- [ ] Verify cancellation cleanup runs on unmount and criteria replacement。
- [ ] Verify retry uses the latest URL-derived criteria rather than an obsolete closure。
- [ ] Verify page normalization is idempotent when the normalized URL is reloaded。
- [ ] Verify count updates after mutation do not reset unrelated filters。
- [ ] Verify optimistic row removal never decrements a count twice。
- [ ] Verify a failed mutation never leaves a phantom page number in the URL。
- [ ] Verify a successful mutation cannot navigate into a page that no longer exists。
- [ ] Verify drawer save refreshes the current page with the current sort/filter criteria。
- [ ] Verify drawer validation does not clear pagination state。
- [ ] Verify upload failures do not close the drawer or lose dirty values。
- [ ] Verify keyboard focus returns after every success, failure, and cancellation path。
- [ ] Verify the table header announces sort state and direction。
- [ ] Verify pager buttons expose disabled state at both boundaries。
- [ ] Verify a screen reader can identify current page and total page count。
- [ ] Verify hidden columns are absent from the accessibility tree when intentionally hidden。
- [ ] Verify row actions remain reachable when optional columns are hidden。
- [ ] Verify safe-area insets are applied on both sides of a full-screen drawer。
- [ ] Verify visual viewport resize is debounced and listener cleanup is tested。
- [ ] Verify page-level overflow remains hidden only where the layout contract requires it。
- [ ] Verify the fixed-height table scroll container has an accessible label or context。
- [ ] Verify no hard-coded mobile pixel height clips validation or action content。
- [ ] Verify dark-mode tokens are used instead of one-off literal colors。
- [ ] Verify reduced-motion media query covers drawer and loading transitions。
- [ ] Verify focus rings remain visible in dark mode and at 200 percent zoom。
- [ ] Verify translations or localized labels do not alter action order or URL semantics。
- [ ] Verify analytics events, if existing, preserve event names and pagination dimensions。
- [ ] Verify the old group-management capabilities have a test owner after refactor。
- [ ] Verify T08 receives only the drawer contract and not an accidental page-state dependency。
- [ ] Verify T10 receives a machine-readable URL/state matrix and screenshot list。
- [ ] Record unresolved questions separately from accepted implementation decisions。
- [ ] Record every deviation from the source PRD with rationale and approver。
- [ ] Mark the task ready for T10 only after the contract record is complete。

### 15.14 Final ownership handoff

- [ ] Name the owner of the admin list API contract。
- [ ] Name the owner of the page URL synchronization logic。
- [ ] Name the owner of the responsive column matrix。
- [ ] Name the owner of the mobile drawer integration point。
- [ ] Name the owner of the group mutation regression suite。
- [ ] Name the owner of the T10 Playwright handoff evidence。
- [ ] Confirm all open questions have a decision or a blocking issue ID。
- [ ] Confirm the handoff does not mark implementation complete before testing。
- [ ] Confirm T10 can reproduce page, filter, sort, drawer, and deletion scenarios。
- [ ] Confirm the task remains in planning until implementation is explicitly started。

## T03 接入检查

- [ ] 管理 page/50/total、筛选/排序、URL、编辑/删除和抽屉真实消费 T03 Token/响应式/无障碍基础。
- [ ] 管理分页/共享壳层消费配置化标题“来个群号”、GitHub URL/文案和添加新群入口，配置回归不改变分页 query。
- [ ] 认证/CSRF、版本冲突、资源生命周期和公开 cursor 保护有回归证据，未用 prototype Mock 替代。
- [ ] 与 T03/T08/AdminView 的共享文件 owner、接入顺序和 T10 handoff 已记录。

## 16. T03 迁移基线后的执行顺序（有效计划）

1. 读取 T03 visual migration 的正式管理列表、分页器、列配置、抽屉和 owner 交接。
2. 确认正式页面没有 prototype fixture、假 total、模拟分页状态或原型 storage 依赖。
3. 审计 T04 群组 Contract、现有管理 endpoint、repository/service、认证/CSRF、资源和 T08 壳层。
4. 先为 page/50/total、COUNT/items 条件、稳定排序、非法页和超页策略建立 Workers 测试。
5. 接入 URL/query adapter、筛选/排序 reset、history、request cancel/race 和错误状态。
6. 将真实 items/total 接入已迁移表格和分页器，不改变其视觉列优先级。
7. 接入编辑/删除/恢复/状态变化后的刷新与退页，复用真实资源抽屉和冲突处理。
8. 验证 360/390/768/1024/1280/1440、键盘、焦点、主题、软键盘和低高度行为。
9. 回归公开 cursor、T08 board/analytics、认证/CSRF、资源生命周期和现有群组 CRUD。
10. 将 page API、URL 矩阵、共享文件 owner 和 T10 证据交接。

### 16.1 停止条件

- T03 迁移表格/分页器/抽屉尚未可消费，或需要重新设计 UI。
- COUNT/items 无法共享过滤条件，或 page API 需要变更未批准的业务语义。
- 真实 mutation 需要绕过认证、CSRF、版本或资源生命周期。
- 管理 page 逻辑开始修改公开 cursor、T08 board 或 Analytics owner。
