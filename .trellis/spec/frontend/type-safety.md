# 前端类型安全

## 编译器契约

使用严格模式 TypeScript 和 `vue-tsc`。不得为了让失败的功能通过编译而降低严格程度。Vite 转译不能代替类型检查门禁。

领域判别字段使用封闭联合类型：

```ts
type GroupKind = "official" | "interest";
type GroupStatus = "pending" | "published" | "rejected" | "delisted";
type JoinMethodType = "group_number" | "qr_code" | "url";
```

行为根据判别字段变化时，使用带 `never` 检查的穷尽 switch。

## 类型归属

- `shared/domain/`：稳定的联合类型和领域值
- `shared/contracts/`：Zod 请求/响应 schema 和推导出的 DTO
- 功能内部文件：只供一个功能使用的组件 props 和视图模型

数据库行类型和 Cloudflare binding 类型不得进入前端。公开 DTO 和管理员 DTO 使用不同 schema。

## 运行时校验

API JSON、本地存储、路由查询字符串、文件元数据和构建配置在解析前一律视为 `unknown`。API 契约使用共享 Zod schema；浏览器 API 使用聚焦单一职责的 parser。

静态 TypeScript 类型不能替代网络、持久化或文件边界上的校验。

## 禁止模式

- `any`、`@ts-ignore` 或未经检查的双重类型断言
- 将 `response.json()` 直接断言成 DTO
- 在没有已证明不变量的情况下，对 API、DOM 或配置数据使用非空断言
- 在负责模块之外用裸字符串比较状态、平台或加群方式
- 在组件内部重新声明 API payload 类型

如果外部包的类型不完整，只能在单一适配器中隔离类型断言，并添加契约测试。
