# 07 首页信息架构与搜索重构

> 执行前置规则：本任务虽已有 PRD 与三份规划，进入执行或最终批准前，仍必须完整读取 `docs/PRD/v2/子任务07.md` 原文，逐条对照 `prd.md`、`design.md`、`implement.md`，记录并修正遗漏。必须先按 `trellis-brainstorm` 规则检查代码、测试、配置、Spec 和任务历史，再与用户进行 brainstorm；每次只提出一个最高价值问题，说明决策影响、推荐方案和取舍。每次用户回答后更新规划并重新检查需求收敛；即使没有剩余疑问，也必须展示最终规划摘要并等待用户明确批准。在原文复核和用户批准完成前，不得运行 `task.py start`、进入实施或修改业务代码；源 PRD 与用户最新决定优先于规划文件。

> 状态：planning。T07 负责公开首页编排和搜索状态，不重新实现 T06 的卡片/Carousel/Dialog，也不进入实施。

## 1. 任务定位与联合 Review

T07 依赖 T03 的顶栏/主题、T05 的公开板块 API 和 T06 的 GroupCard/HorizontalCarousel/GroupDetailsDialog/`group` URL 控制器；间接依赖 T04 的 `last_published_at`、公开 Contract 和状态过滤。交付新的默认首页、搜索模式、发现新群、所有标签、动态板块、所有群组 Grid 和搜索结果 Grid。

产品、Staff Engineer、QA 联合 Review 后冻结：

1. 空搜索默认首页顺序固定为：顶栏、主搜索框、发现新群、所有标签、动态板块、所有群组；不能因区域为空/失败打乱顺序。
2. 有效 `q` 时切换搜索模式：顶栏、同一主搜索框、搜索结果；无需 Enter，debounce 后自动搜索，默认区域隐藏。
3. `q` 按 trim 后的有效词判断；空格/Tab/换行等为空；IME composition 中不搜索，compositionend 后只请求一次。
4. `q` 与 T06 的 `group` 可共存；更新 q 只能增删 q，不能丢 group 或其他合法 query；详情关闭保留搜索词。
5. 发现新群依赖 `last_published_at DESC`、稳定 ID 次排序、最多 10 条，不随机、不轮询、不分页。
6. 标签只统计已发布群组，数据库聚合、数量降序/名称稳定升序，不建立独立标签页面；点击标签替换搜索词并进入搜索模式。
7. 板块严格复用 T05 返回顺序/过滤/排序；0 个板块不显示虚拟默认板块，启用空板块仍显示空状态。
8. 所有群组和搜索结果使用现有 cursor pagination；所有群组保留旋转排位算法，二者都是响应式 Grid，不一次加载全部数据。
9. 默认首页区域独立 loading/success/empty/error/retry；单区失败不能白屏、阻止搜索或重置其他区域。
10. 请求取消、竞态、cursor 绑定、分页去重、滚动/缓存恢复必须可测试；前端隐藏不能替代后端 published 过滤。

## 2. 用户价值

- 用户打开首页即可发现最新发布、标签和板块，同时保留完整目录。
- 用户输入关键词即可快速从标题、简介和标签检索，无需离开当前页面。
- 用户在搜索、详情、返回/前进之间不会丢失 query、结果、点赞或滚动上下文。
- 局部网络/后端故障不会让整页白屏，用户仍能搜索、提交群组和使用其他成功区域。
- 移动端和键盘用户能使用相同顺序、Carousel、Grid 和详情能力。

## 3. 范围与非目标

### 3.1 必须交付

- HomeView/公开布局重构和固定 Section 顺序。
- 主搜索框、有效词判定、debounce、IME、q URL、搜索模式。
- 发现新群读取/最小 API 扩展、10 条 limit、排序和 Carousel 接入。
- 已发布标签聚合、稳定排序、全部标签展示、键盘可点击和标签搜索。
- T05 动态板块 API 接入、空板块/零板块、区域状态。
- 所有群组 Grid、现有旋转排序、cursor、无限滚动、加载更多失败/重试。
- 搜索结果 Grid、字段保持、cursor/query 绑定、空/错状态。
- `q` + `group`、单一详情 Dialog、共享点赞、请求竞态、滚动/缓存策略。
- API client、共享 Contract、Workers Vitest、Vitest、Playwright、视觉/响应式验证。

### 3.2 明确不交付

- 不修改 T03 顶栏/主题基础，不修改 T05 板块管理后端，不修改 T06 卡片/Carousel/Dialog 底层。
- 不修改数据库、`last_published_at`、群组标题/简介规则、点赞安全模型。
- 不改搜索字段范围/相关性算法，不引入 WebSocket、轮询、个性化推荐或独立标签/详情页面。
- 不把所有群组/搜索结果一次返回，不把所有群组改成页码或 Carousel，不公开下架/回收站群组。

## 4. 前置条件与阻断

实施前确认 T03/T05/T06 的规划和实际实现已通过；检查 T04 已回填发布时间、公开摘要和状态过滤。若 T05 API 返回管理字段、T06 的 `group` controller 不支持 query merge，或旧 cursor 与新的 page 状态不能兼容，必须停在 planning 并报告，不在 HomeView 里绕过。

## 5. 页面结构与状态机

### R07-01 固定页面骨架

复用 T03 顶栏，单一主搜索框位于顶栏下且在模式切换时 DOM 位置/高度稳定。默认模式和搜索模式共用一个 SearchHero，不复制两套输入框；Dialog 属于覆盖层，不是第三种内容模式。

### R07-02 默认区域顺序

固定渲染：发现新群 → 所有标签 → 动态板块 → 所有群组。区域可以独立 loading/empty/error，但不因状态删除顺序语义。零板块时不显示总板块区域；启用空板块仍有标题和空态。

### R07-03 搜索模式

`effectiveQuery = rawInput.trim()`；空时默认模式，非空时搜索模式。搜索模式只显示搜索结果，搜索框位置稳定。无需 Enter，debounce 后请求；清空只清 q，恢复默认状态/缓存策略由 design 冻结。

## 6. 搜索与 URL

### R07-04 debounce/IME

沿用现有成熟 debounce 或在设计中冻结新值；连续输入只请求最后稳定词。compositionstart/update 不请求/不写无意义 URL，compositionend 后请求一次。组件卸载、清空、模式切换取消旧 timer/request。

### R07-05 q/group

初始化从 `route.query.q` 安全恢复；更新 q 用 Router 正常编码，保留 group。页面内 card click 追加 group，详情由 T06 controller 管；搜索结果打开 Dialog 后背景仍是搜索，关闭保留 q；清空搜索时 Dialog 可保持打开并切换背景为默认。

### R07-06 历史/滚动

连续输入用 replace 避免每字符污染历史；标签点击可 push 一次回到默认首页。浏览器前进/后退恢复 q、mode、group、结果/合理重载和滚动，不能用 history.length 猜来源。

## 7. 数据区域

### R07-07 发现新群

只查 published，按 `last_published_at DESC, id` 稳定排序，limit 10，最多一页，不随机、不轮询。只返回公共摘要 DTO，允许与板块/所有群组重复。缺 API 时只补最小公开读能力。

### R07-08 标签

数据库聚合已发布 group tags，排除下架、回收站、删除、待审核等；同群同标签只计一次，沿用现有标签规范，不做同义词/简繁/大小写新规则。排序数量降序、名称升序。返回 label/groupCount，不返回完整群组。点击替换搜索词、q、模式和结果。

### R07-09 板块

直接使用 T05 `PublicBoardsResponse` 的板块顺序和过滤，不在前端重新计算 random/过滤作为唯一安全措施。板块标题+Carousel 或空态；不显示 sortMode、version、管理计数、下架信息。错误只影响板块区域。

### R07-10 全部群组

只查 published，复用现有默认旋转排序、epoch/站点时区/每日槽位/稳定 cursor。使用 Grid、cursor、无限滚动、页内 group ID 去重；不解析/修改 cursor，不把新槽位与旧 cursor 错拼。

### R07-11 搜索结果

继续搜索标题、简介、标签和现有匹配/排序；不新写相关性算法。cursor 必须绑定有效 query，query 改变清空 items/cursor，旧请求不能覆盖新结果；Grid、空态、错误态和重试独立。

## 8. 容错、性能和安全

- 每区域状态表达 idle/loading/success/empty/error/retrying；分页含 loadingMore/hasMore/nextCursor/loadMoreError。
- 不使用单一全页 loading；区域 Skeleton 尺寸稳定；单区 retry 不重置其他区域、URL、Dialog、点赞或 cursor。
- 取消 A→B、清空、卸载请求；B 先返回后 A 不能闪回。
- API client 统一 Typed fetch、AbortSignal、Zod response 和错误转换，页面不得散落 fetch/any。
- 不做板块/标签 N+1、不逐卡请求详情、不搜索模式加载所有默认区域、不一次返回全表。
- 后端必须 published 过滤；标签/发现/板块/所有/搜索的公开 DTO 不含完整 join methods 或管理字段。
- 搜索/简介不使用未经清洗的 v-html；query 正常编码；错误不泄露 SQL/表名/堆栈。

## 9. 验收标准

### AC-07-01 默认首页

- [ ] 固定顺序、顶栏/搜索框位置稳定，发现/标签/板块/所有群组布局正确。
- [ ] 发现用 Carousel，板块用 T06 Carousel，所有群组用 Grid。
- [ ] 0 个板块不显示虚拟区域；空板块显示标题+空态。
- [ ] 已下架/回收站群组不公开，手机/桌面顺序一致。

### AC-07-02 搜索与 URL

- [ ] 不按 Enter，debounce/IME 正确，标题/简介/标签搜索保持。
- [ ] q 编码、trim、清空、刷新、返回/前进正确；连续输入不产生大量历史。
- [ ] q/group 共存，详情背景/关闭/清空不互相破坏。
- [ ] 竞态、取消、非法 q、cursor query 绑定正确。

### AC-07-03 数据区域

- [ ] 发现最多 10 条、发布时间排序、稳定次排序、不随机。
- [ ] 标签只统计 published、聚合无 N+1、数量/名称排序、点击搜索。
- [ ] 板块复用 T05 顺序/过滤/随机，published members、空板块、零板块正确。
- [ ] 所有群组/搜索 Grid、cursor、无限滚动、去重、最后一页和 retry 正确。

### AC-07-04 容错/响应式/质量

- [ ] 各区域独立 loading/empty/error/retry，单区失败不白屏。
- [ ] 360–1440 宽度、手机 Carousel 两卡、Grid 两列目标、无页面横向溢出。
- [ ] Workers 查询、Vitest、Playwright、主题/无障碍/回归测试通过。
- [ ] 未修改 T03/T05/T06 底层、数据库、管理端、搜索相关性和点赞安全模型。

## 10. 交付状态

本轮只创建三份规划文件并保持 T07 `planning`，不运行 `task.py start`，不创建子任务。最终实施报告必须列出页面结构、搜索/URL、四类数据区域、cursor/竞态/缓存、容错、响应式、测试和 T10 系统回归接口。
