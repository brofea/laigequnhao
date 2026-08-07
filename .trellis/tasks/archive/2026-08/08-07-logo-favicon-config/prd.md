# 顶栏 Logo 与 Favicon 可配置化（支持 png/jpg/svg）

## Goal

让网站顶栏 Logo 与 Favicon 变为站点配置（site.config.ts）中的可配置图片，支持 png / jpg / svg 三种格式；顶栏 Logo 与 Favicon 是**两个独立的配置项**，各自可替换。

## Requirements

- `site.config.ts` 新增两个图片配置项：
  - 顶栏 Logo：归入 `header` 配置组（如 `header.logoUrl`）。
  - Favicon：站点级配置（如 `faviconUrl`）。
- 两个配置项均只接受 png / jpg / jpeg / svg 四种扩展名，路径以 `/` 开头或为绝对 URL（http/https）。
- 顶栏品牌区改为纯图片：Logo 图片替换现有的 `brandMark` 文字块，**移除 `header.brandLabel` 与 `header.brandMark` 配置项**，品牌区不再显示文字。
- Favicon 配置在运行时生效：`src/main.ts` 按配置动态更新 `<link rel="icon">`；`index.html` 保留静态 favicon 作为无 JS 兜底。
- 默认资产：生成一个 `#` 符号风格的 SVG，替换现有顶栏 Logo 与 Favicon。二者为独立文件、独立配置项（Logo 与 Favicon 不是同一张图）。
- 配置校验（zod）与既有测试同步更新；`prototype/` 目录不在本次范围。

## Acceptance Criteria

- [ ] `shared/domain/config.ts` 中 `header` 组不再包含 `brandMark` / `brandLabel`，包含 `logoUrl`；`siteConfigSchema` 顶层包含 `faviconUrl`。
- [ ] 配置校验拒绝非 png/jpg/jpeg/svg 扩展名、拒绝不以 `/` 开头的相对路径（绝对 URL 除外）。
- [ ] 顶栏（SiteHeader.vue 与 VisualShell.vue 两处）以 `<img>` 渲染 `header.logoUrl`，品牌区无文字。
- [ ] `src/main.ts` 动态设置 favicon `<link rel="icon">` 的 href 与 type（按扩展名推断）。
- [ ] `public/logo.svg` 与 `public/favicon.svg` 为 `#` 符号风格默认图，`site.config.ts` 默认值指向二者。
- [ ] `shared/domain/config.spec.ts` 全量通过；`pnpm typecheck` 通过。
- [ ] 手工验证：dev 站点顶栏显示 Logo 图、浏览器标签页显示新 Favicon；替换为 png/jpg 后同样生效。

## Notes

- 顶栏展示形式已与用户确认：纯图片，去掉文字（brandLabel/brandMark 一并删除）。
- prototype/ 为独立原型目录，不改动。
