# 完善 admin 页面功能：实施计划

## 0. 执行约定

- 当前父任务只负责规划、依赖和最终集成，不直接实现。
- 每个实现 Agent 的提示必须以 `Active task: <child task path>` 开头。
- 子任务进入实现前，先完成各自 `prd.md`、`design.md`、`implement.md`、`implement.jsonl`、`check.jsonl`，通过 `task.py validate` 后再单独 `task.py start`。
- 开始编辑前加载 `trellis-before-dev`；完成代码后加载 `trellis-check`。
- 不修改 `migrations/0001_initial.sql`，不使用 `git add .`，不覆盖其他 Agent 的脏文件。

## 1. 子任务顺序

```text
可并行：
  A. 07-28-admin-list-search-sort
  B1. 07-28-qr-resource-public-flow（migration、契约、asset service）

B1 契约稳定后：
  C. 07-28-admin-group-aggregate-editor

C 完成后：
  B2. 07-28-qr-resource-public-flow（抽屉接入、公开二维码）

最后：
  父任务集成 Review + 全量质量门禁
```

如同一 Agent 顺序执行，建议按 `B1 → C → B2 → A → 父任务集成`；如多个 Agent 并行，A 不得同时修改二维码/写入契约。

## 2. 子任务 A：统一搜索并完善管理员列表

### 2.1 契约与共享 helper

- [ ] 在 `shared/domain/` 增加搜索 query 归一化纯函数及单元测试。
- [ ] 在 `shared/contracts/` 增加管理员列表 query/response schema：
  - 重复 `status` 参数；
  - `deleted`；
  - `q`；
  - `sortBy` / `sortDir`；
  - opaque cursor / limit；
  - `total` / `nextCursor`。
- [ ] 为 `deleted + statuses`、空正常状态集、非法 sort key/direction、无效 cursor 添加契约测试。

### 2.2 Repository 与路由

- [ ] 重构群组搜索 where builder，使公开列表和管理员列表共同搜索标题、简介、标签。
- [ ] `listAll` 支持 1–4 个状态、回收站、搜索、白名单排序、keyset cursor 和 total。
- [ ] COUNT 与 items 复用同一 where/bindings 来源。
- [ ] 为六个排序 key 建立固定 SQL 映射，并追加稳定 ID tie-breaker。
- [ ] 管理员 GET 路由使用专用 query schema；私有响应继续 `no-store`。
- [ ] 公开列表搜索增加简介，保持轮换顺序和公开字段隔离。

### 2.3 API client 与 composable

- [ ] 扩展 `src/shared/api/client.ts` 支持 `AbortSignal`，不破坏现有 header/body 调用。
- [ ] `useGroupDirectory` 实际把 signal 传到公开请求，并保留 request sequence 兜底。
- [ ] `useAdminGroups` 从 URL 解析/写回筛选、搜索、排序与 cursor；普通输入 300ms 防抖，回车/清空立即请求。
- [ ] 变更后保留当前 URL 和滚动位置；不得恢复无条件全量刷新跳顶。

### 2.4 UI

- [ ] 新建状态筛选组件，集中实现“四状态至少一个”和“回收站互斥/恢复”状态转换。
- [ ] 在筛选与表格之间增加搜索框，更新主页 placeholder 为“标题、简介或标签”。
- [ ] `AdminGroupTable` 增加标签列。
- [ ] 六个数据列使用可聚焦排序按钮和 `aria-sort`；操作列明确不可排序。
- [ ] 增加完整结果遍历 UI（游标继续加载或分页控件），显示 total/加载/空/错误状态。

### 2.5 子任务 A 测试

- [ ] 纯函数：trim、Unicode 兼容、英文字母大小写、中文、空输入和控制字符。
- [ ] Worker：多状态组合、回收站互斥、标题/简介/标签搜索、六列升降序、tie、cursor query 绑定、total。
- [ ] Vue：最后一个状态不能关闭、回收站恢复组合、防抖/清空、标签列、表头键盘与 `aria-sort`。
- [ ] E2E：主页与管理端使用同一关键词得到符合各自可见性规则的结果；跨页全局排序稳定。

## 3. 子任务 B：二维码资源和公开交互

### 3.1 Migration

- [ ] 新增 `migrations/0002_admin_group_management.sql`：
  - `assets` 表与生命周期/清理列；
  - `join_methods.asset_id` 外键与索引；
  - `groups.purge_attempts`、`groups.purge_last_error_code`；
  - 必要索引。
- [ ] 更新本地/预览/生产 migration 命令，使其按顺序应用全部 migration，不再只执行 `0001`。
- [ ] 增加“空数据库应用 0001→0002”和“已有 0001 数据升级”的测试。
- [ ] migration 前审计 legacy `qr_code` 行；有数据时记录迁移/替换策略，禁止静默丢失。

### 3.2 Asset contract 与 service

- [ ] 扩展管理员 asset DTO，包含 asset ID、用途、公开 URL、尺寸、体积和安全生命周期状态；不向公开 DTO暴露内部字段。
- [ ] `POST /admin/assets` 创建 `staged` asset；验证 WebP 签名、用途、尺寸、实际字节数和 300 KB 上限。
- [ ] `DELETE /admin/assets/:id` 只清理无引用 asset，使用幂等状态机；失败保留 `delete_failed` 与安全错误码。
- [ ] 提供 retry 命令或让相同删除命令可安全重试。
- [ ] 添加 staged asset 过期回收入口/服务逻辑，不能只依赖浏览器关闭事件。

### 3.3 群组投影与清理

- [ ] Repository 查询 join method 时联接 asset 元数据。
- [ ] 管理员二维码投影返回 asset ID + URL + meta；公开投影只返回 `qrCodeUrl`/展示 meta。
- [ ] 聚合解除 asset 引用后执行引用计数检查，再清理 R2/D1。
- [ ] 重写永久删除为 `none → pending → r2_done → D1 delete` 可重试流程，同时处理 Logo 和二维码。
- [ ] 永久删除路由只接受软删除群组；错误返回稳定 `STATE_CONFLICT` / `DEPENDENCY_UNAVAILABLE`。

### 3.4 移除开关与公开 UI

- [ ] 从 `shared/domain/config.ts`、`site.config.ts`、测试、README 和 spec 移除 `qrCodePublic`。
- [ ] 公开 serializer 始终允许二维码方式，不返回 R2 key/asset ID。
- [ ] 新建可访问的 `QrCodeDialog`，包含群名称、图片、关闭按钮、Escape 和焦点归还。
- [ ] `GroupCard` 使用穷尽分支处理三种加群方式，修复仅按 `method.type` 作为 key 的冲突。

### 3.5 子任务 B 测试

- [ ] Worker：上传验证、staged→ready、引用保护、替换、无引用删除、R2/D1 各阶段失败与重试。
- [ ] Worker：永久删除不是回收站记录时拒绝；重复请求幂等；关联标签/方法/详情/点赞/资源清理。
- [ ] 契约：公开二维码可解析且不含内部字段；管理员 asset 信息完整。
- [ ] Vue：二维码处理、预览、替换、取消、公开对话框键盘/焦点。
- [ ] E2E：管理员上传二维码→保存→主页查看→替换→旧资源清理→软删除/永久删除。

## 4. 子任务 C：群组聚合编辑

### 4.1 写入契约

- [ ] 新增 `adminGroupCreateSchema` / `adminGroupUpdateSchema`，禁止继续使用 `adminGroupDtoSchema.partial()`。
- [ ] 加群方式使用判别联合；更新包含 `version`；请求不包含 `submissionContact`。
- [ ] 标签 0–5、trim、空值/重复校验；加群方式至少 1 条、平台兼容、重复值校验。
- [ ] URL 强制 `https:`；QR asset 必须存在、用途正确且可引用。

### 4.2 Repository 原子写入

- [ ] 创建使用一个 D1 batch 写入 group、tags、join methods、submission details 和 asset 状态。
- [ ] 更新使用 version 条件主表 UPDATE，并让关联语句受期望新版本 `EXISTS` 守卫。
- [ ] 冲突时关联写入必须全部 no-op，返回 `VERSION_CONFLICT`。
- [ ] 完整集合替换保持 `sort_order`；响应重新读取权威聚合。
- [ ] 联系方式永不被写入命令覆盖；审核备注可以 upsert。
- [ ] 软删除/恢复/永久删除验证 NOT_FOUND、STATE_CONFLICT 与幂等边界。

### 4.3 Composable 与抽屉

- [ ] 将列表状态与编辑草稿拆成 `useAdminGroups` / `useAdminGroupDraft`，避免单个 composable 隐藏无关职责。
- [ ] 抽屉打开时深拷贝 DTO，所有动态项使用稳定 client key。
- [ ] 组件分区：基本信息、标签、加群方式、私有信息。
- [ ] 平台切换后标记不兼容方式并阻止保存，不静默删除。
- [ ] 标签和加群方式提供新增、删除、上移/下移；删除最后一个方式立即显示字段错误。
- [ ] 联系方式只读且空值显示“未提供”；审核备注可编辑。
- [ ] 保存失败保留草稿和字段错误；版本冲突获取权威值并要求 Review。
- [ ] dirty guard 覆盖遮罩、关闭按钮、Escape 和页面导航。
- [ ] 宽屏右侧固定最大宽度；窄屏扩展为 `100vw`；正确处理焦点、焦点归还和 reduced motion。

### 4.4 创建和列表回写

- [ ] 修复现有“新建群聊”只开表单但不调用 create 的缺口。
- [ ] 创建/编辑成功后用权威 DTO 更新列表；筛选或排序键变化时精确补取并恢复 scroll anchor。
- [ ] 回收站不渲染编辑入口；恢复后按原状态重新进入正常列表。

### 4.5 子任务 C 测试

- [ ] Worker：创建完整聚合、0/5/6 标签、至少一个方式、同类型多条、重复项、平台不兼容。
- [ ] Worker：主表/标签/方式/notes 全部成功或全部回滚；并发 version 冲突不改任何关联行。
- [ ] Vue：创建/编辑回显、标签/方式 CRUD 与排序、联系方式只读、notes 可写、dirty guard、响应式抽屉。
- [ ] E2E：创建→编辑全部字段→切换状态→软删除→回收站无编辑→恢复→再次编辑。

## 5. 父任务集成 Review

### 5.1 契约和数据流

- [ ] 公开/管理员 DTO 不混用，公开投影没有联系方式、notes、删除字段、version、R2 key 或 asset ID。
- [ ] 管理员列表 query、前端 URL parser 和 SQL 白名单字段完全一致。
- [ ] 主页和管理端搜索调用同一个归一化 helper、同一字段集合。
- [ ] 平台/加群方式规则只有一个来源；三种方式分支穷尽。
- [ ] 保存、上传、解除引用、永久删除各层错误码和 UI 行为一致。

### 5.2 代码复用与一致性

- [ ] 搜索 SQL/normalizer、状态顺序、排序 key、asset URL 映射没有平行副本。
- [ ] 不在组件中使用数据库行、裸 `fetch`、`any`、索引 key 或局部 payload 断言。
- [ ] 所有新增文档以简体中文为主。

### 5.3 全量门禁

按顺序运行并保存结果：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

另外执行：

```bash
python ./.trellis/scripts/task.py validate .trellis/tasks/07-28-admin-list-search-sort
python ./.trellis/scripts/task.py validate .trellis/tasks/07-28-admin-group-aggregate-editor
python ./.trellis/scripts/task.py validate .trellis/tasks/07-28-qr-resource-public-flow
```

## 6. 高风险文件与 Review 重点

| 文件/区域 | 风险 |
|---|---|
| `migrations/0002_*.sql`、migration scripts | 生产升级、外键、legacy QR 与回滚 |
| `shared/contracts/group.ts`、新 admin schemas | 公开私有字段隔离、输入/输出语义 |
| `functions/_lib/repositories/group-repository.ts` | query builder、动态排序、事务与 version 竞态 |
| `functions/_lib/routes/admin-assets.ts` | R2/D1 部分失败、引用保护、幂等重试 |
| `src/shared/api/client.ts` | AbortSignal 与现有 headers/body 调用兼容 |
| `useAdminGroups.ts` / `useAdminGroupDraft.ts` | URL 状态、请求乱序、草稿与权威状态 |
| `AdminGroupDrawer.vue` / 动态编辑器 | 焦点、dirty guard、稳定 key、窄屏布局 |
| `GroupCard.vue` / `QrCodeDialog.vue` | 二维码公开交互和内部字段泄漏 |

## 7. 回滚点

1. **契约/查询回滚点**：在 UI 接入前，先让旧 UI 可继续调用兼容的列表默认值。
2. **Migration 回滚点**：`0002` 只新增表/列/索引；应用回滚时保留结构，不立即删列。
3. **聚合写入回滚点**：新 POST/PATCH 通过契约测试后再切换前端；失败可回到旧路由实现，但不得回滚已写入的新 asset 引用数据。
4. **二维码公开回滚点**：如公开 UI 失败，回滚展示组件但保留 asset 数据；不要恢复一个永久为真的 `qrCodePublic` 死开关。
5. **清理流程回滚点**：任何不确定情况下停止在 `pending/delete_failed`，禁止继续删除 R2 或 D1。

## 8. 完成定义

- 三个子任务各自通过质量门禁并归档。
- 父任务 `prd.md` 的 `AC-01`–`AC-20` 全部可由测试或明确人工验证证明。
- 按 `trellis-update-spec` 更新 API、数据库、前端状态/组件和测试规范中的真实源码示例。
- 父任务完成最终集成 Review、全量命令和迁移演练后再归档。

