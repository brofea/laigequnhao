# T06 验收基线（阶段一）

## 1. 环境固定记录

| 项目 | 值 |
|---|---|
| Git commit | `9b22055`（main） |
| 工作区 | 仅 `task.json` 状态变更（T06 激活），无代码改动 |
| OS | macOS 15.7.8 |
| Node | v25.9.0 |
| pnpm | 11.17.0 |
| Playwright | 1.62.0 |
| 浏览器 | chromium-1234（headless_shell） |
| 站点时区 | `Asia/Shanghai`（site.config.ts boards.timezone / rotation.timezone） |
| UTC 校验时刻 | 2026-08-02 10:17 UTC = 18:17 Asia/Shanghai |
| 迁移版本 | 0001_initial → 0004_board_management（共 4 个） |
| D1 测试库 | `lgqh-test-local`（wrangler.test.jsonc，本地 workerd） |
| R2 测试桶 | `lgqh-test-local`（本地模拟） |
| E2E 状态目录 | `.e2e-state`（每次 start-e2e-api 自动重置） |
| E2E 环境变量 | tests/e2e/.dev.vars：`ADMIN_PASSWORD=test-admin-password`、`SKIP_TURNSTILE=true`、`LOGIN_MAX_ATTEMPTS=100` |
| 生产配置 | wrangler.jsonc（DB/R2/Analytics 绑定待阶段十二核对） |

## 2. 固定时钟约定

- 所有截图/时间敏感测试使用 `Asia/Shanghai` 作为唯一站点时区。
- hourly_random 小时槽位 = 站点时区自然小时；测试固定当前小时为 18:xx（18:17 UTC+8）。
- 主题固定：浅色/深色由测试显式设置，system 模式仅在主题三态用例中验证。

## 3. 报告目录

- `research/`：联合 Review、缺陷记录、冻结问题记录、发布决策
- `evidence/`：测试输出、截图、trace、演练日志、安全检查结果

## 4. 门禁命令

| 门禁 | 命令 |
|---|---|
| Unit | `pnpm test`（vitest run） |
| Workers | `pnpm test:workers` |
| E2E | `pnpm test:e2e` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Build | `pnpm build` |
| 迁移(本地) | `pnpm db:migrate:local` |
| 迁移(测试库) | `pnpm db:test:migrate` |
