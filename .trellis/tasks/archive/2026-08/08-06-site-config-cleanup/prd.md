# site.config 落地：footer 机构信息 + platforms 统一 + 清理未用字段

## Goal

让 `site.config.ts` 的配置项与部署页面真正对齐：footer 展示机构信息（name/description/contactEmail/copyright），添加群组表单的平台选择框读取 `siteConfig.platforms`，并删除全部未被使用的字段，避免迷惑。

## Source

用户反馈（本会话）：site.config.ts 中配置项并不全部出现在部署网页中；platforms 列表与添加群组 Dialog 选择框不一致；无用变量应删除。

## 现状（调研结论）

| 字段 | 使用情况 |
|---|---|
| `title` | ✅ LoginView h1、VisualShell footer、main.ts document.title |
| `header.brandLabel/brandMark/githubUrl/githubLabel/addGroup.label` | ✅ SiteHeader / VisualShell |
| `rotation` / `boards.timezone` | ✅ functions/_lib/routes（后端轮换与板块时段），**必须保留** |
| `name` `shortName` `description` `contactEmail` `copyright` | ❌ 未使用 |
| `theme.*` | ❌ 未使用（正式主题由 src/features/theme 驱动） |
| `header.addGroup.target/route` | ❌ 未使用（添加群组写死为 submission-dialog） |
| `platforms` | ❌ 未使用；AdminEditForm.vue:105 硬编码 4 项（QQ/微信群/Telegram/Discord），与 config 10 项不一致 |
| `features` | ❌ 空扩展点 `{}` |

## Requirements

### R1. Footer 补齐机构信息（用户已确认：footer 补齐机构信息）

- `VisualShell.vue` 的 `.app-footer` 增加机构信息展示：`name`、`description`、`contactEmail`（mailto 链接）、`copyright`。
- `shortName` 删除（无消费场景；footer 用 `name`）。
- 保留现有"当前主题/reduced motion"信息（或与机构信息合理布局，保持简洁）。
- footer 样式需在浅色/深色下正常（沿用现有 `--text-muted` 等变量）。

### R2. platforms 统一（用户已确认：表单改读 siteConfig.platforms）

- `AdminEditForm.vue` 的 `platformOptions` 改为由 `siteConfig.platforms` 生成（`{ value, label }` 一一对应）。
- `site.config.ts` 保留 10 项平台列表。
- 其他平台相关硬编码（如 VisualShell 的默认 draft platform "微信群"）不强制改，但需保证选择框内可选。

### R3. 清理未用字段（用户已确认：删 theme/target/features）

- 删除 `site.config.ts` 中的：`theme`、`header.addGroup.target`、`header.addGroup.route`、`features`、`shortName`。
- 同步更新 `shared/domain/config.ts` 的 `siteConfigSchema`：删除 `themeConfigSchema`、`header.addGroup.target/route`（addGroup 只留 `label`）、`featuresConfigSchema`、`shortName`。
- `shared/domain/config.spec.ts` 的测试同步调整（validConfig 等）。
- 检查是否有其他地方引用被删字段（如 `siteConfig.theme`、`features`、`addGroup.target`），确保删除后无编译错误。

### R4. 保留项

- `name` `description` `contactEmail` `copyright` `title` `header.*`（除 target/route）`platforms` `rotation` `boards` 全部保留。

## Acceptance Criteria

- [ ] footer 显示机构名称、简介、联系方式（mailto）、版权信息，浅色/深色下正常
- [ ] 添加群组/编辑群组 Dialog 的平台选择框选项与 `siteConfig.platforms` 一致（10 项）
- [ ] `site.config.ts` / `config.ts` / `config.spec.ts` 中无 `theme`、`addGroup.target`、`addGroup.route`、`features`、`shortName` 残留
- [ ] 全仓无对被删字段的引用（grep `siteConfig.theme`、`shortName`、`addGroup.target` 等无命中）
- [ ] `pnpm lint`、`pnpm typecheck` 通过；`pnpm test` 无回归
- [ ] 后端 functions（groups/boards 路由）不受影响（rotation/boards 保留）

## Notes

- Lightweight task：PRD-only。
- 相关文件：`site.config.ts`、`shared/domain/config.ts`、`shared/domain/config.spec.ts`、`src/components/VisualShell.vue`（footer）、`src/components/AdminEditForm.vue`（platformOptions）、`src/components/SiteHeader.vue`（如引用 addGroup.target 需检查）。
- `features` 删除后注意 `siteConfigSchema` 的 `.strict()` 行为与任何 `.parse` 调用点（site.config.ts 的 `rawConfig` 若保留多余字段会校验失败，必须同步删）。
