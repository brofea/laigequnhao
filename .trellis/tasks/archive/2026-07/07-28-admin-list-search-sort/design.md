# 统一搜索并完善管理员列表：技术设计

## 数据流

```text
URL query
→ adminGroupListQuerySchema
→ useAdminGroups
→ GET admin groups
→ repository where/search/sort/cursor
→ page DTO
→ filters/search/table
```

URL 是管理列表筛选、搜索和排序的单一来源。组件只发出意图，composable 负责 URL、请求取消、游标、loading/error 和权威响应。

## 共享契约

- 新增管理员专用列表 query：`statuses[]`、`deleted`、`q`、`sortBy`、`sortDir`、`cursor`、`limit`。
- 正常模式要求 1–4 个状态；回收站模式不接受 statuses。
- 响应包含 `items`、`total`、`nextCursor` 和排序描述。
- 新增共享搜索归一化纯函数；主页与管理端共同使用。
- 扩展 API client 支持 `AbortSignal`。

## Repository

- 公开和管理员搜索共享标题/简介/标签 where builder，所有值使用绑定参数。
- COUNT 与 items 使用同一条件来源。
- sort key 经 Zod 后映射到固定 SQL：
  - title：NOCASE；
  - kind：official→interest；
  - status：pending→published→rejected→delisted；
  - platform：NOCASE；
  - tags：第一展示标签，无标签固定在后；
  - likeCount：数值。
- 默认 `created_at DESC, id DESC`；显式排序最终追加 ID。
- cursor 绑定 query 指纹和排序 tuple，使用 keyset 条件。

## 前端状态

- 状态按钮使用集中 reducer，避免多个 watcher 分散维护互斥关系。
- 进入回收站时保存当前业务状态组合；退出时恢复。
- 输入防抖约 300ms；回车/清空立即提交。
- 请求同时使用 abort 和 sequence 防止过期覆盖。
- 管理表格提供完整结果遍历和 `aria-sort`。
- 变更后就地替换/移除；必须重查时保存 row anchor 与 scroll offset。

## 兼容性

- 公开列表状态、轮换和 cursor 语义保持。
- 管理列表默认参数保持“全部未删除、创建时间倒序”。
- 操作列不是数据列，不加入排序 schema。

## 风险

- where/COUNT 分叉：用同一 builder。
- 动态 SQL：只使用固定映射。
- cursor 与 query 不匹配：返回 `VALIDATION_FAILED`。
- 主页现有 abort 未传输：API client 必须实际接收 signal。

