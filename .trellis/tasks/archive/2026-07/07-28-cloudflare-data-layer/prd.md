# cloudflare-data-layer PRD

## 目标

审核并补全 Cloudflare 数据层基础设施：Wrangler 配置、D1 migration、Repository 层、R2 binding、三环境（本地/预览/生产）隔离。本任务不新增业务功能，只确保基础设施完整可部署。

## 已有资产（审核通过）

| 资产 | 文件 | 状态 |
|---|---|---|
| D1 六表 migration | `migrations/0001_initial.sql` | ✅ 无需改动 |
| Repository 层 | `functions/_lib/repositories/*.ts` | ✅ 无需改动 |
| Env 类型 | `functions/_lib/env.ts` | ⚠️ 需补充 R2 相关 secrets |
| D1 绑定 | `wrangler.jsonc` | ✅ |
| 预览/生产环境 D1 | `wrangler.jsonc` env.preview/production | ✅ |

## 需要补全

### 1. `.dev.vars` 本地 secrets 模板

- 创建 `.dev.vars` 包含所有 secrets 的占位值：
  - `ADMIN_PASSWORD`、`SESSION_SECRET`、`LIKE_PEPPER`、`TURNSTILE_SECRET_KEY`
- 创建 `.dev.vars.example` 作为 git 追踪的模板（不含真实密码）
- 确保 `.gitignore` 已忽略 `.dev.vars`

### 2. Preview 环境 R2 绑定

- `wrangler.jsonc` 的 `env.preview` 和 `env.production` 添加 R2 binding
- 确保三环境 D1/R2 命名一致

### 3. Secrets 配置文档

- `wrangler.jsonc` 顶部注释说明 secrets 需通过 `wrangler secret put` 设置
- 列出每个 secret 的用途和应设置的环境

### 4. R2 Adapter 骨架

- `functions/_lib/adapters/r2-adapter.ts`：
  - `uploadLogo(key, webpBlob)` / `uploadQrCode(key, webpBlob)`
  - `delete(key)`
  - `getPublicUrl(key)` — 使用自定义域名，不返回 `r2.dev`
  - `validateWebp(bytes)` — 验证 RIFF/WEBP 签名
- MVP 阶段仅定义接口，写入占位实现，完整逻辑在管理员任务中实现

### 5. migration 运行脚本

- `package.json` 添加 `db:migrate:local`、`db:migrate:preview`、`db:migrate:prod` scripts
- `db:seed:local` — 可选的本地 seed 脚本入口

## 不在范围内

- 管理员认证（已有 session secret 占位）
- 图片上传 UI
- R2 完整 CRUD（仅骨架）
- D1 schema 变更
- Repository 层修改

## 验收标准

- `AC-01`：`.dev.vars.example` 包含所有 secrets 占位且有用途注释
- `AC-02`：`wrangler.jsonc` 三环境（local/preview/production）均有 D1 + R2 绑定
- `AC-03`：`R2_ADAPTER` 接口定义完整（upload/delete/getPublicUrl/validateWebp）
- `AC-04`：`package.json` 包含 `db:migrate:local` / `db:migrate:preview` scripts
- `AC-05`：`pnpm lint`、`pnpm typecheck` 通过
- `AC-06`：`pnpm db:migrate:local` 可执行（已有 D1 的前提下）

