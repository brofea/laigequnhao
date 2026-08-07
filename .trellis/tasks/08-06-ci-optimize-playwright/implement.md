# 执行计划：format:check 修复与 Playwright CI 加速

## 实施清单（按序）

1. 修复 format:check（12 个文件）：
   - `pnpm exec prettier --write` 精确指定 12 个文件；
   - `git diff --stat` 确认仅预期文件变更（无行尾/无关 diff）；
   - LF 副本复现验证 `prettier --check .` 全绿；
   - `pnpm lint` + `pnpm test` 回归（涉及产品源码与测试文件）。
2. 调整 `playwright.config.ts`：
   - `workers` 保持不变（固定 1）；
   - CI reporter：`line + html + json`（json outputFile 含分片标记，供机器解析），本地保持 `line`。
3. 改造 `.github/workflows/ci.yml` e2e job（**首轮实测后按内容分片**，2026-08-06）：
   - 首轮观测（playwright-report artifacts）：`--shard` 按文件切分，image-flows 整组落单片 → 44s / 78s / 210s 失衡；
   - 拆为两个 job：`e2e-main`（非图片 5 文件 × chromium 双 project，matrix `[1,2,3]`，`--shard=N/3 --project=chromium-desktop --project=chromium-mobile`）+ `e2e-image`（matrix 三 image project，`--project=<p>`）；
   - 每个 job 内：浏览器版本步骤（读取 `@playwright/test` 版本）、缓存 key = `ms-playwright-${{ runner.os }}-<version>-chromium-webkit-firefox`（无 restore-keys）、时间戳步骤（缓存恢复/安装起止）、`--with-deps` 无条件保留；
   - 运行步骤：`set -o pipefail` + `tee` 日志（main/image 各自命名）；
   - 汇总步骤（`if: always()`）：node 解析 JSON + 时间戳 + `cache-hit` + `du -sh`，输出 `$GITHUB_STEP_SUMMARY`；
   - 上传步骤（`if: always()`）：HTML 报告 `playwright-report-main-<N>-of-3` / `playwright-report-image-<project>`、日志、JSON；失败另传 test-results。
4. 校验：actionlint（ci.yml）、`pnpm exec prettier --check .github`、YAML 解析。
5. 本地验证补齐全部门禁：
   - `pnpm lint`、`pnpm format:check`（LF 复现）、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm test:workers`；
   - 新分片结构验证：`playwright test --list --project=chromium-desktop --project=chromium-mobile --shard=1/3|2/3|3/3` 三片非空且和 = 70（全量）；`playwright test --list --project=image-<p>` 各 = 4（和 = 12）；
   - 本地全量 e2e（5 project，干净状态）回归。
6. 更新 `.trellis/spec/ci/ci-guidelines.md`：
   - 分片结构（3 分片数字 matrix、独立 runner/API/DB、workers 固定 1 的原因）与报告/上传约定（均 always）；
   - 浏览器缓存约定：key 标准（runner.os + Playwright 版本 + 浏览器集合、无 restore-keys）、`--with-deps` 必需、去留以实测对比为准；
   - 首轮观测数据留档位置（STEP_SUMMARY + 日志/JSON artifact）；
   - 记录 format:check 欠账修复与「新增文件必须 LF 复现验证 prettier」约定；Windows 行尾长期治理（.gitattributes 强制 LF）另开任务评估。
7. 质量检查与提交：`ci(actions): 修复 format:check 并分片加速 Playwright E2E`。
8. 提交后由用户触发 PR 首轮 CI，汇总观测数据（含浏览器缓存首轮直接下载 vs 次轮缓存恢复对比）并记录到任务 Notes（后续调参依据）。

## 验证命令

```bash
pnpm exec prettier --write <12 个文件>
node <prettier> --check .            # LF 副本中
pnpm lint && pnpm test
pnpm typecheck && pnpm build && pnpm test:workers
pnpm exec playwright test --list --shard=1/3   # 及 2/3、3/3，确认非空
pnpm exec playwright test             # 本地干净状态全量 5 project
actionlint .github/workflows/ci.yml
pnpm exec prettier --check .github
```

## 风险与回滚点

- 格式化大文件（VisualShell.vue）diff 较大：审查后接受，纯格式无行为。
- 本地全量 e2e 已知环境差异（API 偶发崩溃）：清理重跑。
- 回滚：ci.yml/playwright.config.ts 还原；12 文件 git 还原。
- CI 首轮观测：分片数、缓存 miss 下载耗时、次轮命中对比；据数据决定缓存去留与分片数调整。
