# 实施计划

## 第 1 批：独立前端改动（可并行）

### 1.1 创建状态排序常量（C2）

- [ ] 新建 `src/features/admin/constants.ts`，导出 `STATUS_ORDER` 和 `STATUS_FILTER_ORDER`
- [ ] **验证**：文件存在，导出正确

### 1.2 筛选按钮顺序（A1）

- [ ] `AdminStatusFilters.vue`：引用 `STATUS_FILTER_ORDER` 渲染按钮
- [ ] **验证**：页面按钮顺序为 待审核→已发布→已下架→已拒绝→回收站

### 1.3 默认排序 + 三态切换（A2 + A3）

- [ ] `useAdminGroups.ts`：
  - 默认 sortBy 改为 `"status"`，sortDir 改为 `"asc"`
  - 三态逻辑：点击当前排序列 → sortDir `asc` → `desc` → `null`（取消）
  - sortBy `null` 时恢复默认排序
- [ ] `AdminGroupTable.vue`：aria-sort 三态切换，视觉箭头同步
- [ ] **验证**：
  - 首次加载按状态→标题排列
  - 点击列头：无→↑→↓→无 循环
  - 刷新页面恢复默认排序

### 1.4 加群方式按钮逻辑（B2）

- [ ] `AdminJoinMethodEditor.vue`：三按钮替代下拉，已存在类型隐藏
- [ ] 去掉 `platform` prop
- [ ] **验证**：按钮正确显示/隐藏，添加后对应按钮消失

### 1.5 排序后端常量同步

- [ ] `functions/_lib/repositories/group-repository.ts`：`listAll` 的 status CASE 表达式与前端 `STATUS_ORDER` 保持一致
- [ ] **验证**：排序结果前端后端一致

---

## 第 2 批：平台解绑 + 图片处理（有依赖）

### 2.1 平台解绑 - Schema（B0）

- [ ] `shared/domain/config.ts`：PlatformConfig 去掉 `allowedJoinMethods`，name 支持中文
- [ ] `site.config.ts`：platforms 去掉 `allowedJoinMethods`
- [ ] **验证**：typecheck 通过

### 2.2 平台解绑 - 前端（B0）

- [ ] `AdminGroupFields.vue`：平台改为 `<input>` + `<datalist>` combobox
- [ ] 管理端筛选下拉平台列表只显示配置列表中的平台
- [ ] **验证**：可选择配置平台，可输入自定义平台名，筛选只有配置平台

### 2.3 平台解绑 - 后端（B0）

- [ ] `functions/_lib/routes/admin-groups.ts`：检查并移除 platform → join method 校验
- [ ] **验证**：任意平台可配任意加群方式

### 2.4 图片处理器增强（B3）

- [ ] `shared/contracts/asset.ts`：`QR_CODE_MAX_BYTES` → 5MB，新增 `QR_CODE_TARGET_BYTES`、`QR_CODE_MAX_DIMENSION`
- [ ] `useImageProcessor.ts`：
  - 移除格式限制（接受所有 image/*）
  - 最长边缩放到 1024px
  - webp 压缩 + 二分搜索 quality 到 ≤300KB
  - alpha 通道检测
  - 所有错误中文化
- [ ] **验证**：各种格式/大小图片能正确处理（建议写单元测试）

### 2.5 Asset URL 补充（C3）

- [ ] `functions/_lib/routes/admin-groups.ts`：listAll/getById 返回时补充 joinMethods 的 assetUrl
- [ ] `functions/_lib/routes/groups.ts`：getById 返回时补充 joinMethods 的 assetUrl
- [ ] **验证**：管理端 API 返回的 qr_code joinMethod 含有效 assetUrl

---

## 第 3 批：Logo 编辑 + 编辑模式图片（依赖 2.4、2.5）

### 3.1 Draft 状态扩展（B1）

- [ ] `useAdminGroupDraft.ts`：新增 `logoBlob`、`logoRemoved` 字段
- [ ] 表单校验：QR 加群方式存在时必须有 QR 图片
- [ ] **验证**：draft 正确跟踪 logo 状态

### 3.2 抽屉 Logo 区域（B1 + B4）

- [ ] `AdminGroupDrawer.vue`：
  - 顶部新增头像编辑区（圆形图 + ImageUploader）
  - 编辑模式传入 existingUrl
  - 保存时处理 logoBlob/logoRemoved
  - 编辑模式：joinMethods 的 QR code 显示已有图片
- [ ] `AdminJoinMethodEditor.vue`：QR 类型行显示当前图片预览（编辑模式）
- [ ] **验证**：
  - 新建时可上传 logo
  - 编辑时可替换/删除 logo
  - QR 图片在编辑模式可见
  - QR 图必填校验生效

---

## 第 4 批：错误审计 + 关联修复

### 4.1 错误信息中文化（B5）

- [ ] 逐文件审计以下位置的英文字符串：
  - `src/features/admin/components/` 下所有 `.vue` 中的 `error` / `message`
  - `src/features/admin/composables/` 下所有 `.ts` 中的错误提示
  - `shared/contracts/` 下 Zod schema 的 `.message()`
  - `functions/_lib/routes/` 下 handler 中的 apiError message
- [ ] **验证**：grep 确认无面向用户的英文报错

### 4.2 恢复 Logo Asset（C1）

- [ ] `functions/_lib/repositories/group-repository.ts`：`restore()` 中补充 logo asset ref_count+1
- [ ] **验证**：软删除→恢复后，logo asset 的 ref_count 正确

### 4.3 最终验证

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全部通过
- [ ] `pnpm test:workers` 全部通过
- [ ] `pnpm lint` 通过
