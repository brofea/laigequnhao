# CI 规范

这些文件定义"来个群号"仓库的 GitHub Actions 持续集成约定：哪些命令构成质量门禁、测试的纳入与隔离边界、CI 与本地环境的差异，以及新增测试时的接入要求。

## 基准技术栈

- GitHub Actions（`.github/workflows/ci.yml`），ubuntu-latest + Node 22 + pnpm（随 `packageManager` 解析）
- 本地质量门禁与 CI 完全一致：ESLint、Prettier、vue-tsc/tsc、Vitest（jsdom）、Workers Vitest（workerd）、Playwright（chromium/webkit/firefox）、Vite 生产构建
- 全程本地模拟（miniflare / wrangler dev / vite dev），CI 不需要任何 GitHub Secrets，fork PR 可跑

## 规范索引

| 规范 | 负责内容 |
|---|---|
| [CI 约定](./ci-guidelines.md) | 触发条件、工作流结构、测试纳入范围、隔离与排除记录、环境差异、接入约定 |

## 当前依据

- 任务记录：`.trellis/tasks/08-06-ci-github-actions/`（规划与实施全过程）
- 测试分层与门禁要求见[测试策略](../guides/testing-strategy.md)
