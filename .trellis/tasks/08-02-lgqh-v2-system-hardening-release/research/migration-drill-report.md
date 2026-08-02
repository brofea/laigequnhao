# T06 数据库迁移演练报告（阶段十一）

- 日期：2026-08-02
- 迁移：0001_initial → 0004_board_management（4 个）
- 环境：wrangler d1 本地（miniflare），独立 `--persist-to` 演练目录，全部可重置
- 证据：`evidence/stage11/*.txt`

## 1. 演练结果

| 演练 | 步骤 | 结果 | 证据 |
|---|---|---|---|
| 一：空库 | 空库执行 0001-0004 全量 | ✅ 4 迁移全部成功；boards 1 行（默认"自定板块"固定 UUID） | drill1-empty.txt + 查询 |
| 二：现有库 | 0001-0003 + 旧群组 1 条 → 升级 0004 | ✅ 旧群组保留（groups=1）；`last_published_at` 保持 NULL（null_last_pub=1）；boards 1（默认板块） | drill2-step1.txt + 查询 |
| 三：重复执行 | 对已迁移库再次执行 0004 | ⚠️ `--file` 直跑报 `duplicate column name: last_published_at`；失败后数据完整（groups=1/boards=1/members=0/NULL 保留） | 查询 |
| 四：中断恢复 | 中断点建到 boards 表、缺 board_groups → 补跑剩余 | ✅ 恢复后 boards/board_groups 完整、默认板块 1 个 | 查询 |
| 五：回滚闭环 | 备份（文件/WAL）→ 破坏（DELETE boards）→ 恢复 | ✅ 数据可恢复（WAL 模式下须完整备份主文件+wal+shm；生产用 D1 官方备份/导出） | 查询 |
| 六：新代码失败语义 | 旧库（无 boards 表）跑新代码 `/boards` | ✅ 返回 `INTERNAL_ERROR`（统一错误信封，无泄露、无假数据、无部分结果） | worker 日志 |

## 2. 关键结论

1. **正式路径幂等**：`wrangler d1 migrations apply` 走 `d1_migrations` 版本表，重复运行自动跳过 → 幂等 ✅。
2. **`--file` 直跑无版本保护**：重复执行 `ALTER TABLE` 会报 duplicate column；失败**无副作用**（不损坏既有数据），但要求 operator 不要用 `--file` 做例行迁移。
3. **默认板块幂等**：固定 UUID + `WHERE NOT EXISTS`，重复/中断恢复后仍 1 个 ✅。
4. **NULL 不回填**：`last_published_at` 初始 NULL，不推断 ✅（RPD §25.1）。
5. **回滚路径**：migration 无降级脚本（T04 移交 §6），回滚 = D1 备份恢复/导出导入；本演练证明备份-恢复闭环可行。
6. **失败语义**：新代码在未迁移库上以 `INTERNAL_ERROR` 明确失败，不会半返回或泄露 ✅。

## 3. 兼容窗口声明（runbook 输入）

- 旧代码（0003 时代）忽略新增 nullable 列/表：boards/board_groups 是新表，groups.last_published_at 为 nullable TEXT → 旧 SQL 不受影响 ✅（T04 设计即保证）。
- 发布顺序要求：**先迁移后发码**（或同批次先迁移），否则新代码查 boards 表失败（但失败干净，可回滚）。
- 迁移失败恢复：任一步失败仅影响该语句；修复后可重跑（CREATE TABLE IF NOT EXISTS 幂等；ALTER TABLE 若已应用会报错但无副作用，人工确认版本表后跳过）。
