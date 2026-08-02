# T08 实施规划：管理端板块管理与三页面导航整合

> 范围修订（2026-08-02）：开始实施时先复核 T03 已迁移的管理 UI，不重复创建 AdminLayout、导航、Dialog、表格或抽屉；实施重点改为 T05 API、认证/CSRF、version/mutation token、CRUD、成员操作、冲突回滚和真实数据测试。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务08.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 当前阶段：planning。以下步骤只在后续明确批准后执行；本轮不运行 `task.py start`，不改正式源码。

## 1. Phase 0：上下文恢复和边界确认

实现前重新读取：

- `docs/PRD/v2/PRD.md`、`docs/PRD/v2/子任务08.md`。
- T01/T02/T03/T05 规划和 T09 源 PRD 的边界章节。
- 实际 admin Router/Layout/nav、groups view、analytics view、auth/logout/CSRF。
- 现有 group edit drawer、trash/permanent delete、Toast/ErrorBanner/Dialog。
- T05 board API client/Contract/error/version/token。
- T03 tokens 和 T02 管理视觉样例。
- 现有 admin Playwright fixtures。

先完成“允许改/禁止改/后续 T09 所有权”表。任何发现应修改 T09 目标（groups pagination、50/page、responsive columns、mobile full-screen drawer）的内容，停止并归还 T09。

## 2. Phase A：路由、壳层和兼容审计

### A1. Routes

- [ ] 记录当前 `/admin`、groups、stats/analytics 的真实路径。
- [ ] 记录默认 redirect 和 legacy path/书签。
- [ ] 记录 auth guard、session expiry、logout、CSRF injection。
- [ ] 记录 browser history/scroll behavior。
- [ ] 记录每个 view 的 loading/error boundary。

### A2. Shared UI

- [ ] 记录当前 layout/header/sidebar/nav。
- [ ] 记录 page title/action patterns。
- [ ] 记录 button/icon/focus/toast/error/skeleton/overlay tokens。
- [ ] 记录 existing dirty form guard and drawer layering。
- [ ] 记录 chart theme/error and analytics refresh behavior。

### A3. Phase A gate

- [ ] 旧路径不破坏或有明确 redirect。
- [ ] 未认证页面没有敏感内容闪现。
- [ ] groups/analytics owned behavior snapshot 已建立。
- [ ] T09 owned surfaces 不在修改清单。

## 3. Phase B：建立 AdminLayout 和三页面 Router

### B1. Layout

建立/整理 AdminLayout：nav/main/page container/theme/global toast/overlay/auth logout/error boundary。页面业务 state 不放入 layout；页面 loading 不覆盖 nav。三 views 以 router view 挂载。

### B2. Navigation

实现群组管理、板块管理、数据分析三个 nav item：active route、`aria-current=page`、keyboard/Touch、mobile visibility、dark theme。若 horizontal mobile nav，当前项 scrollIntoView 不锁 body。

### B3. Routes

注册 board view、保持 groups/analytics path/redirect/guard。刷新当前 route、back/forward、直接访问、unauth/expired session 先写 Playwright。

### B4. PageHeader

提供统一 title/description/actions slot；groups 保留 create/search/filter；analytics 保留 time/refresh；boards create board。不要移动/重命名导致现有测试和业务误解。

### B5. Phase B gate

- [ ] 三页面可直接访问/切换/返回/前进。
- [ ] 当前 nav active 和 aria correct。
- [ ] groups/analytics 原有关键元素仍存在。
- [ ] mobile/nav/dark/reduced motion 初步通过。

## 4. Phase C：已有页面壳层接入和回归基线

### C1. Groups

只包裹现有 groups view：保留 query/filter/sort/list/create/drawer/trash/permanent delete/page behavior. 不改 API、cursor/keyset、pagination、column hiding、mobile final drawer。记录 T09 future mount point。

### C2. Analytics

包裹现有 analytics view：保留 proxy, metrics, time range, refresh, loading/error/chart. 只统一 PageHeader/theme/container，不改变 source/definition/cadence。

### C3. Baseline tests

先运行/补充 groups and analytics Playwright before board implementation；每个失败证明是壳层回归还是既有问题。确认 admin session/CSRF/logout unaffected。

### C4. Phase C gate

- [ ] groups existing function baseline pass。
- [ ] analytics baseline pass。
- [ ] no T09 behavior changed。
- [ ] no duplicate drawer/toast/auth system。

## 5. Phase D：Board API client 和页面状态

### D1. Client

集中实现 list/detail/create/update/delete/reorder/members/candidates/add/remove/move client。每个请求 shared Zod parse、CSRF、AbortSignal、domain error、expectedVersion/token。组件不得原始 fetch。

### D2. State

建立 `useAdminBoards` 或现有 store pattern：boards keyed by ID、members by board、status/error、current versions、reorder/mutation request IDs、optimistic snapshots、dialogs/candidate search。版本和 response 以 server truth 覆盖。

### D3. Initial page

加载 shell 后显示 board skeleton；success 按 API position；board error 内容区 retry；zero boards create CTA；empty board complete header/actions + empty member state。各 board member loading/error 范围独立或按 API 设计。

### D4. Phase D gate

- [ ] no raw fetch/any。
- [ ] request cancellation/sequence prevents stale commit。
- [ ] server version/position is source of truth。
- [ ] zero/empty/disabled loading/error component tests pass。

## 6. Phase E：Board CRUD

### E1. Create dialog

使用 shared schema，字段 title/isEnabled/sortMode，无 position。提交锁、Loading、CSRF；成功 close/insert server board/order/version/toast；失败保留输入和字段错误。测试 empty/width/enum/duplicate submit/network/CSRF/focus。

### E2. Edit dialog

打开保存 board version；修改 title/enabled/sortMode，不改 position。success server replace/toast；409 rollback/refresh latest/retain input/reapply choice；sortMode 不改变 management rows。未启用仍可编辑。

### E3. Delete

Confirm 说明 only relation removal/no group deletion/unrecoverable board. version/token submit；success server list/order replace；default/last allowed/zero state；failure no local remove. Focus/ESC/layer uses shared dialog.

### E4. Phase E gate

- [ ] CRUD APIs wired and typed。
- [ ] server order/version rendered。
- [ ] default/last/zero behavior pass。
- [ ] no accidental group deletion。
- [ ] conflicts/CSRF/network restore expected state。

## 7. Phase F：固定高度成员表

### F1. Table

实现 semantic `<table>`，title/status/actions 三列，board title association，stable groupId keys，manual position ASC regardless sortMode。固定 viewport height，body internal scroll，optional sticky header，scroll boundary releases page。无分页/硬上限。

### F2. Responsive

desktop dense table；tablet wrap header/actions；mobile compact/menu/icon but all actions visible/labelled，dialog/drawer full-screen as existing shared component。避免 page horizontal overflow。

### F3. Row states

published/delisted text status；异常 trash/inconsistent state safe error/refresh；up disabled first/down disabled last/single both disabled；edit/move/remove accessible labels。empty first CTA add group。

### F4. Phase F gate

- [ ] fixed height/internal scroll/multiple independent boards。
- [ ] no member pagination/drag。
- [ ] semantic table/keyboard/action names。
- [ ] mobile table all operations usable。

## 8. Phase G：Candidate search/add/member edit

### G1. Candidate dialog

Use T05 candidate endpoint with debounce and bounded pagination/cursor. Show title/status; allow published/delisted; exclude trash/duplicate or disabled; retry error. Select one or supported batch only when Contract supports; never simulate unchecked multi-write.

### G2. Add

send board/group/expectedVersion/token；success append standard manual end, update count/version from server, toast; failure classify duplicate/not found/state/409/CSRF/network, keep search input and no temp row。

### G3. Edit drawer

Open existing group drawer; preserve title/description/platform/tags/join methods/image/status/version/dirty guard/beforeunload/Escape. Success update row fields; delisted remains row; trash backend removes relation then re-fetch/remove; restore never reinserts relation.

### G4. Phase G gate

- [ ] candidates bounded/debounced/typed。
- [ ] published/delisted allowed, trash excluded。
- [ ] row and count/version server sync。
- [ ] existing drawer all fields/guards regress。
- [ ] trash relation sync test ready for T10。

## 9. Phase H：Member move/remove

### H1. Move

up/down request with board/group/direction/version/token；first/last disabled。Can optimistically swap adjacent rows; snapshot/version/request lock per board；success replace server members/version；failure restore; 409 latest refresh/retry prompt. Test all sortModes but management always manual ASC。

### H2. Remove

confirm/light confirm text “remove from board”; submit token/version；success remove/compress/count/version server sync；failure restore; group remains elsewhere. Test first/middle/last/only/409/token replay。

### H3. Phase H gate

- [ ] one board cannot send concurrent moves。
- [ ] optimistic state fully rollback。
- [ ] boundary buttons correct。
- [ ] no group deletion/status change。

## 10. Phase I：Board drag reorder

### I1. Drag

Use approved library or pointer implementation. Only handle draggable; show placeholder/target/lift; stop propagation from header actions/member table. Touch support if reliable; otherwise keyboard/mobile up/down fallback.

### I2. Commit

before order/version snapshot → complete boardIds/expectedVersions/token → saving lock → server response order/version replace. No local position-only success.

### I3. Failure

network/500/403 restore snapshot and toast/error. 409 restore, fetch latest order/versions, explain conflict, let admin retry; never auto-overwrite. During saving disable other board config writes or queue safely, allow reads only.

### I4. Phase I gate

- [ ] desktop drag works。
- [ ] keyboard fallback works。
- [ ] mobile fallback works。
- [ ] member internal scroll/buttons unaffected。
- [ ] duplicate reorder request prevented。
- [ ] success/failure/conflict evidence complete。

## 11. Phase J：a11y/theme/responsive/operations

### J1. Accessibility

Nav landmark/aria-current；board heading/region；table semantics；drag handle name and live reorder message；icon labels; dialogs focus trap/Escape/restore; toast/live success/conflict; keyboard mobile fallback.

### J2. Theme/motion

Use T03 semantic tokens for nav/active/table/status/sticky/scroll/dialog/skeleton/error/toast/danger. Dark chart uses existing Analytics semantics; reduced motion removes drag lift/dialog/toast movement, not actions.

### J3. Manual/device

Verify 360/390/768/1024/1280/1440; mobile nav/table scroll/dialog; desktop pointer/trackpad; keyboard/200%; dark/reduced motion/slow network/long board list.

## 12. Phase K：Playwright matrix

### K1. Nav/existing

login/three nav/direct routes/active/back/forward/refresh/unauth/session/theme/mobile; groups list/search/filter/create/edit/trash/permanent; analytics content/error/refresh unchanged。

### K2. Initial/CRUD

default/disabled/position/count/loading/error/retry/zero/empty；create validation/success/fail/CSRF/double submit；edit fields/sort/status/version/conflict；delete confirm/default/last/with members/no group delete。

### K3. Reorder

handle/swap/reverse/optimistic/success/failure/409/request lock/keyboard/mobile fallback/no member scroll interference。

### K4. Members

fixed table/internal scroll/status; candidate search/published/delisted/trash exclude/duplicate; add; group drawer/dirty/changes; move edge/all sort modes; remove/all boundaries/failure/token。

### K5. Integration/error

trash link update/restore no reattach; 401/403 CSRF/409/500/parse; responsive 360–1440; dark/reduced/200%; screenshots/manual device。

## 13. 工程验证命令

以 `package.json` 实际脚本为准执行：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
pnpm test:e2e
```

如 T08 只新增管理 Playwright，记录具体 suite；不得因新页面跳过 groups/analytics regression。失败要分环境/flaky/实现/Contract，并保留可复现证据。

## 14. 停止条件与回滚

停止并报告：

- T05 API/Contract 缺少 version/token/order/成员完整响应。
- 无法可靠复用群组编辑抽屉而需要第二套业务表单。
- drag 无 keyboard/mobile fallback。
- 统一壳层会改变 groups pagination/columns 或 Analytics source。
- 未认证页面出现管理数据闪现。
- 版本冲突不能回滚乐观状态。
- trash/restore UI 误把 relation removal 当 group deletion。
- 需要改数据库或后端业务规则。

回滚以恢复旧 route/view shell 为优先；不删除业务数据、不修改历史 migration、不用 destructive git 操作。

## 15. 最终验收清单

- [ ] T08 planning、未 start、无子任务。
- [ ] AdminLayout/nav/routes/default/legacy/active/guard。
- [ ] groups/analytics 壳层接入且业务回归。
- [ ] board list/create/edit/status/sort/delete/zero/empty。
- [ ] fixed table/internal scroll/no member pagination/drag。
- [ ] candidate/add/edit/move/remove/status/compact mobile。
- [ ] board drag/keyboard/mobile/token/optimistic/rollback/conflict。
- [ ] auth/CSRF/errors/focus/ARIA/theme/reduced motion。
- [ ] T09 owned scope unchanged and handoff documented。
- [ ] Playwright/component/manual/screenshots/build regression recorded。

## 16. 实施完成报告格式

1. 三页面路由、AdminLayout、nav、legacy redirects。
2. groups/analytics 保留能力与 T09 边界。
3. board component tree/state/API client/CRUD。
4. drag/keyboard/mobile/token/optimistic rollback/conflict。
5. member table/candidate/add/edit/move/remove/trash sync。
6. responsive/a11y/theme/focus/error behavior。
7. Playwright/Vitest/build/regression/manual evidence。
8. T09 insertion point、T10 cross-feature risks。

## 17. 逐项验收场景清单

### 17.1 Admin navigation and route

- [ ] Authenticated user sees exactly three primary navigation items.
- [ ] 群组管理 nav label is stable.
- [ ] 板块管理 nav label is stable.
- [ ] 数据分析 nav label is stable.
- [ ] Current route has visual active state.
- [ ] Current route has `aria-current=page`。
- [ ] Active state is not color-only。
- [ ] Direct groups route loads。
- [ ] Direct boards route loads。
- [ ] Direct analytics route loads。
- [ ] `/admin` default behavior is documented/tested。
- [ ] Legacy statistics path redirects or remains usable。
- [ ] Browser back groups←boards works。
- [ ] Browser forward groups→boards works。
- [ ] Refresh boards stays boards。
- [ ] Refresh analytics stays analytics。
- [ ] Unauthenticated direct route is blocked。
- [ ] Expired session is handled by existing flow。
- [ ] Logout remains available。
- [ ] CSRF cookie/session survives navigation。
- [ ] Mobile navigation exposes all three pages。
- [ ] Mobile nav does not create page horizontal overflow。
- [ ] Navigation does not lock body scroll unexpectedly。
- [ ] Theme switch remains available on all pages。

### 17.2 Existing groups page regression

- [ ] Group list renders inside AdminLayout。
- [ ] Existing search remains functional。
- [ ] Existing filters remain functional。
- [ ] Existing sort remains functional。
- [ ] Existing create entry remains visible。
- [ ] Existing group edit drawer opens。
- [ ] Existing dirty-form guard works。
- [ ] Existing image upload works。
- [ ] Existing tags editing works。
- [ ] Existing join methods editing works。
- [ ] Existing trash route works。
- [ ] Existing permanent delete route works。
- [ ] Existing CSRF behavior works。
- [ ] Existing session expiry behavior works。
- [ ] Current group list pagination/keyset is unchanged。
- [ ] No T09 page-size 50 is introduced prematurely。
- [ ] No T09 column hiding rewrite is introduced。
- [ ] Returning from boards preserves documented groups query state。

### 17.3 Existing analytics regression

- [ ] Analytics page renders inside AdminLayout。
- [ ] Existing Analytics proxy endpoint is unchanged。
- [ ] Existing metrics remain present。
- [ ] Existing time range control remains present。
- [ ] Existing refresh behavior remains。
- [ ] Analytics loading state is visible in content only。
- [ ] Analytics error is visible and actionable。
- [ ] Analytics data semantics are unchanged。
- [ ] Analytics chart is readable in light theme。
- [ ] Analytics chart is readable in dark theme。
- [ ] Analytics page direct URL works。
- [ ] Analytics back/forward works。
- [ ] Analytics route does not leak board state。
- [ ] No new unapproved metric is added。

### 17.4 Board initial state

- [ ] Board skeleton appears after shell.
- [ ] Navigation remains usable while board list loads。
- [ ] Default board appears when seed exists。
- [ ] Boards are ordered by server position。
- [ ] Board title is visible。
- [ ] Enabled state is textually visible。
- [ ] Disabled state is textually visible。
- [ ] Sort mode uses human labels。
- [ ] Member count is server-provided。
- [ ] Board actions are visible even when empty。
- [ ] Empty board displays add-first action。
- [ ] Zero board displays explanation and create CTA。
- [ ] Zero board does not render virtual default。
- [ ] Refresh after zero board remains zero。
- [ ] Initial list error does not hide nav。
- [ ] Initial list retry only retries content。
- [ ] Single board member error does not clear other boards。
- [ ] Multiple boards have independent member scroll state。

### 17.5 Board create/edit/delete

- [ ] Create dialog opens from PageHeader。
- [ ] Create dialog has accessible title。
- [ ] Empty title shows field error。
- [ ] Over-width title uses shared error。
- [ ] Sort mode options are valid only。
- [ ] Enabled default matches Contract。
- [ ] Position is not client-entered。
- [ ] Duplicate submit is blocked。
- [ ] Create loading is visible。
- [ ] Create success closes or follows approved behavior。
- [ ] Create success uses server position/version。
- [ ] Create success shows toast。
- [ ] Create network failure preserves input。
- [ ] Create CSRF failure does not insert temp board。
- [ ] Create Escape restores focus。
- [ ] Edit opens with current values/version。
- [ ] Edit title success updates server response。
- [ ] Edit enable/disable success updates state。
- [ ] Edit sort mode does not reorder member rows。
- [ ] Disabled board remains editable。
- [ ] Edit version conflict retains user input。
- [ ] Edit conflict loads latest board。
- [ ] Edit does not auto-overwrite latest values。
- [ ] Delete confirmation names board。
- [ ] Delete explains group is not deleted。
- [ ] Delete can cancel。
- [ ] Delete default board is allowed。
- [ ] Delete last board is allowed。
- [ ] Delete with members removes relation only。
- [ ] Delete success uses server list/order。
- [ ] Delete failure keeps local board。
- [ ] Delete version conflict does not remove board。
- [ ] Delete mutation token is not reused across operations。

### 17.6 Board reorder

- [ ] Only board header handle starts drag。
- [ ] Header buttons do not start drag。
- [ ] Member table scroll does not start board drag。
- [ ] Text selection remains possible where appropriate。
- [ ] Two boards can exchange。
- [ ] Multiple boards can reverse order。
- [ ] Placeholder/target indicator is clear。
- [ ] Optimistic order appears while saving。
- [ ] Second reorder is blocked or queued safely。
- [ ] Complete board ID set is submitted。
- [ ] Expected versions are submitted。
- [ ] Mutation token is submitted。
- [ ] Success replaces with server order。
- [ ] Success replaces all relevant versions。
- [ ] Network failure restores exact snapshot。
- [ ] 500 restores exact snapshot。
- [ ] CSRF failure restores exact snapshot。
- [ ] 409 restores and refreshes latest。
- [ ] Conflict does not auto-resubmit。
- [ ] Keyboard up/down fallback works。
- [ ] First up action is disabled。
- [ ] Last down action is disabled。
- [ ] Mobile fallback is discoverable。
- [ ] Reorder announces successful change。
- [ ] Reorder announces failed/conflict change。

### 17.7 Member table and scroll

- [ ] Table uses `<table>` semantics。
- [ ] Table header names title/status/actions。
- [ ] Board title labels member region。
- [ ] Table has controlled fixed height。
- [ ] Table body scrolls internally after overflow。
- [ ] Page body still scrolls outside table。
- [ ] Scroll at table boundary releases page as designed。
- [ ] Sticky header remains readable if enabled。
- [ ] No member pagination appears。
- [ ] No hard member cap blocks adding。
- [ ] Rows use stable groupId keys。
- [ ] Rows are manual position ascending。
- [ ] Sort mode does not reorder management rows。
- [ ] Long group title truncates visually。
- [ ] Full title is accessible/inspectable。
- [ ] Published status has text。
- [ ] Delisted status has text。
- [ ] Unexpected state is safe error/refresh。
- [ ] Empty board has add-first action。
- [ ] Multiple board scroll areas are independent。

### 17.8 Candidate search and add

- [ ] Add dialog opens from board header。
- [ ] Add dialog has accessible title。
- [ ] Candidate query is debounced。
- [ ] Candidate query is bounded/pageable。
- [ ] Candidate query does not load all groups。
- [ ] Published candidate is visible。
- [ ] Delisted candidate is visible。
- [ ] Trash candidate is excluded/disabled。
- [ ] Duplicate current member is excluded/disabled。
- [ ] Candidate status is textual。
- [ ] Add published succeeds。
- [ ] Add delisted succeeds。
- [ ] New member appends to manual end。
- [ ] Add success updates count/version from server。
- [ ] Add success feedback appears。
- [ ] Duplicate error is clear。
- [ ] Trash state error is clear。
- [ ] Version conflict does not insert row。
- [ ] CSRF failure does not insert row。
- [ ] Candidate API failure can retry。
- [ ] Candidate retry keeps board/page context。
- [ ] Candidate search focus is usable by keyboard。
- [ ] Multi-select is only used if Contract supports it。

### 17.9 Group drawer integration

- [ ] Member edit opens existing group drawer。
- [ ] Title editing remains available。
- [ ] Description editing remains available。
- [ ] Platform editing remains available。
- [ ] Tags editing remains available。
- [ ] Join methods editing remains available。
- [ ] Image upload remains available。
- [ ] Group status remains available。
- [ ] Group version conflict remains available。
- [ ] Dirty form guard remains available。
- [ ] Navigation while dirty prompts。
- [ ] Escape behavior remains correct。
- [ ] Successful title change updates row。
- [ ] Group delisted remains in board row。
- [ ] Group republished remains in board row。
- [ ] Group trashed is removed after server sync。
- [ ] Restore does not reinsert old relation。
- [ ] Drawer does not create second group edit form。

### 17.10 Member move/remove

- [ ] First row up disabled。
- [ ] Last row down disabled。
- [ ] Single row both disabled。
- [ ] Middle row up swaps previous only。
- [ ] Middle row down swaps next only。
- [ ] Move works in manual asc。
- [ ] Move works in manual desc while table stays manual asc。
- [ ] Move works in hourly random while table stays manual asc。
- [ ] Move request includes expectedVersion/token。
- [ ] Concurrent move on same board blocked。
- [ ] Move success uses server members/version。
- [ ] Move failure restores exact order/version。
- [ ] Remove confirmation text says remove from board。
- [ ] Remove first compresses rows。
- [ ] Remove middle compresses rows。
- [ ] Remove last compresses rows。
- [ ] Remove only leaves empty board。
- [ ] Remove updates member count/version。
- [ ] Remove failure restores row/order/count/version。
- [ ] Remove conflict refreshes latest。
- [ ] Remove never deletes group。
- [ ] Token replay does not duplicate side effects。

### 17.11 Security, a11y, responsive, final evidence

- [ ] All admin writes require auth。
- [ ] All admin writes require CSRF。
- [ ] 401 follows existing session flow。
- [ ] 403 shows safe security error。
- [ ] 409 shows conflict and refresh path。
- [ ] 500/parse errors show safe banner/toast。
- [ ] Errors do not show SQL/table/token/stack。
- [ ] Nav uses semantic navigation。
- [ ] Board cards have headings/regions。
- [ ] Drag handles have accessible names。
- [ ] Table buttons have board/group context names。
- [ ] Dialog focus trap works。
- [ ] Dialog close restores focus。
- [ ] Toast/live status announces success/failure。
- [ ] Dark mode covers nav/table/dialog/error/toast。
- [ ] Reduced motion retains operation。
- [ ] 360px board page usable。
- [ ] 390px board page usable。
- [ ] 768px board header/table usable。
- [ ] 1024px desktop layout usable。
- [ ] 1280px and 1440px layout not over-wide。
- [ ] No page-level horizontal overflow。
- [ ] Playwright nav/old pages/CRUD/members/reorder/conflict passes。
- [ ] Screenshots and manual device evidence recorded。
- [ ] T09 owned files and safe insertion point documented。
- [ ] T10 cross-feature regression list handed off。

## 18. 交接记录模板

- [ ] 实际 AdminLayout 文件路径。
- [ ] 实际三页面 route path。
- [ ] `/admin` 默认 redirect 行为。
- [ ] legacy route 兼容策略。
- [ ] auth guard 和 CSRF helper 位置。
- [ ] Board API client 导出名。
- [ ] Board state composable/store 位置。
- [ ] Board version 更新来源。
- [ ] Reorder token 生成和发送位置。
- [ ] Member move/remove token 生成和发送位置。
- [ ] Member table fixed height 参数来源。
- [ ] Sticky header 是否启用。
- [ ] Mobile action menu/keyboard fallback 位置。
- [ ] Group drawer 复用入口。
- [ ] Conflict refresh helper。
- [ ] Zero board create CTA。
- [ ] Empty board add CTA。
- [ ] T09 groups insertion point。
- [ ] T09 禁止改动文件清单。
- [ ] T10 admin regression suite 名称。
- [ ] 视觉截图目录。
- [ ] 人工验证设备/缺口。
- [ ] 已知非阻塞问题。
- [ ] 未解决阻断问题必须为空。

### 18.1 Board-specific failure and recovery matrix

- [ ] Load board list with zero boards and verify the empty-state CTA。
- [ ] Load board list with one disabled board and verify status is explicit。
- [ ] Load board list with mixed enabled and disabled boards。
- [ ] Create a board with a duplicate name and display the server validation error。
- [ ] Create a board with an invalid filter configuration and keep the form values。
- [ ] Edit a board after another actor changed its version and require refresh。
- [ ] Delete a board whose members were removed by an earlier operation。
- [ ] Delete a board whose member deletion partially fails and verify atomic rollback。
- [ ] Restore a board and verify no historical member relation is silently reattached。
- [ ] Permanently delete a board and verify the confirmation states the irreversible effect。
- [ ] Reorder an empty member table without issuing a mutation request。
- [ ] Reorder one member and verify the server receives the exact position token。
- [ ] Reorder multiple members and verify only the intended board is mutated。
- [ ] Remove the final member and verify the board remains valid and visible。
- [ ] Move the final member and verify source and destination board state refresh。
- [ ] Move a member to the same board and avoid a no-op destructive request。
- [ ] Open a board while a prior list request is still pending and avoid stale overwrite。
- [ ] Retry a failed mutation only after the user can understand whether it is safe。
- [ ] Confirm every destructive action is protected by the existing auth and CSRF path。
- [ ] Confirm an expired session returns the existing login/reauth behavior。
- [ ] Confirm a non-admin cannot discover board mutation endpoints through the UI。
- [ ] Confirm an API error is announced without exposing internal SQL or stack details。
- [ ] Confirm disabled board state is consistent after refresh and route revisit。
- [ ] Confirm member order remains stable after page reload and route navigation。
- [ ] Confirm board order remains stable after page reload and route navigation。
- [ ] Confirm a failed reorder restores the pre-optimistic order exactly。
- [ ] Confirm a failed remove restores the member row and its prior position。
- [ ] Confirm a failed move restores both source and destination snapshots。
- [ ] Confirm conflict recovery does not discard unrelated unsaved drawer edits。
- [ ] Confirm the group drawer can be opened from a board member without route loss。
- [ ] Confirm closing the group drawer returns focus to the invoking board row/action。
- [ ] Confirm screen-reader labels distinguish board actions from member actions。
- [ ] Confirm keyboard users can reach every board action without drag interaction。
- [ ] Confirm a keyboard reorder fallback has equivalent server semantics to drag。
- [ ] Confirm touch users have a non-drag path for moving/removing members。
- [ ] Confirm fixed-height member scrolling does not scroll the surrounding page unexpectedly。
- [ ] Confirm sticky headers do not obscure the first or last member row。
- [ ] Confirm board cards do not use an unbounded member list in the DOM。
- [ ] Confirm rapid filter changes do not mix board results from different criteria。
- [ ] Confirm loading, empty, error, disabled, and conflict states are visually distinct。
- [ ] Confirm dark mode preserves action contrast and destructive-action distinction。
- [ ] Confirm reduced-motion mode removes nonessential drag and drawer animation。
- [ ] Confirm 200 percent zoom still exposes board actions and error messages。
- [ ] Confirm 320px and 375px widths have no horizontal page overflow。
- [ ] Confirm desktop and mobile screenshots are captured for each board state。
- [ ] Confirm all unresolved failures are classified as blocker, follow-up, or out of scope。
- [ ] Confirm only blockers remain open before the handoff to T10。

## T03 接入检查

- [ ] 板块页面真实消费 T03 Admin shell/Token/主题/无障碍基础和 T05 API，未复制 prototype 数据或主题逻辑。
- [ ] 管理壳层消费配置化标题“来个群号”、GitHub URL/文案和添加新群入口，未出现第二套常量。
- [ ] 认证、CSRF、version/mutation token、错误/冲突、成员状态和回收站数据流有集成测试或交接证据。
- [ ] AdminView/T09 共享文件的修改 owner、顺序和回归命令已记录。
