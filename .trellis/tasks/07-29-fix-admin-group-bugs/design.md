# 技术设计

## 1. 状态排序常量（C2，A1/A2 共用）

**位置**：`src/features/admin/constants.ts`（新建）

```ts
/** 管理端状态排序权重（待审核→已发布→已下架→已拒绝→回收站） */
export const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  published: 1,
  delisted: 2,
  rejected: 3,
};

/** 筛选按钮渲染顺序 */
export const STATUS_FILTER_ORDER = ["pending", "published", "delisted", "rejected"] as const;
```

A1 和 A2 引用此常量，后端 `listAll` 的 CASE 表达式改为读取同一权重。

## 2. 排序三态（A3）

**位置**：`src/features/admin/composables/useAdminGroups.ts`

当前排序逻辑：
```ts
// sortBy 为 null → 默认排序（created_at DESC）
// sortBy 有值 → 固定 sortDir
```

改为：
```ts
// sortBy: null → 默认排序（状态 ASC，标题 ASC）
// sortBy 有值 + sortDir "asc" → 升序
// sortBy 有值 + sortDir "desc" → 降序
// 用户点击当前排序列 → 取消排序（sortBy = null）
```

**位置**：`src/features/admin/components/AdminGroupTable.vue`

列头 aria-sort 属性：`none` → `ascending` → `descending` → `none`。视觉：无箭头 → ↑ → ↓ → 无箭头。

## 3. 平台解绑（B0）

### 3.1 Config Schema 变更

**位置**：`shared/domain/config.ts`

```ts
// 旧
platformConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  allowedJoinMethods: z.array(z.enum(["group_number", "qr_code", "url"])),
});

// 新
platformConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // 支持中文
});
```

移除 `allowedJoinMethods`。

### 3.2 site.config.ts 更新

```ts
platforms: [
  { id: "qq", name: "QQ" },
  { id: "wechat", name: "微信" },
  { id: "dingtalk", name: "钉钉" },
  { id: "discord", name: "Discord" },
  { id: "telegram", name: "Telegram" },
],
```

### 3.3 前端 Platform Selector

**位置**：`AdminGroupFields.vue`

改用 combobox 模式：`<input list="platforms">` + `<datalist>`，既可从列表选也可自由输入。datalist 选项来自 `siteConfig.platforms`。

### 3.4 筛选下拉

管理端筛选面板的平台下拉只显示 `siteConfig.platforms` 中配置的平台，不显示自定义平台。

### 3.5 加群方式编辑器

**位置**：`AdminJoinMethodEditor.vue`

移除 platform prop 依赖，三种加群方式始终可选。

### 3.6 后端校验

检查 `functions/_lib/routes/admin-groups.ts` 中 create/update 是否有 platform → join method 的校验，如有则移除。

## 4. Logo 头像编辑（B1）

### 4.1 组件结构

`AdminGroupDrawer.vue` 顶部新增 Logo 区域：

```vue
<div class="logo-area">
  <img :src="logoPreview" class="w-24 h-24 rounded-full object-cover" />
  <ImageUploader purpose="logo" :existingUrl="group?.logoUrl" @uploaded="onLogoUploaded" @remove="onLogoRemoved" />
</div>
```

复用现有 `ImageUploader` 组件（purpose="logo"），传入 `existingUrl`。

### 4.2 Draft 状态扩展

**位置**：`useAdminGroupDraft.ts`

```ts
interface DraftState {
  // ... existing fields
  logoBlob: Blob | null;       // 新上传的 logo
  logoRemoved: boolean;        // 是否删除了已有 logo
}
```

### 4.3 保存逻辑

位置：`AdminGroupDrawer.vue` 的 `handleSave`：

1. 有 `logoBlob` → 上传到 R2 → 创建 staged asset
2. 有 `logoRemoved` → logoR2Key 设为 null, logoUrl 设为 null
3. 修改 group 时传 `logoR2Key`、`adoptAssetIds`
4. 旧 logo asset 的 ref_count 由 `update()` 中的 batch 自动处理

### 4.4 Asset 生命周期

- 新建群组：logo asset staged → create() 中 adopt → ready
- 编辑换图：旧 logo asset ref_count-1（batch 中 `update` 的 asset removal 逻辑）→ 新 staged asset adopt
- 编辑删图：旧 logo asset ref_count-1
- 软删除：logo asset 保持 ready（不处理 ref_count）
- 恢复（C1）：找到 logo_r2_key 对应的 asset → ref_count+1
- 永久删除：`permanentDelete` 流程中已处理 logo R2 key

## 5. 加群方式按钮（B2）

**位置**：`AdminJoinMethodEditor.vue`

```ts
const ALL_JOIN_TYPES = [
  { type: "qr_code", label: "二维码" },
  { type: "group_number", label: "群号" },
  { type: "url", label: "链接" },
] as const;

const availableTypes = computed(() =>
  ALL_JOIN_TYPES.filter(t => !methods.value.some(m => m.type === t.type))
);
```

下拉按钮改为三个独立按钮或分段控制器，每段对应一种类型，已存在则隐藏。

## 6. QR 图片处理（B3）

### 6.1 常量更新

**位置**：`shared/contracts/asset.ts`

```ts
export const QR_CODE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const QR_CODE_TARGET_BYTES = 300 * 1024; // 300KB 压缩目标
export const QR_CODE_MAX_DIMENSION = 1024; // 最长边限制
```

### 6.2 图片处理器

**位置**：`src/features/admin/composables/useImageProcessor.ts`

`process()` 函数增强：

```ts
async function process(file: File, maxBytes: number, targetBytes?: number, maxDim?: number): Promise<ProcessResult | null> {
  // 1. 格式校验：接受任意图片格式
  if (!file.type.startsWith("image/")) { error = "仅支持图片格式"; return null; }

  // 2. 大小校验
  if (file.size > maxBytes) { error = `文件大小 ${formatBytes(file.size)} 超过限制 ${formatBytes(maxBytes)}`; return null; }

  // 3. 加载图片
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // 4. 缩放到最长边 ≤ maxDim
  let { width, height } = img;
  if (maxDim && Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  // 5. 检测 alpha 通道
  const imageData = ctx.getImageData(0, 0, 1, 1);
  const hasAlpha = imageData.data[3] < 255; // 简化检测：采样左上角

  // 6. 压缩到 targetBytes（二分搜索 quality）
  let blob: Blob;
  let quality = 0.8;
  const mimeType = hasAlpha ? "image/webp" : "image/webp";
  // 二分压缩...
}
```

### 6.3 错误信息

所有 `error.value = "..."` 改为中文。

## 7. 编辑模式图片显示（B4）

### 7.1 后端 Asset URL 补充（C3）

**位置**：`functions/_lib/routes/admin-groups.ts`

在 `listAll` 和 `getById` 的返回数据中，补充 joinMethods 的 assetUrl。

方案：在 `mapToAdminDto` 调用后，遍历 `joinMethods`，对 qr_code 类型且 asset 为 ready 状态者，拼接 `R2_PUBLIC_BASE_URL` + `r2_key` 得到 `assetUrl`。

### 7.2 Logo 图片

已有 `group.logoUrl`，直接传给 ImageUploader 的 `existingUrl`。

### 7.3 QR 图片

编辑模式下，joinMethods 中 qr_code 类型的 `assetUrl` 用 ImageUploader 显示。`qrCodeUrl` 字段是公开 URL（R2 直链），直接作为 `<img src>`。

### 7.4 表单校验

在 `useAdminGroupDraft` 或保存时：
- QR 加群方式存在 → `logoRemoved !== true` 或 `logoBlob !== null` 或已有 asset → 通过
- 否则 → 报错 "请上传二维码图片"

## 8. 错误信息中文化（B5）

### 8.1 审计范围

| 层级 | 文件 | 方式 |
|---|---|---|
| 组件 | `ImageUploader.vue`、`AdminJoinMethodEditor.vue`、`AdminGroupDrawer.vue` 等 | 逐文件检查 `error.value =` |
| 组合式函数 | `useImageProcessor.ts`、`useAdminGroupDraft.ts` | 同上 |
| Zod schema | `shared/contracts/` 下各文件 | 检查 `.message()` |
| 后端 | `functions/_lib/routes/` 下各文件 | 检查 `apiErrorSchema.parse({ message: ... })` |
| 常量 | `shared/contracts/asset.ts` | 错误码常量 |

### 8.2 无需翻译

- 技术标识符（D1_ERROR、ZodError 等）
- Console 日志
- 测试中的断言消息

## 9. 恢复 Logo Asset（C1）

**位置**：`functions/_lib/repositories/group-repository.ts` 的 `restore()`

```ts
async restore(id: string): Promise<AdminGroupDto | null> {
  const now = new Date().toISOString();
  const result = await db
    .prepare("UPDATE groups SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL")
    .bind(now, id).run();
  if (!result.success) return null;

  // 恢复 logo asset ref_count
  const group = await db.prepare("SELECT logo_r2_key FROM groups WHERE id = ?").bind(id).first<{logo_r2_key: string | null}>();
  if (group?.logo_r2_key) {
    await db.prepare(
      "UPDATE assets SET ref_count = ref_count + 1, updated_at = ? WHERE r2_key = ? AND status = 'ready'"
    ).bind(now, group.logo_r2_key).run();
  }

  return this.getById(id);
}
```

## 10. 文件变更清单

| 文件 | 改动 |
|---|---|
| `src/features/admin/constants.ts` | **新建**，STATUS_ORDER、STATUS_FILTER_ORDER |
| `src/features/admin/components/AdminStatusFilters.vue` | A1：按钮顺序引用常量 |
| `src/features/admin/composables/useAdminGroups.ts` | A2：默认排序；A3：三态切换 |
| `src/features/admin/components/AdminGroupTable.vue` | A3：aria-sort 三态 |
| `shared/domain/config.ts` | B0：PlatformConfig 去掉 allowedJoinMethods |
| `site.config.ts` | B0：platforms 去掉 allowedJoinMethods |
| `src/features/admin/components/AdminGroupFields.vue` | B0：平台 combobox |
| `src/features/admin/components/AdminJoinMethodEditor.vue` | B0+B2：移除 platform 依赖 + 三按钮 |
| `src/features/admin/components/AdminGroupDrawer.vue` | B1+B4：Logo 头像区 + 编辑模式图片 |
| `src/features/admin/composables/useAdminGroupDraft.ts` | B1：logoBlob/logoRemoved 字段；B4：表单校验 |
| `src/features/admin/composables/useImageProcessor.ts` | B3：格式放宽 + 缩放 + webp 压缩 + alpha |
| `shared/contracts/asset.ts` | B3：常量更新 |
| `src/features/admin/components/ImageUploader.vue` | B3+B4：错误中文化 + existingUrl |
| `functions/_lib/repositories/group-repository.ts` | C1：restore logo asset；C2：状态排序引用 |
| `functions/_lib/routes/groups.ts` | C3：assetUrl 注入 |
| `functions/_lib/routes/admin-groups.ts` | B0：移除平台校验；C3：assetUrl 注入；B5：message 中文化 |
| 各组件/composables/schema | B5：全面审计英文报错 |
