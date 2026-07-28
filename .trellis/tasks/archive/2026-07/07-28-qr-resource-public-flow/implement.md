# 完成二维码资源与公开交互闭环：实施计划

## 步骤

1. **Migration**
   - 新增 `0002` 的 assets、asset_id、索引和 purge retry 字段。
   - 更新 migration 脚本。
   - 测试空库与 0001 升级，审计 legacy QR。

2. **Asset 契约/服务**
   - 扩展管理员 asset DTO。
   - 修复上传的 staged 写入与 R2→D1 失败补偿。
   - 实现引用保护、delete_pending/delete_failed 和幂等重试。
   - 实现 staged 过期回收。

3. **群组投影**
   - 查询 join method asset 元数据。
   - 管理员投影返回 asset 信息，公开投影只返回 URL/meta。
   - 为聚合编辑子任务发布稳定输入/输出契约。

4. **清理**
   - 实现解除引用后的 refcount 清理。
   - 重写永久删除状态机，覆盖 Logo、QR 和 D1 关联行。

5. **公开能力**
   - 完整移除 `qrCodePublic`。
   - 新增 `QrCodeDialog`，让 `GroupCard` 穷尽处理三种方法。
   - 修复动态列表 key。

6. **测试**
   - migration、上传、引用、替换、删除、失败重试和永久删除。
   - 公开/管理员字段隔离契约。
   - QR 对话框与完整 E2E。

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

- migration 只新增结构；应用回滚时保留。
- asset 状态不明确时停在 staged/delete_failed，禁止猜测并删除。
- 公开 UI 可单独回滚，但不恢复永远为真的死开关。

