# PRD: 平台与加群方式彻底解耦

## Goal

删除 `PlatformConfig` 类型和所有平台键值对映射，将平台改为纯文本标签。前端用预设列表 + 自定义输入替代现有 `<input>`+`<datalist>` 方案（该方案存在 `id`/`name` 匹配 bug）。

## Background

### 代码库探索结论

**好消息**：`platform` 在 DB 层、API 层、Zod schema 层已经是自由文本 — 唯一受约束的是前端 UI 和 `site.config.ts`。

**当前问题**：

| 位置 | 问题 |
|------|------|
| `shared/domain/platform.ts` | `PlatformConfig = { id, name }` — 整个文件需删除 |
| `site.config.ts` | `[{ id: "qq", name: "QQ" }, ...]` — 键值对需改为 `string[]` |
| `AdminGroupFields.vue` | `<datalist>` 值用 `p.name`，但 `currentPlatform` 用 `p.id` 匹配 → **bug** |
| `SubmissionDialog.vue` | `<select>` 下拉框 — 用户只能选预设平台 |
| `useAdminGroupDraft.ts` | `currentPlatform` 基于 `id` 查找，且未被任何组件使用 |

### 设计决策

- **方案 A（已确认）**：`site.config.ts` 保留 `platforms: string[]`，部署方可编辑。自定义输入不写回配置。

### 默认平台列表

QQ、微信、钉钉、飞书、小红书、抖音、百度贴吧、Telegram、Discord

## Requirements

### R1: 删除 PlatformConfig 类型

- 删除 `shared/domain/platform.ts` 文件
- `shared/domain/config.ts`: `platforms` 从 `z.array(platformConfigSchema).min(1)` 改为 `z.array(z.string().min(1)).min(1)`
- `shared/domain/index.ts`: 移除 `PlatformConfig` / `platformConfigSchema` 导出
- `site.config.ts`: 移除 `PlatformConfig` 导入和 re-export

### R2: 更新 site.config.ts

- `platforms` 改为 `string[]`：`["QQ", "微信", "钉钉", "飞书", "小红书", "抖音", "百度贴吧", "Telegram", "Discord"]`

### R3: 前端 Select + 自定义输入

- `AdminGroupFields.vue`：用 `<select>` 展示预设列表 + 额外 `<option value="__custom__">自定义</option>`
- 选择"自定义"时显示 `<input>` 文本输入框
- `SubmissionDialog.vue`：同样改造
- 修复 `id`/`name` 不匹配的遗留 bug

### R4: 清理 useAdminGroupDraft

- 删除 `currentPlatform` 计算属性（未被任何组件消费）
- `emptyDraft` 默认平台改为 `siteConfig.platforms[0]`
- 移除 `PlatformConfig` 导入

### R5: 更新种子脚本

- 删除 `PLATFORM_NAMES`
- `PLATFORMS` 直接用中文名

## Acceptance Criteria

1. **AC1**: 新建群组时，平台下拉框显示 9 个预设 + "自定义"选项
2. **AC2**: 选择"自定义"出现文本输入框，可输入任意平台名
3. **AC3**: 编辑已有群组，平台正确回显（含自定义平台名）
4. **AC4**: 种子脚本生成中文平台名
5. **AC5**: `PlatformConfig` 类型及相关文件完全删除
6. **AC6**: `vue-tsc` + `tsc` 类型检查通过

## Out of Scope

- 数据库迁移（platform 列已是 TEXT）
- 公开首页的平台筛选

## Files to Change

| File | Change |
|------|--------|
| `shared/domain/platform.ts` | **删除** |
| `shared/domain/config.ts` | `platforms: z.array(z.string())` |
| `shared/domain/index.ts` | 移除 PlatformConfig 导出 |
| `site.config.ts` | `string[]`，移除 re-export |
| `useAdminGroupDraft.ts` | 删除 `currentPlatform` + PlatformConfig 导入 |
| `AdminGroupFields.vue` | `<select>` + 自定义 `<input>` |
| `SubmissionDialog.vue` | 同上 |
| `seed-local.mjs` | 直接用中文名 |
