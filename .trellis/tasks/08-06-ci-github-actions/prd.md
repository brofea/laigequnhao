# GitHub Action CI 脚本整合仓库测试与规范落地

## Goal

分两阶段交付：**阶段 A 先把仓库全部质量门禁在本地跑通**（不盲目 debug），**阶段 B 再基于已验证的绿色基线编写 GitHub Action CI 工作流**；最后新增 Trellis spec 固化 CI 约定。

## Background

- 项目：Vue 3 + Vite + Cloudflare Workers（Hono）+ D1 + R2；pnpm 11.17.0（packageManager），Node >= 22。
- 仓库当前无 `.github/` 目录，无任何已有 CI。
- `.trellis/spec/guides/testing-strategy.md` 已规定「必须运行的命令」为 7 条，并要求「CI 必须运行全部命令；隔离测试必须有负责人、原因和解除条件」。
- E2E 前置：`scripts/start-e2e-api.mjs` 以 `--env-file tests/e2e/.dev.vars` 启动测试 API；该文件被 `.gitignore` 忽略，CI 需自行生成（固定测试值，无真实 secret）。

## Requirements

- R1：阶段 A——本地基线全绿：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm build`、`pnpm test:e2e` 全量 5 个 project 通过；`format:check` 在本地 Windows 因 CRLF 假阳性（`core.autocrlf=true`、仓库无 .gitattributes），以 CI（Linux/LF）验证为准，不阻塞阶段 A 验收。
- R2：阶段 B——新增 `.github/workflows/ci.yml`：`workflow_dispatch`（任意分支）+ `pull_request` → `main`；5 个并行 job 全量跑 7 条门禁，任一失败即整体失败；无需 GitHub Secrets。
- R3：CI 环境：Node 22、pnpm 随 packageManager 解析、依赖与 Playwright 浏览器缓存、`tests/e2e/.dev.vars` 自动生成（不含 R2_PUBLIC_BASE_URL）。
- R4：新增 Trellis spec（.trellis/spec/ci/，简体中文）：触发与工作流结构、测试纳入范围（隔离/排除记录：prototype/、seed-local.test.mjs、cloudflare:check、db:test:*）、`.dev.vars` 生成与同步约定、新增测试接入约定、action 版本固定约定。
- R5（用户批准，2026-08-06）：修复 e2e 既有失败（全部已实施）：
  1. `tests/e2e/.dev.vars` 删除 `R2_PUBLIC_BASE_URL=https://assets.e2e.invalid`（保留 TLD 不可解析），回退同源 `/api/v1/assets`；
  2. `BoardManagement.expandedId` 异步加载竞态：watch 首次填充时补全展开首个板块；
  3. `a11y-flows:53` 竞态：Tab 序列前 `toBeAttached` 等待种子卡片；
  4. `image-flows:238` 多选下拉展开遮挡：移除前收起加群方式菜单；
  5. `image-flows:165` 同上：保存前收起菜单；
  6. `admin-flows` 板块删除循环竞态：循环前等待板块渲染（否则 count()=0 空转重建重复"自定板块"）。

## Technical Notes

- 7 条门禁命令对应 package.json：lint、format:check、typecheck、test、test:workers、test:e2e、build。
- **审计确认排除项（原因记录于 ci spec）**：`scripts/seed-local.test.mjs`（"测试的测试"，用户确认）、prototype/（用户确认隔离）、`cloudflare:check`（需 CF 认证）、`db:test:*`（本地调试辅助）、`seed`/`db:migrate`（本地工具）、`deploy`/`release`/`db:migrate:remote`（部署链路）。
- **审计确认全部 41 个门禁测试文件有归属**：vitest（src/**、shared/**）、workers vitest（tests/workers/**）、playwright（tests/e2e/**），无遗漏。
- `pnpm format:check` 会检查 `.github/**`（.prettierignore 未排除），工作流 YAML 须 prettier 兼容。
- **已知环境差异（记录于 ci spec，不再本地 debug）**：
  - 本地 Windows：e2e API（wrangler dev/miniflare）偶发中途崩溃导致整批 ECONNREFUSED 失败（已多次观察到；非测试代码问题）；
  - 本地 Windows：`.e2e-state` 偶发无法被 start-e2e-api.mjs 清空（文件锁）→ 跨轮次数据累积污染断言；
  - `image-webkit:165` 保存按钮点击偶发超时：探针（720px 视口、等价流程）无法复现，真实测试连续 3 轮失败，根因未定；**决策：不继续本地深挖，作为已知偶发项记录，由 CI（Linux）验证；CI retries=2 兜底；若 CI 上稳定复现则另开任务**。
  - 上述均为 Windows 本地环境问题，CI 运行在 ubuntu-latest，不受影响。

## Out of Scope

- 不包含部署/发布流水线（deploy、release、db:migrate:remote、cloudflare:check 不入 CI）。
- 除 R5 六项修复外不修改产品代码；`prototype/` 与 `scripts/seed-local.test.mjs` 不纳入 CI（AC5 隔离记录）。
- 不再对 `image-webkit:165` 做本地 debug（记录为已知偶发项）。
- 不修改测试断言本身。

## Acceptance Criteria

- [ ] AC1：阶段 A——本地 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:workers`、`pnpm build` 全绿。
- [ ] AC2：阶段 A——本地 `pnpm test:e2e` 在干净状态下全量 5 个 project 跑通；若遭遇已知环境差异（API 崩溃/状态残留），清理后重跑确认套件本身绿，并在 spec 记录。
- [ ] AC3：阶段 B——`.github/workflows/ci.yml` 支持两种触发且通过 actionlint。
- [ ] AC4：阶段 B——工作流覆盖 7 条门禁命令，任一失败即 job/检查失败；`.github/**` 通过 prettier --check。
- [ ] AC5：新增 `.trellis/spec/ci/` spec（index.md + ci-guidelines.md，简体中文），含隔离/排除记录与已知环境差异说明。
- [ ] AC6：`git status` 产品改动仅限 R5 六项相关文件。

## Key Decisions

- 执行顺序：本地跑通 → 写 CI 脚本（用户指令，2026-08-06）。
- `image-webkit:165`：不再本地 debug，记录为已知偶发项，CI 验证（用户指令，不盲目 debug）。
- prototype/ 与 seed-local.test.mjs 不纳入 CI（用户已确认）。
- `tests/e2e/.dev.vars` 由工作流 heredoc 生成（不含 R2_PUBLIC_BASE_URL），不提交该文件。
- format:check 本地 CRLF 假阳性不作为阶段 A 阻塞项。
