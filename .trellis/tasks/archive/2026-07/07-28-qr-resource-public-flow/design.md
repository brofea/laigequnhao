# 完成二维码资源与公开交互闭环：技术设计

## Migration

新增 `0002_admin_group_management.sql`，不修改 `0001`：

- 创建 `assets`：R2 key、用途、WebP 元数据、生命周期、删除尝试与安全错误码。
- 为 `join_methods` 增加 `asset_id` 外键和索引。
- 为 groups 补齐永久清理重试字段。
- 审计 legacy `qr_code` value；不从未知 URL 猜测 R2 key。

应用顺序为 schema 先于代码；本地和预览验证 0001→0002 以及已有 0001 数据升级。

## Asset 生命周期

```text
upload → staged → ready → delete_pending → D1 row removed
                         ↘ delete_failed → retry
```

- 上传先写 R2，再写 staged asset；D1 写失败时补偿删除新 R2 对象。
- 聚合保存引用 asset 并将其转为 ready。
- 解除引用后再次检查 refcount；只有 0 引用才进入删除。
- R2 对象不存在视为删除成功。
- 失败保留安全错误码和 attempts，可重复同一命令。
- staged 资源提供过期回收兜底。

## 永久删除

```text
soft-deleted group
→ purge pending
→ 检查并清理无其他引用的 Logo/QR
→ r2_done
→ D1 batch 删除 likes/tags/methods/details/group
```

不是软删除记录时返回 `STATE_CONFLICT`；重复请求从当前状态继续。

## 契约与投影

- 管理员 QR DTO：asset ID、公开 URL、宽高、体积、状态。
- 公开 QR DTO：公开 URL/展示元数据，不含 asset ID 或 R2 key。
- `qrCodePublic` 从 config schema、配置、代码、测试和文档删除。
- QR 始终计入“至少一个加群方式”。

## 前端

- 复用 `useImageProcessor` 和 `ImageUploader` 的 WebP 处理能力。
- 上传 composable 与图片处理分离，负责 staged asset 和清理命令。
- `GroupCard` 对三种方式做穷尽处理。
- `QrCodeDialog` 显示群名称和二维码，支持关闭按钮、Escape、焦点归还和懒加载。
- 多个同类型方式使用稳定复合 key，不使用仅 type 或数组索引。

## 风险

- 当前路由写入不存在的 assets 表：migration 是首要门禁。
- R2/D1 无共享事务：使用 staged/ready 和补偿/重试状态。
- legacy QR 无 asset_id：先审计，显式替换/迁移。
- 公开字段泄漏：白名单 serializer 和契约测试。

