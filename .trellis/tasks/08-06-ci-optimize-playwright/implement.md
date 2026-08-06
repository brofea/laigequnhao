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
3. 改造 `.github/workflows/ci.yml` e2e job：
   - matrix 数字分片 `[1, 2, 3]`（`fail-fast: false`），`--shard=${{ matrix.shard }}/3`；
   - 浏览器版本步骤：读取 `@playwright/test` 实际版本写入 GITHUB_OUTPUT；缓存 key = `ms-playwright-${{ runner.os }}-<version>-chromium-webkit-firefox`，**无 restore-keys**；
   - 运行步骤：`set -o pipefail` + `tee playwright-shard-<n>.log`；
   - 时间戳步骤：记录缓存恢复、浏览器安装的起止时间（GITHUB_OUTPUT）；
   - 汇总步骤（`if: always()`）：node 解析 JSON 结果 + 时间戳 + `cache-hit` + `du -sh ~/.cache/ms-playwright`（命中时），输出到 `$GITHUB_STEP_SUMMARY`；
   - 上传步骤（`if: always()`）：HTML 报告 `playwright-report-<N>-of-3`、分片日志、JSON 结果；失败时另传 test-results；
   - `--with-deps` 无条件保留。
4. 校验：actionlint（ci.yml）、`pnpm exec prettier --check .github`、YAML 解析。
5. 本地验证补齐全部门禁：
   - `pnpm lint`、`pnpm format:check`（LF 复现）、`pnpm typecheck`、`pnpm build`、`pnpm test`、`pnpm test:workers`；
   - `pnpm exec playwright test --list --shard=1/3`、`--shard=2/3`、`--shard=3/3` 确认三个分片均非空（各分片测试数之和 = 全量）；
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
