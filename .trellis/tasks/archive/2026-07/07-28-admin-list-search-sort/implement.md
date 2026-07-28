# 统一搜索并完善管理员列表：实施计划

## 步骤

1. **共享契约**
   - 新增搜索归一化 helper。
   - 新增 admin list query/page/sort schema 与契约测试。
   - 扩展 API client 的 `AbortSignal`。

2. **查询层**
   - 提取公开/管理员共享搜索 where builder。
   - 实现多状态、回收站、搜索、六列白名单排序、total 和 keyset cursor。
   - 更新管理员与公开列表路由。

3. **前端状态**
   - 把 admin query 放入 URL。
   - 实现状态按钮 reducer、回收站组合恢复、搜索防抖和请求乱序保护。
   - 保留变更后的 scroll anchor。

4. **组件**
   - 增加状态按钮、搜索框、标签列、可访问表头排序和完整结果遍历。
   - 更新主页搜索 placeholder 和 signal 传递。

5. **测试**
   - 单元：搜索归一化。
   - Worker：多状态、搜索三字段、六列排序、cursor/total。
   - Vue：互斥状态机、防抖、aria-sort、标签列。
   - E2E：主页/管理端搜索与跨页全局排序。

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

- 先保持旧 query 默认值兼容，再切换 UI。
- API client signal 变更必须保持现有 headers/body 行为。
- 如新 cursor 有问题，回滚 UI 切换，不回滚已经兼容的 query schema。

