# CI 浏览器缓存常驻（main-only seed）+ E2E 按需浏览器安装（按浏览器粒度）

## Goal

让 main 分支常驻 Playwright 浏览器二进制缓存（GitHub Actions 缓存作用域规则下，PR 可恢复 main 的缓存），PR 的 6 个 E2E job 保持完全并行、直接读取 main 缓存，并按各自 project 只安装实际需要的浏览器。**不引入任何跨 job 的串行依赖。**

## Background（实测事实）

- GitHub Actions 缓存按 ref 作用域隔离：`pull_request` 运行可恢复 ① 本 PR 合并 ref ② 基础分支（main）创建的缓存；不同 PR 之间的缓存互不可见。
- GitHub Actions 缓存是 **immutable**：同一 key 只能创建一次，并发 job 不会把不同内容合并进同一个 cache；先成功的 writer 决定该 key 的内容，其余 job 无法补充。
- `ci.yml` 目前只在 `pull_request` + `workflow_dispatch` 触发，main 从未跑过 workflow → main 作用域无缓存，每个 PR 首次运行 6 个 E2E job 全部 miss（run 31171052590 实测）。
- 实测：正常 runner 三浏览器全新安装约 40s；缓存恢复约 5s（490MB）；曾出现单 runner apt 停滞 9 分钟（runner 环境波动）。
- **缓存边界**：`~/.cache/ms-playwright` 只含浏览器二进制与 ffmpeg；Linux 系统依赖（apt 包）不包含其中，无法由缓存覆盖。
- **job 边界**：不同 GitHub Actions job 运行在独立 runner，文件系统不共享；任何前置 job 都无法替后续 runner 安装浏览器或系统依赖。

## Requirements

- 新增 `e2e-browser-cache` seed job（**push-main-only**，`browser` matrix：chromium / webkit / firefox，3 个实例并行）：
  - 每个实例恢复**自己浏览器**的 main key；miss 时执行 `playwright install <该浏览器>`；
  - **不执行 `--with-deps`，也不执行 `install-deps`**（该 job 不运行测试，无需系统依赖）；
  - miss 时 job 结束保存**自己浏览器**的 main key。
- **按浏览器粒度的缓存 key**（main / PR 两组，各 3 个，key 与内容一一对应）：
  - `ms-playwright-main-${runner.os}-${playwrightVersion}-chromium|-webkit|-firefox`：长期、权威共享缓存，由 main push 的 seed 建立；
  - `ms-playwright-pr-${runner.os}-${playwrightVersion}-chromium|-webkit|-firefox`：当前 PR 的 fallback / bootstrap 缓存，由 PR 首次 miss 安装后保存。
  - **禁止**三浏览器共用同一 key（immutable cache 下并发 job 无法合并，先完成者内容可能只含部分浏览器）。
- PR / dispatch 的 6 个 E2E job **完全并行，无 `needs` 依赖**，每个 job 只恢复**本 job 需要的浏览器**对应的 main key → PR key，不再恢复约 490MB 的三浏览器全集。
- **安装职责拆分**（不再用 `playwright install --with-deps <browser>` 同时承担两个职责）：
  - 每个 E2E runner **始终**执行 `playwright install-deps <browser>`（apt 系统依赖不属于缓存，每台 runner 必须各自准备）；
  - 仅当本浏览器的 main key 与 PR key **均 miss** 时执行 `playwright install <browser>`（纯二进制下载，无 `--with-deps`）。
- **PR fallback 缓存指定 writer**（同一 key 只有明确 writer，不依赖并发 save 竞争）：
  - chromium PR key：仅 `e2e-main` **shard 1** 负责保存；shard 2 / shard 3 / image-chromium 只 restore，不 save；
  - webkit PR key：仅 `e2e-image`（image-webkit）保存；
  - firefox PR key：仅 `e2e-image`（image-firefox）保存。
  - save 紧跟 install 之后、跑测试之前执行（成功下载安装即保存，**不依赖测试最终是否通过**）。
- **Bootstrap 语义（首次迁移）**：当前 PR 合并前 main 尚无缓存，允许首轮 cache miss 后自行安装并保存 PR key；cache miss **不得导致 CI 失败**；当前 PR 的后续 run 复用 PR key；合并后由 `push main` 建立 main key，之后的新 PR 直接复用 main key。
- **事件语义**：
  - `pull_request`：main key → miss 后 PR key → 再 miss 才下载 → writer 保存 PR key；
  - `workflow_dispatch`（手动全量检查，**不是 PR**）：只尝试恢复 main key；miss 时正常下载保证测试可跑；**不 restore 也不创建任何 `ms-playwright-pr-*` 缓存**；
  - `push main`：仅运行 browser seed matrix（建立 / 刷新 main 缓存），quality/unit/workers/build/E2E 均不运行。
- 不使用宽泛 `restore-keys`；验收引入 `actionlint`。
- `.trellis/spec/ci/ci-guidelines.md` 在实施阶段同步更新。

## Acceptance Criteria

- [ ] `push main` 触发的运行中，只执行 `e2e-browser-cache` 一个 job（matrix 3 个实例）；缓存列表出现 3 个 main key `ms-playwright-main-Linux-<version>-{chromium,webkit,firefox}`，各 key 内容只含对应浏览器。
- [ ] 新 PR 首次运行（main 无缓存）：6 个 E2E job 日志显示各自浏览器的 main key miss → PR key miss → 正常安装并继续测试（**CI 不因 miss 失败**）；安装后仅 shard 1 / image-webkit / image-firefox 各保存一次对应 PR key（共 3 次 save），同 PR 后续 run 命中 PR key。
- [ ] main 缓存建立后的新 PR：E2E job 日志显示对应浏览器的 `ms-playwright-main-*` 命中，且 `playwright install` 步骤不执行（跳过）。
- [ ] 每个 E2E job 只安装 / 恢复本 job 需要的浏览器（`e2e-main`=chromium；`e2e-image` 按 matrix 对应）；`playwright install-deps` 在每个 E2E runner 上始终执行（与缓存命中与否无关）。
- [ ] 6 个 E2E job 之间无 `needs` 依赖，与 quality/unit/workers/build 直接并行。
- [ ] 同一缓存 key 全局唯一 writer：无两个并行 job 保存同一 key 的场景（main key 各由 seed 对应实例；PR key 各由指定 writer）。
- [ ] `workflow_dispatch` 触发运行全部非 seed job（手动全量检查语义），日志**不出现** PR key 的 restore / save。
- [ ] `actionlint .github/workflows/ci.yml` 0 errors；`pnpm format:check`（LF 环境）通过。
- [ ] ci-guidelines.md 与 ci.yml 行为一致；文档中"cache hit 后 install 秒级校验"、"后续轮安装 0 次"等混淆表述已修正为：**browser binary download 在 cache hit 后 0 次；system dependency install/check 每个 E2E runner 仍执行**。

## Notes

- 本次不处理：shard 2 的 worker 中途崩溃（本地无法复现，判定 runner 瞬时故障，重跑观察）；畸形 JSON 返回 500 而非 400 的既有问题。
- 6 个 cache key（main + PR 各 3）并存占用配额：单浏览器缓存约 160MB（chromium 略大），总量与原来双份 490MB 相近；GitHub 缓存按 LRU 自动驱逐，属可接受边界。
- `playwright install <browser>` 会随任一浏览器附带安装 ffmpeg（体积很小），故每个 browser key 内除对应浏览器外还含 ffmpeg，属 Playwright 既定行为，可接受。
- save 仅在"本次为全新安装"（main key 与 PR key 均未命中且为指定 writer）时执行，天然规避 `actions/cache/save` 对已存在 key 报错的问题。
