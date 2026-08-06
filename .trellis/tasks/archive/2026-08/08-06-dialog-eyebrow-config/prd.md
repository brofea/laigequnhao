# Dialog eyebrow 副标题可配置化 (issue 10)

## Goal

Dialog 头部残留"视觉样例 · 模拟数据"的硬编码 eyebrow 副标题（`src/components/Dialog.vue:110`）。将其改为可配置 prop，由各调用方按语义传入。

## Requirements

- `Dialog.vue` 新增可选 prop `eyebrow?: string`；**不传则不渲染** eyebrow 元素。
- 删除硬编码的"视觉样例 · 模拟数据"文案。
- `src/components/VisualShell.vue` 中 8 个 Dialog 实例按语义逐一传入 eyebrow：
  - 群组详情 → 群组详情
  - 提交新群 → 提交新群
  - 添加新群 · 管理编辑 → 添加群组
  - 编辑群组 · 窄屏抽屉样例 → 编辑群组
  - 编辑板块详细信息 → 编辑板块
  - 新增板块 → 新增板块
  - 板块内添加新群 → 板块内添加新群
  - 永久删除确认 → 不传（无需类别语义，不渲染）
- 不动 eyebrow 现有样式（`.eyebrow` 类保持不变）。

## Acceptance Criteria

- [ ] Dialog 头部不再出现"视觉样例 · 模拟数据"
- [ ] 8 个 Dialog 实例显示各自语义化的 eyebrow；删除确认框无 eyebrow
- [ ] 其他使用 Dialog 的视图（如有）不传 eyebrow 时不渲染该元素
- [ ] `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 无回归

## Notes

- 用户已确认：可选 prop，不传不渲染。
- Lightweight task：PRD-only，无需 design.md / implement.md。
