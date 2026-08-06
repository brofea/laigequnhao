# 主题变量上移根层：回弹露白 + 管理端验证页过亮 (issue 17 + 12)

## Goal

两个根因相同的 issue 合并修复：主题 CSS 变量仅定义在 `.app-shell[data-theme=...]` 上，`:root`/`body` 背景硬编码浅色 `#f3f5f8`，导致：

- **#17**：深色模式滚动回弹时 html/body 露出白色背景闪烁
- **#12**：管理端"正在验证管理员会话"页面（`src/views/admin/AdminView.vue:19` 的 `main.app-shell` 无 `:data-theme` 绑定）永远是浅色

## Requirements

- 主题变量上移到根层：CSS 变量定义改为响应 `:root` 上的 `data-theme` 属性（`bootstrapTheme` 已通过 `applyThemeToDocument` 在 `documentElement` 上设置该属性），`.app-shell` 保留变量引用。
- `html` / `body` 背景不再硬编码浅色，改为引用主题变量并随主题切换。
- `index.html` 的 `<meta name="theme-color">` 从硬编码 `#f3f5f8` 改为随主题更新（bootstrap 时同步写入，浅色/深色各一份值）。
- `color-scheme` 已由 `applyThemeToRoot` 设置在根上，保持并验证生效。
- `AdminView.vue` 验证分支的 `main.app-shell` 补上 `:data-theme` 绑定（复用 `useTheme().resolvedTheme`，与 LoginView / VisualShell 一致），使验证页在浅色/深色/系统模式下背景正确。
- 保留浏览器原生滚动回弹效果，不允许禁用回弹（issue #17 约束）。

## Acceptance Criteria

- [ ] 深色模式下页面滚动到顶部/底部触发回弹不再露出白色背景
- [ ] "正在验证管理员会话"页面在浅色/深色/系统模式下背景与主题一致（深色模式不再白屏）
- [ ] `theme-color` meta 随主题更新（浅色 `#f3f5f8`、深色对应值）
- [ ] 浅色模式视觉无回归（`:root`/`body` 背景仍为 `#f3f5f8`）
- [ ] 管理端登录页、主视图、验证页主题行为一致
- [ ] `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 无回归

## Notes

- 用户已确认：合并为一个 child，变量上移到根层处理根因。
- 涉及主题机制（bootstrap / CSS 变量），实现前需读 `.trellis/spec/frontend/` 与 `src/features/theme/` 现有测试（`theme.spec.ts`）。
