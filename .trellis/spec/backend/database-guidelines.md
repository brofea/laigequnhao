# D1 数据库规范

## 方案

通过有类型约束的 repository 模块直接使用 Cloudflare D1。MVP 不使用 ORM。所有值都通过预处理语句绑定；禁止把值插值到 SQL 中。

Repository 在单一边界把 `unknown` D1 行映射为内部类型。Service 和路由不得读取无类型约束的行属性。

## 初始数据表

| 表 | 职责 |
|---|---|
| `groups` | 内容、性质、平台、状态、Logo 资源、轮换 key、计数、版本、软删除状态和永久清理进度 |
| `group_tags` | 有顺序且已归一化的标签 |
| `join_methods` | 有顺序的群号、URL 或二维码资源加群方式 |
| `submission_details` | 仅管理员可见的联系方式和审核备注 |
| `assets` | R2 key、用途、尺寸、字节数、状态、引用计数和可重试清理元数据 |
| `likes` | 群聊与投票者 hash 的唯一关系 |
| `rate_limits` | 必要时使用的服务端过期计数器 |
| `boards` | 管理员可配置的板块及其公开启用、顺序和排序模式 |
| `board_groups` | 板块与群组的多对多成员关系及人工位置 |

外部标识符使用 `crypto.randomUUID()` 生成的 TEXT UUID。时间戳统一使用 UTC 整数毫秒或 ISO 字符串；应用使用 `Asia/Shanghai` 计算排名时间窗。

`groups.status` 只能是 `pending`、`published`、`rejected`、`delisted`。软删除使用 `deleted_at` 且不修改 `status`，因此恢复时清除删除字段。每次管理员编辑都递增 `version`。

永久清理只允许作用于软删除记录。`groups.purge_state` 使用 `none`、`pending`、`r2_done` 三种值，并配合 `purge_started_at`、`purge_attempts` 和安全的 `purge_last_error_code` 保存可重试进度。最终 D1 关联行全部删除后，不再保留操作记录；如果删除 D1 失败，`r2_done` 行必须能够继续重试。

## 不变量与索引

- 已发布群聊至少有一种当前阶段允许公开使用的加群方式。二维码始终公开，单独的 `qr_code` 满足此不变量；`delisted` 仅属于管理员业务状态，不进入公开查询。
- `likes` 包含 `UNIQUE(group_id, voter_hash)`。
- `groups.like_count` 是缓存投影，与点赞行在同一 D1 batch 中更新。
- 持久化前，根据应用配置校验平台和性质。
- 资源记录引用不可变的 R2 key。
- 为公开可见性/轮换、发布时间发现、板块位置/成员、管理员状态/删除/永久清理、标签查询、提交时间和限流过期时间建立索引。
- 显式启用并声明外键。

写入和查询时统一对搜索文本执行 trim、Unicode 宽度/兼容性和拉丁字母大小写归一化。在 1,000 个群聊的基准下，对维护好的可搜索投影使用 D1 `LIKE` 即可。没有测量证明需要之前，不要引入 FTS 或外部搜索服务。

## 事务与多资源操作

以下相关 SQL 写入使用 D1 batch/transaction 语义：

- 群聊、标签和加群方式；
- 点赞行和缓存计数；
- 软删除元数据；
- 审核状态和私有提交信息更新。

D1 和 R2 无法共享事务。替换资源时，先写入新对象，再写入 D1，最后移除未被引用的旧对象。永久删除时，先把软删除记录标为 `pending`，确认资源没有被其他记录引用后移除相应 R2 对象，再将状态写为 `r2_done`，最后以 D1 batch 删除关联行和群聊行。任何失败都必须保留可重试状态并让管理员可见；重试必须把"对象已经不存在"视为 R2 清理成功。

### D1 batch 原子聚合更新模式（Mutation Token）

D1 batch 按顺序执行所有语句，不会因首条 UPDATE 影响 0 行而跳过后续语句。因此版本冲突时，后续 DELETE/INSERT 仍会执行，必须通过守卫条件阻止副作用。

**模式**：

```
1. 生成 mutation_token = crypto.randomUUID()
2. 构建单一 batch:
   a. UPDATE groups SET ..., version = version + 1, mutation_token = <token>
      WHERE id = ? AND version = ?
   b. DELETE FROM group_tags WHERE group_id = ?
      AND EXISTS (SELECT 1 FROM groups WHERE id = ? AND mutation_token = <token>)
   c. INSERT INTO group_tags (...) SELECT ... WHERE EXISTS (... mutation_token = <token>)
   d. 同理处理 join_methods, submission_details, assets
   e. UPDATE groups SET mutation_token = NULL WHERE id = ?
3. 执行 db.batch(batch)
4. results[0].meta.changes === 0 → VERSION_CONFLICT（EXISTS 守卫零副作用）
   results[0].meta.changes > 0 → 写入成功，所有关联操作已通过守卫执行
```

**关键约束**：
- mutation_token 不进入任何公开或管理员 DTO。
- `results[0].meta.changes` 在本地 miniflare 和远端 D1 均可靠反映 UPDATE 影响行数。
- 禁止使用 `updated_at` 或 `version` 推断写入是否成功（不具备唯一性）。
- 禁止 batch 后 SELECT 补偿判断。

## Asset 生命周期

`assets.status` 状态机：

```
D1 staged 登记 → R2 upload → staged → (群组聚合保存) → ready
R2 upload 失败 → delete_failed
ready → (群组聚合移除最后引用) → delete_pending
delete_pending → (R2 删除成功) → D1 行移除
delete_pending → (R2 删除失败) → delete_failed
delete_pending/delete_failed → (人工 cleanup 重试) → D1 行移除 / 保留可重试状态
```

### 状态说明

| 状态 | 含义 | ref_count | R2 对象 |
|---|---|---|---|
| `staged` | 上传完成，等待群聊保存确认 | 0 | 已存在 |
| `ready` | 群聊保存成功，正常引用中 | ≥1 | 已存在 |
| `delete_pending` | 引用归零，等待异步清理 | 0 | 待删除 |
| `delete_failed` | R2 删除失败，等待重试 | 0 | 可能存在 |

### 引用计数规则

- `join_methods.asset_id` 指向 `assets` 表示一次引用。
- 多个 `join_methods` 可以引用同一 asset（ref_count > 1）。
- staged → ready、ready 复用和引用释放只能作为群组 create/update 的同一个 D1 batch
  一部分执行；禁止保留独立 adopt/addRef/release HTTP 旁路。
- 聚合保存预校验后，另一个聚合可能已把同一 staged asset 变为 ready。adoption 更新必须
  对 staged/ready 都增加一次引用，并让 QR `join_methods` INSERT 在 asset 已变为不可引用
  状态时通过 FK 失败使整个 batch 回滚。
- 直接 asset DELETE 只允许 purge 未引用 staged 资源；ready 引用必须通过保存所属群组
  聚合来改变。
- `deleteIfUnreferenced()` 删除 R2 前同时检查缓存 `ref_count` 和
  `join_methods.asset_id` 的实际引用；缓存计数不能单独作为误删保护。
- 永久删除群组时，在删除 `join_methods` 的同一 D1 batch 内释放仍由其他群组共享的
  ready asset 引用。独占资源由 R2 清理状态机处理，不能把共享资源的 `ref_count`
  留在删除前的值。
- 独占资源的 D1 asset 行必须在删除 `join_methods` 和群组的最终 batch 中一起删除；
  禁止先删除群组，再在路由里吞错式清孤儿。最终 batch 失败时保留 `r2_done` 群组
  tombstone，下一次永久删除调用必须能继续。

### R2/D1 补偿策略

- **上传**：先写 D1 staged 行，再写 R2。D1 首写失败时不得调用 R2；R2 上传失败时把
  D1 行标为 `delete_failed`，若状态更新也失败则保留 staged 行供超时扫描，禁止产生
  没有 D1 记录的 R2 孤儿。
- **删除**：先删 R2，再删 D1 行。R2 对象不存在视为成功（幂等）。
- **检查 R2 存在性**：删除失败后通过 `r2.head()` 验证对象是否真的不存在。
- **失败保留**：`delete_attempts`、`delete_last_error`、`delete_last_error_code` 记录失败信息。
- **计数返回**：cleanup/retry 返回值只统计资源确实已删除的结果；服务返回 `false`
  或抛错都不能增加成功数。

### Staged 过期回收

- `cleanupStaged(olderThanMinutes)`：清理超过 N 分钟未被聚合保存采用的 staged asset。
- 人工 cleanup 同时重试 `delete_pending` 和 `delete_failed`；只扫描 failed 会让
  “R2 已删但 D1 最后一步失败”的 pending 行永久失去恢复入口。
- 先删 R2（尽力而为），再删 D1 行；任一失败均不阻塞其他清理。

## 数据库迁移（Migration）

- 有序 SQL 存放在 `migrations/`。
- 禁止修改已应用的 migration。
- 应用到生产环境之前，先在本地和隔离的预览数据库执行 migration。
- 破坏性 migration 必须先导出/备份，并制定补偿性回滚 migration 方案。
- Migration 测试从空数据库开始，并覆盖从有代表性的旧 schema 升级。
- Seed 数据与 migration 分开，且绝不包含 Secret。

## 禁止做法

- 在公开投影中使用 `SELECT *`
- 根据请求输入动态生成表名或列名
- 存储原始 IP、密码、会话 token 或 Analytics token
- 在 D1 中存储图片 blob
- 每张群聊卡片产生 N+1 查询
- 没有不变量测试就假设缓存的 `like_count` 始终正确
- 本地测试访问生产 D1
