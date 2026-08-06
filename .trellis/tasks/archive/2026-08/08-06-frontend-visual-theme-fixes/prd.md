# 前端视觉与主题问题修复 (issue 2/10/12/17)

## Goal

修复仓库中 4 个前端视觉/主题 issue：Dialog eyebrow 残留、Dialog 滚动条与圆角冲突、管理端验证页过亮、深色模式滚动回弹露白。全部为视觉/样式问题，不改变数据与业务逻辑。

## Source Issues

| Issue | 标题 | Child Task |
|---|---|---|
| #10 | 视觉样例迁移残留 | `08-06-dialog-eyebrow-config` |
| #2 | Dialog 滚动条和圆角冲突 | `08-06-dialog-scrollbar-radius` |
| #12 | 管理端验证页面太亮 | `08-06-overscroll-bg-fix`（合并） |
| #17 | 深色模式滚动回弹时短暂露出白色背景 | `08-06-overscroll-bg-fix`（合并） |

## Requirements

- 每个 issue 独立实现、独立验证、独立归档。
- #12 与 #17 根因相关（主题 CSS 变量未覆盖 html/body 层），合并为一个 child 处理根因。
- 不允许禁用浏览器原生滚动回弹（issue #17 约束）。
- Dialog 滚动条必须保留原生滚动能力，不允许隐藏滚动条（issue #2 comment 约束）。
- 全站 `color-scheme` 与 `theme-color` 需随主题正确切换。

## Acceptance Criteria（跨子任务）

- [ ] 4 个 issue 各自的验收标准在对应 child prd.md 中达成
- [ ] `pnpm lint`、`pnpm typecheck` 通过
- [ ] 现有单测（`pnpm test`）无回归
- [ ] 深色模式下整站（含管理端）刷新、滚动回弹、Dialog 交互均无露白
- [ ] 相关 issue 修复后由用户关闭并附实现说明

## Notes

- 任务树：parent 只做集成验收，不承载直接实现工作。
- 每个 child 可独立 `task.py start` / finish / archive。
