# 执行计划：修复添加群组表单系列问题 (#3 #4 #5 #20)

## 子任务与文件矩阵

| 子任务 | Issue | 主要文件 | 类型 |
|---|---|---|---|
| 08-06-default-values-cleanup | #3 | VisualShell.vue、AdminEditForm.vue、shared/contracts/group.ts、functions/_lib/routes/admin-groups.ts | 轻量偏中 |
| 08-06-join-method-select-fix | #5 | Select.vue、AdminEditForm.vue、src/styles/index.css | 轻量偏中 |
| 08-06-platform-combobox | #4 | Combobox.vue（新建）、AdminEditForm.vue、shared/contracts/group.ts | 轻量偏中 |
| 08-06-public-submit-qr | #20 | AdminEditForm.vue、features/groups/api.ts、shared/contracts/submission.ts、functions/_lib/services/submission-service.ts | 复杂 |

共享设计统一在父任务 `design.md`；各子任务自行维护 `prd.md` 与简短实现清单。

## 执行顺序（串行）

1. **A → 08-06-default-values-cleanup**（表单基线）
2. **B → 08-06-join-method-select-fix**（Select.vue multiple）
3. **C → 08-06-platform-combobox**（Combobox.vue，契约 platform 放行空值）
4. **D → 08-06-public-submit-qr**（二维码全链路，最后接入）
5. **父任务集成验收**：全链路手测 + 测试套件

## 验证命令

```bash
pnpm vitest run          # 单元测试（含契约测试）
pnpm lint                # lint
pnpm typecheck           # 类型检查（若脚本存在）
pnpm build               # 构建验证（前端 + worker）
```

## 质量门

- 每个子任务结束：`pnpm vitest run` + lint + typecheck 通过；浏览器手测对应 Dialog。
- 父任务结束：4 个 issue 的验收标准逐条核对；`git status` 确认仅预期文件变更。
- 测试补充：D 子任务需为 submissionRequestSchema 新增 qr 用例（契约测试）；A 子任务如存在表单测试需更新默认值断言。

## 风险与回滚点

- B/C 同改 AdminEditForm.vue → 严格串行，B 完成后先提交（用户确认后）再开始 C。
- Combobox 视觉漂移 → 复用 `.app-field`/`.app-select` 样式类。
- submission-service 图片链路细节 → D 实现时先读 `functions/_lib` 现有图片存储/解析代码再动手。
- 契约放宽为向后兼容，无需数据迁移。

## 收尾

- 父任务 prd.md 的 Acceptance Criteria 全过 → 集成验收
- 需要时更新 `.trellis/spec/frontend/` 相关 spec（Select/Combobox 组件约定）
