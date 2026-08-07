# 执行计划：两阶段交付（本地跑通 → CI 工作流）

## 阶段 A：本地绿色基线

### A1 非 e2e 门禁（已完成，2026-08-06 验证）

- [x] `pnpm lint` → 0 错误（33 警告为既有）
- [x] `pnpm typecheck` → 通过
- [x] `pnpm test` → 22 文件 173 例通过
- [x] `pnpm test:workers` → 11 文件 135 例通过
- [x] `pnpm build` → vue-tsc + vite build 通过（`pnpm build` 脚本本体因 Windows spawn shim ENOENT 本地失败，CI Linux 无此问题；已分别验证其两个组成命令通过）
- [ ] `format:check` → 本地 CRLF 假阳性（`core.autocrlf=true` + 无 .gitattributes），不阻塞；CI（Linux/LF）验证

### A2 e2e 修复（已完成实施，R5 六项）

- [x] `tests/e2e/.dev.vars` 移除 assets.e2e.invalid
- [x] `BoardManagement.expandedId` watch 首次填充补全
- [x] `a11y-flows.spec.ts` Tab 前等待种子卡片
- [x] `image-flows.spec.ts:238` 移除前收起加群方式菜单
- [x] `image-flows.spec.ts:165` 保存前收起加群方式菜单
- [x] `admin-flows.spec.ts` 删除循环前等待板块渲染

### A3 e2e 全量验证（进行中）

- [ ] 干净 `.e2e-state` + 杀残留进程后跑 `pnpm exec playwright test` 全量 5 project
- [ ] 遭遇已知环境差异（API 崩溃/状态残留）→ 清理重跑；重跑后全绿即验收
- [ ] 将 Windows 环境差异与 `image-webkit:165` 偶发项写入 ci spec（已知项记录，不再 debug）

## 阶段 B：CI 工作流（A 阶段验收后）

### B1 产物（初稿已存在，验收后终检）

- [ ] `.github/actions/setup-pnpm/action.yml`：pnpm/action-setup@v4 + setup-node@v4（22/cache: pnpm）+ `pnpm install --frozen-lockfile`
- [ ] `.github/workflows/ci.yml`：双触发 + concurrency + 5 jobs（quality/unit/workers/build/e2e）+ e2e 浏览器安装与 ms-playwright 缓存 + heredoc 生成 `tests/e2e/.dev.vars` + 失败上传 artifact

### B2 校验

- [ ] `actionlint .github/workflows/ci.yml`（已通过，终检复跑）
- [ ] `pnpm exec prettier --check .github`（已通过）
- [ ] YAML 语法解析（已通过）

### B3 spec 文档（简体中文）

- [ ] `.trellis/spec/ci/index.md`（层索引，仿 backend/index.md 格式）
- [ ] `.trellis/spec/ci/ci-guidelines.md`：触发与结构、7 条门禁全量、隔离/排除记录（prototype/、seed-local.test.mjs、cloudflare:check、db:test:*，各含负责人/原因/解除条件）、`.dev.vars` 生成与同步约定、**已知环境差异记录（Windows e2e API 偶发崩溃、状态残留、image-webkit:165 偶发项）**、新增测试接入约定、action 版本固定约定

### B4 提交

- [ ] `git status --porcelain` 确认产品改动仅限 A2 六项相关文件
- [ ] commit：`ci(actions): 新增 GitHub Action CI 工作流与 CI 规范`（Conventional Commits + 中文 body）

## 验证命令

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:workers && pnpm build
pnpm exec playwright test          # 干净状态全量 5 project
actionlint .github/workflows/ci.yml
pnpm exec prettier --check .github
```

## 风险与回滚点

- 阶段 A 剩余风险：`image-webkit:165` 偶发（不再 debug，CI 验证 + retries=2）；e2e API Windows 偶发崩溃（重跑策略）。
- 回滚点：A2 六项修复可逐个还原；B1 产物整体删除。
- 需保持一致性：`tests/e2e/.dev.vars` 本地文件与 workflow heredoc 同步（ci-guidelines.md 记录）。
