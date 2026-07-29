# Admin 页面收敛修复：实施计划

## 0. 执行约定

- 本轮只允许一个实现 Agent 串行工作，不再拆分并行子任务。
- 先添加能够失败的回归测试，再修改实现；禁止只增加测试数量。
- 不重写筛选、搜索、排序、抽屉布局等已经通过验收的功能。
- 不修改 `migrations/0001_initial.sql` 或 `0002_admin_group_management.sql`。
- 不调用或接管用户个人浏览器；Playwright 使用项目隔离的 headless 测试浏览器。
- 开发前使用 `trellis-before-dev`，完成后使用 `trellis-check`。

## 1. 建立真实测试夹具

- [x] 在 Worker 测试 helper 中提供最小合法 WebP fixture。
- [x] 提供通过上传路由创建 staged asset 的 helper，返回 asset ID、R2 key 和响应 DTO。
- [x] 提供把 staged asset 通过群组创建/更新变为 ready 的 helper。
- [x] 提供 D1 asset、join_methods、groups、tags、submission_details 的测试内查询断言。
- [x] 使用 Miniflare R2 binding 检查对象存在/不存在；不要只检查 HTTP 状态。
- [x] 为 R2 delete/head 失败提供可控 adapter stub 或依赖注入点，测试后恢复。
- [x] 为并发测试注入固定时钟，确保两个请求拥有相同 `updated_at`，证明方案不依赖时间戳唯一性。

## 2. 使用唯一 mutation token 完成聚合原子更新

### 2.1 Migration

- [x] 新增 `migrations/0003_group_mutation_token.sql`：

  ```sql
  ALTER TABLE groups ADD COLUMN mutation_token TEXT;
  ```

- [x] 更新 migration 测试，覆盖全新建库和 `0002 → 0003` 升级。
- [x] 不把 `mutation_token` 加入公开或管理员 DTO。

### 2.2 Repository

- [x] `update()` 每次生成 `const mutationToken = crypto.randomUUID()`。
- [x] 预读仅用于计算旧/新 QR asset 差异和 notes upsert 分支；写入所有权只认 mutation token。
- [x] 单个 `db.batch()` 的第一条语句：

  ```sql
  UPDATE groups
  SET ..., version = version + 1, mutation_token = ?
  WHERE id = ? AND version = ?
  ```

- [x] asset 引用增减、staged adopt、标签删除/插入、加群方式删除/插入、notes upsert 全部增加 `mutation_token = ?` 守卫。
- [x] 最后一条语句按同一 token 清空 `mutation_token`。
- [x] 保存 `const results = await db.batch(batch)`；只使用 `results[0].meta.changes` 判断成功或 `VERSION_CONFLICT`。
- [x] 删除 `updated_at + expectedVersion` 伪 token、提交后成功推断和所有事后版本补偿。
- [x] batch 抛错时向路由传播稳定内部/依赖错误，不返回成功 DTO。
- [x] 成功后读取最新权威 DTO；即使另一个合法请求随后更新，也不得把本次已提交写入误报为冲突。

### 2.3 原子性回归测试

- [x] 两个相同旧版本、相同时间戳 PATCH：一个成功，一个 409；失败请求的 tags、join_methods、notes、asset refs 全部零副作用。
- [x] 故障注入让关联 INSERT 失败：主表字段、version、token、关联行、asset refs 全部保持原值。
- [x] 正常更新后 `mutation_token IS NULL`。
- [x] 连续合法版本更新都成功，不因提交后 SELECT 竞态误报冲突。

## 3. 打通管理员已有二维码预览

### 3.1 数据契约与草稿

- [x] 保留管理员路由对 ready QR 的 `assetUrl`/`qrCodeUrl` 补齐。
- [x] `DraftJoinMethod` 增加 `assetUrl: string | null`。
- [x] `dtoToDraft()` 使用 `m.assetUrl ?? m.qrCodeUrl ?? null`。
- [x] 新建空方式的 `assetUrl` 为 null。
- [x] asset ID 被移除或换成新上传 ID 时同步把旧 `assetUrl` 清空。
- [x] `toCreateInput()`/`toUpdateInput()` 不发送 `assetUrl`。

### 3.2 编辑器显示

- [x] 图片源使用 `qrPreviewUrls[clientKey] ?? m.assetUrl`。
- [x] 本次上传生成的 Object URL 优先于远端 URL。
- [x] 远端图片提供明确 alt；移除后不继续显示旧图。
- [x] 组件销毁时 revoke 所有本地 Object URL，不 revoke 远端 URL。
- [x] 删除整行 QR 时先记录 asset ID 并发送 `cleanup-asset`，再移除草稿行；父级继续只 purge 本会话 tracked staged asset。

### 3.3 Vue 测试

- [x] 已有 ready QR DTO 打开抽屉后显示远端 URL。
- [x] 新上传后本地预览覆盖远端 URL。
- [x] 移除 asset 后远端图片消失、payload 不含旧 ID。
- [x] 删除整行 staged QR 触发一次 cleanup；删除 ready QR 不触发 purge 请求。

## 4. 补齐资源生命周期与维护入口证明

- [x] staged upload → purge：HTTP 200、D1 asset 行不存在、R2 对象不存在。
- [x] ready asset purge：HTTP 409、D1 引用和 R2 对象保持。
- [x] 被 join_method 引用的资源不能直接 purge。
- [x] staged → ready：保存后状态 ready、引用计数正确、管理 DTO 有 URL、公开 DTO 无内部 ID。
- [x] 新增 ready 引用时计数增加；移除最后引用时进入 pending 并最终删除。
- [x] R2 delete/head 故障：HTTP 502 或保存后的 `delete_failed`，错误码安全且 D1 行保留。
- [x] `POST /admin/assets/cleanup` 重试成功后删除 R2 与 D1；断言返回计数只统计实际成功项。
- [x] 带 QR 群组永久删除：join_methods、group、asset 行和 R2 对象符合状态机结果；R2 故障时保持可重试。
- [x] README 明确 cleanup 当前是管理员人工维护命令。若没有部署 Cron，不使用“自动后台清理”措辞。

## 5. Playwright 关键路径

- [x] 增加管理员登录/测试数据 helper，使用测试 D1/R2。
- [x] 场景一：管理员打开含 ready QR 的已有群组，抽屉显示二维码。
- [x] 场景二：管理员上传 QR、保存、进入主页并打开二维码查看界面。
- [x] 测试完成后清理创建的数据和本地报告。
- [x] 不接入或操作用户个人浏览器会话。

## 6. 质量收口

- [x] 删除本任务新增的文件级 `eslint-disable`；修复可自动处理的 Vue warning。
- [x] 无历史 warning 延期项；最终 `pnpm lint` 输出为 0 errors、0 warnings。
- [x] 更新 `design.md`，只保留 UUID mutation token 单 batch 方案，删除两步补偿和时间戳 token 描述。
- [x] 更新测试名称，使其与真实 fixture 和断言一致。

按以下顺序运行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
git diff --check
```

## 7. Review 停止条件

出现下列任一情况时停止提交，不继续补丁式修复：

- 仍以时间戳或 version 作为请求唯一标识。
- batch 成功与否仍通过提交后 SELECT 推断。
- asset 测试仍只使用不存在的固定 UUID。
- API 返回二维码 URL但草稿/组件没有消费。
- Playwright 没有发现测试。
- 任一要求的门禁非零退出。

## 8. 完成定义

- `AC-S01`–`AC-S14` 全部由代码和对应测试证明。
- 原 `AC-01`–`AC-20` 无回归。
- 实现 Agent 提交一份逐场景证据表，列出 D1、R2、API、UI 和测试文件。
- 独立验收 Agent 不依赖实现总结，能够从仓库和命令结果复现结论。

## 9. 最终验收证据（2026-07-29）

| 场景 | D1 断言 | R2 断言 | API/UI 断言 | 主要测试 |
|---|---|---|---|---|
| 同版本、同时间 PATCH | 仅赢家完整聚合提交，失败者零副作用，token 清空 | 旧资源删除、赢家/输家资源状态正确 | 一个 200、一个 409，后续合法更新成功 | `tests/workers/admin-resource-lifecycle.spec.ts` |
| batch 中途失败 | groups/version/tags/join_methods/notes/ref_count 全回滚 | 原对象保留 | 安全 500 | `tests/workers/admin-resource-lifecycle.spec.ts` |
| staged/ready 生命周期 | adoption 与真实引用数一致；归零删除；pending/failed 可重试 | 上传、保留、删除和重试均检查对象 | purge 200/409、cleanup 实际成功计数 | `tests/workers/admin-resource-lifecycle.spec.ts`、`tests/workers/admin-assets.spec.ts` |
| 永久删除 | 共享引用减一；独占 asset 与群组在最终 batch 删除；D1 失败保留 tombstone | 独占对象删除；R2 失败后可重试 | 成功 200，依赖失败 502 | `tests/workers/admin-resource-lifecycle.spec.ts` |
| 搜索与排序分页 | 标题/简介/标签字面 LIKE；标签空分区置后；尾页无假 cursor | 不适用 | 中文与 `%` 搜索、跨页无重复遗漏 | `tests/workers/groups.spec.ts`、`tests/workers/admin-groups.spec.ts` |
| 管理员已有二维码 | ready asset 和引用不变 | 对象存在 | DTO URL → 草稿 → 抽屉远端预览 | `AdminGroupDrawer.spec.ts`、`admin-qr.spec.ts` |
| 上传并公开查看二维码 | staged → ready，ref_count=1；afterEach 软删/永久删除清数据 | 测试 R2 对象创建并最终清理 | 上传、保存、主页二维码对话框图片可见 | `admin-qr.spec.ts`（桌面 + 移动） |
| 抽屉交互 | staged 替换/取消只 purge 本会话资源 | purge 请求精确一次 | footer 保存提交一次；dirty 导航两种决策；移动宽度等于视口 | `AdminGroupDrawer.spec.ts`、`admin-qr.spec.ts` |

最终门禁：

| 命令 | 结果 |
|---|---|
| `pnpm format:check` | 通过 |
| `pnpm lint` | 通过，0 errors / 0 warnings |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 72/72 |
| `pnpm test:workers` | 61/61 |
| `pnpm test:e2e` | 4/4（桌面 2 + 移动 2） |
| `pnpm build` | 通过 |
| `git diff --check` | 通过 |

自动化测试全部使用 `wrangler.test.jsonc` 的本地 D1/R2；未连接用户个人浏览器，
未写入远端 `lgqh-dev`。
