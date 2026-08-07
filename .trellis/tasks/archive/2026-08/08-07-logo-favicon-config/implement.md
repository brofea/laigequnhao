# 执行计划：顶栏 Logo 与 Favicon 可配置化

## 顺序清单

1. `shared/domain/config.ts`
   - `headerConfigSchema`：删 `brandMark` / `brandLabel`，加 `logoUrl`（共用图片 URL refine）。
   - 新增模块级 `imageUrlSchema`（扩展名 + 路径形式 refine），`siteConfigSchema` 顶层加 `faviconUrl`。
2. `shared/domain/index.ts`：导出新增 schema/类型（如 `headerConfigSchema` 已在列，无需变动；确认类型导出是否需加）。
3. `public/logo.svg`、`public/favicon.svg`：新建 `#` 符号默认图。
4. `site.config.ts`：header 组替换为 `logoUrl: "/logo.svg"`，顶层加 `faviconUrl: "/favicon.svg"`。
5. `src/main.ts`：动态设置 favicon link（href + type 按扩展名）。
6. `src/components/SiteHeader.vue`：品牌区改 `<img>`。
7. `src/components/VisualShell.vue`：同上。
8. `src/styles/index.css`：`.app-brand__mark` → `.app-brand__logo` 图片样式；删 `.app-brand strong`。
9. `shared/domain/config.spec.ts`：更新 validConfig 与既有用例，新增图片 URL 校验用例。

## 校验命令

```bash
pnpm typecheck
pnpm vitest run shared/domain/config.spec.ts
```

## 审查门

- grep `brandMark|brandLabel` 确认无残留引用。
- dev 运行验证：顶栏 Logo 渲染、标签页 favicon 生效。

## 回滚点

- 单文件改动可独立回退；配置契约变更集中在步骤 1/2，若 schema 校验与渲染不一致，先回退渲染侧（步骤 6-8）。
