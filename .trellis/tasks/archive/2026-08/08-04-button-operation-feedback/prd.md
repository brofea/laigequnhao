# 修复数据库交互按钮无操作反馈

## Goal

在网络较慢、后端响应延迟或图片处理耗时时，让管理端和公开端所有纳入本任务范围的异步按钮立即呈现明确的进行中状态；完成后按结果显著性提供界面变化、持久状态或 Toast，失败始终明确提示，避免用户误以为点击无效而重复操作。

## Background and confirmed facts

- Issue #1「按钮无操作反馈」要求覆盖管理页与主页面的数据库交互按钮；Issue 评论进一步明确：确认彻底删除后，确认 Dialog 不应在请求发出时立即关闭，而应保持打开并显示 loading，后端确认删除后再关闭。
- 共享 `Button` 组件已经支持 `loading`、自动禁用、`aria-busy` 和屏幕阅读器文案（`src/components/Button.vue:8-52`），本任务优先复用这一能力。
- Toast 容器已经集中在 `VisualShell`，通过 `ToastItem` 和 `showToast` 提供 `success`、`info`、`warning`、`danger` 四种语气（`src/components/Toast.vue:4-31`、`src/components/VisualShell.vue:212-222`）。
- 群组编辑/公开投稿/管理端添加新群已有局部 busy 状态与成功/失败 toast（`src/components/VisualShell.vue:77-80,345-375,585-627,649-679`），但表单按钮当前仅传 `disabled`，没有将 busy 映射为按钮 spinner（`src/components/AdminEditForm.vue:577-590`）。
- 群组列表删除、恢复、永久删除当前由 `VisualShell` 直接触发异步 composable 操作，缺少按钮级 pending；永久删除在请求开始前就关闭确认 Dialog（`src/components/VisualShell.vue:498-525`）。
- 板块编辑表单没有 loading 输入，板块新增、编辑、删除、排序、成员新增、成员移除和成员上下移都由 `VisualShell` 直接调用异步操作（`src/components/BoardEditForm.vue:7-69`、`src/components/BoardManagement.vue:18-28,60-84,124-246`、`src/components/VisualShell.vue:681-754`）。
- 群组列表表格操作直接 emit `open/remove/restore/purge`，没有 pending 或禁用契约（`src/components/AdminTable.vue:9-22,100-142`）。板块内添加群组结果是原生 button 直接 emit `add`（`src/components/BoardAddGroupForm.vue:48-76`）。
- 点赞逻辑已有失败回滚和 toast，但卡片与详情 Dialog 的按钮没有 loading/禁用状态（`src/components/VisualShell.vue:246-258,1177-1184`、`src/components/GroupCard.vue:67-81`）。

## Product requirements

### R1. 即时反馈

点击纳入范围的异步按钮后，按钮或所属字段/列表应在同一交互周期内进入 loading 状态并阻止同一动作重复提交；请求或图片处理完成（成功或失败）后停止 loading。独立行/独立群组/独立板块的动作不能因为其他行的请求而全部锁死，除非为保证同一资源一致性确有必要。

### R2. 成功与失败反馈

所有纳入范围的网络写操作失败时都必须显示明确的 warning/danger toast 或 inline 错误；失败时保留可继续操作的界面状态，不得用成功反馈掩盖失败。成功反馈按结果显著性分级：

- **Loading + 成功 Toast**：保存、删除、恢复、永久删除、编辑板块、移出板块等成功结果不明显、具有破坏性或会关闭 Dialog 的操作。
- **Loading + 界面结果，不弹成功 Toast**：板块内添加群组等成功后列表/详情立即可见的普通操作。
- **乐观更新 + 失败 Toast**：点赞/取消点赞等高频低风险操作；成功状态由即时界面变化表达。
- **Loading + 持久成功页面/状态**：公开投稿；成功后必须让用户持续看到受理结果，不能只依赖短暂 Toast。
- **仅成功 Toast**：复制链接、复制群号等无网络或瞬间完成的浏览器操作，不适用于 Issue 中的大部分数据库操作。

现有版本冲突、接口返回错误和异常兜底提示应继续保留其语义；成功 Toast 不得成为所有写操作的统一副作用。

### R3. 破坏性操作的 Dialog 生命周期

永久删除确认 Dialog 在确认请求完成前保持打开；确认按钮显示 loading 并禁用重复提交，取消按钮和 Dialog 关闭入口在请求进行中不可导致重复或矛盾状态。只有后端确认成功后才关闭 Dialog，并显示成功 toast；失败时保留 Dialog，停止 loading 并显示失败 toast。

### R4. 可访问性与视觉一致性

loading 状态必须通过现有 `Button` 的 `aria-busy`/“加载中”语义或等价的可访问实现暴露；禁用状态不能丢失按钮原有可访问名称。spinner 和 toast 应沿用现有组件及样式，不引入第二套全局反馈机制。

### R5. 覆盖入口

本次审计范围是正式运行时 `src/` 中的全部按钮；独立的 `prototype/` 是视觉真源，不进入正式构建和生产运行时，因此不在本任务修改范围内（`.trellis/spec/frontend/ui-design.md:262-282`）。

审计结论如下：

| 入口/组件 | 行为类别 | Loading 决策 |
|---|---|---|
| 管理登录提交 | 后端认证请求 | 保留现有 `Button.loading` |
| 公开投稿提交 | 图片暂存/数据库写入 | Loading + 持久成功页面/状态；失败明确提示，不只依赖短暂 Toast |
| 管理端添加新群、编辑群组保存 | 数据库写入 | Loading；结果不明显或 Dialog 关闭时显示成功 Toast，失败明确提示 |
| 编辑群组删除、群组列表删除、回收站恢复、永久删除确认 | 数据库破坏性写入 | Loading + 成功 Toast，禁用重复点击；永久删除 Dialog 等待成功后再关闭 |
| 板块新增/编辑/删除/排序 | 数据库写入 | Loading；编辑/删除等结果不明显或 Dialog 关闭时成功 Toast，普通排序以界面结果为主，失败明确提示 |
| 板块内添加群 | 数据库写入，成功后列表立即变化 | Loading + 界面结果，不重复弹成功 Toast；失败明确提示 |
| 板块内移除群 | 数据库写入，成功后列表立即变化 | Loading；Issue 明确要求成功 Toast，失败明确提示 |
| 板块成员上移/下移 | 数据库写入，成功后顺序立即变化 | Loading + 界面结果，不重复弹成功 Toast；失败明确提示 |
| 群组列表搜索、状态筛选、回收站切换、排序、分页、公开端重试 | 后端读取/重新查询 | 使用现有列表/字段 loading；触发控件在请求期间禁用或显示 loading，避免重复查询 |
| 公开端卡片/详情点赞 | 数据库写入并乐观更新 | 乐观更新 + 按群组防重入；成功由界面状态表达，失败回滚并 Toast |
| 公开端标签选择 | URL 状态变化并触发查询 | 不在标签按钮内单独转圈；结果区域沿用列表 loading/skeleton，保证点击后立即有状态变化 |
| 打开/关闭 Dialog、编辑/管理 tab、板块展开、Carousel 滚动 | 纯本地 UI 状态 | 不需要 loading |
| 主题切换、复制/分享、二维码保存 | 浏览器本地能力或立即导航 | 不需要数据库 Pending；复制链接/群号可仅显示成功/失败 Toast |
| 表单添加/移除标签、添加/移除加群方式、清除搜索、取消 | 本地表单/查询状态 | 不需要独立 loading；若随后触发请求，由所属区域显示 loading |
| 群组头像/二维码选择与压缩 | 浏览器图片处理，可能耗时 | 复用 `uploading` 状态，上传/处理入口显示 loading 或不可重复操作 |
| 运行数据中的 `24h/7d/30d` | 当前静态 Mock，无实际命令 | 不新增 loading；若未来接入 API，另按查询控件设计 |

因此，Issue 明确列出的入口全部纳入，并扩展覆盖同一正式页面上其他实际数据库读写按钮；纯本地、导航和浏览器快速操作不强行添加 spinner。

## Acceptance criteria

- [ ] 在慢响应条件下，R5 明确范围内每个写操作按钮点击后立即显示 spinner、`aria-busy`（或等价语义）并阻止重复提交。
- [ ] R5 中会触发后端读取的搜索、筛选、回收站切换、排序、分页和重试入口，在请求期间有字段/列表/按钮级可见 loading，并阻止重复查询。
- [ ] 同一列表中对不同资源的独立操作不会互相错误复用 loading 状态；请求结束后对应按钮恢复可用。
- [ ] 成功反馈遵循 R2 分级：保存/删除/恢复/永久删除/编辑板块/移出板块显示成功 Toast；板块内添加群、成员排序等界面结果清晰的普通操作不重复弹成功 Toast；点赞使用乐观更新并仅在失败时 Toast；公开投稿显示持久成功状态；复制类瞬时操作可仅成功 Toast。
- [ ] 所有网络写操作失败都显示明确的 warning/danger Toast 或 inline 错误；接口失败、异常和版本冲突均不会显示成功提示。
- [ ] 永久删除确认 Dialog 在后端响应前不关闭；成功后关闭并提示成功，失败后保持打开并允许重试。
- [ ] 群组编辑/公开投稿/管理端添加新群的表单提交按钮在现有 busy 生命周期内实际显示 loading，而不是只有 disabled；公开投稿成功后保留持久受理结果。
- [ ] 现有成功路径、失败回滚、版本冲突处理、toast 的 `aria-live` 语义和相关 E2E 流程不回归。
- [ ] 新增或调整的前端测试覆盖至少一个成功、一个失败/重试、一个重复点击防护和永久删除 Dialog 生命周期场景。
- [ ] 纯本地 UI、导航、复制/分享、二维码保存和静态 Mock 控件没有被错误地改成等待型 loading，现有交互和可访问名称不回归。

## Out of scope

- 不修改后端路由、数据库 migration、共享 API schema、错误码或认证契约。
- 不修改 `prototype/` 视觉原型，不把其静态 Mock 控件接入正式运行时。
- 不重新设计全局 Toast、按钮视觉语言或表单业务校验；仅补齐异步生命周期所需的 loading、禁用和可访问状态。
- 不为纯本地 UI、立即导航、剪贴板/下载等短时浏览器操作强行添加等待型 spinner。

## Technical notes

- 优先复用 `Button.loading`、`Input.status="loading"`、现有 Toast 和 spinner CSS；定制原生按钮只补齐等价语义。
- pending 状态由 `VisualShell` 编排并按资源/动作 keyed，展示组件通过类型化 props/events 接收，不引入 Pinia 或第二套请求缓存。
- 异步读取状态必须防止过期请求的 `finally` 覆盖当前请求；写操作必须在 `finally` 清理 pending。
