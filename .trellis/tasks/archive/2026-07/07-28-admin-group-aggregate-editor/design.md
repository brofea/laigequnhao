# 完善群组聚合编辑：技术设计

## 写入契约

创建/更新使用独立 schema，包含：

- 标题、简介、性质、平台、状态；
- 0–5 个规范化标签；
- 至少一个判别联合加群方式；
- 可空审核备注；
- 更新命令额外包含 `version`。

联系方式不在请求 schema。二维码输入使用 QR 子任务定义的 asset ID，不接收任意 URL/R2 key。

## 原子创建

单个 D1 batch 写入：

1. group；
2. tags；
3. join methods；
4. submission details；
5. 被引用 staged asset 的 ready 状态。

任何语句失败时 batch 回滚。

## 原子更新与乐观锁

- 主表使用 `UPDATE ... WHERE id=? AND version=?` 并递增版本。
- 标签/方式/notes 的删除和插入由“group 已进入期望新版本”的 `EXISTS` 守卫。
- 主表 changes 为 0 时所有关联语句都为 no-op，返回 `VERSION_CONFLICT`。
- 成功后重新读取权威聚合。

对 UI 是逐项增删改，对数据库采用校验后的完整集合替换，保持 `sort_order`。

## 领域校验

- 平台来自 site config。
- 方法类型受 `allowedJoinMethods` 约束。
- 标签 trim、去空、大小写不敏感去重，0–5。
- 方法至少一个；同类型可多条；完全重复拒绝。
- 群号非空、URL 为 HTTPS、QR asset 存在且用途正确。
- 平台切换后的不兼容项不自动删除，保存返回字段错误。

## 前端结构

```text
AdminView
→ AdminGroupDrawer
   ├─ AdminGroupFields
   ├─ AdminTagEditor
   ├─ AdminJoinMethodEditor
   └─ AdminPrivateDetails
→ useAdminGroupDraft
```

- 草稿深拷贝 DTO，动态行使用稳定 client key。
- 标签/方式使用上移/下移按钮调整顺序。
- 联系方式只读，审核备注可写。
- dirty guard 覆盖遮罩、关闭、Escape 和导航。
- 宽屏右侧抽屉，窄屏 `100vw`；管理焦点和 reduced motion。

## 列表回写

- 创建/编辑使用服务端返回 DTO。
- 当前 query 仍命中时替换/插入；不命中时移除。
- 排序 key 改变需要精确补取并恢复滚动 anchor。
- 回收站不挂载编辑命令。

## 风险

- version 竞态：guarded batch。
- 表单 schema 与 DTO 混淆：输入输出严格分离。
- 草稿修改响应对象：深拷贝，props 只读。
- QR 上传取消误删：只清理本抽屉新建且仍 staged 的 asset。

