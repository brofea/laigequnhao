# 完善群组聚合编辑：实施计划

## 步骤

1. **等待依赖**
   - 确认 QR 子任务的 asset migration、管理员 QR DTO 和输入 schema 已稳定。

2. **写入契约**
   - 新增 create/update schema 和判别联合 join method input。
   - 添加标签、方法、平台兼容与私有字段测试。

3. **Repository/Route**
   - 实现聚合 create batch。
   - 实现 version 条件 update + guarded 关联语句。
   - 实现 notes upsert、权威回读和稳定错误映射。
   - 修复 POST 创建状态/字段缺口。

4. **草稿与抽屉**
   - 新增 `useAdminGroupDraft`。
   - 拆分基本字段、标签、加群方式、私有详情组件。
   - 实现增删、排序、字段错误、dirty guard 和响应式抽屉。
   - 接入 QR staged asset，不重复实现 asset service。

5. **列表回写**
   - 修复新建按钮实际调用 create。
   - 使用权威 DTO 就地更新，必要时精确补取并恢复滚动。
   - 回收站不提供编辑。

6. **测试**
   - Worker：完整 create/update、原子回滚、version 冲突、所有边界校验。
   - Vue：回显、动态编辑器、联系方式/notes、dirty/focus/响应式。
   - E2E：创建→编辑→删除→回收站→恢复。

## 验证

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm test:e2e
pnpm build
```

## 回滚点

- 新写入路由测试通过前不切换前端。
- QR 输入只消费已稳定契约。
- version 冲突或 batch 原子性未证明时禁止进入 UI 集成。

