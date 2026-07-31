# 01 全量 Spec 与代码审计实施计划

> 执行前置规则：进入执行或最终批准前，必须完整读取 `docs/PRD/v2/子任务01.md` 原文并逐条核对三份规划；先检查代码、测试、配置、Spec 和任务历史，再与用户按 Trellis Brainstorm 逐轮讨论，每次只问一个最高价值问题。每次用户回答后更新规划；即使无疑问也必须提交最终规划摘要并等待明确批准，未完成前不得实施或修改业务代码。

## 1. 当前阶段与执行边界

- 当前任务：`01-lgqh-v2-spec-audit`。
- 父任务：`lgqh-v2`。
- 当前状态：`planning`。
- 本次只创建规划文件，不执行 `task.py start`，不进入实现阶段。
- 未来审计仍不得修改业务代码、migration、测试代码、快照、Tailwind 配置或依赖。
- 允许的未来产出是 `research.md`、`impact-map.md` 和有证据的父任务 PRD 修订建议。

## 2. 阶段一：建立材料清单

1. 找到全部 Spec、AGENTS、workflow 和相关技能规范。
2. 找到全部归档任务及其可用规划、验收和结果记录。
3. 找到当前父任务和所有 V2 子任务 PRD；确认旧 `07-30-frontend-overhaul` 目录是否为空、是否被引用。
4. 找到总 PRD、已冻结产品决策和父任务依赖图。
5. 找到真实源码目录：`src/`、`shared/`、`functions/`、`migrations/`、`tests/`。
6. 找到 `package.json`、Vitest/Workers Vitest/Playwright 配置、Wrangler 配置和测试初始化。
7. 记录缺失、不可读取、命名与源 PRD 不同的材料。

### 材料清单最低覆盖

| 类别 | 当前重点 |
| --- | --- |
| Spec | `.trellis/spec/frontend/`、`.trellis/spec/backend/`、`.trellis/spec/guides/` |
| 归档任务 | 全部 `task.json`、PRD、design、implement；重点首页、管理、上传、搜索、点赞、状态机 |
| 父/当前 V2 | `RPD.md`、子任务 01–10、`.trellis/tasks/08-01-lgqh-v2/` |
| 前端 | `src/views/`、`src/features/groups/`、`src/features/admin/`、`src/shared/` |
| 共享 | `shared/domain/`、`shared/contracts/` |
| 后端 | `functions/api/[[route]].ts`、`functions/_lib/` |
| 数据库 | `migrations/`、Wrangler D1 配置、Workers migration tests |
| 测试 | `tests/workers/`、`tests/e2e/`、组件/composable specs、测试配置 |

## 3. 阶段二：审计规范与历史决策

1. 读取所有 Spec 实际正文。
2. 读取所有归档任务的 PRD、design、implement 和可用验收结果。
3. 提取不可破坏规则、历史 Bug 防回归点、迁移约束和设计决策。
4. 标记过时、相互冲突或与真实代码不一致的规范。
5. 建立 Spec 与历史任务索引，并为每个领域关联后续 V2 任务。

## 4. 阶段三：追踪当前实现

按照以下调用链审计公开读路径：

```text
公开前端
→ composable / view
→ API client
→ Hono route
→ service
→ repository
→ D1
```

同时审计管理写路径：

```text
管理端操作
→ 认证和 CSRF
→ 状态转换
→ R2 生命周期
→ D1 batch / 事务边界
→ 测试
```

按以下顺序执行领域审计：

1. 首页路由、组件层级、卡片、Grid、加载/空/错误、图片、QR、复制、点赞和响应式。
2. 搜索输入、debounce、IME、URL/历史、字段、排序、cursor、取消、重复和无限滚动。
3. 旋转排序的 epoch、时区、槽位、循环移位、作用范围、cursor 耦合和固定时间测试。
4. 管理列表 keyset、筛选、排序、URL、total count、删除退页、表格和测试。
5. 状态集合、转换入口、公开过滤、管理显示和 `last_published_at` 候选入口。
6. 回收站、恢复、永久删除、R2、D1 batch、突变令牌、冲突、失败恢复和关联清理。
7. 主题 Token、Tailwind、挂载时机、localStorage、系统检测、公共状态和硬编码颜色。
8. Playwright 矩阵、夹具、登录、D1、移动 viewport、WebKit、截图、剪贴板、拖拽、触摸、时间和选择器。
9. migration 编号、建表、时间、外键、索引、默认数据、幂等、本地/测试同步和部署顺序。

## 5. 阶段四：建立差异表

对每个 V2 功能建立记录：

- 当前能力。
- 目标能力。
- 当前实现与目标的差异。
- Spec/代码/测试/migration 证据。
- 受影响的模块和文件。
- 风险和冲突等级。
- 后续所属任务。
- 是否需要用户决策。

至少覆盖主题、顶栏、卡片、详情、分享、Carousel、发现、标签、板块、所有群组、搜索、管理分页、响应式表格和回收站关联清理。

## 6. 阶段五：编写交付物

按以下顺序生成未来审计产出：

1. `research.md`：完整现状和冲突审计报告。
2. `impact-map.md`：功能到模块/文件/任务/测试的影响图和风险热力图。
3. 总 PRD 修改方案：逐条列出事实纠正、术语、约束、验收、测试、任务边界、依赖、风险和待决策。
4. 在获得父任务范围批准后，修订父任务 `prd.md`；源 `docs/PRD/v2/RPD.md` 是否修改必须由父任务流程明确授权，不能自行覆盖。
5. 完成审计修改记录。

当前 planning 只写本任务的三份规划文件，不创建上述研究交付物，不修改父任务或源 PRD。

## 7. 阶段六：自检与质量门禁

必须确认：

- 没有业务代码、migration、测试代码、测试快照、Tailwind 或依赖变化。
- 所有重要结论有文件/符号、测试、route、schema、repository、service 或 migration 证据。
- 每个重点领域都有 Spec/代码/测试三方核对。
- 所有高风险冲突有处理建议和后续任务归属。
- 所有 C4/C5 问题单独列出，不用模糊措辞掩盖。
- 所有待决策问题确实无法由仓库证据解决。
- PRD 修订未遗漏已冻结产品规则。
- 子任务影响图没有遗漏高冲突共享文件。

## 8. 建议验证命令

这些命令用于只读审计和工作区证明，不代表进入实现阶段：

```bash
rg --files .trellis/spec src shared functions migrations tests
find .trellis/tasks/archive -type f \( -name task.json -o -name prd.md -o -name design.md -o -name implement.md \)
rg -n "rotation|cursor|pagination|status|trash|purge|csrf|theme|dark|playwright" src shared functions migrations tests .trellis/spec
git status --short
git diff --name-only
```

如需建立基线，只能运行不写入工作树的检查；不得执行 migration、数据库 reset、快照更新或修复命令。业务测试不是 T01 的完成条件，除非为了读取既有测试行为而运行只读测试并记录环境影响。

## 9. 风险、回滚与停止条件

| 风险 | 预防/处理 |
| --- | --- |
| 材料量大导致漏读 | 先建立清单，再按领域分块读取；报告中记录每个材料的读取状态 |
| 旧任务/旧目录误导 | 以当前父任务、真实代码和 Git 状态为准，旧引用作为 C1 文档偏差记录 |
| 把建议写成产品决定 | 分开“证据事实、推荐方案、待用户决策”三类 |
| C4/C5 被继续任务绕过 | 在影响图标为阻塞，并阻止相关后续任务进入实施 |
| 发现 Bug 后越界修复 | 只记录证据、影响、归属和建议，不修改业务代码 |
| 研究产出与父任务漂移 | 每条 PRD 修改引用证据和父任务章节，得到批准后再更新 |

若发现数据损坏、公开泄露、资源生命周期破坏、不可逆迁移、安全绕过或无法替代的测试缺口，立即标记 C5，停止相关后续 planning 的实施授权，但仍可完成证据整理。

## 10. 后续汇报格式

未来 T01 完成时，汇报必须包含：

### 已完成

- 阅读材料数量和缺失材料。
- `research.md`、`impact-map.md` 路径。
- 总 PRD 是否修订，以及修订范围。

### 关键发现

- 最重要的可复用能力。
- 最大实现冲突。
- 最大迁移风险。
- 最大测试风险。

### PRD 修改

- 修改条目数量。
- 主要修改类别。
- 是否存在待用户确认事项。

### 阻塞项

按 C4 和 C5 分组列出。如果没有阻塞项，明确写：

```text
未发现阻止后续设计阶段开始的 C4/C5 阻塞项。
```

### 代码状态

明确确认：未修改业务代码、未创建正式迁移、未执行功能重构。
