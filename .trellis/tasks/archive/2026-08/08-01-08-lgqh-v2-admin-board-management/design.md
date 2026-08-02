# T08 技术设计：管理端板块管理与三页面导航整合

> 范围修订（2026-08-02）：本设计把 T03 迁移后的 AdminLayout、导航、表格、抽屉和板块视觉作为既有基线；T08 只设计真实板块数据流、权限、并发、成员操作、错误状态和与 T09 的共享边界。

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务08.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

> 设计草案。T08 依赖 T03/T05，必须在实际管理端审计、视觉输入和 API Contract 核对后冻结文件路径与路由。

## 1. 设计目标

将管理端从两个独立页面整理为一个路由驱动的系统：统一 AdminLayout/导航/标题/状态视觉，同时为板块提供可并发安全的 CRUD、排序、成员管理界面。设计把页面壳层、板块状态、API client、群组编辑抽屉和 T09 的群组列表改造严格分层。

不变量：

- router 是三页面身份来源，不用本地 Tab 替代。
- T05 返回的 position/version/成员顺序是服务器真值。
- 前端任何乐观状态都有可恢复快照和 request key。
- 群组编辑复用既有抽屉，避免两个群组 Contract/版本流。
- group relation 删除不等于删除 group；UI 文案必须清楚。
- T09 可在 T08 壳层之上改群组列表而不重写导航。

## 2. 现状审计

实施前读取：

1. 当前 admin Router、`/admin` 默认行为、旧群组路径、统计路径、redirect/guard。
2. 当前 admin layout/header/sidebar、session/logout、CSRF 注入和 ErrorBoundary。
3. 当前群组页面、搜索/filter/sort/query、编辑抽屉、trash/permanent delete、image/tag/join method forms。
4. 当前 Analytics 页面、代理 client、时间范围、loading/error/chart theme。
5. T03 token、button/icon/focus/toast/error/skeleton/overlay/z-index。
6. T05 board Admin API Contract、version/token/error、candidate pagination、member response。
7. T02 管理导航/board card/table/drawer 视觉样例。
8. Playwright login/route/CSRF fixtures 和 existing admin tests。

输出 ownership 表：统一 layout/nav、group page、analytics page、board page、shared drawer、shared dialogs、T09 future files，避免多人/后续任务同时写高冲突文件。

## 3. Router 和 AdminLayout

### 3.1 Routes

推荐目标：

```text
/admin          -> configured default, recommended redirect /admin/groups
/admin/groups   -> existing group management
/admin/boards   -> new board management
/admin/analytics -> existing analytics
```

实际路径必须尊重现有书签/测试；旧 statistics route 可保留或 redirect。每条路由共享 auth guard，未认证不渲染敏感内容。路由切换不清 CSRF/session。

### 3.2 AdminLayout responsibilities

`AdminLayout` 负责导航、brand/session/logout、main landmark、page container、theme provider、global toast/overlay/error boundary；不负责板块或群组数据和业务表单。页面内容以 route slot/view 渲染，页面 loading 不覆盖导航。

### 3.3 Navigation

三个 nav item label 为群组管理/板块管理/数据分析，当前项用颜色+文字/aria-current，键盘和 mobile 可用。若 mobile horizontal nav，当前项自动滚入可见区但不锁页面；不使用不可复制 local tab state。

### 3.4 Page title

统一 PageHeader 结构 title/description/actions/status；groups 保留 new/search/filter entry，analytics 保留 time/refresh，boards 提供 create board。T09 可在 groups content 内插入 page/pagination，而不改 PageHeader/route shell。

## 4. Board 页面组件架构

目标树：

```text
AdminLayout
├── AdminNavigation
└── AdminBoardsView
    ├── PageHeader(CreateBoard)
    ├── BoardsRegion
    │   ├── BoardManagementCard*
    │   │   ├── BoardHeader/DragHandle
    │   │   ├── BoardActions
    │   │   └── BoardMembersTable
    │   └── EmptyBoardsState
    ├── CreateBoardDialog
    ├── EditBoardDialog
    ├── DeleteBoardConfirm
    └── AddBoardMemberDialog
```

群组编辑由现有 shared drawer 挂载，删除/创建/添加/板块编辑共用 Dialog primitive。BoardMemberTable 是语义 table，不用成员拖拽。

## 5. API client/Contract

集中 client：

```text
listAdminBoards(signal)
getAdminBoard(boardId, signal)
createBoard(input, signal)
updateBoard(boardId, input, signal)
deleteBoard(boardId, input, signal)
reorderBoards(input, signal)
listBoardMembers(boardId, signal)
searchBoardCandidates(boardId, query, cursor/page, signal)
addBoardMember(boardId, input, signal)
removeBoardMember(boardId, groupId, input, signal)
moveBoardMember(boardId, groupId, input, signal)
```

client 负责 typed fetch、Zod request/response、CSRF header、AbortSignal、token 生成/传递、HTTP→domain error。组件不能散落 fetch，也不能把 mutation token 写入 URL/localStorage。响应使用服务器完整 board/version/order 覆盖本地。

## 6. 页面状态模型

建议集中 `useAdminBoards`/store：

```text
BoardPageState = {
  boards: BoardViewModel[]
  pageStatus: idle|loading|success|error|retrying
  pageError
  reorder: idle|dragging|saving|error
  dialogs: create/edit/delete/addMember
  mutationsByBoardId: { kind, requestId, pending, error }
}
BoardViewModel = {
  board, members, memberStatus, memberError,
  snapshot?, currentVersion, optimistic?, requestSequence
}
```

所有 board 引用以 ID 为 key，避免拖拽重排后组件 index 错配。成员使用 groupId key；候选 query 独立 debounced state。写请求带 request ID，旧 response 只有在匹配当前 board/request/version 时才能 commit。

## 7. Loading/error/zero/empty

首次页面显示 shell/nav + content skeleton，不锁全屏。板块 list failure 只在 main 里 ErrorBanner+retry，导航可切换。zero boards 显示 create CTA，不插本地默认。board members empty 显示 title/status/actions + add-first CTA。单板/候选/操作错误按范围展示，不清所有 boards。

## 8. Board CRUD 设计

### 8.1 Create

Dialog fields title/isEnabled/sortMode，复用 T04/T05 shared schema 和 width/error。位置由 server append，client 不显示/提交 position。submit locked，成功关闭、使用 response 插入后按 server order 排列、toast；失败保留输入。

### 8.2 Edit

打开时保存 board version，字段 title/enabled/sortMode，不能改 position。submit expectedVersion，成功 response 替换；sortMode 不重排管理 members。409 保留用户输入、加载 latest，并允许 reapply/close，沿用现有 group conflict UX。

### 8.3 Delete

统一 confirm 内容说明只移除 board/relations、不删 group；发送 version/token。成功以 server board list/order 更新，允许 default/last board，zero state；失败不提前移除本地。确认 Dialog 的焦点/ESC/Loading 与永久删除视觉一致但文案不混淆。

## 9. Board reorder 设计

### 9.1 Drag surface

只在 BoardHeader drag handle 启用，避免成员 table/button/text selection 捕获。桌面 pointer/drag library 实现占位/target indicator；不依赖整个 card drag。

### 9.2 Keyboard/mobile fallback

如果 drag library keyboard/touch 不可靠，提供 board move-up/move-down action。第一 board up、最后 board down disabled。fallback 走相同完整 reorder API，不直接写 position。

### 9.3 Optimistic protocol

`beforeOrder` + `beforeVersions` 快照 → 用户结束 drag → 生成完整 boardIds + expectedVersions + token → 显示 saving/锁重排 → success server order/version replace → failure restore snapshot, show error → 409 fetch latest, replace, ask user retry。禁止第二个重排请求覆盖第一个。

### 9.4 Other writes

保存期间禁用其他 board configuration writes（或明确排队），允许读和群组编辑需评估 version conflict；最安全是短暂锁 board reorder/delete/edit controls，成员 read unaffected。

## 10. BoardMembersTable

### 10.1 Layout

固定高度和内部 vertical scroll，header sticky（若视觉批准），page body 仍可滚动，内部到边界释放 body scroll。三列 title/status/actions；stable key groupId。不能分页、cursor、硬上限或成员 drag。

### 10.2 Rows

管理 rows 按 `position ASC, groupId`，sortMode 不影响。title limited visual ellipsis but accessible full label；status text published/delisted，不只颜色；actions edit/up/down/remove。edge buttons disabled。

### 10.3 Responsive

desktop table dense；tablet header/action wrap；mobile compact title/status/action menu/icon names，仍暴露全部四类操作；内部滚动清晰，无 page horizontal overflow。编辑抽屉/Dialog mobile near fullscreen 按现有 shared component。

## 11. Member flows

### 11.1 Candidate search

Add dialog 使用 T05 candidate endpoint、debounce、page/cursor limit；显示 title/status，allow published/delisted，exclude trash/duplicate。不能拉全群组。候选 error retry 不关闭 board。

### 11.2 Add

发送 boardId/groupId/expectedVersion/token；成功 server response 加入人工 position 末尾、更新 member count/version；失败保留 query、区分 duplicate/not found/state/409/CSRF。

### 11.3 Edit group

复用现有 group drawer/fields、upload/tags/join methods/version/dirty guard。成功更新当前 row title/status；delisted 留在 board；trash backend 删除 relation，页面刷新/移除；不会在 UI 自动重插恢复 relation。

### 11.4 Move

up/down 发送 groupId/direction/expectedVersion/token；可以乐观交换相邻两行，边界 disabled；success server members/version replace，failure snapshot restore；同 board 只允许一个 move pending。

### 11.5 Remove

确认文案“从当前板块移除”，不写“删除群组”；成功移除/压缩/更新 count/version；失败 restore；group 仍可在群组管理/其他 board。

## 12. Navigation and existing pages

群组页/analytics 页只改 layout shell/page header/theme/state wrapper；保留现有 query, table, search/filter/sort, group drawer, trash/permanent delete, analytics proxy/time range/error. 不修改 groups API/分页/列隐藏/窄屏抽屉，这是 T09 的 owned surface。所有 route view 共享 auth/error/toast/theme，但各自 query/state 不互相污染。

## 13. Focus, a11y, theme

导航 `nav`/`aria-current`/keyboard；board card heading/region；table semantic header/cells；drag handle name + live announcement + fallback；icon buttons complete names；dialogs focus trap/Escape/restore；toast/ARIA live for success/conflict. T03 token covers active, disabled, table, sticky header, scrollbars, modal, error, skeleton, danger. Reduced motion disables drag lift/dialog/toast animation but not operation.

## 14. Test matrix

### 14.1 Route/old pages

login/unauth, direct groups/boards/analytics, navigation active/back/forward/refresh/mobile/theme；group list/search/filter/create/edit/trash/permanent; analytics content/loading/error/refresh/data unchanged。

### 14.2 Board initial

default seed, position order, enabled/disabled, counts/sortMode, loading/error/retry, zero boards, empty board, many boards independent scroll。

### 14.3 CRUD/reorder

create validation/success/failure/CSRF/double submit; edit fields/version/conflict; delete confirm/default/last/with members/failure; drag swap/reverse/optimistic/success/rollback/409/request lock/keyboard/mobile fallback。

### 14.4 Members

candidate paging/debounce/status/exclude; add published/delisted/duplicate/trash/conflict; group drawer/dirty/version; move boundaries/sortModes/concurrency; remove boundaries/count/rollback/token。

### 14.5 Responsive/a11y

360/390/768/1024/1280/1440, table scroll/header/actions, keyboard nav/dialog/table/drag fallback, dark, reduced motion, 200% zoom, no horizontal page overflow。

## 15. Decision gates/risks

必须冻结：

1. actual routes/default/legacy redirects。
2. admin nav desktop/mobile form。
3. board list/member loading strategy（batch vs per-board controlled）。
4. drag library/handle/threshold/keyboard/touch fallback。
5. optimistic lock scope and conflict refresh UX。
6. member table fixed height/sticky header/mobile action menu。
7. group drawer integration ownership with current groups page。
8. T09 insertion point and files not to edit。

停止条件：T05 Contract 不支持完整顺序/version/token；已有抽屉改造会改变群组业务；拖拽无法 keyboard fallback；板块 FK/状态联动不一致；壳层改动会修改 groups pagination/analytics semantics；或出现未认证数据闪现。

## 16. 交付映射

- R08-01 → Router/AdminLayout/navigation/old-page regression。
- R08-02–04 → board cards/CRUD/reorder/zero/empty。
- R08-05–06 → member table/actions/shared group drawer/trash sync。
- R08-07 → auth/CSRF/version/error/a11y/theme/responsive。
- T09 boundary → explicit owned files and no pagination/column rewrite。

## T03 接入提示

管理板块设计以 T03 正式 Token/主题/无障碍基础为消费契约；真实数据流为 AdminView/板块组件 → typed API → T05 route/service → 认证/CSRF/version → D1。原型仅可作为视觉参考，不可作为生产状态源；与 T09 共享的壳层改动必须有 owner 和回归边界。

管理壳层的标题、品牌、GitHub 外链和添加新群入口沿用 T03/T04 站点配置；T08 只消费，不在 AdminView 或板块组件中硬编码。
