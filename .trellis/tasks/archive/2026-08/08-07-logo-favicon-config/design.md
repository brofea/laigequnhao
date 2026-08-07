# 设计：顶栏 Logo 与 Favicon 可配置化

## 现状

- 顶栏品牌区：`SiteHeader.vue:33-34` 与 `VisualShell.vue:962-963` 用 `.app-brand__mark` 文字块（`header.brandMark`）+ `header.brandLabel` 文字渲染。
- Favicon：`index.html:7` 静态 `<link rel="icon" href="./favicon.svg">`，无配置化。
- 配置：`shared/domain/config.ts` 的 `headerConfigSchema`（brandMark/brandLabel）与 `siteConfigSchema`（title 等）；`src/main.ts` 已做 `document.title = siteConfig.title`。

## 配置契约

```ts
// header 组（移除 brandMark/brandLabel，新增 logoUrl）
header: {
  logoUrl: string,   // png/jpg/jpeg/svg，以 / 开头或 http(s):// 绝对 URL
  githubUrl: string,
  githubLabel: string,
  addGroup: { label: string },
}

// 站点级新增
faviconUrl: string,  // 校验规则同 logoUrl
```

### 图片 URL 校验（zod refine）

```ts
const imageUrlRefine = (v: string) => /\.(png|jpe?g|svg)$/i.test(v) && /^(\/|https?:\/\/)/i.test(v);
```

- 扩展名白名单：`.png` `.jpg` `.jpeg` `.svg`（大小写不敏感）。
- 路径形式：以 `/` 开头（public 根路径）或绝对 http/https URL。相对路径（如 `logo.svg`）在 `createWebHistory` 下会随路由路径失效，故拒绝。
- 通用 helper 供 `logoUrl` / `faviconUrl` 复用（模块内函数 + 导出到 index.ts 可选）。

## 渲染方案

### 顶栏 Logo（两处）

`.app-brand__mark` 文本 span → `<img class="app-brand__logo" :src="siteConfig.header.logoUrl" alt="" aria-hidden="true">`。

- `SiteHeader.vue` 品牌区仅剩图片（RouterLink 内）。
- `VisualShell.vue` 同样替换；RouterLink `aria-label="回到公开首页"` 保留，保证可访问性。
- CSS：`src/styles/index.css` 中 `.app-brand__mark` 改为 `.app-brand__logo` 图片样式：40×40px、`object-fit: contain`、圆角；删除不再使用的 `.app-brand strong` 规则。

### Favicon（运行时生效）

`src/main.ts` 在设置 title 之后追加：

```ts
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
icon.href = siteConfig.faviconUrl;
icon.type = "image/" + ext;  // svg → image/svg+xml, png → image/png, jpg/jpeg → image/jpeg
```

- `index.html:7` 静态 `<link rel="icon">` 保留为无 JS 兜底（href 指向默认 `/favicon.svg`）。

## 默认资产

- `public/logo.svg`：`#` 符号风格，圆角方块 + 白色 `#` 图形，64px viewBox。
- `public/favicon.svg`：同风格 `#` 符号（可略简），独立文件。
- 两个文件彼此独立（满足"顶栏 Logo 与 Favicon 不是同一张图"），`site.config.ts` 默认值分别为 `/logo.svg`、`/favicon.svg`。

## 兼容性与影响面

- 配置破坏性变更：`brandMark`/`brandLabel` 删除 → 所有引用点同步改（SiteHeader、VisualShell、schema、spec、site.config.ts）。
- 其他引用 `header.brandMark` / `brandLabel` 的地方（grep 确认仅上述两组件）一并处理。
- `prototype/` 不在范围内。
- 主题：Logo 为图片不随主题变色，视觉上与现有 accent 色块不一致属预期（配置方可自备深色主题图）。

## 测试

- `config.spec.ts`：validConfig 更新（header 无 brandMark/brandLabel、含 logoUrl；顶层含 faviconUrl）；新增用例——拒绝 `.gif`、拒绝非绝对路径（`logo.svg`）、接受绝对 URL。
- `pnpm typecheck` + `pnpm vitest run shared/domain/config.spec.ts`。
