# 执行计划：数据库交互按钮反馈

## 实施顺序

1. **建立可复用 pending 状态与请求生命周期保护**
   - 新增 keyed pending 工具及纯单元测试。
   - 修复公开目录、管理群组列表、管理板块加载状态可能被过期请求 `finally` 清空的问题。
   - 保持现有 AbortController、URL 状态同步和服务端权威刷新行为。

2. **补齐通用组件反馈契约**
   - 将 `AdminEditForm`、`BoardEditForm`、`Dialog`、`GroupCard`、`AdminTable`、`BoardManagement`、`BoardAddGroupForm` 的 pending props/events 类型化。
   - 为定制原生按钮复用现有 spinner、`aria-busy` 和 disabled 样式语义；必要时扩展 `Select` 的 loading 表现。
   - 保持图标按钮的原有 accessible name、焦点和移动端布局。

3. **接通公开端操作**
   - 群组卡片和详情点赞使用同一 group key，加入按钮级 loading、重复点击防护和失败回滚验证。
   - 投稿提交把 `publicSubmitBusy` 接到真正的 submit loading，并保持 Dialog busy 期间不可关闭；成功后显示持久受理状态，不只依赖 Toast。
   - 重试/搜索/标签查询沿用目录 loading 或结果区域 skeleton；不为本地打开详情、标签状态变化、复制/分享、二维码保存引入不必要等待。

4. **接通管理群组操作**
   - 编辑群组保存、删除/移除、列表删除、恢复、永久删除分别绑定动作 key。
   - 修复永久删除确认 Dialog 的关闭时机：成功后关闭，失败后留在 Dialog 内可重试。
   - 为管理搜索、状态筛选、回收站、排序和分页补齐请求中状态及重复查询防护。
   - 保留版本冲突和 API 错误的现有 toast 文案语义。

5. **接通板块管理操作**
   - 板块新增/编辑/删除/排序和删除确认按钮加入 loading。
   - 板块内添加群、移除成员、成员上下移按资源独立 pending；无关行继续可用。
   - 按成功反馈矩阵处理结果：编辑/删除/移出等显示成功 Toast；添加群和成员排序以界面结果为主不重复弹 Toast；所有失败都明确提示，并在失败后保持可重试状态或重新同步服务端快照。

6. **全量按钮复审**
   - 按 PRD 的审计表重新检查 `src/**/*.vue` 的全部 `Button` 和原生 `button`。
   - 确认纯本地 UI、导航、复制/分享、二维码保存、静态 Mock 控件没有误加 loading。
   - 确认 `prototype/` 没有改动。

7. **测试与质量门禁**
   - 组件测试：基础 loading/aria、点赞重复点击、表单提交 loading、永久删除 Dialog 保持打开、板块成员独立 pending。
   - E2E：在公开点赞、管理删除/恢复/永久删除、板块成员操作路径中使用延迟响应，断言 spinner、禁用、toast 和最终状态；至少覆盖桌面与移动项目。
   - 运行完整门禁并修复格式、类型、无障碍和响应式回归。

## 计划修改的主要文件

- `src/shared/composables/usePendingActions.ts`（新增）
- `src/components/Button.vue`、`src/components/Dialog.vue`、`src/components/Input.vue`、`src/components/Select.vue`
- `src/components/AdminEditForm.vue`、`src/components/BoardEditForm.vue`、`src/components/BoardAddGroupForm.vue`
- `src/components/AdminTable.vue`、`src/components/BoardManagement.vue`、`src/components/GroupCard.vue`
- `src/components/VisualShell.vue`、`src/features/groups/composables/useGroupDirectory.ts`、`src/features/admin/composables/useAdminGroups.ts`、`src/features/admin/composables/useAdminBoards.ts`
- 相关组件测试和 `tests/e2e/admin-flows.spec.ts`、`tests/e2e/public-flows.spec.ts`（按实际测试设计增补）
- `src/styles/index.css`（仅在自定义原生按钮需要统一 spinner/disabled 视觉时修改）

## 验证命令

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

## 风险文件与回滚点

- `src/components/VisualShell.vue`：跨公开端、管理端和 toast 的最大集成风险；每一类操作完成后单独检查状态清理。
- `src/components/Dialog.vue`：关闭保护影响所有 Dialog；只在 busy 时阻止关闭，并保留普通 Dialog 原行为。
- `src/features/groups/composables/useGroupDirectory.ts`、`src/features/admin/composables/useAdminGroups.ts`：请求序号保护必须不改变 URL 恢复、取消和分页语义。
- `src/components/AdminTable.vue`、`src/components/BoardManagement.vue`：自定义原生按钮的 spinner 可能影响窄屏布局；必须运行移动端 E2E 和 format/typecheck。

## 开始实现前的复核门

- [ ] 最新 `prd.md` 已通过需求收敛，范围覆盖正式 `src/` 全部按钮并明确哪些不需要 loading。
- [ ] `design.md` 已确认 pending 状态归属、Dialog 生命周期、读取 loading 和请求竞态处理。
- [ ] `implement.jsonl` 与 `check.jsonl` 已填入真实规范/研究条目。
- [ ] 用户已明确批准本次最终规划摘要；在此之前不运行 `task.py start`，不修改产品代码。
