# Pages Functions 开发规范

这些文件定义“来个群号”的初始服务端契约。运行时是 Cloudflare Pages Functions（`workerd`），不是 Node.js 服务器。

## 基准技术栈

- 仅挂载在 `/api/v1` 下的 Hono 应用
- 与前端共享的 Zod schema
- 直接使用 D1 预处理语句和有序 SQL migration
- 通过 R2 binding 存储最终 WebP 资源
- Web Crypto 和 Web Standard API
- Cloudflare Workers Vitest 集成

## 规范索引

| 规范 | 负责内容 |
|---|---|
| [API 契约](./api-guidelines.md) | 路由、响应信封、认证和分页 |
| [目录结构](./directory-structure.md) | Function、service、repository 边界 |
| [数据库规范](./database-guidelines.md) | D1 schema、查询、migration 和不变量 |
| [错误处理](./error-handling.md) | 稳定错误分类和部分失败 |
| [日志规范](./logging-guidelines.md) | 结构化日志和脱敏 |
| [质量规范](./quality-guidelines.md) | 安全和测试门禁 |

项目级测试要求见[测试策略](../guides/testing-strategy.md)。

## 当前依据

目前还没有产品 Functions。`.trellis/tasks/00-bootstrap-guidelines/` 下的 bootstrap PRD 和 `design.md` 是这份初始契约的依据。首次构建后，使用已实现的真实示例替换目标路径引用。
