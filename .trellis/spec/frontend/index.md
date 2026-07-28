# 前端开发规范

这些文件定义“来个群号”绿地项目的初始前端契约。它们描述首次实现时必须建立的架构；产品代码出现后，必须用基于实际源码的示例替换或补充其中的目标路径。

## 基准技术栈

- Vue 3、Vite、严格模式 TypeScript、Composition API、`<script setup>`
- Vue Router
- Tailwind CSS 与 CSS 自定义属性
- MVP 阶段使用功能级 composable，不引入 Pinia
- 使用 `shared/` 中的 Zod schema 校验 API 契约
- Vitest、Vue Test Utils 和 Playwright

## 规范索引

| 规范 | 负责内容 |
|---|---|
| [前端架构](./architecture.md) | 运行时分层、数据流和依赖边界 |
| [目录结构](./directory-structure.md) | 目标前端目录与职责归属 |
| [组件规范](./component-guidelines.md) | Vue 组件与无障碍规则 |
| [Composable 规范](./composable-guidelines.md) | 有状态逻辑与请求生命周期 |
| [状态管理](./state-management.md) | 本地、URL、持久化和服务端状态 |
| [类型安全](./type-safety.md) | 严格 TypeScript 与 Zod 边界 |
| [质量规范](./quality-guidelines.md) | 必须通过的检查和 Review 门禁 |

项目级测试要求见[测试策略](../guides/testing-strategy.md)。

## 当前依据

仓库目前还没有产品源码。`.trellis/tasks/00-bootstrap-guidelines/` 下的 bootstrap PRD 和技术设计是这些初始规则的依据。后续修改必须引用真实的源码和测试文件。
