# 设计：main-only 浏览器缓存 seed（按浏览器 matrix）+ E2E 按需安装（无串行依赖）

## 触发 × Job 矩阵

| 事件 | 运行内容 |
|---|---|
| `push: branches: [main]` | 仅 `e2e-browser-cache`（seed，browser matrix 3 实例），全量检查全部跳过 |
| `pull_request` (main) | quality / unit / workers / build + 6 个 E2E job 全部并行；seed 不运行 |
| `workflow_dispatch` | 同上（手动全量检查语义）；seed 不运行；**不创建任何 `pr-*` 缓存** |

实现：seed job `if: github.event_name == 'push'`；其余 job `if: github.event_name != 'push'`。无额外 input 参数。

## 缓存模型（按浏览器粒度的 6 key + 明确 writer）

```
main push ──> e2e-browser-cache（seed matrix：chromium / webkit / firefox，3 实例并行）
               每个实例只处理自己的浏览器：
               restore ms-playwright-main-*-<browser> → miss 则 install <browser>（无 --with-deps、无 install-deps）→ save 同 key

PR ──> 6 个 E2E job 并行（无 needs），每 job 只碰自己的浏览器 key：
       ① restore ms-playwright-main-*-<browser>（权威缓存，main 建立后命中）
       ② miss → restore ms-playwright-pr-*-<browser>（本 PR bootstrap 缓存）
       ③ install-deps <browser>（始终执行，apt 不缓存）
       ④ ① ② 均 miss → install <browser>（纯二进制下载）
       ⑤ 仅指定 writer 且 ① ② 均 miss → save ms-playwright-pr-*-<browser>（紧跟 ④，在跑测试之前）

dispatch ──> 同上但：
       ② restore-pr 步骤不执行（跳过）
       ⑤ save-pr 步骤不执行（跳过）
       main key miss → 直接 install → 跑测试
```

- **为什么按浏览器拆分 key**：GitHub Actions 缓存 immutable，同一 key 并发 save 先到先得、不可合并。若 6 个 job 共用 `ms-playwright-pr-${os}-${version}`，最先成功保存的内容可能只有 Chromium（或 WebKit/Firefox），其余 job 的浏览器永远无法补入；main seed 同理。按浏览器拆 key 后，**每个 key 的内容与 key 一一对应**，不存在"某个 key 缺浏览器"的悬挂状态。
- **每 job 只恢复自己的浏览器**：`e2e-main`（chromium-desktop + chromium-mobile）只碰 chromium 两个 key；`e2e-image` 按 `matrix.browser` 只碰对应浏览器两个 key。不再恢复三浏览器全集（约 490MB），恢复体积降至单浏览器（约 160MB）。
- **缓存覆盖边界**：`~/.cache/ms-playwright` 仅浏览器二进制 + ffmpeg。Linux 系统依赖（apt）不在缓存内。
- **job 边界**：runner 文件系统不共享，seed 无法替任何 E2E runner 安装任何东西；seed 的唯一作用是为 main 作用域准备各浏览器二进制缓存。
- **Bootstrap 时序**：当前 PR 合并前 main 无缓存 → 首轮 ① ② 全 miss → 各 job 自行安装 → 指定 writer 保存 PR key（chromium 由 shard 1，webkit/firefox 由各自 image job）→ 该 PR 后续 run 命中 PR key；合并后 push main 建立 3 个 main key → 之后新 PR ①直接命中。
- 为什么不用单个 `actions/cache` 默认查找：其顺序是"当前 branch/PR 优先、default branch 次之"，与"main 权威优先"相反；双 key + `actions/cache/restore` / `actions/cache/save` 分离控制可实现严格的 main 优先语义。
- save 条件：仅当 main key 与 PR key 均未命中（本次全新安装）且为指定 writer 才保存 PR key；`actions/cache/save` 在 key 已存在时会报错，命中场景与并发场景（key 已被别处创建）都由该条件规避。

## writer 分配表（每个 PR key 唯一 writer）

| 缓存 key | writer |
|---|---|
| `ms-playwright-pr-*-chromium` | `e2e-main` shard 1（`if: matrix.shard == 1`） |
| `ms-playwright-pr-*-webkit` | `e2e-image`（image-webkit） |
| `ms-playwright-pr-*-firefox` | `e2e-image`（image-firefox） |

- `e2e-main` shard 2 / shard 3、`e2e-image`（image-chromium）：只 restore，不 save（writer 竞争消除，save 步骤对该矩阵维度条件为 false）。
- main key 的 writer 天然唯一：每个 main key 只由 seed matrix 中对应浏览器实例保存。
- save 步骤紧跟 install 之后、跑测试之前 → 浏览器成功下载安装即保存，与测试最终成败无关。

## seed job（e2e-browser-cache，push-only matrix）

```yaml
e2e-browser-cache:
  if: github.event_name == 'push'
  runs-on: ubuntu-latest
  timeout-minutes: 15
  strategy:
    fail-fast: false
    matrix:
      browser: [chromium, webkit, firefox]
  steps:
    - checkout
    - setup-pnpm
    - resolve playwright version（输出 version）
    - actions/cache/restore（key: ms-playwright-main-${{ runner.os }}-${{ version }}-${{ matrix.browser }}）
    - pnpm exec playwright install ${{ matrix.browser }}        # 无 --with-deps，无 install-deps
    - actions/cache/save（if: cache-hit != 'true'；key: 同上）
```

- 为什么用 matrix 而非单 job 装全浏览器：单 job 若装 3 浏览器后分别 save 3 个 key，每个 key 的内容都含全浏览器，key 与内容不对应；matrix 每个实例只装一个浏览器，save 时目录只含对应浏览器，保证"key ↔ 内容"一一对应。
- 成本判断：matrix 3 个 runner 并发（仅 push main 每次合并触发 1 次），各实例核心耗时约 install 40s + save ~10s，wall-clock 与单 job 相当、并行度相同，多占 2 个 runner 并发槽但 push main 频率低，且这是"key 内容严格对应"的必要代价。首次（全部 miss）成本最高，此后 restore 命中即跳过 install，实例秒级完成。
- seed 实例之间无竞争：chromium/webkit/firefox 三个 main key 各由一个实例保存。

## E2E job 步骤（按浏览器）

| job | browser | restore main key | restore pr key | install-deps | install（双 miss） | save pr key |
|---|---|---|---|---|---|---|
| `e2e-main` shard 1/2/3 | chromium | ✓ | ✓（shard 1 是唯一 writer，shard 2/3 只 restore） | ✓ 始终 | ✓ | 仅 shard 1 |
| `e2e-image` image-chromium | chromium | ✓ | ✓（只 restore） | ✓ 始终 | ✓ | 否 |
| `e2e-image` image-webkit | webkit | ✓ | ✓ | ✓ 始终 | ✓ | ✓（唯一 webkit job） |
| `e2e-image` image-firefox | firefox | ✓ | ✓ | ✓ 始终 | ✓ | ✓（唯一 firefox job） |

- 步骤顺序（所有事件）：restore main → （PR 时）restore pr → install-deps → （双 miss 时）install → （PR + 双 miss + writer 时）save pr → 生成 .dev.vars → 跑测试 → 汇总/上传（`if: always()`）。
- 条件表达式要点：
  - restore-pr 步骤：`if: steps.cache-main.outputs.cache-hit != 'true' && github.event_name == 'pull_request'`；
  - install 步骤：`if: steps.cache-main.outputs.cache-hit != 'true' && steps.cache-pr.outputs.cache-hit != 'true'`（dispatch 下 restore-pr 被跳过，`cache-pr.outputs.cache-hit` 为空值 ≠ `'true'`，条件成立 → 正常安装，语义正确）；
  - save-pr 步骤：`if: github.event_name == 'pull_request' && steps.cache-main.outputs.cache-hit != 'true' && steps.cache-pr.outputs.cache-hit != 'true' && <writer 条件>`（writer 条件：e2e-main 为 `matrix.shard == 1`；e2e-image 为 `matrix.browser != 'chromium'`）。
- `e2e-image` matrix 用 `include` 携带 `browser` 字段（`project` → `browser` 一一对应），避免无条件三浏览器安装。
- 汇总（STEP_SUMMARY）沿用现有指标，适配新 step id：cache-main-hit / cache-pr-hit、restore 耗时、install 耗时（cache hit 时 install 步骤跳过，记 0 或 n/a）、install-deps 耗时、浏览器体积。

## 与旧方案（e2e-prep + needs）的差异

| 维度 | 旧方案 | 新方案 |
|---|---|---|
| 串行依赖 | 6 个 E2E job `needs: e2e-prep`（串行关键路径 + 失败耦合） | 无 needs，E2E 直接并行 |
| 缓存 key 粒度 | 单 key 三浏览器全集 | 按浏览器拆 6 key（main×3 + pr×3），key 与内容一一对应 |
| 缓存查找 | 单 key，依赖默认查找顺序（当前 scope 优先） | 双 key 显式 main 优先；PR key 作 bootstrap fallback |
| 并发保存 | prep/E2E 可能竞争同一 key（immutable 下先到先得，内容残缺不可补） | 每个 key 唯一 writer，无竞争 |
| 安装命令 | `playwright install --with-deps <浏览器>` 一次承担两个职责 | `install-deps <browser>`（每 runner 始终）+ `install <browser>`（仅双 miss，纯下载） |
| 安装次数 | prep 1 次 + E2E 6 次 = 7 次（且 E2E 每次三浏览器全装） | push main 时 seed 每浏览器 1 次；PR 仅双 key 全 miss 才安装（首轮 1 次/job，cache hit 后 **browser download 0 次**）；**system dependency install/check 每个 E2E runner 仍执行** |
| seed 的 --with-deps | 有（替不存在的测试准备系统依赖，无意义） | 无（seed 不跑测试） |
| 系统依赖准备 | 隐含"前置 job 已准备"的错误预期 | 明确由各 E2E runner 的 `install-deps` 独立完成 |
| dispatch | 参与创建 PR fallback 缓存 | 只恢复 main key，不创建 pr-* 缓存 |
| 首次迁移 | 隐含 main 缓存已存在 | 允许首轮 miss、自行安装、writer 保存 PR key；合并后 main key 自然建立 |

## 校验手段

- `actionlint`（GitHub Actions 语义校验，能发现 on/if/needs/expression 等错误）本地执行：Windows 下载 release 二进制（`actionlint.exe ci.yml`）或 `docker run --rm -v ${PWD}:/repo -w /repo rhysd/actionlint:latest`。
- YAML 语法解析仅作辅助（python yaml.safe_load），不作为唯一校验。

## 风险

- push main 才触发 seed：合并首个 PR 之前 main 无缓存（首个 PR 首轮 miss 属预期，writer 保存 PR key 后次轮起命中）。
- `if: github.event_name != 'push'` 需加到全部非 seed job；遗漏会导致 push main 重复跑全量。
- 首次 PR 并发 miss 时，非 writer job（shard 2/3、image-chromium）会各自安装 chromium 但不保存：多花 2-3 次下载成本（仅发生在 PR 首次 run 的 chromium 维度），不破坏正确性；由 shard 1 保存的 PR key 使后续 run 全部命中。
- concurrency group 保持 `ci-${{ github.workflow }}-${{ github.ref }}`：push main 与 PR 运行按 ref 区分，互不取消。
- 若 `actions/cache/restore` 命中但内容被外部篡改/半残：immutable 缓存由 install 完整产物建立，命中即视为完整；不做 hit 后二次校验（避免"秒级校验"式伪职责，浏览器缺件由该 job 测试失败暴露、重跑恢复）。
