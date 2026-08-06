# 技术设计：format:check 修复与 Playwright CI 加速

## format:check 修复

- 根因：12 个文件在 LF 下不满足 prettier（本地 CRLF 假阳性长期掩盖）。
- 修复：仅对这 12 个文件执行 `prettier --write`（**禁止** `prettier --write .` 全仓——工作区 CRLF 下会整仓重写行尾）。
- 验证：`git -c core.autocrlf=false archive` 导出 LF 副本 + prettier 二进制 `--check .` 全绿；`git diff` 审查仅含格式改动。
- 回归：格式化涉及产品源码（VisualShell.vue 等）与测试文件，需重跑 `pnpm lint`、`pnpm test` 确认无行为变化。
- **Windows 行尾长期治理（记录，本任务不执行）**：评估新增 `.gitattributes` 强制 LF（`* text=auto eol=lf`）以根治本地 CRLF 假阳性；该治理会触发全仓 renormalize，须另开任务单独评估执行，**本任务不得顺带 renormalize 或制造无关行尾 diff**。

## Playwright 配置调整（playwright.config.ts）

- `workers` **保持 1 不变**（用户决策）：共享 e2e API DB 约束下，分片内多 worker 会破坏状态隔离；三路并行完全来自 3 个独立 runner 分片，每个分片内部仍串行。分片之间互不共享 webServer / `.e2e-state` / D1。
- `reporter`：CI 时 `[["line"], ["html", { outputFolder: "playwright-report" }], ["json", { outputFile: "playwright-report/results-<shard>.json" }]]`，本地保持 `"line"`。JSON 输出供机器解析（expected/unexpected/skipped/duration），不依赖 line reporter 文本。

## 工作流改造（ci.yml e2e job）

- matrix 数字分片：`strategy.matrix.shard: [1, 2, 3]`，`fail-fast: false`；运行命令 `pnpm exec playwright test --shard=${{ matrix.shard }}/3`。
- 每分片独立 runner、独立 webServer（start-e2e-api + vite dev）、独立 `.e2e-state` → 状态天然隔离。
- HTML 报告 artifact：`playwright-report-${{ matrix.shard }}-of-3`（避免 `/` 进名称），`if: always()`。
- 分片日志与 JSON 结果一并上传（`if: always()`）。

## 浏览器缓存：审慎处理（不默认缓存更快）

**事实与约束**：
- 各分片运行于独立 runner，只是**分别恢复同一份缓存副本**，并非共享磁盘；**首次无缓存时三个并发分片可能全部 miss、各自完整下载，只有后续 workflow 才会命中**（不得假设同一轮内其他分片可命中）。
- actions/cache 恢复有固定开销（打包/传输/解压）与偶发失败/损坏风险；缓存体积（chromium+webkit+firefox）计入仓库缓存配额。
- 浏览器缓存**不含 Linux 系统依赖**（libnss3 等），`--with-deps` 必须无条件保留。
- **缓存 key 设计（唯一标准）**：`ms-playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}-chromium-webkit-firefox`，其中 version 由步骤读取 `@playwright/test` 实际版本（`node -p "require('./node_modules/@playwright/test/package.json').version"` 写入 GITHUB_OUTPUT）。**不使用宽泛 restore-keys**（防止跨版本恢复旧缓存）。

**决策流程（测量驱动）**：
1. 首轮 CI（无缓存）：3 分片各自直接下载 → 记录每分片安装耗时、下载是否成功；
2. 次轮 CI（缓存命中）：3 分片各自恢复缓存 → 记录恢复耗时、安装耗时、安装后缓存体积（`du -sh`）、恢复稳定性；
3. 对比两轮：恢复耗时 vs 直接下载耗时、体积成本、失败率；若直接下载更快或相当，则移除缓存步骤；否则保留并固化 key 设计。
4. **不增加串行准备 job**（如"预下载浏览器"前置 job）：未经测量不得引入串行链路。

## 首轮观测设计（用户要求）

| 数据 | 获取方式 |
|---|---|
| 测试数量 / 失败数 / 跳过数 / 时长 | playwright JSON reporter 输出文件（机器解析） |
| 浏览器缓存命中 | `actions/cache` step 的 `outputs.cache-hit` |
| 缓存恢复耗时 | 缓存 step 前后时间戳 |
| 浏览器安装耗时 | 安装 step 前后时间戳 |
| 浏览器准备总耗时 | 缓存 step 起点 → 安装 step 终点 |
| 安装后缓存体积 | 命中后 `du -sh ~/.cache/ms-playwright` |
| 环境准备时长 | GitHub Actions 各步骤耗时（UI 天然展示） |

落地：e2e job 中：
1. 运行步骤：`set -o pipefail; pnpm exec playwright test --shard=... 2>&1 | tee playwright-shard-<n>.log`（日志留档）；
2. 汇总步骤（`if: always()`）：用 node 解析 JSON 结果 + 各时间戳 + cache-hit + 体积，输出表格到 `$GITHUB_STEP_SUMMARY`；
3. 上传步骤（`if: always()`）：HTML 报告、分片日志、JSON 结果。

## 性能预期（待测假设，未经本项目验证）

- **假设**：3 分片并行后 e2e 总时长约为串行的 1/3 + 每分片固定启动成本（webServer 启动、浏览器准备）。
- **待测假设**：浏览器缓存命中后的安装耗时显著小于直接下载（实测前不下结论）；`--with-deps` 的 apt 开销（实测前不下结论）。
- 首轮运行后据观测数据决定：分片数、缓存去留、是否引入 per-test DB 隔离以换取分片内多 worker。

## 回滚

- workflow/配置改动：还原 ci.yml 与 playwright.config.ts 即可。
- 12 文件格式化：`git checkout` 还原（内容纯格式，无行为）。
- 不影响产品功能与测试语义。
