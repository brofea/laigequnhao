# T06 部署与回滚 Runbook（阶段十二）

- 版本：V2 发布（T01-T06）
- 构建基线：`main` @ `9b22055`（T06 验收基线）
- 技术栈：Cloudflare Pages（Hono Functions）+ D1 + R2 + Analytics

## 0. 部署前置检查表

### 0.1 构建

- [ ] `pnpm install`（lockfile 一致）
- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm run lint` 0 errors（40 条既有 .vue warning 可接受）
- [ ] `pnpm run test` 82 passed
- [ ] `pnpm run test:workers` 103 passed
- [ ] `pnpm run test:e2e` 52 passed（桌面+手机）
- [ ] `pnpm run build` 通过
- [ ] `grep -rl "demoBoards|demoTags|demoGroups|设计师交换站" dist/` 无结果（生产 bundle 无 fixture）

### 0.2 配置核对

| 项 | 要求 | 检查 |
|---|---|---|
| D1 绑定 | `DB` → 生产库 `laigequnhao-prod`（wrangler.jsonc env.production；**database_id 目前为占位符 "production"，发布前必须替换为真实 ID**） | ⚠️ |
| R2 绑定 | `R2` → `laigequnhao-assets-prod`（env.production） | ⚠️ 需创建/确认 |
| Secrets | `ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY`、`R2_PUBLIC_BASE_URL`（wrangler secret put） | ⚠️ |
| vars | production: `SKIP_TURNSTILE=false`、`SECURE_COOKIE=true`（已配置） | ✅ |
| Analytics | `ANALYTICS_TOKEN`（可选，看板用） | ⚠️ |
| 健康检查 | `/api/v1/health`（公开）、`/api/v1/admin/health`（认证，D1/R2 状态） | ✅ 已演练 |
| 登录限流 | `LOGIN_MAX_ATTEMPTS`/`LOGIN_WINDOW_MINUTES` 可覆盖默认 5 次/15 分钟 | ✅ |

### 0.3 数据准备

- [ ] D1 生产库已创建；备份/时间点恢复可用性确认
- [ ] 迁移版本预期：0001-0004（`wrangler d1 migrations list` 确认生产当前版本）
- [ ] R2 生产桶已创建；公开访问域名配置好 `R2_PUBLIC_BASE_URL`

## 1. 发布步骤（顺序不可颠倒）

### 步骤 1：备份

```bash
# D1 生产备份（或使用 Cloudflare 控制台时间点恢复）
wrangler d1 export laigequnhao-prod --remote --config wrangler.jsonc --output ./backup-prod-$(date +%Y%m%d-%H%M).sql
# 记录 R2 桶对象数基线
wrangler r2 object list laigequnhao-assets-prod --config wrangler.jsonc | wc -l
```

### 步骤 2：数据库迁移（先迁移后发码）

```bash
wrangler d1 migrations apply laigequnhao-prod --remote --env production --config wrangler.jsonc
# 预期输出：0001-0004 全部 ✅（重复执行自动跳过，d1_migrations 版本表保证幂等）
# 验证：
wrangler d1 execute laigequnhao-prod --remote --env production --config wrangler.jsonc \
  --command "SELECT COUNT(*) AS boards FROM boards; SELECT COUNT(*) AS null_lp FROM groups WHERE last_published_at IS NULL;"
# 期望：boards=1（自定板块），null_lp=全部群组数（初始 NULL，不回填）
```

### 步骤 3：代码发布

```bash
wrangler pages deploy ./dist --env production --config wrangler.jsonc --commit-dirty=true
# 或 CI：pages:deploy
```

### 步骤 4：发布后验证

```bash
# 健康
curl -s https://<域名>/api/v1/health                    # ok:true
curl -s https://<域名>/api/v1/boards                     # 自定板块 + groups:[]
# 公开 smoke（见 evidence/e2e/）：目录/搜索/发现/标签/板块/点赞/提交/详情深链
# 管理 smoke：登录 → 群组列表 → 板块管理 → 运行数据
# 视觉抽查：首页浅色/深色、手机双卡、详情弹窗
```

### 步骤 5：监控接入

- Cloudflare 控制台 → Workers Metrics：请求量/错误率/P95
- `observability.enabled: true`（wrangler.jsonc 已配置）
- 告警建议：5xx 错误率 > 1%（15min 窗口）、`/api/v1/admin/*` 401/403 突增（撞库/CSRF 探测）、R2 上传失败

## 2. 回滚步骤

### 2.1 代码回滚（低风险，最常用）

```bash
# Pages 回滚到上一部署版本（控制台 → Deployments → 选择上一版本 → Rollback）
# 或重新部署上一 commit 的 dist
```
旧代码兼容窗口：新迁移为**纯新增**（nullable 列 + 新表 + 默认板块），旧代码（0003 时代）可忽略这些结构 → **回滚代码无需回滚数据库** ✅（迁移演练已证明）。

### 2.2 数据回滚（仅当迁移后数据被写坏时）

migration 0004 **无降级脚本**（T04 移交 §6）。回滚补偿方案（按顺序）：

```bash
# 1. 恢复备份（若迁移后误操作）
wrangler d1 import laigequnhao-prod --remote --config wrangler.jsonc --file ./backup-prod-<时间>.sql
# 2. 或使用 Cloudflare D1 时间点恢复（PITR，控制台操作，需发布前确认可用）
# 3. 恢复后必须重跑 0004（恢复的是迁移前快照）
wrangler d1 migrations apply laigequnhao-prod --remote --env production --config wrangler.jsonc
```

**禁止**：不能用"删除 boards 表"代替回滚；不能跳过版本表手工删 d1_migrations 记录。

### 2.3 发布失败升级处置

| 现象 | 处置 |
|---|---|
| 迁移失败（某语句报错） | 错误仅影响该语句（演练三验证无副作用）；修复/重跑；确认版本表后继续 |
| 新代码访问旧库 | 明确 `INTERNAL_ERROR`（演练六验证，无泄露）；先迁移后发码可避免 |
| 公开端泄露下架/回收站数据 | **立即回滚代码**；检查 repository 公开过滤；升级 T04 |
| 管理写操作 401/403 异常 | 检查 secrets/CSRF；回滚代码；升级处置 |
| 投稿失败（Turnstile） | 预期行为（A1 已知阻塞）；按用户批准方案处理 |

## 3. 发布后观察（24h）

- [ ] 公开 API 错误率（4xx/5xx）
- [ ] 管理 API 错误率与认证/CSRF 失败
- [ ] 上传/R2 清理日志
- [ ] D1 慢查询（>200ms）
- [ ] 首页/搜索/详情 smoke 每 6h
- [ ] 记录观察窗口、负责人、升级路径

## 4. 已知阻塞项（发布前必须用户决策）

- **A1 Turnstile**：production `SKIP_TURNSTILE=false` + 前端固定 `turnstileToken:"placeholder"` → 生产投稿必然失败。发布前必须：集成 Turnstile widget（前端增量）或服务端替代方案，否则公开投稿能力不可用。
- **B3 回收站 UI 无恢复/永久删除入口**：PRD §21.7 要求保留，当前 UI 缺失（composable 已实现未接线）。发布前需用户批准接线或接受功能缺口。

## 5. 演练证据

- 部署 smoke（创建/点赞/详情/软删/永久删除 404 链）：`/tmp/smoke.mjs` 输出全 OK
- 健康检查：公开 `healthy`；认证 `{api:ok,d1:ok,r2:ok}`
- 迁移六项演练：`evidence/stage11/`
- E2E 52 passed：`evidence/e2e/`
