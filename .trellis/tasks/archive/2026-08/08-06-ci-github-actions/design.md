# 技术设计：两阶段交付（本地跑通 → CI 工作流）

## 阶段划分

```
阶段 A：本地绿色基线（用户指令：先跑通，不盲目 debug）
  A1 非 e2e 门禁（已全部验证通过）：lint / typecheck / test / test:workers / build
  A2 e2e 修复（已实施 6 项，R5）：见 prd.md R5
  A3 e2e 全量验证：干净 .e2e-state 上跑 5 个 project
  A4 已知环境差异处理：API 偶发崩溃 / 状态残留 → 清理重跑，不 debug 代码

阶段 B：CI 工作流（基于 A 阶段绿色基线）
  B1 .github/actions/setup-pnpm/action.yml（composite，已初稿）
  B2 .github/workflows/ci.yml（已初稿，含 heredoc 生成 .dev.vars）
  B3 校验：actionlint / prettier --check .github / YAML 解析
  B4 .trellis/spec/ci/ spec 文档
  B5 质量检查与提交
```

## 阶段 A 设计

- 环境差异处理原则（写进 ci spec）：
  - Windows 本地 e2e API 偶发崩溃（ECONNREFUSED 批量失败）：清理残留进程与 `.e2e-state` 后重跑；不做代码级 workaround（CI 为 Linux，不受影响）。
  - `.e2e-state` 文件锁清空失败：先 `Stop-Process` 杀干净 laigequnhao 相关 node 进程再删除。
  - `image-webkit:165`：探针已排除菜单遮挡（菜单已收起）与几何问题（720px 视口点击成功），根因未定；记录为已知偶发项，CI retries=2 兜底，CI 上稳定复现则另开任务。
- 验收判据：一次干净运行 5 个 project 全绿即为阶段 A 完成；遭遇已知环境差异时，清理重跑后全绿也算完成（记录在 spec）。

## 阶段 B 设计（沿用已定稿设计）

- 触发：`pull_request`（branches: main）+ `workflow_dispatch`；concurrency 按 ref 分组、cancel-in-progress。
- 5 个并行 job：`quality`（lint→format:check→typecheck）、`unit`（test）、`workers`（test:workers）、`build`（build）、`e2e`（浏览器安装+缓存→生成 .dev.vars→test:e2e→失败上传 artifact）。
- 环境：ubuntu-latest、Node 22、`pnpm/action-setup@v4`（读 packageManager）、`actions/setup-node@v4`（cache: pnpm）、ms-playwright 缓存。
- 零 Secrets；`tests/e2e/.dev.vars` 由 heredoc 生成，与本地文件保持同步（不含 R2_PUBLIC_BASE_URL）。

## 回滚

- 阶段 A 的 R5 修复可逐个还原（git diff 清晰）。
- 阶段 B 产物整体删除即可回滚；不影响产品代码。
