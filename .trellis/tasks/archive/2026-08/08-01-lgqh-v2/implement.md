# V2 新任务实施编排（仅规划）

## 1. 当前状态

本文件规定总任务后续验收顺序。T07 已进入代码实施并完成本地验证；真实 Cloudflare 资源写入和生产验收仍保留给项目所有者通过 Dashboard 执行。

## 2. 前置确认

在任何新任务开始前，必须确认：

- `docs/PRD/v2/PRD.md` 已被完整读取。
- 用户确认 T01-T03 的成果冻结，prototype v2 是视觉真源。
- 旧 T04-T10 不在活动任务树中，仅保留归档参考。
- T04-T06 已完成并有归档交付；T07 的 `prd.md`、`design.md`、`implement.md` 已存在。
- 子任务 PRD 已由产品、Staff Engineer 和 QA 联合 Review。
- 任何需要改变 Vue/CSS/布局/交互的建议都已暂停并单独向用户 brainstorm。

## 3. 阶段顺序

### 阶段 A：任务与契约冻结

总任务确认主 PRD、依赖图、文件所有权、旧任务归档和 T03 已交付状态记录。T07 已获用户批准进入实施；当前记录为“代码实施与本地验证完成，真实 Cloudflare 环境验收待项目所有者通过 Dashboard 执行”，真实 Cloudflare 写入仍不由 Agent 代替所有者执行。

### 阶段 B：T04 后端能力扩展

T04 先盘点现有 schema、路由、服务、repository、认证、存储和测试，然后按迁移→共享 Contract→业务服务→API→安全→测试的顺序实施。T04 不进入 Vue 表现文件。

T04 的移交条件：迁移可重复、Contract 稳定、API 具备错误语义、公开过滤和权限测试通过，并提交接口清单与回滚说明。

### 阶段 C：T05 全栈业务适配

T05 先建立真实 API 访问矩阵，再逐一替换 Mock/fixture，依次连接公开读、公开写、管理读、管理写、上传、回收站和分析。适配优先在 API client/composable/mapper 层完成；不得修改表现层来绕过接口不匹配。

T05 的移交条件：生产入口无 Mock，关键公开/管理流程使用真实 API，失败状态和权限状态可复现，视觉快照与 T03 基线一致，所有差异已记录。

### 阶段 D：T06 系统加固与发布验收

T06 先固定测试数据、系统主题、时区、小时槽位和部署环境，再运行单元、Workers、E2E、视觉、无障碍、性能、安全和迁移演练。缺陷按照领域回派；不通过关闭断言或修改视觉基线。

T06 的移交条件：发布清单、迁移演练、回滚验证、测试报告、性能安全结论、监控健康检查和遗留问题均齐全。

### 阶段 E：T07 Workers 架构迁移与部署

T07 先读取 `docs/PRD/v2/PRD.md`、自身三份规划、T06 runbook 和 Cloudflare research；执行当前 Wrangler CLI contract、Worker/Vite 开发模式实验、seed/clean 安全验证、只读资源检查和 dry-run。确认入口与静态资源配置后，按“构建产物检查 → 账号/Worker/分支与环境核对 → D1/R2 检查或确认创建 → 生成非敏感部署配置 → 远程 D1 migration → `wrangler deploy`”执行真实验证。Workers Builds 的 Build command 为 `pnpm build`，Deploy command 为 `pnpm deploy`；首次部署必须在真实全新或隔离 Cloudflare 环境中通过 Fork → Import repository → Save and Deploy 完成，不能要求 clone、本地命令或手工 binding；第二次 main 提交必须证明资源复用和新增 migration。Preview 默认关闭或使用隔离 Worker/D1/R2，本地完整发布由 `pnpm release` 编排，不能把两者混为一个会重复构建的命令。第一阶段不修改冻结前端；Turnstile 生产投稿照实记录 A1 blocked。

T07 的移交条件：独立 Worker/Static Assets/D1/R2/Secrets 证据、可重复 check/deploy 命令、Local/Preview/Production 隔离、资源清单、migration/health/smoke 结果、失败/重试/回滚报告、README/runbook 更新和 A1 blocked 结论均齐全。

### 阶段 F：总任务最终验收

总任务对照总 PRD 和 T04-T07 验收清单复核，确认前端冻结、数据边界、现有能力、真实 Cloudflare 连接、部署和回滚，再决定是否允许发布。A1 未解决时不得签署“生产投稿完整可用”。

## 4. 串并行规则

| 工作 | 是否可并行 | 条件 |
| --- | --- | --- |
| 总任务文档审计与 T04 规划 | 可 | 不改业务代码 |
| T04 migration 与 T05 生产接线 | 不可 | T05 必须等待 Contract 稳定 |
| T04 后端不同模块 | 仅在文件所有权清晰时 | migration/Contract 先冻结 |
| T05 公开适配与管理适配 | 可有限并行 | 不共改同一 adapter/路由状态 |
| T06 测试编写 | 可提前准备 | 不把失败测试当作已通过 |
| T06 发布演练 | 不可提前完成 | 必须等待 T04/T05 构建和移交 |
| T07 CLI contract/doctor/dry-run | 可 | 不产生生产远程写入 |
| T07 生产资源初始化/migration/deploy | 不可提前完成 | 必须等待 T06 交付和用户授权 |

## 5. 推荐验证命令

实际命令以 `package.json` 为准，至少核对：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
pnpm test:e2e
```

若某个命令不存在，记录实际替代命令，不擅自删除门禁。所有命令记录 Node/pnpm 版本、环境变量、数据库状态、时区、浏览器和结果。

## 6. 实施暂停条件

出现下列任一情况即暂停当前任务并记录：

- 权威 PRD 路径或内容出现新的不一致。
- T03 视觉基线无法访问或无法复现。
- Cloudflare 目标账号、Worker 名称、D1/R2 资源或环境归属不明确。
- Wrangler 当前版本不支持已规划的 Worker deploy/config、Static Assets 或 D1/R2 binding 命令。
- Secret 将进入 Git、shell 参数、日志或 evidence。
- D1 migration、R2 清理探针、health 或 smoke 失败。
- 需要修改前端才能使生产投稿通过；该项回到 A1 用户决策，不在 T07 静默扩大范围。
- API Contract 与正式前端的现有视图模型无法通过 adapter 适配。
- 需要修改 Vue 表现、CSS、布局、动画、Dialog 或交互流程。
- migration 不能证明幂等、兼容或回滚。
- 公开 API 可能泄露非 published 数据。
- 认证、CSRF、版本冲突或资源清理语义不明确。

## 7. 交付文件

T04 交付 migration、Contract、API 文档和测试证据；T05 交付真实接线清单、adapter 变更、流程验证和 Mock 清理报告；T06 交付测试报告、性能/安全结论、迁移/部署/回滚文档和 `acceptance.md`；T07 交付真实 Cloudflare 资源/部署/连接报告、check/deploy 入口、README/runbook 和 A1 blocked 记录。总任务交付最终验收记录。

## 8. 规划结束定义

本文件完成只表示总任务验收顺序已明确。T04-T06 已完成；T07 当前记录为“代码实施与本地验证完成，真实 Cloudflare 环境验收待项目所有者通过 Dashboard 执行”，不把 Agent 未获生产账号授权描述为代码实现失败。
