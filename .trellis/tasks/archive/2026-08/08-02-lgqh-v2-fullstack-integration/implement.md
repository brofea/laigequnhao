# T05 全栈业务适配：实施计划（保持 planning）

## 0. 实施前门禁

T05 不能在 T04 Contract 未冻结时启动。启动前必须完成：

- [ ] 重新读取 `docs/PRD/v2/RPD.md`。
- [ ] 读取 T04 最终 API/Contract 移交包。
- [ ] 读取 T03 视觉和交互验收记录。
- [ ] 核对当前 git 工作区，保留已有用户改动。
- [ ] 列出允许修改的 adapter/client/composable 文件。
- [ ] 列出明确禁止修改的 `.vue`、CSS、主题和表现文件。
- [ ] 完成产品、Staff Engineer、QA 联合 Review。
- [ ] 记录接口缺口和需要用户 brainstorm 的问题。

## 1. 阶段一：生产数据入口审计

### 1.1 搜索生产 Mock

- [ ] 搜索 `prototype/data` 引用。
- [ ] 搜索 `fixtures`、`mock`、`fake`、`seed` 生产导入。
- [ ] 搜索业务 localStorage/sessionStorage。
- [ ] 搜索静态数组作为 API fallback。
- [ ] 搜索请求失败后返回旧数据的逻辑。
- [ ] 搜索生产构建对 prototype 的依赖。
- [ ] 搜索公开端和管理端所有 API 调用。

### 1.2 输出矩阵

每个入口记录：文件、调用方、当前数据来源、目标 endpoint、状态、错误、测试和责任人。不能只删除 import 而不验证运行时路径。

## 2. 阶段二：API client 基础

按顺序完成：

1. 统一请求方法和 base URL。
2. 统一 headers、cookie 和 CSRF。
3. 统一 request id。
4. 统一 JSON 和非 JSON 错误解析。
5. 统一响应 schema 校验。
6. 统一 AbortSignal 和 timeout。
7. 统一 ClientError。
8. 编写 client 单元测试。

禁止为每个页面复制 fetch、错误判断和权限判断。

## 3. 阶段三：公开端接线

### 3.1 默认首页

- [ ] 接入真实发现新群。
- [ ] 接入真实标签聚合。
- [ ] 接入真实板块。
- [ ] 接入真实目录第一页。
- [ ] 验证并发请求和局部错误。
- [ ] 验证空集合不被误判为请求失败。

### 3.2 搜索

- [ ] 读取 URL q。
- [ ] 处理 debounce。
- [ ] 处理 IME composing。
- [ ] 取消旧请求。
- [ ] 接入 cursor。
- [ ] 连接加载更多。
- [ ] 连接无结果和重试。
- [ ] 清空恢复默认首页。
- [ ] 验证前进/后退。

### 3.3 详情

- [ ] 读取 group 深链。
- [ ] 请求真实公开详情。
- [ ] 过滤不可公开错误。
- [ ] 映射多个加群方式。
- [ ] 连接分享规范 URL。
- [ ] 连接点赞。
- [ ] 验证 q 与 group 共存。
- [ ] 验证关闭只清除 group。

### 3.4 提交

- [ ] 映射字段和显示宽度校验。
- [ ] 映射成功 Toast。
- [ ] 映射字段错误。
- [ ] 映射网络失败和重试。
- [ ] 不改变现有表单流程。

## 4. 阶段四：管理端接线

### 4.1 登录与会话

- [ ] 真实登录。
- [ ] 真实 session restore。
- [ ] 真实退出。
- [ ] 401 进入既有会话失效路径。
- [ ] 403 不伪造权限。
- [ ] CSRF 失败可复现。

### 4.2 群组管理

- [ ] 接入固定 50 条分页。
- [ ] 接入 totalItems/totalPages。
- [ ] 接入筛选。
- [ ] 接入回收站。
- [ ] 接入排序。
- [ ] URL state 恢复。
- [ ] 筛选/搜索/排序回第一页。
- [ ] 删除最后一条退页。
- [ ] 编辑保存。
- [ ] 版本冲突。
- [ ] 图片上传。
- [ ] 标签和加群方式。
- [ ] 永久删除。

### 4.3 板块管理

- [ ] 板块列表。
- [ ] 创建/编辑/启停/删除。
- [ ] 板块顺序。
- [ ] sort mode。
- [ ] 添加已发布。
- [ ] 添加已下架。
- [ ] 拒绝 trash。
- [ ] 成员上移/下移。
- [ ] 成员移除关联。
- [ ] 冲突和失败回滚。
- [ ] 空板块和零板块。

## 5. 阶段五：状态与错误

逐个 endpoint 验证：

- [ ] idle。
- [ ] loading。
- [ ] loading-more。
- [ ] success。
- [ ] empty。
- [ ] validation error。
- [ ] unauthorized。
- [ ] forbidden/CSRF。
- [ ] conflict。
- [ ] not public。
- [ ] network timeout。
- [ ] server error。
- [ ] retry。

状态必须通过 T03 已有表现落点展示；若不存在落点，建立问题而不是写新视觉。

## 6. 阶段六：竞态和缓存

- [ ] 搜索新请求不会被旧响应覆盖。
- [ ] 详情切换不会显示上一个群组。
- [ ] 加载更多不会重复 cursor。
- [ ] 组件卸载取消请求。
- [ ] 重试不会复制写请求。
- [ ] 点赞重复点击符合服务端语义。
- [ ] 保存后列表和抽屉数据一致。
- [ ] 回收站后列表、板块和详情状态一致。

## 7. 阶段七：测试

### 7.1 Client/adapter

- [ ] 正常 DTO。
- [ ] 空 DTO。
- [ ] malformed DTO。
- [ ] 错误 code。
- [ ] field errors。
- [ ] 401/403/409。
- [ ] 网络失败。
- [ ] 超时。
- [ ] 取消。

### 7.2 公开 E2E

- [ ] 默认首页真实数据。
- [ ] 搜索真实数据。
- [ ] 标签。
- [ ] 板块。
- [ ] 无限滚动。
- [ ] 详情和深链。
- [ ] 分享。
- [ ] 点赞。
- [ ] 提交。
- [ ] 空/错/重试。

### 7.3 管理 E2E

- [ ] 登录。
- [ ] 分页。
- [ ] URL 恢复。
- [ ] CRUD。
- [ ] 上传。
- [ ] 回收站。
- [ ] 永久删除。
- [ ] 板块管理。
- [ ] 冲突。
- [ ] 会话失效。

## 8. 阶段八：视觉冻结检查

每个公开和管理流程至少检查桌面浅色、桌面深色、手机浅色、手机深色。记录：视口、浏览器、数据、时间、主题、截图路径和是否有 DOM/CSS 改动。

允许真实数据内容变化；不允许布局、颜色、间距、Dialog、Card、Carousel、Table、Drawer 或流程变化。发现差异时停止相关接线，提交问题记录。

## 9. 阶段九：Mock 清理验证

- [ ] 生产入口无 prototype data。
- [ ] 生产入口无 src fixture。
- [ ] 生产入口无业务 localStorage。
- [ ] API 失败无假数据 fallback。
- [ ] 测试 Mock 只在测试配置生效。
- [ ] 构建产物扫描通过。
- [ ] 运行时 smoke test 通过。

## 10. 阶段十：移交 T06

移交材料：

- [ ] endpoint 使用矩阵。
- [ ] Mock 清理 diff/扫描结果。
- [ ] 公开流程结果。
- [ ] 管理流程结果。
- [ ] 错误状态结果。
- [ ] 权限和 CSRF 结果。
- [ ] 视觉截图对照。
- [ ] 构建日志。
- [ ] 已知问题。
- [ ] 不得修改表现层的阻塞项。

## 11. 变更控制

如果实现中发现：

- T04 Contract 缺字段：回派 T04。
- T04 错误语义不稳定：暂停接线。
- prototype 与正式项目不一致：以 T03 基线为准并记录。
- 需要修改 Vue template/style：暂停并向用户 brainstorm。
- 真实数据长度造成布局问题：先记录数据规则问题，不改 CSS。
- 旧测试夹具依赖 Mock：隔离测试，不把 fixture 复活为生产 fallback。

## 12. T05 完成定义

- [ ] 生产真实 API 接线完成。
- [ ] Mock 清理证据完成。
- [ ] 公开/管理流程可重复。
- [ ] 错误、权限、冲突和重试可验证。
- [ ] 视觉冻结未被违反。
- [ ] T04/T05 变更均有测试。
- [ ] T06 移交包完整。

## 13. 公开端接线追踪表

| 流程 | 真实来源 | adapter 输出 | 失败场景 | 证据 |
| --- | --- | --- | --- | --- |
| 发现新群 | 公开 discovery API | carousel items | 空/网络 | |
| 标签 | 聚合 API | tag count | 空/失败 | |
| 板块 | public boards API | board view-model | 单板块失败 | |
| 目录 | cursor API | grid items/cursor | 末页/失败 | |
| 搜索 | search API | results/cursor | 无结果/取消 | |
| 详情 | group detail API | dialog model | 不存在/下架 | |
| 点赞 | like API | count/liked | 重复/限流 | |
| 分享 | 当前域名 + group | normalized URL | clipboard 失败 | |
| 提交 | submission API | success/error | 校验/网络 | |

每一行在实施过程中补充 endpoint 版本、测试和截图；空白项不得在移交时保留。

## 14. 管理端接线追踪表

| 流程 | 真实来源 | 适配责任 | 负向场景 | 证据 |
| --- | --- | --- | --- | --- |
| 登录 | session API | auth composable | 401/403 | |
| 列表 | page API | page adapter | 50/51 | |
| URL | route query | query parser | 非法参数 | |
| 新建 | group write API | form payload | validation | |
| 编辑 | group write API | version payload | conflict | |
| 上传 | asset API | upload state | fail/cleanup | |
| 回收站 | mutation API | status adapter | permission | |
| 永久删除 | mutation API | confirm result | resource fail | |
| 板块 CRUD | board API | board adapter | conflict | |
| 成员操作 | board member API | position adapter | boundary | |

## 15. 错误场景执行表

每类错误必须配置测试响应并运行一次真实接线：

- [ ] 400/validation：字段错误落到既有表单。
- [ ] 401/unauthorized：会话失效路径。
- [ ] 403/forbidden：权限错误路径。
- [ ] CSRF：写请求失败且不伪造成功。
- [ ] 404/not public：非敏感详情错误。
- [ ] 409/conflict：保留冲突信息和恢复动作。
- [ ] 409/duplicate：不重复添加成员。
- [ ] 413/asset size：不显示已保存图片。
- [ ] 415/asset type：不显示已保存图片。
- [ ] 429/rate limit：既有反馈和可重试边界。
- [ ] 500/server：通用错误，不暴露栈。
- [ ] timeout/network：可重试且不会重复写。
- [ ] malformed JSON：client error，不进入成功渲染。

## 16. URL 状态检查表

- [ ] 首页无 q。
- [ ] 首页有 q。
- [ ] q + group 共存。
- [ ] 关闭 group 保留 q。
- [ ] 刷新恢复 q。
- [ ] 返回恢复上一个 q。
- [ ] 前进恢复下一个 q。
- [ ] 管理 page 恢复。
- [ ] 管理 filters 恢复。
- [ ] 管理 sort 恢复。
- [ ] 筛选变化 page=1。
- [ ] 排序变化 page=1。
- [ ] 搜索变化 page=1。
- [ ] 非法 query 被规范化而不改变布局。

## 17. Mock 清理报告字段

每个生产数据来源报告：

- [ ] 文件路径。
- [ ] 导入链路。
- [ ] 运行环境。
- [ ] 当前行为。
- [ ] 目标真实 API。
- [ ] 是否删除。
- [ ] 如果保留，为什么只在测试使用。
- [ ] 构建扫描证据。
- [ ] 运行时 smoke 证据。

特别检查：

- [ ] prototype fixture 不进入正式 bundle。
- [ ] `src/data` 不是默认生产来源。
- [ ] localStorage 不保存群组/板块业务真相。
- [ ] API 失败不回落到旧结果。
- [ ] 测试 mock 不被生产 config 启用。

## 18. 视觉冻结报告字段

每个被接线的页面记录：

- [ ] prototype 基线路径。
- [ ] 正式项目截图路径。
- [ ] 视口。
- [ ] 主题。
- [ ] 浏览器。
- [ ] 数据种子。
- [ ] 时间和时区。
- [ ] DOM 结构是否变化。
- [ ] CSS/class 是否变化。
- [ ] 差异属于内容还是表现。
- [ ] 是否需要用户决定。

视觉差异只有两种处理：数据/adapter 修正，或冻结问题记录；不能直接改 CSS。

## 19. 任务 Review 问题

### 产品经理

- [ ] 所有已确认用户流程是否保持原样？
- [ ] 默认首页区域是否真实填充？
- [ ] 下架/回收站是否完全隔离？
- [ ] 空、错和重试是否符合已冻结设计？
- [ ] 是否出现未经批准的新业务行为？

### Staff Engineer

- [ ] adapter 是否隔离后端 DTO？
- [ ] 是否存在重复 fetch 或竞态？
- [ ] 写请求是否安全重试？
- [ ] query state 是否唯一？
- [ ] 生产 Mock 是否彻底隔离？
- [ ] 错误 code 是否稳定？

### QA

- [ ] 每个 endpoint 有成功/空/错/权限/冲突测试？
- [ ] 公开和管理数据边界有负向测试？
- [ ] 真实浏览器流程可复现？
- [ ] URL、IME、取消和加载更多有覆盖？
- [ ] 视觉截图能区分数据差异和实现差异？

## 20. 实施结束报告

报告必须回答：

- [ ] 哪些 Mock 被移除？
- [ ] 哪些测试 Mock 被保留？
- [ ] 哪些真实 endpoint 已接入？
- [ ] 哪些错误场景已验证？
- [ ] 哪些流程依赖 T04 修复？
- [ ] 是否改动表现层？如有，必须停止并报告。
- [ ] 视觉基线是否一致？
- [ ] T06 是否可以开始？
- [ ] 哪些问题仍需用户 brainstorm？

## 21. 交付前核对

- [ ] 生产构建、预览构建和测试构建的 API 配置已分别验证。
- [ ] 浏览器刷新不会恢复过期的假业务数据。
- [ ] 登录失效不会把管理数据继续展示为新鲜数据。
- [ ] 公开详情错误不会暴露管理端字段。
- [ ] 真实空结果不会被误判为 Mock 缺失。
- [ ] 所有移交报告链接可访问且与 commit 对应。
- [ ] API 版本和接口清单在移交前再次锁定。
- [ ] 测试账号、测试数据和清理步骤已写入运行说明。
- [ ] 未出现以视觉改动绕过 Contract 问题的变更。
