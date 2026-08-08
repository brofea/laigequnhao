# 群组性质文本化设计

## 架构边界与数据流

```text
site.config.ts (groupKinds)
  → siteConfigSchema 运行时校验
  → AdminEditForm 的 Select 选项（仅可选）
  → 管理创建/更新请求 kind 文本
  → shared group/submission Zod contracts
  → repository 预处理语句绑定
  → D1 groups.kind TEXT
  → 管理/公开 DTO
  → toDemoGroup 原样展示
```

配置仅控制浏览器表单候选项。共享契约是网络边界的唯一校验位置，校验文本性质的长度和非空性但不读取前端配置；这样已有数据、管理 API 与未来受信任调用方都不会被某次前端候选列表调整意外拒绝。repository 已使用参数绑定，因此不需为中文文本改变 SQL 写入方式。

## 共享契约与前端模型

- 将 `shared/domain/group.ts` 的 `groupKindSchema` 从 `z.enum` 改为文本 schema，并继续导出推导出的 `GroupKind`。
- 所有引用此 schema 的公开 DTO、管理员 DTO、创建、更新和投稿 schema 自动获得同一语义；相应测试覆盖中文自定义值与无效空/超长值。
- `SiteConfig` 增加显式 `groupKinds` 数组；其 schema 负责候选列表本身的非空、元素非空与去重检查。
- `DemoGroup.kind` 改为文本；`toDemoGroup` 直接传递 API 返回的 `group.kind`，移除 `official → 工具` 的显示转换。`AdminEditForm` 用 `siteConfig.groupKinds.map(...)` 构造 `Select` 选项，复用平台选项的现有模式。

## 数据库迁移

新增 `migrations/0005_group_kind_text.sql`，不改动已应用的 `0001`–`0004`。D1/ Wrangler 根据 `d1_migrations` 只执行未应用的文件，因此它满足三种部署状态：

| 数据库状态 | 执行行为 |
| --- | --- |
| 全新、没有 `groups` 表 | 按 `0001` 到 `0005` 顺序建表，`0005` 将初始旧约束表转换为目标表。 |
| 已有 `0001`–`0004` 结构 | 仅执行未记录的 `0005`，复制数据并重建目标表。 |
| 已有正确目标结构且 `0005` 已记录 | Wrangler 跳过 `0005`，不执行任何表或数据操作。 |

`0005` 的具体步骤：

1. 在 migration 中临时关闭外键约束，创建 `groups_new`，列集合与当前 `groups` 相同，但 `kind TEXT NOT NULL` 不包含旧枚举 `CHECK`；保留状态和清理状态等其它约束。
2. 使用显式列清单复制每行。`CASE kind WHEN 'official' THEN '官方' WHEN 'interest' THEN '兴趣' ELSE kind END` 在复制时执行旧值转换，未来异常文本则无损保留。
3. 删除旧 `groups`、重命名新表，并恢复所有当前 `groups` 索引（状态、轮换、软删除、清理、发布时间）。重新开启外键。

`group_tags`、`join_methods`、`submission_details`、`likes` 与 `board_groups` 的外键都继续指向交换后的 `groups` 表；migration 不复制或重写这些子表记录。迁移后必须验证 `PRAGMA foreign_key_check`（或等价的真实关联写入/读取）及已有板块关联。

部署脚本已经满足所需时序：`scripts/deploy.mjs` 在 `wrangler deploy` 前调用 `wrangler d1 migrations apply --remote`，且 migration 失败会中止部署。本任务将对此增加回归覆盖或文档级断言，但不改为 Worker 运行时迁移，也不在每次部署中按 `sqlite_master` 重新判定和重建已记录的 schema。

## 兼容性与回滚

- 升级一次性将旧英文枚举变为指定中文值；降级到旧 Worker 前必须先恢复兼容 schema/值，因此发布时先执行 migration 后部署使用新契约的 Worker，禁止回滚到仍假定英文枚举的版本。
- 若需恢复旧约束，使用新的补偿 migration 重建表并显式定义中文值如何折回旧枚举；不得修改或撤销 `0005`。
- `kind` 的排序不再使用 `official` 优先逻辑，改为稳定的 `COLLATE NOCASE` 文本排序并保留 `id` 次排序，避免任意中文值落入同一默认分支。

## 测试设计

- 配置单元测试：接受默认/自定义候选，拒绝空列表、空项与重复项。
- 共享契约测试：接受中文自定义性质，拒绝空/超长值；更新 DTO、创建和投稿均覆盖。
- 组件/适配测试：性质 Select 来自 `siteConfig.groupKinds`，`toDemoGroup` 原样投影性质。
- Worker 路由测试：管理员创建/更新与公开投稿可保存并返回新的中文性质。
- migration 测试：覆盖空库完整建表、先应用 `0001`–`0004` 后插入带 `official`、`interest` 及关联数据的旧记录再升级、以及已升级数据库重复 apply 不变；断言值映射、全部列/关联和新的中文任意值写入。
