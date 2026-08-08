# CI 约定

## 目的

把仓库全部质量门禁接入 GitHub Actions 自动化流水线，保证任何合并到 `main` 的改动都必须先通过完整测试。本文档记录触发条件、工作流结构、测试纳入边界、CI 与本地环境的差异，以及新增测试时的接入约定。

## 触发条件

- `push`：`main` 分支推送时触发，**只运行 `e2e-browser-cache`（浏览器缓存 seed，browser matrix）**，全量检查全部跳过。
- `pull_request`：目标分支为 `main` 时自动触发，运行全量检查；不运行 seed。
- `workflow_dispatch`：任意分支可手动触发（由 GitHub UI 选择分支），运行全量检查（手动全量检查语义），**不创建任何 `pr-*` fallback 缓存**。

## 工作流结构

文件：`.github/workflows/ci.yml`；公共环境准备：`.github/actions/setup-pnpm/action.yml`（composite action，供全部 job 复用）。

| job | 命令 | 超时 |
|---|---|---|
| `quality` | `pnpm lint` → `pnpm format:check` → `pnpm typecheck` → Trellis 任务归档检查 | 15 min |
| `unit` | `pnpm test` | 15 min |
| `workers` | `pnpm test:workers` | 15 min |
| `build` | `pnpm build` | 15 min |
| `e2e-browser-cache` | push-main-only seed：browser matrix（chromium/webkit/firefox 并行），restore → miss 时 `playwright install <browser>` → save 对应 main key；无 `--with-deps`、无 `install-deps` | 15 min |
| `e2e` | 两个 job 按测试内容分片：`e2e-main`（非图片 5 文件 × chromium 双 project，matrix `[1,2,3]`，`--shard=N/3`）+ `e2e-image`（image-flows 按 project 维度，matrix 三 image project，`--project=<p>`） | 30 min |

- `quality`/`unit`/`workers`/`build` 相互独立、并行执行；6 个 E2E 执行单元与它们**完全并行，无 `needs` 依赖**。任一 step 失败即该 job 失败，合并检查整体失败。
- concurrency 按 `github.ref` 分组并 `cancel-in-progress`，避免同一分支重复推送排队浪费。
- **E2E 分片（按内容）**：首轮实测（2026-08-06）发现 `--shard` 按 spec 文件切分使 image-flows 整组失衡（44s / 78s / 210s），故拆为两个 job：`e2e-main`（轻量文件 3 分片）与 `e2e-image`（重操作 image-flows 按浏览器 project 拆 3 个并行 job）。所有执行单元运行于独立 runner，各自初始化独立 webServer 与 `.e2e-state`（API/D1/R2 状态天然隔离）；`fail-fast: false`；**`workers: 1` 固定不变**——测试共享同一 API DB，分片内多 worker 会破坏状态隔离，并行完全来自 runner 分片。
- **报告与 artifact**：CI reporter 为 `line + html + json`（JSON 输出 `playwright-report/results.json` 供机器解析，不依赖 line 文本）；HTML 报告、分片日志、E2E Worker 生命周期与 Wrangler 诊断日志、汇总（`$GITHUB_STEP_SUMMARY`）上传均 `if: always()`，artifact 命名 `playwright-report-main-<N>-of-3` / `playwright-report-image-<project>`（名称不含 `/`），保留 7 天；失败时另传 `test-results-main-<N>-of-3` / `test-results-image-<project>`。
- action 版本必须固定到 major 标签（`@v4` 等），升级需单独提交并说明。

## 浏览器缓存约定

- **缓存粒度 = 浏览器粒度**：key 格式为 `ms-playwright-{main|pr}-${{ runner.os }}-<@playwright/test 实际版本>-{chromium|webkit|firefox}`（版本由步骤读取 package.json 输出），**不使用宽泛 restore-keys**，避免跨 Playwright 版本恢复不兼容浏览器。
  - main key（3 个）：`ms-playwright-main-<os>-<version>-<browser>`，长期、权威共享缓存，由 push main 的 seed matrix 建立/刷新；
  - PR key（3 个）：`ms-playwright-pr-<os>-<version>-<browser>`，当前 PR 的 bootstrap / fallback 缓存。
- **key 与内容一一对应**：GitHub Actions 缓存是 immutable，同一 key 并发 save 先到先得、不可合并；若多个浏览器共用同一 key，先成功写入的内容可能只含部分浏览器且无法补充。因此每个缓存条目只含对应浏览器二进制（+ ffmpeg，Playwright 随任一浏览器附带安装，体积小），每个 job 也只恢复自己浏览器对应的 key，不恢复三浏览器全集（单浏览器约 160MB，全集约 490MB）。
- **缓存按分支/PR 合并 ref 作用域隔离**：`pull_request` 运行只能读本 PR（`refs/pull/N/merge`）与基础分支（main）的缓存，读不到其他分支保存的同 key 缓存。每个 PR 的首次运行在 main 无缓存时必然 miss。
- **main 常驻策略（2026-08-07 决策）**：push main 时由 `e2e-browser-cache`（browser matrix，chromium/webkit/firefox 三个实例并行）负责建立/刷新 main key；实例只装自己的浏览器、只 save 自己的 main key，无并发竞争。实测：正常 runner 单浏览器安装约 40s，缓存恢复约 5s。
- **PR fallback 缓存指定唯一 writer**：
  - `ms-playwright-pr-*-chromium` → 仅 `e2e-main` shard 1 保存（shard 2/3、image-chromium 只 restore）；
  - `ms-playwright-pr-*-webkit` → 仅 `e2e-image`（image-webkit）保存；
  - `ms-playwright-pr-*-firefox` → 仅 `e2e-image`（image-firefox）保存。
  - save 紧跟 install 步骤之后、跑测试之前：浏览器成功下载安装即保存，不依赖测试最终是否通过；save 仅在"本次为全新安装"（main key 与 PR key 均 miss）时执行，天然规避 `actions/cache/save` 对已存在 key 报错。
- **浏览器二进制与系统依赖职责分离**（2026-08-07 最终决策）：
  - **browser binary download**：仅当本浏览器 main key 与 PR key 均 miss 时执行 `playwright install <browser>`（纯下载，无 `--with-deps`）；cache hit 后下载 0 次；
  - **system dependency install/check**：每个 E2E runner 无条件执行 `playwright install-deps <browser>`（apt 包不属于缓存，每台 runner 必须独立准备；实测曾出现 apt 停滞 9 分钟，属 runner 环境波动，不因缓存命中而免除）。
- **事件语义差异**：
  - `pull_request`：main key → miss 后 PR key → 再 miss 才下载 → writer 保存 PR key；
  - `workflow_dispatch`：只尝试恢复 main key，miss 时正常下载保证测试可跑，**不 restore 也不创建 `pr-*` 缓存**；
  - `push main`：仅 seed matrix，建立/刷新 main key。
- **Bootstrap 语义**：首次迁移 PR（main 无缓存）双 key 全 miss 属正常路径，自行安装、writer 保存 PR key 后同 PR 后续 run 命中；合并后 push main 建立 main key，之后新 PR 直接命中。cache miss 永远是正常降级路径，不得导致 CI 失败。
- 每分片在 STEP_SUMMARY 输出：main-cache-hit、pr-cache-hit（跳过时为 n/a）、缓存恢复耗时、浏览器准备耗时（install-deps + install + save）、浏览器体积、JSON 解析的测试数与时长。

## Trellis 任务归档检查

- **规则**：`.trellis/tasks/` 下除 `archive/` 外不得存在其他一级目录；Trellis 任务必须归档后才能提交至仓库。
- 由 CI `quality` job 的 `Check Trellis tasks are archived` 步骤强制：`find .trellis/tasks -mindepth 1 -maxdepth 1 -type d ! -name archive` 非空即失败（`::error::` + 非零退出）。`.trellis/tasks/` 不存在时不误报。
- **本地约定**：进行中任务目录处于 untracked 状态，不得 `git add .trellis/tasks/`；任务完成必须经 `task.py archive` 归档（自动移动至 `archive/` 并产生 `chore(task)` 提交）后才允许随 PR 进入仓库。
- 该检查在 `push main` 时不运行（quality job 仅 PR/dispatch 触发），main 的结构已由 PR 检查把关。

## 门禁命令（7 条，必须全量运行）

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

对应 `.trellis/spec/guides/testing-strategy.md` 的「必须运行的命令」。新增命令必须同步更新两处（spec 与工作流）。

## 测试纳入范围与隔离记录

CI 覆盖全部 41 个门禁测试文件：vitest（`src/**`、`shared/**`）、Workers vitest（`tests/workers/**`）、Playwright（`tests/e2e/**`），由各自的配置文件自动发现，无需在 workflow 中逐文件列出。

以下测试与脚本**不纳入** CI，按测试策略的隔离条款记录：

| 排除项 | 负责人 | 原因 | 解除条件 |
|---|---|---|---|
| `prototype/` 独立测试（vitest + playwright） | brofea | 历史视觉原型目录，未接入 package.json 脚本；其 vitest 当前 2 例失败，playwright 依赖系统 Chrome channel | 用例修复并接入 package.json 脚本后重新评估 |
| `scripts/seed-local.test.mjs`（node:test） | brofea | 开发 seed 脚本时的辅助测试（"测试的测试"），非产品门禁 | 需要时接入 `node --test` 脚本并纳入 CI |
| `pnpm cloudflare:check` | brofea | 检查/创建远程生产资源，需要 Cloudflare 账号认证，非测试 | 引入带 Secret 的独立部署流水线时评估 |
| `pnpm db:test:migrate\|reset\|unlock` | brofea | Workers 测试 DB 的本地调试辅助；自动化套件使用隔离内存存储 + `TEST_MIGRATIONS` / `start-e2e-api.mjs` 自带迁移 | 无需解除 |

## `tests/e2e/.dev.vars` 生成与同步

- 该文件被 `.gitignore` 忽略（`.dev.vars` 规则），`scripts/start-e2e-api.mjs` 以 `--env-file tests/e2e/.dev.vars` 启动 E2E API，缺失即启动失败。
- CI 由 workflow 的 heredoc 步骤生成，内容与本地文件保持一致（固定 `test-*` 值，**不含** `R2_PUBLIC_BASE_URL`）。
- `R2_PUBLIC_BASE_URL` 为空时 `r2-adapter` 回退同源 `/api/v1/assets`（worker 公开服务），E2E 依赖该回退；**不要**在 E2E 环境恢复 `assets.*.invalid` 之类的不可解析域名（保留 TLD 任何机器都无法解析，会导致图片断言全挂）。
- 本地新增必填变量时，必须同步更新 workflow heredoc；否则 CI 会在启动阶段失败并指向本文件。

## 已知环境差异与 E2E 诊断

以下问题中，除 E2E 生命周期诊断外，仅出现在 Windows 本地开发机；不得为此修改产品代码或测试：

1. **E2E API 生命周期诊断**：`scripts/start-e2e-api.mjs` 会在每次运行前重建 `.e2e-state` 和 `.e2e-runtime-logs`，并将 Wrangler stdout/stderr、`WRANGLER_LOG_PATH` 诊断日志与 `lifecycle.jsonl` 保留在后者。Worker 非受控退出会以非零状态结束并指出日志目录；Playwright 正常清理所转发的 `SIGINT`/`SIGTERM` 才视为正常停止。CI 的 E2E report artifact 始终包含该目录，摘要以 `worker-lifecycle-failure` 区分基础设施退出、以 `test-failure` 区分断言失败，并将缺失 JSON 报告标为 `report-missing`。不得以增加重试掩盖 `socket hang up` 或 `ECONNREFUSED`，应先读取此目录定位根因。
2. **`.e2e-state` 清空失败**：Windows 文件锁导致 `start-e2e-api.mjs` 的 `rmSync` 无法删除 sqlite 文件，跨轮次数据累积污染断言（如板块/群组重复）。处理：先 `Stop-Process` 杀净 `laigequnhao` 相关 node 进程再删除。
3. **`pnpm format:check` 本地假阳性**：`core.autocrlf=true` 且仓库无 `.gitattributes`，工作区文件为 CRLF，Prettier（`endOfLine: lf`）全部报错；CI 检出为 LF，不受影响。**长期治理（未执行）**：评估新增 `.gitattributes` 强制 LF（`* text=auto eol=lf`）根治假阳性；该治理会触发全仓 renormalize，须另开任务单独评估，不得顺带制造无关行尾 diff。
4. **`pnpm build` 脚本本体**：`scripts/build.mjs` 的 `spawn("pnpm")` 在 Windows 因 pnpm 是 shim 报 `ENOENT`；其组成命令（vue-tsc + vite build）本地已验证通过，CI 为 Linux 无此问题。
5. **`image-webkit:165` 保存点击超时（已修复，2026-08-06）**：CI 上稳定复现（retry 3 次全挂），二分定位根因为**逐元素 `expect()` 循环**（16384 次/个 × 2 个循环）的海量断言开销阻塞 Node 主线程，使后续 CDP 操作（click/expect/waitForTimeout）在 WebKit 下 30s 超时。修复：循环改批量断言（`every()` + 单次 expect）、`readImagePreview` 移除页面内 canvas（改 Node 侧 sharp 解码）、编辑表单 footer sticky。**约定**：e2e 断言禁止逐元素 `expect()` 大循环，必须一次批量断言；页面内 canvas 像素读取必须移到 Node 侧。

## 新增测试接入约定

- 新增测试文件必须落在既有三套配置的 include 范围内（`src/**`、`shared/**`、`tests/workers/**`、`tests/e2e/**`），进入 CI 无需改动 workflow。
- 测试文件必须有脚本归属，否则视为未接入门禁。
- 新测试默认全量纳入 CI；如需隔离，按测试策略条款记录负责人、原因与解除条件，并同步本文件的隔离表。
- 修改测试相关配置（playwright/workers 配置、`.dev.vars` 内容、浏览器矩阵）时，必须同步评估 workflow 是否需要变更（浏览器安装清单、heredoc、缓存 key 等）。
- 修改源码/测试文件后，必须用 LF 复现环境验证 prettier（`git -c core.autocrlf=false archive HEAD` 导出 + prettier `--check .`），本地 CRLF 假阳性不可作为 format 通过的依据。format:check 欠账已于 2026-08-06 修复 12 个文件。
