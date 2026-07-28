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

外部标识符使用 `crypto.randomUUID()` 生成的 TEXT UUID。时间戳统一使用 UTC 整数毫秒或 ISO 字符串；应用使用 `Asia/Shanghai` 计算排名时间窗。

`groups.status` 只能是 `pending`、`published`、`rejected`、`delisted`。软删除使用 `deleted_at` 且不修改 `status`，因此恢复时清除删除字段。每次管理员编辑都递增 `version`。

永久清理只允许作用于软删除记录。`groups.purge_state` 使用 `none`、`pending`、`r2_done` 三种值，并配合 `purge_started_at`、`purge_attempts` 和安全的 `purge_last_error_code` 保存可重试进度。最终 D1 关联行全部删除后，不再保留操作记录；如果删除 D1 失败，`r2_done` 行必须能够继续重试。

## 不变量与索引

- 已发布/已下架群聊至少有一种当前阶段允许公开使用的加群方式。二维码始终公开，单独的 `qr_code` 满足此不变量。
- `likes` 包含 `UNIQUE(group_id, voter_hash)`。
- `groups.like_count` 是缓存投影，与点赞行在同一 D1 batch 中更新。
- 持久化前，根据应用配置校验平台和性质。
- 资源记录引用不可变的 R2 key。
- 为公开可见性/轮换、管理员状态/删除/永久清理、标签查询、提交时间和限流过期时间建立索引。
- 显式启用并声明外键。

写入和查询时统一对搜索文本执行 trim、Unicode 宽度/兼容性和拉丁字母大小写归一化。在 1,000 个群聊的基准下，对维护好的可搜索投影使用 D1 `LIKE` 即可。没有测量证明需要之前，不要引入 FTS 或外部搜索服务。

## 事务与多资源操作

以下相关 SQL 写入使用 D1 batch/transaction 语义：

- 群聊、标签和加群方式；
- 点赞行和缓存计数；
- 软删除元数据；
- 审核状态和私有提交信息更新。

D1 和 R2 无法共享事务。替换资源时，先写入新对象，再写入 D1，最后移除未被引用的旧对象。永久删除时，先把软删除记录标为 `pending`，确认资源没有被其他记录引用后移除相应 R2 对象，再将状态写为 `r2_done`，最后以 D1 batch 删除关联行和群聊行。任何失败都必须保留可重试状态并让管理员可见；重试必须把\u201C对象已经不存在\u201D视为 R2 清理成功。

## Asset 生命周期

`assets.status` 状态机：

```
upload → staged → (adopt) → ready → (release, ref_count → 0) → delete_pending
                                                    delete_pending → (R2 删除成功) → D1 行移除
                                                    delete_pending → (R2 删除失败) → delete_failed
                                                    delete_failed → (retry) → D1 行移除 / 继续 delete_failed
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
- `adopt()`：staged → ready，ref_count +1。
- `addRef()`：直接对 ready asset 增加引用（复用已有 asset 时）。
- `release()`：ref_count -1；归零时标记 `delete_pending` 并触发异步清理。
- 异步清理使用 `deleteIfUnreferenced()`：再次检查 ref_count=0 后才删除 R2 + D1。

### R2/D1 补偿策略

- **上传**：先写 R2，再写 D1 staged 行。D1 失败则回删 R2 对象。
- **删除**：先删 R2，再删 D1 行。R2 对象不存在视为成功（幂等）。
- **检查 R2 存在性**：删除失败后通过 `r2.head()` 验证对象是否真的不存在。
- **失败保留**：`delete_attempts`、`delete_last_error`、`delete_last_error_code` 记录失败信息。

### Staged 过期回收

- `cleanupStaged(olderThanMinutes)`：清理超过 N 分钟未被 adopt 的 staged asset。
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
- 存储原始 IP、密码、会话 token、Turnstile token 或 Analytics token
- 在 D1 中存储图片 blob
- 每张群聊卡片产生 N+1 查询
- 没有不变量测试就假设缓存的 `like_count` 始终正确
- 本地测试访问生产 D1
