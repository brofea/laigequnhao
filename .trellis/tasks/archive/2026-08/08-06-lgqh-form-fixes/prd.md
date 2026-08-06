# 修复添加群组表单系列问题 (#3 #4 #5 #20)

## Goal

修复管理端"添加新群"Dialog 与主页"添加新群"投稿表单中的 4 组 UI/表单缺陷，让表单无占位符默认值、平台支持自定义输入、加群方式下拉正确显示已添加状态、主页投稿支持上传二维码。父任务负责 4 个子任务的统一规划、共享组件（Select.vue / AdminEditForm.vue / 契约）改动协调与最终集成验收。

## Background

项目为 Vue 3 + Vite + Cloudflare Workers。群组创建/编辑共用表单 `src/components/AdminEditForm.vue`，由 `src/components/VisualShell.vue` 的 `openAdminCreateDialog()`（管理端，admin-create-dialog）与 `openPublicSubmitDialog()`（主页，public-submit-dialog）两个弹窗分别承载。加群方式、平台选择均使用 `src/components/Select.vue`（单选，无自定义输入、无多选状态）。

GitHub issues:

- #3 管理页添加新群 Dialog 多余默认值
- #4 添加新群 Dialog 平台下拉框无法自定义
- #5 管理端添加群 Dialog 加群方式 Section 多项 BUG
- #20 主页添加新群无法上传二维码

## Confirmed Facts（已核实，来源为代码研读）

- 管理端新建群草稿默认值位于 `src/components/VisualShell.vue:408-423`：title="待编辑的新群组"、platform="微信"、kind="兴趣"、description="这是管理工作台添加入口的本地编辑样例。"、tags=["待审核"]、joinMethods=[{type:number, value:"待填写"}]。
- 表单内部默认值 `src/components/AdminEditForm.vue:62-72`：contact="提交者仅在私密审核区可见"（管理端）、auditNotes="已完成基础内容审核，等待下一次公开复核。"。
- 加群方式类型占位 `src/components/AdminEditForm.vue:120-124`：link value="https://sample.invalid/new-link"、number value="待填写群号"、qr value="二维码占位区域"。
- `Select.vue` 仅单选：props.modelValue 为 string，无 multiple/自由输入能力（行 10-22）；加群方式选择在 `AdminEditForm.vue:530-539`，选项在行 110-119，同类型去重逻辑行 205-220。
- 平台 Select 在 `AdminEditForm.vue:457-462`，选项来自 `site.config.ts:40` 静态 `platforms` 列表；后端契约 `shared/contracts/group.ts:254/325` 与 `submission.ts:38` 均接受任意非空字符串（platform 后端无限制，限制全在前端 Select）。
- 管理端保存链路 `toAdminPayload`（`VisualShell.vue:645-673`）不包含 contact，且把 auditNotes 硬编码为 null（行 669）→ 管理端保存时"审核备注"输入值永不提交。
- 公开投稿二维码被禁用的 4 处：`AdminEditForm.vue:115-119`（选项过滤）、:207（addJoinMethod 拦截）、:243-246（readImage 拦截）、:351-356（save 中 qr: []）；`src/features/groups/api.ts:86-100` submitGroup 仅传一个 logo 文件；`shared/contracts/submission.ts:18-19` 明确"公开投稿最多接收一个 Logo 文件"。
- 提交者联系方式（contact）管理端创建后不可改（三层均不支持）：表单 readonly（`AdminEditForm.vue:618-623`）、groupUpdateSchema 无 contact 字段、后端 update 不处理 contact。管理端创建时 contact 恒为 null（admin-groups.ts create 不传）。
- 已有接近 combobox 的模式：`BoardAddGroupForm.vue:74-117`（搜索词过滤+点击选中）；标签添加模式 `AdminEditForm.vue:500-521`。无现成复合组件。

## Requirements

### 子任务 A（#3）— 清理多余默认值 + contact 创建时可填

- A-1 删除管理端新建群 Dialog 的全部占位符默认值（标题/简介/标签/群号/加群链接/审核备注/联系方式占位），新建草稿应为空或业务合理默认（平台、性质除外，见子任务 C）。
- A-2 管理端创建群组时"提交者联系方式"允许输入，创建后（编辑态）不可修改。
- A-3 让"审核备注"在管理端保存时真正提交（修复 toAdminPayload 硬编码 null）。
- A-4 主页公开投稿弹窗的默认值保持现状（issue 未要求），仅管理端清理。

### 子任务 B（#5）— 加群方式下拉状态与默认值

- B-1 "添加加群方式"下拉展开时，对已添加的加群方式显示勾选标记（多选状态），而非仅对最后一次点击打勾。
- B-2 管理端添加新群 Dialog 内加群方式默认值为空（不默认带"空群号"占位）。
- B-3 主页（公开投稿）加群方式下拉如有同样问题一并修复。

### 子任务 C（#4）— 平台支持自定义输入

- C-1 平台选择改为"下拉框+输入框"复合组件：可从配置列表选择，也可输入自定义值；选中"自定义"前后组件外观一致。
- C-2 管理端添加新群时平台默认值为空。
- C-3 空平台值在创建/更新时后端可接受（契约允许空字符串或为空则省略）。

### 子任务 D（#20）— 主页投稿支持二维码上传

- D-1 公开投稿支持上传二维码图片，参考管理端新增群组 Dialog 的交互。
- D-2 覆盖前端表单（AdminEditForm publicMode）、前端 API（submitGroup）、契约（submissionRequestSchema 支持 qr 加群方式）、后端处理（submission-service）。

## Acceptance Criteria

- [ ] 管理端添加新群 Dialog 无任何占位符默认值（标题/简介/标签/群号/加群链接/联系方式/审核备注），群号为空不默认携带。
- [ ] 管理端创建群时可填写提交者联系方式，创建后编辑态该字段不可修改。
- [ ] 管理端保存后审核备注不再被清空（修复 null 硬编码）。
- [ ] 加群方式下拉对每个已添加的方式显示勾选标记；添加新群时加群方式区域默认无预置项。
- [ ] 平台下拉可自定义输入，组件外观在"选择/自定义"前后一致；管理端新建时平台默认值为空。
- [ ] 主页投稿可上传二维码并成功提交；后台收到 qr 加群方式数据。
- [ ] 现有测试通过，无回归（`pnpm vitest run`、lint、typecheck）。

## Out of Scope

- 回收站检索（#11）、运行数据页（#6）、CI（#9）、限流（#15）、匿名身份（#14）、蜜罐字段（#16）、Node 部署（#18）等其他 issue。
- 群组编辑页其他字段的 UI 重设计。
- 公开投稿二维码的审核流重设计（仅打通上传与存储链路）。

## Key Decisions

- 任务树：父任务 + 4 子任务（各对应一个 issue），Select.vue 改造（multiple/combobox）由子任务 B/C 共享，需先设计组件方案避免冲突。
- 子任务执行顺序建议：A → B → C → D（A 清理表单基线，B/C 改造 Select 共享组件，D 依赖表单稳定后接入）。
- 平台空值的后端契约：需要与用户确认（见 Open Questions）。

## Key Decisions（已与用户确认）

- **平台自定义输入（#4）**：采用"输入框+下拉一体"（方案 A）——组件始终是一个可编辑输入框+下拉箭头，点开下拉快捷选择常用平台列表，直接打字即自定义值；不设"自定义..."项，外观恒定。
- **加群方式勾选（#5）**：采用"勾选标记+点击切换"——下拉中已添加的方式显示勾选标记，点击未添加的=添加，点击已添加的=移除；行内删除按钮保留。
- **公开投稿二维码（#20）**：完整打通前后端——投稿时头像+二维码多文件同时上传，契约增加 qr 加群方式，后端存储/审核链路对齐管理端。
- **auditNotes 提交 bug**：纳入本任务修复（toAdminPayload 硬编码 null，VisualShell.vue:669）。

## Open Questions

- 无。全部决策已确认，进入设计阶段。

## Out of Scope
