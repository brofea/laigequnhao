# 优化 GitHub Action CI：修复 format:check 并加速 Playwright

## Goal

修复首次 CI 中唯一失败的 `pnpm format:check`（LF 环境下 12 个文件真实格式问题），并优化 Playwright E2E 的 CI 运行效率：3 分片（每分片独立 runner/API/DB，分片内 `workers: 1`）、HTML 报告 artifact、首轮运行数据观测（含浏览器缓存去留的实测决策）。并行仅来自 3 个独立分片，**不启用分片内多 worker**。

## Background（证据，2026-08-06）

- 首次 CI 结果：仅 `pnpm format:check` 失败，其余 6 条门禁全过（含 e2e 全绿，`image-webkit:165` 偶发项未在 Linux 复现）。
- format:check 失败复现：`git -c core.autocrlf=false archive HEAD` 导出纯 LF 副本后 `prettier --check .` 报 12 个文件 warn：
  `functions/_lib/routes/submissions.ts`、`functions/_lib/services/submission-service.ts`、`README.md`、`shared/contracts/group.spec.ts`、`shared/contracts/submission.spec.ts`、`shared/domain/index.ts`、`site.config.ts`、`src/components/VisualShell.vue`、`src/features/groups/composables/useLikedGroups.ts`、`src/features/theme/dom.ts`、`tests/e2e/a11y-flows.spec.ts`（本任务上一轮引入，长行超 printWidth 100）、`tests/workers/submissions.spec.ts`。
- 本地 Windows 因 `core.autocrlf=true` + 无 .gitattributes，format:check 全量 CRLF 假阳性，长期掩盖上述真实问题。
- Playwright 现状：`workers: 1`、`fullyParallel: false`、`reporter: "line"`、CI retries=2；workflow e2e job 已有 ms-playwright 缓存步骤（旧 key 设计，本任务统一为新标准）、`--with-deps` 每次重装系统依赖、无分片、无 HTML 报告。
- 关键约束：e2e 各 spec 文件共享同一 API Worker 与持久化 D1（`workers:1` 串行即为此设计），**文件内/文件间并行会破坏状态隔离**；加速必须走「分片」（每个分片独立 runner + 独立 webServer + 独立 .e2e-state）。

## Requirements

- R1：修复 format:check——对上述 12 个文件执行 `prettier --write`（只修这 12 个，禁止全仓 --write 以免行尾巨变），LF 复现环境验证 `prettier --check .` 全绿。
- R2：workflow e2e job 改造：
  - 分片：matrix `shard: [1, 2, 3]`（数字分片），运行时拼接 `--shard=${{ matrix.shard }}/3`；每个分片运行于**独立 runner**，独立初始化本地 API 与测试数据库（webServer + `.e2e-state` 各自独立）；
  - **workers 固定为 1**（用户决策：共享 DB 约束下不启用分片内多 worker，三路并行完全来自 runner 分片）；
  - reporter 切换为 HTML + JSON（CI 时 `line + html + json`，JSON 输出到文件供机器解析），HTML 报告作为 artifact 上传；
  - `--with-deps` 保持（浏览器缓存不含 Linux 系统依赖，必须保留）；
  - 浏览器缓存**审慎处理**（用户要求，不默认缓存更快）：各分片只是分别恢复同一缓存副本，**首次无缓存时三个并发分片可能全部 miss、各自完整下载，只有后续 workflow 才会命中**；缓存 key 统一为 `runner.os + Playwright 实际版本 + 浏览器集合`，**不使用宽泛 restore-keys**（避免跨版本恢复旧缓存）；是否保留缓存**以首轮/次轮实测对比为准**（直接下载 vs 缓存恢复的耗时/空间/稳定性），**不增加未经测量的串行准备 job**。
- R3：**首轮运行观测**（用户要求，据数据后续决策）：
  - 分别记录：**缓存恢复耗时**、**浏览器安装耗时**、**浏览器准备总耗时**、**安装后缓存体积**（`du -sh`）、测试数量、测试时长；
  - 机器解析**不依赖 line reporter 文本**：优先使用 playwright JSON reporter 输出文件（`results-<shard>.json`，含 expected/unexpected/skipped/duration 等结构化数据）；
  - 汇总步骤（`$GITHUB_STEP_SUMMARY`）、分片日志、报告上传步骤均 `if: always()`；
  - 环境准备时长由各步骤耗时观测（GitHub UI 天然展示）；
  - 首轮 CI 后汇总数据，决定：缓存去留、分片数、worker 数量等后续调整。

## Out of Scope

- 不重构测试的 DB 隔离（如 per-test 独立 D1）——那是消除串行约束的长期方案，另开任务。
- 不修改测试断言；不调整浏览器矩阵。
- 不优化 webServer 启动本身（迁移+dev 启动为既有基础设施）。

## Acceptance Criteria

- [ ] AC1：LF 复现环境 `prettier --check .` 全绿；CI format:check 预期通过。
- [ ] AC2：workflow e2e job 使用 3 个数字分片（matrix `[1,2,3]`，独立 runner），运行时 `--shard=N/3`，每分片独立初始化 API 与测试数据库，互不共享状态。
- [ ] AC3：e2e `workers: 1` 保持不变（不启用分片内多 worker）；并行仅来自 3 个 runner 分片。
- [ ] AC4：HTML 报告生成并作为 artifact 上传（命名 `playwright-report-<N>-of-3`，`if: always()`，不互相覆盖）。
- [ ] AC5：actionlint + `prettier --check .github` 通过。
- [ ] AC6：本地 e2e 全量（5 project）保持通过，不受本次配置改动影响。
- [ ] AC7：e2e job 输出首轮观测数据：缓存恢复耗时、浏览器安装耗时、浏览器准备总耗时、安装后缓存体积、测试数量与时长（JSON 结构化输出）；汇总/日志/报告上传步骤均 `if: always()`。
- [ ] AC8：缓存 key = `runner.os + Playwright 实际版本 + 浏览器集合`，无宽泛 restore-keys；`--with-deps` 保留；未增加串行准备 job。
- [ ] AC9：实施验证补齐全部本地门禁：`pnpm lint`、`pnpm format:check`（LF 复现）、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm test:workers`；并执行 `pnpm exec playwright test --list --shard=N/3`（N=1,2,3）确认三个分片均非空。

## Key Decisions

- 分片数 N=3，matrix 用数字分片 `[1,2,3]`（用户确认，2026-08-06）。
- 报告形态：分片独立 HTML artifact（`playwright-report-<N>-of-3`），不做 merge job（用户确认）。
- **workers 固定 1**（用户决策，2026-08-06）：共享 DB 约束下不启用分片内多 worker，并行完全来自 3 个 runner 分片；替代此前的 50% 方案。
- 首轮运行做数据观测（用户决策）：缓存恢复耗时/安装耗时/总耗时/体积、测试数、测试时长，据数据再调参。
- **浏览器缓存去留 = 待测量决策**（用户要求）：不默认缓存更快；首轮（直接下载，三片可能全 miss）/次轮（缓存恢复）对比耗时、空间、稳定性后决定；key = runner.os + Playwright 实际版本 + 浏览器集合，无宽泛 restore-keys；不增加串行准备 job。
- format:check 修复方式：仅对 12 个文件 `prettier --write`，禁止全仓 --write。
- 测试语义不变：不开启 fullyParallel、不改断言、不调整浏览器矩阵。
- **Windows 行尾长期治理（记录不执行）**：评估新增 `.gitattributes` 强制 LF（`* text=auto eol=lf`），消除本地 CRLF 假阳性；但**本任务不得顺带全仓 renormalize 或制造无关行尾 diff**，治理方案另开任务评估执行。
