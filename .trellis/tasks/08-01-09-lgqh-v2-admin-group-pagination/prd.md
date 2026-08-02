# 09 管理端群组分页与响应式表格

> 范围修订（2026-08-02）：T02 `prototype/` 已完成管理表格、分页器、响应式列和抽屉视觉基线，T03 `t03-visual-migration` 负责迁移正式 `src/`；T09 不再重复实现表格外观，改为接入真实 page/50/total API、URL、筛选排序、删除退页、认证和回归测试。

> 执行前置规则：本任务虽已有 PRD 与三份规划，进入执行或最终批准前，仍必须完整读取 `docs/PRD/v2/子任务09.md` 原文，逐条对照 `prd.md`、`design.md`、`implement.md`，记录并修正遗漏。必须先按 `trellis-brainstorm` 规则检查代码、测试、配置、Spec 和任务历史，再与用户进行 brainstorm；每次只提出一个最高价值问题，说明决策影响、推荐方案和取舍。每次用户回答后更新规划并重新检查需求收敛；即使没有剩余疑问，也必须展示最终规划摘要并等待用户明确批准。在原文复核和用户批准完成前，不得运行 `task.py start`、进入实施或修改业务代码；源 PRD 与用户最新决定优先于规划文件。

> 状态：planning。T09 专注管理端群组列表页码分页、响应式列和窄屏抽屉；不改公开 cursor、不改板块/统计业务、不进入实施。

## 1. 任务定位与联合 Review

T09 依赖 `t03-visual-migration` 的正式管理 Token/表格/抽屉基础和 T04 的群组 Contract/真实状态字段；若 T08 已完成，复用其稳定的 AdminLayout、三页面导航和群组页面壳层，只接入群组数据。产品、Staff Engineer、QA 联合 Review 冻结：

1. 管理端群组列表从 keyset 改为传统页码分页，服务端固定 `pageSize = 50`，客户端不能选择 25/100 等其他大小。
2. 响应必须含 `items/page/pageSize/totalItems/totalPages`；COUNT 与 items 使用完全相同筛选条件，搜索/标签 join 不重复计数。
3. page 从 1 开始；非法参数安全 4xx/规范化，超出页可返回空页+正确 total，由前端 replace 到最后有效页；零条为 page 1/totalPages 0，不出现“1/0”。
4. URL 必须恢复 page、搜索、状态、回收站、排序字段和方向；输入/规范化用 replace，页码/筛选/排序操作按设计 push，查询变化重置 page=1。
5. 每种排序有唯一稳定次排序，跨页无重复/遗漏；公开所有群组和公开搜索继续使用 cursor，不得删除或共用错误的管理分页实现。
6. 列隐藏优先级固定为标签→性质→点赞→平台；标题、状态、操作在所有断点永久保留；隐藏表头和单元格同步且不留在可访问树。
7. 新建/编辑抽屉窄屏占满可用页面，动态视口、安全区、软键盘、内部滚动、底部操作、焦点和现有脏状态守卫全部保留。
8. 现有群组搜索、筛选、排序、新建、编辑、状态、回收站、恢复、永久删除、图片、标签、加群方式和版本冲突不得因分页重构退化。
9. 不新增用户可选 page size、不做批量选择/虚拟滚动/新全文算法，不改管理员认证、CSRF、群组状态机、R2 或 Analytics。

## 2. 用户价值

- 管理员可快速定位第 N 页群组并看到真实总量，不必连续滚动大量列表。
- 搜索/筛选/排序和 URL 可复制、刷新、返回和前进恢复，管理工作不丢状态。
- 同值排序稳定，管理员不会因翻页看到重复或遗漏记录。
- 窄屏复杂编辑表单可完整操作，键盘、焦点、脏状态和危险操作保持安全。
- 信息密度随可用宽度渐进变化，标题、状态和操作始终可见。

## 3. 范围与非目标

### 3.1 必须交付

- 管理 list API 的 Query Schema、固定 50、COUNT、OFFSET/等效页码、稳定排序、分页 response。
- 管理 API client、URL page/q/status/trash/sort/direction、页码窗口和响应式分页器。
- 搜索/筛选/排序重置第一页，超页/删除最后一条/状态变化后自动退页，竞态和 retry。
- 标签→性质→点赞→平台列隐藏，标题/状态/操作永久列、无障碍和窄屏操作。
- 新建/编辑抽屉桌面/窄屏全屏、动态视口、安全区、软键盘、滚动锁定、脏状态。
- Workers/Vitest/Playwright、公开 cursor 回归、现有管理能力回归。

### 3.2 明确不交付

- 不修改公开端所有群组/搜索 cursor、首页/T07 分页、板块/T08、Analytics、数据库/状态机/R2/认证/CSRF。
- 不新增 page size、无限滚动、虚拟表格、批量选择、隐藏列独立详情页或大型表格框架。
- 不覆盖 T08 AdminLayout、nav、boards/analytics，只复用其稳定入口；T08 未实施时保持最小壳层改动。

## 4. 前置条件与阻断

实施前审计当前管理 route/keyset repository/service/URL/table/drawer、T04 Contract、T03 tokens、T08 ownership（若存在）和公开 cursor 工具。若 COUNT 与 list 无法共享条件、稳定排序无法证明、page size 与后端/Contract 冲突、窄屏 drawer 复用会破坏脏状态，停在 planning，不用前端假 total/假页码修补。

## 5. 需求

### R09-01 分页 API

`page` 默认 1、正整数；server `pageSize=50`，忽略或拒绝 client pageSize 但永不改变 50；`offset=(page-1)*50`，所有参数绑定/白名单。Response 的 page/pageSize/totalItems/totalPages 与 items 真实一致。COUNT 和 items 条件复用，搜索/标签 join 使用 DISTINCT。

### R09-02 超页/总数

超页策略必须统一：推荐返回空 items+正确 totals，前端 replace 到最后有效页；零记录保持 page=1,totalPages=0。禁止 URL 999 但显示第 4 页数据、无限重定向或 500。并发下不要求昂贵快照，但规范化条件接近同一时刻。

### R09-03 查询/排序

保留当前 search/status/trash/sort/direction；排序字段白名单、方向 asc/desc、NULL 规则明确，每种排序附加 id 稳定次排序。查询变化只影响管理列表，不改变公开 cursor。记录 OFFSET 深页风险和索引证据，不无批准新增 migration。

### R09-04 URL/历史

URL 可恢复 page、q、status、trash、sort、direction；默认值规范一致。页码/筛选/排序按 design push，连续搜索和非法规范化用 replace；所有结果集合/顺序变化重置 page=1。抽屉/Toast/临时输入不写 URL，抽屉开关不丢列表条件。

### R09-05 列和分页器

分页器有上一/下一/首/尾/当前/窗口/省略号/总数，桌面完整、手机简化但保留当前/总页/可翻页且不横溢。列响应式按固定优先级渐隐；表头/单元格一致；隐藏列仍可通过现有编辑抽屉查看，排序字段隐藏时在排序控件可见。

### R09-06 抽屉

桌面沿用样式，窄屏新建/编辑 width 100%、height 100dvh 或安全等效，顶部 close、独立表单滚动、底部 sticky save/cancel、安全区、软键盘可达、背景 scroll lock 和原位置恢复。保留 Escape/overlay/route/beforeunload 脏守卫、焦点锁定/恢复、图片/标签/加群方式。

### R09-07 现有操作/错误

分页后保留所有群组管理能力；写操作结果由服务器刷新当前查询，状态离开筛选/删除/恢复/永久删除导致空页时正确退页；409/401/403/500/parse/network/cancel 有统一安全 UX，乐观更新不覆盖新数据。

## 6. 验收标准

- [ ] API 固定每页 50，页码从 1，总数/总页数/COUNT/筛选条件正确。
- [ ] 搜索、状态、回收站、排序、URL、历史和 page reset 正确。
- [ ] 跨页稳定排序无重复/遗漏，管理 keyset 安全替换，公开 cursor 回归通过。
- [ ] 删除/回收站/恢复/状态变化造成空页时正确退页，第一项不退到 0。
- [ ] 分页器桌面/手机/ARIA/省略号正确，错误/重试不让 URL 与数据矛盾。
- [ ] 列按标签→性质→点赞→平台隐藏，标题/状态/操作始终保留并可访问。
- [ ] 新建/编辑窄屏全屏、滚动、键盘、安全区、脏状态和现有表单能力通过。
- [ ] 管理旧能力、认证/CSRF、T08 壳层（如有）和公开 cursor 无回归。
- [ ] 未修改数据库/公开分页/板块/Analytics/状态机/R2。

## 7. 交付状态

本轮仅创建三份规划文件，T09 保持 `planning`，不运行 `task.py start`，不创建子任务。最终实施报告必须列出 API/COUNT/OFFSET、URL/分页器、稳定排序、删除退页、列阈值、抽屉、公开 cursor 保护和测试结果。

## T03 正式视觉基础接入提示

- T09 必须消费 T03 的 Token、主题、表格状态、响应式、焦点和窄屏抽屉基础；不得复制 T02 prototype 表格或主题状态。
- 管理分页页面及其共享壳层必须消费配置化标题/品牌、GitHub URL/文案和添加新群入口，默认网站标题为“来个群号”，不得硬编码。
- 管理分页/筛选/排序/编辑必须接入真实 page/50/total API、认证/CSRF、版本冲突和现有资源抽屉；公开 cursor、公开 API、T08 板块和 T03 主题契约不得被改写。
- 交付需记录 AdminView/T08/T03 的共享接入点、真实 query/response、回归命令和未解决的跨任务阻塞。

## 8. T03 迁移后的有效职责（覆盖前文 UI 实现归属）

### 8.1 已确认基线

- T02 prototype 已完成管理群组表格、分页器、响应式列、编辑/新建抽屉和状态样例。
- T03 visual migration 负责把这些视觉基础迁移到正式 `src/`；T09 不再重做表格、分页器或抽屉外观。
- T09 仍然负责后端 page API 与正式管理列表的数据状态，因此不是纯 QA 任务。

### 8.2 T09 实际负责

- 建立并接入固定 `pageSize=50`、page、totalItems、totalPages、COUNT/items 条件一致的真实 API。
- 接入 q/status/trash/sort/direction URL、历史、筛选重置、非法页和超页规范化。
- 接入稳定排序、跨页无重复/遗漏、删除/恢复/状态变化后的退页和重取。
- 将真实认证、CSRF、版本冲突、资源抽屉和既有群组 CRUD 接入已迁移表格。
- 验证 T03 的响应式列、分页器、抽屉、焦点、主题和无障碍没有被真实数据状态破坏。
- 保护公开 cursor、T08 板块和 Analytics 不被管理 page 逻辑污染。

### 8.3 不再由 T09 负责

- 不重新设计/搭建表格、分页器、列隐藏、抽屉、Token 或管理视觉样例。
- 不复制 prototype fixture、假 total、假页码或本地成功 CRUD。
- 不修改 T08 AdminLayout/导航和 T05/T04 业务 Contract 的所有权。

### 8.4 新前置条件和交接

- 硬前置：T03 visual migration 已交付正式表格、分页器、抽屉和 responsive owner。
- 硬前置：T04 群组 Contract/真实状态、既有管理 API 及 T08 壳层边界可审计。
- T09 交给 T10：真实 page/50/total、URL、排序、退页、认证、抽屉和公开 cursor 保护证据。

### 8.5 修订后的完成定义

- [ ] 视觉页面复用 T03 迁移基线，T09 只做真实数据和状态接入。
- [ ] page/50/total、COUNT、排序、筛选、URL、退页和错误状态有真实 API 证据。
- [ ] 既有群组编辑/资源/认证能力和公开 cursor 无回归。
- [ ] T08/T10 可以按交接契约消费群组列表，不需要重新实现视觉。
