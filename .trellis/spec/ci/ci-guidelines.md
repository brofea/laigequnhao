# CI 约定

## 目的

把仓库全部质量门禁接入 GitHub Actions 自动化流水线，保证任何合并到 `main` 的改动都必须先通过完整测试。本文档记录触发条件、工作流结构、测试纳入边界、CI 与本地环境的差异，以及新增测试时的接入约定。

## 触发条件

- `pull_request`：目标分支为 `main` 时自动触发。
- `workflow_dispatch`：任意分支可手动触发（由 GitHub UI 选择分支）。

## 工作流结构

文件：`.github/workflows/ci.yml`；公共环境准备：`.github/actions/setup-pnpm/action.yml`（composite action，供全部 job 复用）。

| job | 命令 | 超时 |
|---|---|---|
| `quality` | `pnpm lint` → `pnpm format:check` → `pnpm typecheck` | 15 min |
| `unit` | `pnpm test` | 15 min |
| `workers` | `pnpm test:workers` | 15 min |
| `build` | `pnpm build` | 15 min |
| `e2e` | 两个 job 按测试内容分片：`e2e-main`（非图片 5 文件 × chromium 双 project，matrix `[1,2,3]`，`--shard=N/3`）+ `e2e-image`（image-flows 按 project 维度，matrix 三 image project，`--project=<p>`） | 30 min |

- 5 个 job 相互独立、并行执行；任一 step 失败即该 job 失败，合并检查整体失败。
- concurrency 按 `github.ref` 分组并 `cancel-in-progress`，避免同一分支重复推送排队浪费。
- **E2E 分片（按内容）**：首轮实测（2026-08-06）发现 `--shard` 按 spec 文件切分使 image-flows 整组失衡（44s / 78s / 210s），故拆为两个 job：`e2e-main`（轻量文件 3 分片）与 `e2e-image`（重操作 image-flows 按浏览器 project 拆 3 个并行 job）。所有执行单元运行于独立 runner，各自初始化独立 webServer 与 `.e2e-state`（API/D1/R2 状态天然隔离）；`fail-fast: false`；**`workers: 1` 固定不变**——测试共享同一 API DB，分片内多 worker 会破坏状态隔离，并行完全来自 runner 分片。
- **报告与 artifact**：CI reporter 为 `line + html + json`（JSON 输出 `playwright-report/results.json` 供机器解析，不依赖 line 文本）；HTML 报告、分片日志、汇总（`$GITHUB_STEP_SUMMARY`）上传均 `if: always()`，artifact 命名 `playwright-report-main-<N>-of-3` / `playwright-report-image-<project>`（名称不含 `/`），保留 7 天；失败时另传 `test-results-main-<N>-of-3` / `test-results-image-<project>`。
- action 版本必须固定到 major 标签（`@v4` 等），升级需单独提交并说明。

## 浏览器缓存约定

- 缓存 key 唯一标准：`ms-playwright-${{ runner.os }}-<@playwright/test 实际版本>-chromium-webkit-firefox`（版本由步骤读取 package.json 输出），**不使用宽泛 restore-keys**，避免跨 Playwright 版本恢复不兼容浏览器。
- 各分片运行于独立 runner，只是**分别恢复同一份缓存副本**，并非共享磁盘；**首次无缓存时三个并发分片可能全部 miss、各自完整下载，只有后续 workflow 才会命中**。
- 浏览器缓存**不含 Linux 系统依赖**，`--with-deps` 必须无条件保留。
- **缓存去留 = 实测决策**：不默认缓存更快。首轮（直接下载）与次轮（缓存恢复）对比恢复耗时、安装耗时、准备总耗时、安装后体积（`du -sh`）与稳定性后再决定；**未经测量不得引入串行准备 job**。
- 每分片在 STEP_SUMMARY 输出：cache-hit、缓存恢复耗时、浏览器安装耗时、浏览器准备总耗时、浏览器体积、JSON 解析的测试数与时长。

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

## 已知环境差异（Windows 本地 vs CI/Linux）

以下问题仅出现在 Windows 本地开发机，**CI（ubuntu-latest）不受影响**，不得为此修改产品代码或测试：

1. **E2E API 中途崩溃**：本地 `wrangler dev`（miniflare/workerd）偶发中途崩溃，导致后续测试批量 `ECONNREFUSED :8788` 失败。处理：清理残留 node 进程与 `.e2e-state` 后重跑。
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
