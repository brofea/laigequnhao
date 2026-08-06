# 设计：修复添加群组表单系列问题 (#3 #4 #5 #20)

## 架构总览

```
前端 (Vue 3)
  VisualShell.vue          → 两个弹窗（admin-create-dialog / public-submit-dialog）、草稿、payload 组装
  AdminEditForm.vue        → 共用表单（publicMode 区分公开投稿）
  Select.vue               → 单选/多选下拉（子任务 B 扩展 multiple）
  Combobox.vue（新建）      → 输入框+下拉一体（子任务 C，平台字段专用）
契约 (shared/contracts)
  group.ts                 → create/update schema（contact、platform 空值、auditNotes）
  submission.ts            → 投稿 schema（qr 加群方式、多文件）
后端 (functions/_lib)
  routes/admin-groups.ts   → create 传 contact/auditNotes
  services/submission-service.ts → qr 图片存储 + joinMethods
  repositories/group-repository.ts → create 已支持 contact??null（无需大改）
```

## 共享组件设计（子任务 B/C 关键决策）

### Select.vue 扩展 multiple 模式（子任务 B）

- 新增 prop `multiple?: boolean`；multiple 时 `modelValue: string[]`，emit `update:model-value: string[]`。
- 选项行渲染勾选标记（选项已选中时显示勾选 icon）。
- 点击选项：切换选中/未选中（emit 新数组），**菜单不收起**；点击外部/ESC 收起。
- 单选模式行为完全不变（状态筛选、性质/状态等使用点零回归）。
- 样式沿用 `.app-select__menu` 体系，新增勾选标记样式（`src/styles/index.css`）。

### Combobox.vue 新建组件（子任务 C）

- 决策：**新建独立组件而非继续扩展 Select.vue**。理由：combobox 是"可编辑输入框+下拉菜单"形态，与 Select 的"按钮 trigger+菜单"形态差异大，合并会显著增加 Select 复杂度并提高 B/C 两个子任务的文件冲突风险。
- API：`v-model: string`、`label?`、`options: SelectOption[]`、`placeholder?`、`disabled?`。
- 行为：输入框可自由编辑（值即自定义）；焦点/点击下拉箭头展开选项菜单；点选选项 → 值写入输入框、收起菜单；输入框清空时值为 ""（空平台合法）。
- 外观：输入框+右侧下拉箭头，选择/输入前后外观恒定。
- 样式复用现有 `.app-field` / `.app-select__menu` 视觉体系，尽量复用 CSS。

## 契约变更

### shared/contracts/group.ts

- `groupCreateSchema`：
  - `platform`: `z.string().min(1)` → `z.string().max(50)`（允许空字符串，平台可为空；issue #4 明确"平台值可以为空"）。
  - 新增 `contact?: z.string().max(200).optional()`（管理端创建时提交联系方式）。
  - 确认 `auditNotes` 字段存在并透传（若缺失则新增 optional 字段）。
- `groupUpdateSchema`：`platform` 同样放行空值；不新增 contact（创建后不可改，保持现状）。

### shared/contracts/submission.ts（子任务 D）

- `submissionRequestSchema` 加群方式 union：新增 `qr` 类型（含图片数据引用）。
- 文件上传约束注释更新：公开投稿可同时接收 logo 与二维码文件。

## 后端变更

### routes/admin-groups.ts create（子任务 A）

- `repo.create` 调用 input 增加 `contact: payload.contact ?? null`、`auditNotes`（repo 层 `group-repository.ts:579-585` 已支持 `input.contact ?? null` 与 notes 写入，无需改 repo）。

### services/submission-service.ts（子任务 D）

- 解析 qr 图片文件（按 filePurpose 区分），复用现有图片存储链路；
- joinMethods 含 qr 类型时随提交落库（对齐管理端存储路径）。

## 前端流程改动

### 子任务 A（#3）

- `VisualShell.vue:408-423` 草稿清理：title/description/tags/joinMethods 置空；platform 由子任务 C 负责（本次保持或置空需与 C 顺序协调——建议 A 阶段将 platform 置空，C 落地组件）。
- `AdminEditForm.vue:62-72`：contact/auditNotes 占位文案移除；创建模式（非 publicMode 且无原值）contact 输入框可编辑，编辑模式 readonly（现有行 618-623 逻辑保留，仅放开创建态）。
- `VisualShell.vue:645-673` `toAdminPayload`：auditNotes 传表单实际值；创建时携带 contact。

### 子任务 B（#5）

- `AdminEditForm.vue:530-539`：加群方式 Select 改 multiple 模式，options 勾选状态绑定 `draft.joinMethods`，点击选项走 add/remove（现有 `addJoinMethod`/`removeJoinMethod` 复用）。
- publicMode 下同样生效（qr 选项在子任务 D 解禁后出现）。

### 子任务 C（#4）

- `AdminEditForm.vue:457-462`：平台 Select → Combobox；管理端草稿 platform 默认 ""；公开投稿草稿保持 "微信"（issue 仅要求管理端）。

### 子任务 D（#20）

- `AdminEditForm.vue`：解除 4 处 publicMode qr 禁用 + 模板占位文案；qr 方式上传 UI 与管理端一致。
- `src/features/groups/api.ts` `submitGroup`：支持 logo + qr 多文件（filePurpose 区分）。
- 公开投稿草稿 joinMethods 允许 qr。

## 子任务边界与执行顺序

```
A（#3 默认值+contact+auditNotes） → B（#5 Select multiple） → C（#4 Combobox） → D（#20 二维码链路）
```

- A 先行：表单基线干净后 B/C/D 才可验证（B 依赖草稿 joinMethods 为空，C 依赖 platform 空值契约）。
- B 与 C 均改 `AdminEditForm.vue`：串行执行（B 改 Select.vue + 表单加群方式区，C 新建 Combobox.vue + 替换平台字段），避免同文件并发冲突。
- D 依赖 B（下拉多选）与 A（表单基线），最后执行；后端与契约改动独立可先行验证。

## 兼容性与回滚

- 契约放宽（platform 允许空、contact 可选、submission 加 qr）向后兼容：旧前端请求仍合法。
- Select.vue multiple 为新增 prop，默认 false，不影响既有调用。
- 回滚点：各子任务独立提交，B/C 组件改动如出问题可单独 revert 组件文件不影响其余。
- 数据迁移：无。contact/auditNotes 仅新建写入路径变化；qr 投稿为新增能力。

## 风险

- Combobox 与 Select 外观统一性：尽量复用 `.app-field`/`.app-select` 样式类，减少视觉漂移。
- submission-service 图片链路细节需实现时核对（文件解析、filePurpose 传递）。
- `groupCreateSchema` 若缺 auditNotes 字段，需补充（同时确认 admin create 校验兼容）。
