# V2 新任务跨层设计

## 1. 设计结论

本次任务体系采用“冻结前端表现 + 后端能力扩展 + 非表现层数据适配 + 系统质量门禁 + 真实 Cloudflare 连接”的四段式结构。T04、T05、T06、T07 不再按照旧 PRD 拆分页面功能；页面和 Dialog 已由 T02/T03 完成，后续工作的核心是让其消费真实、稳定、安全、可观测的数据，并完成可重复部署。

## 2. 设计输入与优先级

发生冲突时按以下顺序处理：

1. 用户本轮明确的前端冻结规则。
2. 用户声明 T01-T03 已完成及 prototype v2 为唯一视觉真源。
3. `docs/PRD/v2/PRD.md` 的产品约束。
4. T01-T03 已验收的代码和现有 Trellis Spec。
5. 旧子任务 PRD 仅作为历史背景，不得用来扩大或缩小新 T04-T07 边界。

## 3. 分层架构

```text
prototype v2 / T03 视觉基线
              │  不可改表现
              ▼
正式 Vue 表现层（冻结）
              │
      API client / adapter / composable
              │  T05 可改非表现层
              ▼
共享 Contract / Zod DTO
              │
       Hono route / auth / service
              │  T04
              ▼
       Repository / D1 / R2
              │
      migration / indexes / constraints
```

T06 横向覆盖所有层，但只允许测试、配置、文档、部署和最小非表现集成修复；T07 只负责真实 Cloudflare 资源、部署编排和运行时验证。发现表现差异时必须回到问题记录和用户决策流程。

## 4. T04 边界设计

### 4.1 数据模型

T04 负责新增 `last_published_at`、`boards`、`board_groups` 和必要的索引、外键、唯一约束、级联规则与版本字段。迁移必须保持现有 D1 配置兼容；默认板块“自定板块”必须幂等创建，现有 `last_published_at` 全部保持 NULL。

### 4.2 业务状态

服务端是发布时间和公开状态的唯一权威。只有非 published → published 成功转换写入服务端时间；published → published 的编辑不更新时间。进入回收站时，群组状态改变与所有板块关联删除必须在同一个原子边界内完成；恢复不自动恢复关联。

### 4.3 公开查询

公开查询统一先应用 `status = published` 和敏感字段过滤，再进行发现新群、标签聚合、板块、目录、搜索和详情查询。板块可以保存已下架成员，但公开端只能返回已发布成员。标签必须通过聚合查询取得，避免逐标签 N+1。

### 4.4 管理查询

管理端群组列表使用固定 `pageSize = 50` 的页码响应，服务端返回 items、page、pageSize、totalItems、totalPages。排序必须有稳定次排序字段，筛选和排序参数需要可校验、可复现，并与现有权限和回收站语义兼容。

### 4.5 安全

管理写操作复用现有管理员认证、会话、CSRF、Zod、版本冲突、突变令牌和原子批量模式。新接口不得通过“内部路由”“前端隐藏按钮”代替服务端授权；公开路由不得泄露下架、回收站或永久删除对象。

## 5. T05 边界设计

### 5.1 适配层

T05 的首选改动位置是 `src/shared/api`、feature API 文件、composable、store、query state、DTO mapper 和请求生命周期代码。adapter 将后端 DTO 转成 T03 已存在的视图模型，不把后端字段、临时状态或错误对象直接泄漏给表现组件。

### 5.2 Mock 清理

生产入口不得读取 `prototype/data`、正式项目 fixture 或临时 localStorage 业务数据。测试可以保留可控 fixture，但必须通过测试边界注入，不能作为生产 fallback。API 失败时不能静默回退到旧数据造成数据伪造。

### 5.3 状态与 URL

T05 保持 T03 已确认的 URL、Dialog 和搜索交互；只负责把 query state 与真实请求连接、取消过时请求、恢复前进/后退状态和映射 loading/error/empty 状态。若现有表现层缺少某个视觉状态，记录问题，不在 T05 设计新状态。

### 5.4 认证与权限

公开请求按现有匿名能力工作；管理请求携带现有会话和 CSRF 机制。会话失效、403、冲突、校验错误和网络错误必须映射到现有界面可消费的状态，不得通过改变导航或隐藏操作绕过权限。

## 6. T06 门禁设计

T06 把产品验收拆为：数据正确性、API 安全、适配正确性、页面流程、视觉冻结、可访问性、性能、迁移、部署和回滚十类门禁。每类门禁都必须有命令、环境、数据夹具、实际结果和负责人。

### 6.1 T07 Workers 真实部署设计

T07 在 T06 的本地/模拟部署演练之后，增加真实 Cloudflare Workers 门禁：独立 Module Worker、Workers Static Assets、D1/R2 bindings、Workers Builds 的 Build/Deploy command、认证健康、公开/管理 smoke、失败停止和回滚证据。首次部署必须通过 Fork → Import repository → `pnpm build` → `pnpm deploy` → Save and Deploy 的非交互端到端流程，在全新或隔离 Cloudflare 环境中自动按确定性名称创建/复用 Worker、D1、R2，执行 migration 并上线；第二次提交必须证明资源复用。资源流程采用检查优先、缺失才创建、已存在稳定复用、冲突停止；Wrangler 无资源 ID 的自动预配属于 Beta，主流程保留明确的 D1/R2 检查/创建方案。Cloudflare Vite Plugin 官方输出优先，不能仅因 `dist/client` 等目录差异降级；Preview 默认关闭或使用隔离 Worker/D1/R2。T07 规划统一本地 Worker/Vite 开发、local/remote migration、仅本地 seed/clean 和幂等 deploy；不再新增或维护 Pages 生产目标。第一阶段不修改冻结前端；Turnstile 等既有 A1 阻塞项继续照实记录。

## 7. 文件所有权

| 领域 | 主要负责人 | 其他任务规则 |
| --- | --- | --- |
| migration、repository、service、route、共享后端 Contract | T04 | T05 只能消费，变更需先协商 |
| API client、adapter、composable、真实请求接线 | T05 | 不修改表现层 |
| Vue 页面、表现组件、CSS、主题、Dialog | T03 冻结成果 | T04-T07 禁止写入 |
| 测试矩阵、部署、迁移演练、报告 | T06 | 发现缺陷回指领域负责人 |
| Cloudflare 资源检查、部署编排、真实连接和发布报告 | T07 | 不修改前端；不自动删除/清空/覆盖冲突资源 |
| 总 PRD、依赖图、最终决定 | 总任务 | 不在总任务重写业务 |

## 8. 跨任务接口

T04 在移交给 T05 前必须提供：接口清单、请求/响应示例、错误码、认证要求、分页语义、公开过滤规则、迁移版本、测试命令、已知限制和回滚说明。T05 在移交给 T06 前必须提供：生产请求路径清单、Mock 清理证明、流程矩阵、视觉快照对照、失败场景、构建产物和剩余问题。T06 提供系统验收、迁移/回滚和发布 runbook。T07 最终提供真实 Cloudflare 资源清单、CLI contract、部署命令、health/smoke、Secrets presence、失败/重试证据和 A1 blocked 结论。

## 9. 发现前端问题的处理协议

1. 复现问题并保存基线截图或视频。
2. 判断问题属于数据、Contract、adapter、后端逻辑还是表现层。
3. 若属于数据/接口/adapter，在对应任务范围内修复并加测试。
4. 若属于表现层，冻结任务只创建问题记录，描述建议和风险，不直接改代码。
5. 由用户确认是否解除冻结；没有明确批准时保持原实现。

## 10. 失败与回滚

数据库迁移失败不得继续接入新 API；API Contract 不稳定不得继续 T05；真实流程未通过不得进入 T06 发布演练；T06 系统验收未完成不得进入 T07 production 写入；T07 的资源冲突、Secrets 泄露、migration、health 或 smoke 失败不得标记 Cloudflare 部署完成。每个阶段都必须能够回到上一个已验证状态，不使用 destructive git 操作清理他人改动。

## 11. 设计完成定义

本设计文件只定义边界和集成方式，不代表代码已经实现。T04/T05/T06 已有交付证据；T07 必须完成其 PRD、设计、实施计划和用户批准，才能进入后续真实 Cloudflare 实施流程。
