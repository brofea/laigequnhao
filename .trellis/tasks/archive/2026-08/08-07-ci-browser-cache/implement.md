# 执行计划：按浏览器粒度的 main-only seed + E2E 按需安装（无串行依赖）

## 前置状态

- 工作区当前 ci.yml 含旧方案残留（未提交）：`e2e-prep` job + `e2e-main` / `e2e-image` 的 `needs: e2e-prep`，install 步骤为 `playwright install --with-deps chromium webkit firefox`。
- `.trellis/spec/ci/ci-guidelines.md` 同样残留旧方案描述（未提交）：`e2e-prep` 行 + "浏览器准备收敛到串行 e2e-prep job"决策条目。
- 已提交 `18b999e`（prettier format 修复）。
- 本轮仅修订 task 文档（prd / design / implement），**不实施 CI**；本文件为实施阶段执行清单。

## 顺序清单

1. `.github/workflows/ci.yml`
   - `on` 增加 `push: branches: [main]`。
   - 删除旧 `e2e-prep` job。
   - 新增 `e2e-browser-cache`（`if: github.event_name == 'push'`，`strategy.matrix.browser: [chromium, webkit, firefox]`）：
     checkout → setup-pnpm → resolve version → `actions/cache/restore`（key `ms-playwright-main-${os}-${version}-${browser}`）→ `pnpm exec playwright install ${{ matrix.browser }}`（无 `--with-deps`，无 `install-deps`）→ `actions/cache/save`（`if: steps.<restore>.outputs.cache-hit != 'true'`，同 key）。
   - 删除 `e2e-main` / `e2e-image` 的 `needs: e2e-prep`。
   - `quality` / `unit` / `workers` / `build` / `e2e-main` / `e2e-image` 加 `if: github.event_name != 'push'`。
   - `e2e-main` / `e2e-image`：
     - matrix 补充 `browser` 维度（`e2e-main` 固定 chromium；`e2e-image` 用 `include` 按 project 携带 browser：image-chromium→chromium / image-webkit→webkit / image-firefox→firefox）；
     - 缓存步骤改为四段式（restore main → restore pr → install-deps → install → save pr）：
       1. `actions/cache/restore` main key（`id: cache-main`，key `ms-playwright-main-${os}-${version}-${browser}`）；
       2. `actions/cache/restore` PR key（`id: cache-pr`，key `ms-playwright-pr-${os}-${version}-${browser}`，`if: steps.cache-main.outputs.cache-hit != 'true' && github.event_name == 'pull_request'`）；
       3. `pnpm exec playwright install-deps ${{ matrix.browser }}`（**无条件执行**）；
       4. `pnpm exec playwright install ${{ matrix.browser }}`（`if: steps.cache-main.outputs.cache-hit != 'true' && steps.cache-pr.outputs.cache-hit != 'true'`，无 `--with-deps`）；
       5. `actions/cache/save` PR key（`if: github.event_name == 'pull_request' && steps.cache-main.outputs.cache-hit != 'true' && steps.cache-pr.outputs.cache-hit != 'true' && <writer>`，writer：`e2e-main` 为 `matrix.shard == 1`，`e2e-image` 为 `matrix.browser != 'chromium'`）；
       - save 步骤必须排在跑测试之前（紧跟 install 之后），保证"安装成功即保存，不依赖测试结果"。
     - 现有计时 / STEP_SUMMARY / 汇总步骤适配新的 step id（cache-main / cache-pr / install-deps / install），保留 cache-hit、restore/install/install-deps 耗时、浏览器体积、JSON 测试数输出。
2. `.trellis/spec/ci/ci-guidelines.md`
   - job 表：`e2e-prep` 行替换为 `e2e-browser-cache`（push-main-only，browser matrix）说明；`e2e` 行说明 6 个并行 E2E job；删除"needs: e2e-prep"表述。
   - 触发说明：push main 仅 seed；PR/dispatch 全量（dispatch 不创建 pr-* 缓存）。
   - 浏览器缓存章节重写为：按浏览器粒度 6 key + main 常驻策略 + **缓存只覆盖二进制，apt 系统依赖由各 runner 的 `install-deps` 独立执行** + 每个 key 唯一 writer + 按需浏览器清单 + 实测数据 + 串行准备 job 决策更正（不引入）。
   - 修正混淆表述：删除"cache hit 后 install 秒级校验"、"后续轮安装 0 次"等；明确区分 **browser binary download（cache hit 后 0 次）** 与 **system dependency install/check（每个 E2E runner 仍执行）**。
3. 校验
   - `actionlint .github/workflows/ci.yml`（本地二进制或 docker），0 errors。
   - `python yaml.safe_load` 辅助确认 jobs/if/needs/matrix 结构。
   - LF 环境 `prettier --check`（.github/、.trellis/ 范围）通过。
4. 提交
   - 单 commit 中文 message；含 ci.yml + ci-guidelines.md。

## 验收命令

```bash
actionlint .github/workflows/ci.yml
python -c "import yaml; d=yaml.safe_load(open('.github/workflows/ci.yml',encoding='utf-8')); print(list(d['jobs'].keys()))"
# 期望：quality/unit/workers/build/e2e-browser-cache/e2e-main/e2e-image
```

真实验收（合并后）：
- push main：运行仅含 `e2e-browser-cache`（matrix 3 实例），保存 `ms-playwright-main-Linux-<version>-{chromium,webkit,firefox}` 3 个 key。
- 当前 PR 后续 run：各 job 对应浏览器 main key miss → PR key 命中（无 install 下载，install-deps 仍执行）。
- 合并后新 PR 首轮：各 job `ms-playwright-main-*` 命中，install 步骤跳过。
- dispatch 手动运行：日志无 `ms-playwright-pr-*` restore/save 步骤执行。

## 回滚点

- ci.yml 单文件改动，撤销 commit 即可；spec 同步回滚；不影响产品代码。
- 缓存 key 已按浏览器拆分，与旧 key（`ms-playwright-${os}-${version}-chromium-webkit-firefox`）互不冲突，历史缓存自然废弃（LRU 驱逐），无需手工清理。
