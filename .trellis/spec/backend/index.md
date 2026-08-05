# Cloudflare Worker 后端开发规范

这些文件定义“来个群号”的服务端契约。生产运行时是独立 Cloudflare Module Worker（`workerd`），不是 Pages 项目或 Node.js 服务器；Hono API 与 Workers Static Assets 由同一 Worker 部署。

## 基准技术栈

- 仅挂载在 `/api/v1` 下、由 Worker `fetch` 入口承载的 Hono 应用
- 与前端共享的 Zod schema
- 直接使用 D1 预处理语句和有序 SQL migration
- 通过 R2 binding 存储最终 PNG 资源
- Web Crypto 和 Web Standard API
- Cloudflare Workers Vitest 集成

## 规范索引

| 规范 | 负责内容 |
|---|---|
| [API 契约](./api-guidelines.md) | 路由、响应信封、认证和分页 |
| [目录结构](./directory-structure.md) | Function、service、repository 边界 |
| [数据库规范](./database-guidelines.md) | D1 schema、查询、migration 和不变量 |
| [错误处理](./error-handling.md) | 稳定错误分类和部分失败 |
| [部署规范](./deployment-guidelines.md) | Workers Builds、资源编排、运行时配置和功能降级 |
| [日志规范](./logging-guidelines.md) | 结构化日志和脱敏 |
| [质量规范](./quality-guidelines.md) | 安全和测试门禁 |

项目级测试要求见[测试策略](../guides/testing-strategy.md)。

## 当前依据

生产入口为 `worker/index.ts`，业务路由和服务仍位于 `functions/_lib/` 以保持边界稳定。Pages adapter 已退役；`.trellis/tasks/08-03-lgqh-v2-cloudflare-deployment/` 记录 Worker、Assets、D1/R2 和命令迁移约束。
