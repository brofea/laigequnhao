# T01 事实审计报告

## 1. 审计结论

### 1.1 执行摘要

当前系统不是缺少基础能力的空白项目，而是已经具备公开浏览、搜索、匿名点赞、管理员 CRUD、状态管理、图片/R2 生命周期和 Workers 测试基础的 V1 系统。V2 的主要风险来自既有规则与新 PRD 的跨层不一致，而不是单一组件缺失。

审计得到以下结论：

1. V2 的“已下架群组完全不公开”已经由用户确认，覆盖旧 Spec、归档任务、代码和测试。它不是待决策项，而是后续公开查询、详情、板块和 E2E 的硬约束；在实现和回归完成前属于公开泄露风险门禁。
2. 当前公开查询仍使用包含 `published` 和 `delisted` 的 `listPublished()`，并在内存中加载全部匹配记录后做旋转和分页。公开列表、搜索和详情链路需要拆分“公开过滤”和“旋转/分页”责任。
3. V2 需要的 `last_published_at`、`boards`、`board_groups` 尚未存在于 migration、repository、Contract 或测试中。用户已确认网站暂未上线，因此 T04 新增 `last_published_at` 时现有记录全部保持 `NULL`；未来真实发布转换才写入。T04 是迁移和共享 Contract 的前置 owner，T05 依赖其结果。
4. 当前管理端使用 cursor/load-more，V2 要求固定每页 50 条的页码分页、total、URL 状态和删除退页。该改造不能扩散到公开 cursor。
5. 当前主题只有 light/dark，入口没有首屏初始化，CSS 只有 light `color-scheme`；T02 视觉模板缺失已按用户决定延期，T03 及依赖正式视觉契约的前端实施仍被阻塞。
6. 现有质量基线不是全绿：`pnpm test` 为 72/77，`pnpm lint` 有 1 项错误，`pnpm format:check` 有 22 个文件失败。用户已确认由 T04/T10 修复，T01 不直接改动。
7. backend Spec 与实现在 CORS、Origin、响应 `X-Request-Id`、错误日志结构和生产 `SELECT *` 等方面存在偏差，需要纳入后续验收或明确非 V2 范围，不能在 T01 越界修复。

总体判断：V2 技术上可在现有架构上演进，但必须先冻结 T04 的共享 Contract/迁移边界，再按 T03、T05、T06/T07、T08、T09 的依赖顺序实施；公开可见性和数据迁移是高风险门禁。

### 1.2 当前质量基线

本次审计前已运行只读验证，未执行 migration、快照更新或修复命令：

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `pnpm typecheck` | 通过 | TypeScript strict 基线通过 |
| `pnpm test:workers` | 65/65 通过 | Wrangler 尝试写入用户级日志时出现 EPERM，但测试套件完成并通过 |
| `pnpm build` | 通过 | Vite 生产构建通过 |
| `pnpm test` | 72/77 通过 | 5 个失败，见第 5 节 |
| `pnpm lint` | 失败 | `scripts/seed-local.mjs` 存在 1 个 `no-useless-assignment` |
| `pnpm format:check` | 失败 | 22 个文件未通过格式检查 |

5 个单元测试失败集中在：

- `shared/domain/config.spec.ts`：仍使用旧的对象型 `platforms` 配置，而 `shared/domain/config.ts` 已使用 `string[]`。
- `src/features/admin/components/AdminGroupDrawer.spec.ts`：暂存资源清理测试期待 `fetch` purge 调用，但当前测试链没有观察到调用，共 3 个失败。
- `src/features/admin/composables/useImageProcessor.spec.ts`：测试期待 `10MB` 文案，当前实现按传入/默认限制输出 `5.0 MB` 文案。

责任已经冻结：配置 Contract 归 T04；抽屉资源生命周期、图片处理器、lint 和格式门禁归 T10。上述问题是实施和最终验收门禁，不是 T01 的修复范围。

## 2. 材料与证据范围

### 2.1 已读取材料

| 类别 | 已读取内容 | 结论用途 |
| --- | --- | --- |
| 项目流程 | `AGENTS.md`、`.trellis/workflow.md`、Trellis skills | 确认任务阶段、禁止越界修改和交付顺序 |
| Spec | `.trellis/spec/guides/`、`.trellis/spec/frontend/`、`.trellis/spec/backend/` | 建立 Spec/代码/测试三方矩阵 |
| V2 PRD | `docs/PRD/v2/RPD.md`、`子任务01.md` 至 `子任务10.md` | 提取 V2 目标、验收、依赖和冻结规则 |
| 当前任务 | T01 `prd.md`、`design.md`、`implement.md` | 对照审计范围和边界 |
| 父任务 | `.trellis/tasks/08-01-lgqh-v2/` 三份规划、`task.json` | 核对父子关系、依赖和创建状态 |
| 兄弟任务 | T02–T10 当前三份规划及任务文件 | 建立文件所有权和依赖阻塞清单 |
| 历史任务 | `.trellis/tasks/archive/2026-07/` 可用 `task.json`、`prd.md`、`design.md`、`implement.md` | 区分当前约束与已被替代的旧决策 |
| 前端 | `src/views/`、`src/features/groups/`、`src/features/admin/`、`src/shared/` | 追踪公开读和管理写路径 |
| 共享层 | `shared/domain/`、`shared/contracts/` | 核对配置、状态、分页和资产 Contract |
| 后端 | `functions/_lib/`、`functions/api/[[route]].ts` | 追踪 route、middleware、service、repository |
| 数据库 | `migrations/0001` 至 `0003`、Workers migration 测试 | 核对现有 schema、迁移顺序和缺失表/字段 |
| 测试 | `tests/workers/`、`tests/e2e/`、组件和 composable spec | 核对锁定行为、覆盖缺口和基线失败 |
| 工具配置 | `package.json`、Vitest、Workers Vitest、Playwright、Wrangler | 确认真实门禁和测试环境 |

### 2.2 缺失或过时材料

- 用户原指向的 `docs/PRD/v2/PRD.md` 不存在，仓库实际源文件是 `docs/PRD/v2/RPD.md`，本报告按后者审计。
- 当前仓库没有 T02 所需的 Figma、视觉模板项目、视觉稿或可审查视觉资产。用户已决定进入 T02 时再补全并更新 Spec，因此这不阻塞 T01，但阻塞 T02 正式视觉规范、T03 Token/顶栏以及依赖视觉确认的正式前端实施。
- 历史文档引用 `07-30-frontend-overhaul`，该活动目录不存在；当前父任务是 `.trellis/tasks/08-01-lgqh-v2`，不能继续使用旧目录作为任务关系依据。
- 归档任务中部分只保留规划，没有完整验收记录；结论只在存在当前代码、测试或明确历史约束时采用。

## 3. 当前实现事实

### 3.1 公开读路径与状态

当前公开群组链路为：

```text
HomeView / useGroupDirectory
→ src/features/groups/api.ts
→ GET /api/v1/groups
→ functions/_lib/routes/groups.ts
→ createGroupRepository().listPublished()
→ D1 groups / group_tags / join_methods
→ publicGroupDto 投影
```

关键事实：

- `functions/_lib/repositories/group-repository.ts` 的 `listPublished()` 查询条件为 `g.status IN ('published', 'delisted') AND g.deleted_at IS NULL`。
- `functions/_lib/routes/groups.ts` 直接调用该方法，公开列表和搜索因此继承已下架可见行为。
- repository 会先 `COUNT(*)`，再查询全部匹配 `g.*`，然后在内存中做 rotation offset 和 skip/limit；这与 V2 要求的规模化 cursor 读取存在风险。
- `groups.ts` 对解码失败或 epoch/query 不匹配的 cursor 采用从头开始的回退行为，没有将所有非法/过期 cursor 统一映射为显式验证错误。
- `shared/contracts/pagination.ts` 当前公开 limit 默认 50、最大 200；公开 cursor Contract 仍保留 `rotationWindow`。
- `src/features/groups/composables/useGroupDirectory.ts` 有 AbortController 和 debounce，但没有独立的递增请求序列号来拒绝“旧请求晚到”的非 Abort 结果；IME composing 保护也未在该 composable 中形成完整契约。
- `src/features/groups/components/GroupList.vue` 通过 IntersectionObserver 触发 load more，现有机制可复用，但需配合新的首页区域和状态边界。

### 3.2 已下架公开冲突

旧行为证据如下：

- `.trellis/spec/backend/api-guidelines.md` 仍描述公开 `/groups` 为“已发布/已下架群聊”的游标页。
- `.trellis/spec/guides/testing-strategy.md` 的参考组件测试和 Playwright 关键路径仍把“已下架仍公开并带标记”当成行为。
- `tests/workers/groups.spec.ts` 的测试名和断言明确允许 `published`、`delisted`。
- `src/features/groups/components/GroupCard.vue` 在公开卡片显示 `delisted` 徽章；对应 `GroupCard.spec.ts` 断言该徽章存在。

用户已经覆盖并替换上述旧规则：

```text
公开列表、搜索、公开板块成员、详情深链接：只允许 published
管理端：delisted 仍可查看、编辑、加入板块并重新发布
回收站：不可公开，并按既有资源清理状态机处理
```

这是跨层 C5 风险门禁：在所有公开入口、缓存/投影、详情路由和 E2E 都通过隔离测试前，T06/T07/T10 不得宣称完成。

### 3.3 搜索、旋转与分页

- 搜索字段为标题、简介和标签，`toSubstringLikePattern()` 对 `%`、`_` 和反斜杠做转义，既有匹配语义具有复用价值。
- 现有目录/搜索排序使用 `rotation_key`、id 和站点配置的 rotation 时间窗，相关 Workers 测试覆盖分页、中文模糊搜索和重复防护。
- V2 的“发现新群”需要 `last_published_at DESC, id DESC`，不能直接复用当前 rotation 全量数组逻辑；两种排序应在 Contract 和 repository 层分开。
- 管理 API `functions/_lib/routes/admin-groups.ts` 接收 `cursor`、`limit`，默认 50；前端 `useAdminGroups.ts` 与 `AdminGroupTable.vue` 以 `nextCursor` 和“加载更多”驱动。
- 管理端现有 Workers 测试验证 keyset cursor 的跨页排序、标签分区和无重复，但 V2 明确要求页码、URL、total、删除退页和固定 50 条，需要新增/替换管理端契约。

### 3.4 状态、迁移与板块基础

- `shared/domain/group.ts` 与 `migrations/0001_initial.sql` 的状态集合是 `pending | published | rejected | delisted`；软删除使用 `deleted_at`，不改变 status。
- 当前 migration 只有 groups、tags、join methods、submission details、likes、rate limits、assets 和 mutation token；不存在 `last_published_at`、`boards` 或 `board_groups`。
- `migrations/0002_admin_group_management.sql` 已建立 asset `staged/ready/delete_pending/delete_failed` 生命周期字段和 QR `asset_id` 引用。
- `migrations/0003_group_mutation_token.sql` 增加 mutation token，但没有 V2 发布时间或板块关系。
- `tests/workers/migrations.spec.ts` 目前主要验证已有 migration 升级，不覆盖未来板块表、默认板块幂等、现有 `last_published_at` 全部为 `NULL` 或外键/级联演练。
- 当前没有发现板块 repository、service、管理 API、公开板块 API 或板块前端页面；T05/T08 需要新增能力，T04 先提供 schema/Contract。

### 3.5 主题、配置与视觉基础

- `shared/domain/config.ts` 的 `themeConfigSchema.defaultMode` 只有 `light`、`dark`。
- `site.config.ts` 默认配置为 `light`。
- `src/style.css` 只有 `--color-primary`、`--color-accent` 和 `color-scheme: light`，未形成三态主题 token 映射。
- `src/app/main.ts` 先加载 CSS、创建 Vue 应用后直接 mount，没有在挂载前解析 localStorage 或 `prefers-color-scheme` 的初始化脚本。
- `App.vue` 只承载 RouterView，顶栏和全局主题入口尚未形成 V2 结构。
- T02 视觉模板缺失属于已确认延期；不能在 T01 代拟正式视觉语言。T03 只能在 T02 提供模板/Spec 后冻结正式 Token。

### 3.6 资源与图片处理

- `shared/contracts/asset.ts` 当前 Logo 限制为原始 5MB、压缩后 80KB、128px、最低质量 45；QR 为原始 5MB、压缩后 400KB、最大 1024px、最低质量 55。
- `src/features/admin/composables/useImageProcessor.ts` 的实现默认原始文件上限为 10MB，但调用方可以传入其他限制；当前失败测试的文案与实际调用参数不一致，需由 T10 追踪真实 Contract。
- `AdminGroupDrawer.vue` 只清理本会话 `stagedAssetIds`，ready 资源不会被 purge；替换、取消关闭和 route leave 都走尽力清理路径。
- `src/features/admin/api.ts` 的 `purgeStagedAsset()` 使用 `DELETE /admin/assets/:id?mode=purge` 和 CSRF header。
- `AdminGroupDrawer.spec.ts` 试图通过全局 `fetch` 观察 purge 事件，但当前 3 个测试没有观察到预期调用；根因需在 T10 追踪组件事件、mock 边界、异步 flush 和 API client 之间的数据流，不能删除断言。

### 3.7 管理端与 API 安全

- `functions/_lib/app.ts` 使用无参数 `cors()`，与 backend Spec 的同源/不开放宽泛 CORS 约束不一致。
- `functions/_lib/middleware/auth.ts` 的 CSRF 中间件验证 `X-CSRF-Token`，但没有单独检查同源 `Origin`。
- `functions/_lib/middleware/request-id.ts` 只把 request ID 写入 Hono context，没有统一向响应设置 `X-Request-Id`。
- `functions/_lib/middleware/error-handler.ts` 只记录错误 message，返回固定内部错误信封，没有结构化 error code/context 记录。
- `functions/_lib/repositories/group-repository.ts` 和 `functions/_lib/services/asset-service.ts` 仍有生产路径 `SELECT *`，与 backend database quality Spec 的显式字段要求不一致。
- `src/shared/api/client.ts` 给每个请求附加 `X-Device-Id`，包括管理请求；设备 ID 和点赞存储的 ownership 需要在后续安全审计中明确，不能由公开页面组件自行复制。

### 3.8 E2E 与测试矩阵

- `playwright.config.ts` 当前只有 Chromium desktop 和 Chromium mobile 两个 project，没有 Firefox、WebKit 或 WebKit mobile。
- `tests/e2e/` 当前主要为 `admin-qr.spec.ts`，覆盖登录、QR 上传、管理抽屉、桌面/移动 drawer 和公开 QR 展示；缺少 V2 首页区域、板块、搜索模式、详情深链、主题、页码、键盘/焦点和下架隔离矩阵。
- 当前 Workers 测试对公开列表、管理员 CRUD、资源生命周期、点赞和迁移已有可复用夹具，但需要加入 `delisted` 非公开、board relation、发布时间转换、初始 `NULL` 和页码契约。

## 4. Spec / 代码 / 测试三方一致性矩阵

| 领域 | Spec 规定 | 当前代码 | 当前测试 | 证据与结论 | V2 影响 |
| --- | --- | --- | --- | --- | --- |
| 公开可见性 | 旧 Spec 允许 published/delisted；用户新决策改为仅 published | `listPublished()` 查询两种状态 | Workers 与 GroupCard 测试允许/展示 delisted | `group-repository.ts`、`groups.ts`、`groups.spec.ts`、`GroupCard.vue/spec`；旧规则被产品决策覆盖 | T04/T05/T06/T07/T10 必须统一过滤 |
| 状态集合 | 四状态，软删除独立 | domain/migration 四状态，deleted_at 独立 | Workers 覆盖部分状态和管理流程 | `group.ts`、`0001_initial.sql`、admin tests；基础可复用 | T04 增加发布时间转换与迁移测试 |
| 公开分页 | Spec/PRD 要求 cursor 和无限滚动 | public API 是 cursor 外形，但 repository 全量加载后内存分页 | groups tests 验证 limit/cursor/中文搜索 | `pagination.ts`、`listPublished()`、`groups.spec.ts`；契约形状可复用，执行策略需调整 | T07/T09 不能互换公开与管理分页 |
| 管理分页 | V2 要求固定 50 条页码 | route/composable/table 是 cursor + load more | admin workers 验证 keyset cursor | `admin-groups.ts`、`useAdminGroups.ts`、`AdminGroupTable.vue`、admin tests | T09 重构，T10 做跨页回归 |
| 旋转排序 | 现有目录保留确定性 rotation；发现新群按发布时间 | 目录用 rotation_key + 内存循环位移；无 last_published_at | 既有 rotation/pagination 测试 | repository、rotation service、groups tests；两种查询不可混用 | T04/T07/T10 |
| 主题 | V2 system/light/dark、持久化、系统检测、防闪烁 | schema 仅 light/dark；入口无初始化；CSS 仅 light | 未形成 V2 主题矩阵 | config、site.config、style.css、main.ts、Playwright config | T02/T03/T10；模板输入是前置阻塞 |
| 配置 platforms | 当前代码 Contract 为 string[] | `config.ts` 和 `site.config.ts` 为 string[] | `config.spec.ts` 仍断言对象数组 | `config.ts`、`site.config.ts`、`config.spec.ts`；现有基线失败 | T04 同步共享 Contract 与测试 |
| 资源生命周期 | Spec 要求 staged/ready、引用计数、失败可重试 | asset schema/migration/service 已有基础，drawer 有 staged 跟踪 | drawer 3 个资源清理测试失败；Workers 资源测试通过 | asset Contract、migration、drawer/api/spec；行为链需 T10 定位 | T10 先稳定既有链路，T06/T08 复用 |
| 安全响应 | Origin、CSRF、request ID、结构化错误、禁止 SELECT * | CORS 宽泛、无 Origin、request ID 未写响应、错误日志简单、存在 SELECT * | 现有测试未覆盖全部 Spec 要求 | backend Spec 与 middleware/repository 对照；属于安全/质量偏差 | T10 集成验收，必要时回退责任子任务 |
| E2E 矩阵 | 关键公开/管理/移动/主题/浏览器场景 | 仅 Chromium 两 project 和 admin QR 场景 | 现有 QR E2E 可复用夹具 | `playwright.config.ts`、`tests/e2e/admin-qr.spec.ts` | T10 扩展矩阵 |

## 5. V2 冲突与风险登记

| 编号 | 级别 | PRD 目标 | 当前事实 | 风险 | 处理与责任 | 是否需用户决策 |
| --- | --- | --- | --- | --- | --- | --- |
| C1-01 | C1 | 当前任务目录和父子任务关系应与 V2 一致 | 旧文档仍引用 `frontend-overhaul` / `07-30`，实际为 `lgqh-v2` / `08-01` | 任务错链、责任丢失 | 已修正父任务和 T01 规划；后续以当前 task.json 为准 | 否 |
| C5-01 | C5 风险门禁 | 已下架完全不公开 | repository、route、测试、GroupCard 仍允许/展示 delisted | 公开数据泄露和错误详情深链 | T04/T05/T06/T07 修改，T10 以 Workers/E2E 证明；未通过前阻塞公开发布 | 决策已确认，实施仍阻塞 |
| C3-01 | C3 | 发现新群依赖 last_published_at；板块依赖 boards/relations | migration 和代码均不存在相关字段/表 | 初始 NULL、外键、旧代码读取新 schema 和发布顺序风险 | T04 设计 forward migration、初始 NULL 验证和部署顺序；T05 依赖 T04 | 否，技术方案需评审 |
| C3-02 | C3 | 管理端固定 50 条页码，公开端保留 cursor | 管理端和 repository 主要按 cursor/load-more | URL、total、删除退页和跨页稳定排序回归 | T09 接管管理查询/前端，严禁修改公开 cursor；T10 验收 | 否 |
| C2-01 | C2 | 三态主题和正式视觉语言 | 当前只有两态；T02 模板缺失 | Token、顶栏、公共状态样式可能反复重做 | 用户已同意延迟模板；T02 输入后 T03 实施 | 视觉输入待用户在 T02 提供 |
| C2-02 | C2 | 配置/共享 Contract 应可执行且测试一致 | `platforms` 实现为字符串，测试仍使用对象 | 基线不稳定、后续配置变更误导 | T04 统一 schema、配置、Spec 和测试 | 否 |
| C2-03 | C2 | 既有资源生命周期继续可重试且有测试 | drawer 资产清理测试与当前异步 API 观察不一致 | 未保存上传可能泄漏或误清 ready asset | T10 追踪真实调用链和回归；不删测试 | 否 |
| C2-04 | C2 | 公开分页应可扩展并防竞态 | 全量内存 rotation，cursor 异常静默回退，composable 无 sequence guard | 规模、重复、旧响应覆盖新结果 | T07 与 T04/T10 设计查询/竞态契约并测量 | 否 |
| C2-05 | C2 | backend Spec 的同源、安全、错误和显式字段约束应成立 | CORS/Origin/request ID/error/SELECT * 存在偏差 | 安全审计和故障排查能力不足 | T10 建立验收项；实际修复归对应后端 owner | 否 |
| Q-01 | 质量门禁 | 全量命令应可作为实施基线 | 5 单测失败、1 lint、22 format 失败 | V2 失败难以归因，发布门禁失真 | T04/T10 按用户确认责任清零 | 否 |

除“视觉模板需在 T02 提供”这一已确认的输入延期外，没有需要用户重新决定的 C4 产品分歧。C5-01 是已解决产品规则下的实现/验收阻塞，不是重新开放的行为选项。

## 6. 可复用模块

| 模块 | 当前职责 | V2 复用方式 | 不可破坏行为 | 所属任务/依赖 | 相关测试 |
| --- | --- | --- | --- | --- | --- |
| `src/features/groups/composables/useGroupDirectory.ts` | 搜索、debounce、cursor、取消 | 保留公开 cursor 和搜索归一化，拆分首页区域状态并补 sequence/IME 契约 | 搜索字段和既有匹配语义 | T07，依赖 T04 Contract、T03 主题 | composable specs、groups Workers、Playwright |
| `functions/_lib/services/rotation-service.ts` | 时间窗和确定性 rotation | 目录继续复用；发现新群使用独立发布时间排序 | 固定时钟、时区、轮换窗口 | T04/T07 | rotation/group Workers |
| `shared/contracts/pagination.ts` | cursor 编码、公开 list query | 公开仍用 cursor；管理页码另建 Contract，不复用同一语义 | URL-safe Unicode cursor、公开分页 | T04/T07/T09 | pagination specs、公开/管理 Workers |
| `functions/_lib/repositories/group-repository.ts` | 群组查询和写入 | 保留公开字段投影和并发语义；按 owner 顺序拆公开/管理/板块查询 | version、mutation token、状态/删除语义 | T04→T05/T07/T09 | group/admin/resource Workers |
| `src/features/admin/components/AdminGroupDrawer.vue` | 管理编辑抽屉、草稿和 staged asset | T08/T09/T10 复用抽屉边界；不复制资源清理逻辑 | ready 不误删、staged 可清理、未保存导航提示 | T10 基线后再由相关任务接入 | drawer specs、QR E2E |
| `functions/_lib/services/asset-service.ts` | R2/D1 asset 引用、清理和公开元数据 | 继续作为资源生命周期唯一入口 | staged/ready/refCount/purge retry | T10 先稳定，T06/T08 只调用 | admin resource Workers |
| `shared/domain/config.ts` | site/theme/rotation/platform schema | T04 负责共享 Contract，T03 消费 theme 三态 | 单一 schema 事实来源 | T04→T03 | config specs |
| `tests/workers/helpers.ts` | Workers 请求、seed 和 auth helper | 扩展 delisted/board/migration fixture，保持隔离 D1 | 不依赖工作区持久化状态 | T10 统筹 | Workers suites |
| `tests/e2e/admin-qr.spec.ts` | 管理登录、资源和 QR E2E | 复用登录、CSRF、资源 seed；增加 V2 场景时保持测试隔离 | 不使用生产 binding/密钥 | T10 | Playwright |

## 7. 必须修改模块

| 模块/文件 | 修改原因 | 类型 | 后续任务 | 依赖与风险 |
| --- | --- | --- | --- | --- |
| `migrations/0004+`（新 forward migration） | 增加 `last_published_at`、boards、relations、索引/默认数据；现有发布时间保持 `NULL` | 新增迁移 | T04 | D1 部署顺序、FK/级联、回滚替代方案 |
| `shared/domain/config.ts`、`site.config.ts`、`config.spec.ts` | platforms 基线与 theme 三态 Contract | Contract/测试 | T04，T03 消费 theme | T04 与 T03 需顺序合并 |
| `shared/contracts/group.ts`、相关 DTO、`scripts/seed-local.mjs` | 发布时间、板块成员、显示宽度、合法测试数据和公开投影 | 共享 Contract/seed | T04/T05/T06/T07 | 公开字段泄露、seed 与 Contract 漂移 |
| `functions/_lib/repositories/group-repository.ts` | published 公开过滤、发布时间排序、板块/管理查询 | 查询分层 | T04→T05/T07/T09 | 高冲突，禁止并行大范围覆盖 |
| `functions/_lib/routes/groups.ts`、详情/板块 routes | 统一公开可见性和 cursor 错误语义 | API | T05/T07 | C5-01，必须有公开隔离测试 |
| `src/features/groups/components/GroupCard.vue` 及 spec | 移除公开 delisted badge、四行简介、token 化 | UI/测试 | T06 | 与 T07 首页状态和 T03 Token 顺序依赖 |
| `src/features/groups/composables/useGroupDirectory.ts`、HomeView、GroupList | 首页区域、搜索竞态/IME、状态和 URL | 前端状态 | T07 | 公开 cursor 不能改为页码 |
| `functions/_lib/routes/admin-groups.ts`、`useAdminGroups.ts`、`AdminGroupTable.vue` | cursor/load-more 改为 page/50/total/URL | 管理 API/UI | T09 | 与 T08 管理壳层协调，删除退页 |
| `src/style.css`、`src/app/main.ts`、顶栏/公共状态 | 三态主题、首屏防闪烁、Token | 前端基础 | T03，模板依赖 T02 | 视觉资产缺失、全站回归风险 |
| `functions/_lib/app.ts`、auth/request-id/error middleware | Spec 安全和错误响应偏差 | 安全/基础设施 | T10 统筹，按实际 owner 修复 | 不能在 T01 越界修复 |
| `playwright.config.ts`、`tests/e2e/`、Workers fixtures | V2 浏览器矩阵和公开隔离 | 测试基础设施 | T10 | 本地 D1/R2 隔离、固定时间/字体 |

## 8. 数据迁移与部署风险

### 8.1 `last_published_at`

- 只能通过新增 forward migration 增加 nullable UTC ISO 文本字段，不能修改 `0001`–`0003`。
- 仅在“旧状态不是 published → 新状态是 published”时写入；普通编辑、published→delisted、点赞、资源写入和冲突不应更新。
- 新建 pending 记录默认 `NULL`；用户已确认当前未上线数据的历史 `last_published_at` 全部保持 `NULL`，不使用 `created_at` 或 migration 时间回填。未来若网站上线后需要历史回填，应另立迁移决策。
- 状态、version、mutation token 和时间字段必须在同一个原子写入边界内更新，避免孤立时间戳。
- 需要在空库、当前 `0001`–`0003` schema、重复迁移和冲突重试场景验证。

### 8.2 boards 与 board_groups

- `boards` 至少需要 id、name、description、position、sort mode、enabled、version/更新时间和可删除语义；具体字段必须以 T04/T05 设计评审为准。
- `board_groups` 需要稳定排序位置、唯一关系、外键和删除关系行不删除 group 的约束。
- 默认“自定板块”由 migration/初始化幂等创建，运行时不能发现缺失就静默创建。
- 板块可为零，默认板块可删除，未启用板块可编辑，可添加已下架群组；公开查询只能投影 published 成员。
- 回收站/永久删除关系清理由 T05 接入既有 R2/D1 四阶段，不得由 FK 或 board 逻辑提前破坏资源清理。
- 必须演练旧代码读取新库、失败 migration、孤儿 relation、重复关系和部署顺序。

### 8.3 发布与回滚

- D1 migration 没有可假定的自动回滚，发布应采用“先兼容字段/表、再切读写、最后清理旧路径”的 forward 修复策略。
- 在 `last_published_at` 和 board 表可被旧代码安全忽略前，不得发布依赖新字段的公开查询。
- T10 需要记录空库初始化、当前 schema 升级、现有字段全部 `NULL`、默认板块幂等和失败演练结果。

## 9. API 与跨层影响

### 9.1 公开读

```text
Home/Search/Detail/Board member
→ public composable / route controller
→ typed API client
→ public route
→ public repository projection
→ D1
```

必须统一：

- 所有入口过滤 `published`，包括搜索、板块成员和 `?group=` 详情深链。
- 公开 DTO 不返回 auditNotes、submissionContact、version、deletedAt、R2 key、设备 ID 或内部状态。
- 公开 cursor 与管理页码分离；公开排序继续用 cursor，发现新群使用稳定发布时间排序。
- 详情不存在、未发布、已下架、回收站和非法 ID 的错误/404 语义需由 T06/T07/T10 共同验证，不能只在组件层隐藏。

### 9.2 管理写

```text
Admin form/table
→ auth + Origin + CSRF + version/mutation token
→ route/service state transition
→ D1 batch / R2 lifecycle
→ typed response + X-Request-Id
→ admin state
```

必须保持：

- 管理员可以查看、编辑、重新发布 delisted 群组。
- staged asset 的 adoption、替换、取消、关闭和 purge 不能误删 ready 资源。
- 版本冲突、mutation token、D1 batch 和 R2 失败恢复不能因 board relation 或页码重构而改变。
- 新 board 关系只删除关系，不删除 group 或 asset。

## 10. 测试影响面

| 测试层 | 保留 | 修改/新增 |
| --- | --- | --- |
| shared domain/Contract | rotation、pagination、group status、asset schema | platforms 基线、theme system、display width、board DTO、last_published_at |
| Vue unit/component | GroupCard、GroupList、drawer、image processor、search composable | delisted 不公开、卡片四行、详情/Carousel、主题状态、管理页码、staged asset 根因回归 |
| Workers integration | groups、admin-groups、resource lifecycle、migration、likes | 公开只 published、board CRUD/query、发布时间状态转换、migration upgrade/NULL 初始化、page/total/delete-back |
| Playwright | admin QR 登录/资源夹具 | 首页区域、搜索 URL/IME、`?group=`、分享、主题/首屏、防下架泄露、管理页码、窄屏/键盘、Firefox/WebKit |
| 质量命令 | typecheck、workers、build | T04/T10 清零 `test` 5 failures、lint 1 failure、format 22 failures |

不可接受的测试替代：删除现有 delisted 断言而不补充“公开不返回 delisted”的正向测试；只断言 HTTP 2xx 而不核对 D1/R2 状态；只运行单个浏览器；通过重复重试隐藏不稳定失败。

## 11. PRD 修订建议

| 类型 | 建议 | 证据 | 责任 |
| --- | --- | --- | --- |
| 事实纠正 | 将源 PRD 的真实文件名、任务目录、当前 route 前缀、现有 cursor/load-more 和 migration 文件名写实 | 当前仓库路径、父任务 task.json、routes/migrations | 父任务 |
| 约束补充 | 明确公开过滤只允许 published，覆盖列表、搜索、板块成员和详情；delisted 仅管理员可见 | repository/route/tests/用户决策 | T04/T05/T06/T07/T10 |
| 约束补充 | 明确公开 cursor 与管理页码是两套契约，固定管理 pageSize=50 | pagination Contract、admin route/composable/table、V2 RPD | T09/T10 |
| 迁移补充 | 明确 forward-only、当前未上线数据全部 NULL、无旧内容兼容、seed 合法性、默认板块幂等、FK/级联和部署兼容窗口 | migrations/0001–0003、V2 RPD、用户决定 | T04/T05/T10 |
| 测试补充 | 把 delisted 隔离、发布时间转换、board relation、迁移演练、页码删除退页、主题矩阵加入门禁 | 当前测试缺口、V2 验收 | T04/T05/T09/T10 |
| 安全补充 | 将 Origin、响应 X-Request-Id、结构化错误、显式投影和宽泛 CORS 处理纳入质量验收 | backend Spec 与当前 middleware/repository | T10/对应后端 owner |
| 任务边界 | T04 只拥有共享基础和 migration；T05 拥有板块后端；T06/T07 拥有公开 UI/查询接入；T08/T09 拥有管理 UI；T10 拥有系统门禁和既有基线 | 当前兄弟任务规划 | 父任务 |
| 视觉依赖 | 记录模板暂缺不阻塞 T01，但阻塞 T02 正式样例、T03 Token 和依赖视觉的前端实施 | 工作区材料扫描、用户决定 | T02/T03 |
| 质量门禁 | 5 单测失败、1 lint、22 format 由 T04/T10 修复，T01 不越界 | 只读基线命令 | T04/T10 |

### 11.1 T02–T10 方案审核结果

| 子任务 | 审核结论 | 本轮处理 |
| --- | --- | --- |
| T02 视觉语言 | 视觉模板按用户决定延期；原方案的下架状态 fixture 可能被误用于公开视图 | 修订为公开视图只含 `published`，`delisted` 只在管理端模拟 |
| T03 主题与顶栏 | 依赖 T02 的视觉输入，未发现与已确认状态/迁移规则冲突 | 保持 planning，等待 T02 模板和 Spec 更新 |
| T04 Schema/发布 | 原规划仍有旧内容兼容、历史回填和 restore 直接发布表述 | 修订为现有字段全部 `NULL`、seed 合法、restore 不改 status，显式发布才更新 |
| T05 板块后端 | 管理端允许维护下架成员，但公开板块必须过滤；原文“恢复后重新 published”容易混淆 restore 语义 | 修订为显式重新发布恢复公开投影，软删除 restore 不自动发布/恢复旧关系 |
| T06 卡片/详情/Carousel | 公开组件依赖 published-only 查询，未发现新的规划冲突 | 保留公开过滤和详情深链阻塞，交由 T04/T05/T07 Contract 接入 |
| T07 首页/搜索 | 原规划已明确排除下架，但发现流需要共享初始 NULL 排序边界 | 已修订为 `last_published_at DESC, id DESC`、全部 NULL 时稳定排序 |
| T08 管理板块 | 责任边界是管理端下架成员维护，不把下架成员投影到公开端 | 保持 planning，依赖 T05 API 和 T02/T03 视觉输入 |
| T09 管理分页 | 管理 page/50/total 与公开 cursor 已分离，未发现产品规则冲突 | 保持规划，禁止把管理分页改造扩散到公开查询 |

### 11.2 本轮文档修订落点

- 项目 Spec：`.trellis/spec/backend/api-guidelines.md`、`.trellis/spec/backend/database-guidelines.md`、`.trellis/spec/guides/testing-strategy.md`。
- V2 源 PRD：`docs/PRD/v2/RPD.md`、`docs/PRD/v2/子任务04.md`、`docs/PRD/v2/子任务10.md`。
- 总任务规划：`.trellis/tasks/08-01-lgqh-v2/prd.md`、`design.md`、`implement.md` 和 `task.json`。
- 子任务规划：T02 的三份规划、T04 的三份规划与任务状态、T05 的 PRD、T07 的 PRD/design、T10 的三份规划。
- T01 交付物：本目录的 `prd.md`、`design.md`、`implement.md`、`research.md`、`impact-map.md`。

以上均为审计/规划文档变更；未修改 `src/`、`shared/`、`functions/`、`migrations/`、`tests/` 或正式测试配置。

## 12. 结论与 T01 完成条件

T01 事实审计已将旧行为、当前实现、测试锁定行为、V2 目标、责任边界和阻塞条件分开。当前没有需要重新向用户开放的 C4 产品分歧；已下架隔离是冻结规则，视觉模板是已确认的输入延期。

T01 交付物完成后仍必须满足：

- 业务代码、正式 migration、测试代码和快照无变化。
- `research.md` 与 `impact-map.md` 的所有高风险结论均有路径/符号/测试/migration 证据。
- T04→T05、T02→T03、T03/T05/T06→T07/T08/T09、T03–T09→T10 的依赖和文件 owner 已冻结。
- 后续任务只能在各自规划获得批准后实施；T02 在视觉模板补全前不得冻结正式视觉规范。
- C5-01 公开隔离和迁移风险在 T10 真实测试通过前不得解除。

当前状态：事实审计、影响范围、文件所有权和文档修订已整理完成，用户已明确批准 T01 收口。T02–T10 仍保持 planning，未启动任何业务实施。
