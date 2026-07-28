# 跨层思考指南

> **目的**：实现前先梳理数据如何跨层流动。

---

## 问题

**多数 bug 发生在层与层的边界，而不是层内部。**

常见跨层 bug：

- API 返回格式 A，前端预期格式 B
- 数据库存储 X，service 转换为 Y，但在过程中丢失数据
- 多个层用不同方式实现同一逻辑

---

## 实现跨层功能之前

### 第一步：画出数据流

画出数据的移动过程：

```
来源 → 转换 → 存储 → 读取 → 转换 → 展示
```

对每个箭头都提出这些问题：

- 数据采用什么格式？
- 可能出现什么错误？
- 谁负责校验？

### 第二步：识别边界

| 边界 | 常见问题 |
|------|---------|
| API ↔ Service | 类型不匹配、字段缺失 |
| Service ↔ Database | 格式转换、null 处理 |
| Backend ↔ Frontend | 序列化、日期格式 |
| Component ↔ Component | Props 结构变化 |

### 第三步：定义契约

对每个边界明确：

- 确切输入格式是什么？
- 确切输出格式是什么？
- 可能出现哪些错误？

---

## 常见跨层错误

### 错误 1：隐含的格式假设

**反例**：未经检查就假设日期格式

**正例**：在边界显式转换格式

### 错误 2：分散校验

**反例**：在多个层重复校验同一内容

**正例**：只在入口校验一次

### 错误 3：抽象泄漏

**反例**：组件了解数据库 schema

**正例**：每一层只了解相邻层

### 错误 4：每个使用方都解析同一 Payload

**反例**：命令读取 JSONL 事件，并在局部断言字段：

```typescript
const thread = (ev as { thread?: string }).thread;
const labels = (ev as { labels?: string[] }).labels;
```

这看起来只是局部实现，实际上会让每个使用方各自维护一份事件契约。下次字段变化时，很可能只更新一个命令而遗漏另一个。

**正例**：只在事件边界解码一次，然后导出有类型约束的投影：

```typescript
if (!isThreadEvent(ev)) return false;
return ev.thread === filter.thread;
```

**规则**：对于只追加日志、JSON stream、RPC payload 或配置文件，应由一个明确负责方统一管理：

- 事件/payload 类型定义
- 从 `unknown` 开始的 type guard 和归一化
- UI 命令使用的元数据投影
- 从事实来源重放状态的 reducer

渲染代码可以格式化字段，但不得重新定义 payload 契约。

---

## 跨层功能检查表

实现前：

- [ ] 已画出完整数据流
- [ ] 已识别所有层边界
- [ ] 已定义每个边界的格式
- [ ] 已确定校验发生的位置

实现后：

- [ ] 已使用边界情况测试（null、空值、无效值）
- [ ] 已验证每个边界的错误处理
- [ ] 已检查数据往返后仍完整
- [ ] 已检查使用方导入共享 decoder/投影，而不是在局部断言 payload 字段
- [ ] 已检查派生状态指向来源事件标识符（`seq`、`id`、`version`），而不是自创新的第二套游标

---

## 跨平台模板一致性

在 Trellis 中，命令模板（例如 `record-session.md`）以相同或近似内容存在于**多个平台**。这是一个跨层边界。

### 检查表：修改任何命令模板之后

- [ ] 查找包含同一命令的所有平台：`find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] 更新所有平台副本（Markdown `.md` 和 TOML `.toml`）
- [ ] 对 Gemini TOML：调整续行符（`\\` 与 `\`）和三引号字符串
- [ ] 运行 `/trellis:check-cross-layer`，确认没有遗漏

**真实案例**：Claude 中的 `record-session.md` 更新为使用 `--mode record`，但遗漏了 iFlow、Kilo、OpenCode 和 Gemini，最终被跨层检查发现。

---

## 生成型运行时模板的升级一致性

部分生成文件既是文档，也是运行时输入。在 Trellis 中，`.trellis/workflow.md` 会被 `get_context.py`、`workflow_phase.py`、SessionStart filter 和每轮 hook 解析。模板变更必须同时验证全新 init 和升级路径。

### 检查表：修改由运行时解析的模板之后

- [ ] 识别读取该模板的每一个运行时 parser，不要只检查负责安装文件的 writer
- [ ] 检查相关语法是否位于 tag block 等明显托管区域之外
- [ ] 验证全新 `init` 输出，以及写入旧版 `.trellis/.version` 的带版本 `update` 场景
- [ ] 使用旧版纯净模板夹具添加升级回归测试，并断言安装文件最终达到当前 package 形态
- [ ] 更新负责该运行时契约的后端 spec

---

## 带版本文档边界

带版本文档属于跨层边界：源码路径、`docs.json` 版本路由和渲染出的版本选择器必须描述同一条发布线。

### 检查表：编辑带版本文档之前

- [ ] 确定目标发布线：stable、beta 或 RC
- [ ] 确认编辑的 MDX 路径与发布线匹配：
  - stable：`docs-site/{start,advanced,...}` 和 `docs-site/zh/{start,advanced,...}`
  - beta：`docs-site/beta/**` 和 `docs-site/zh/beta/**`
  - RC：`docs-site/rc/**` 和 `docs-site/zh/rc/**`
- [ ] 确认 `docs.json` 导航把版本标签指向相同路径
- [ ] Commit 前在相反目录树 grep 发布线专属术语
- [ ] Beta 内容出现在根发布路径时，应视为源路径 bug，而不是渲染 bug

**真实案例**：某个仅限 beta 的任务工作流变更，在根目录 `start/` 和 `advanced/` 路径中记录了 `prd.md` + `design.md` + `implement.md`、任务创建同意机制和 Codex 模式横幅，导致文档站点在 Release 选择器下提供 0.6 beta 行为。修复方式是恢复根目录 release 文档，把 0.6 内容移至 `beta/` 和 `zh/beta/`，并增加针对根 release 目录树中 beta 标记的 grep 审计。

**真实案例**：Codex inline 模式把工作流平台标记从 `[Codex]`/`[Kilo, Antigravity, Windsurf]` 改为 `[codex-sub-agent]`/`[codex-inline, Kilo, Antigravity, Windsurf]`。全新 init 正确，但 `trellis update` 只合并 `[workflow-state:*]` block，保留了 block 外的旧标记。结果是升级后的项目得到了新 hook 脚本，却仍使用旧工作流路由，`get_context.py --mode phase --platform codex` 可能返回空的 Phase 2.1 细节。

---

## 模式检测探测检查表

CLI 通过探测远程资源自动判断模式时（例如检查 `index.json` 是否存在，以决定使用 marketplace 还是直接下载）：

### 实现前

- [ ] 探测必须在使用其结果的**所有**代码路径运行（交互、`-y`、各种 `--flag` 组合）
- [ ] 区分 404 与暂时性错误，不能把两者都当成“未找到”
- [ ] 暂时性错误必须**中止或重试**，绝不能静默切换模式
- [ ] 上下文变化时（例如用户切换源），必须**重置**共享状态（缓存、预取数据）
- [ ] **快捷路径**（例如使用 `--template` 跳过选择器）的错误处理质量必须与探测路径一致；检查下游函数是否调用 catch-all 包装器

### 实现后

- [ ] 追踪从探测结果到模式决策分支的每条路径，不能存在意外 fallthrough
- [ ] 测试外部格式契约（giget URI、raw URL），或至少用注释记录
- [ ] 读取元数据时消费完整响应或使用 streaming parser；绝不能把固定长度前缀当成完整 JSON 解析
- [ ] 根据解析后的各部分重建组合标识符时，确认包含**所有**字段且位置**正确**（例如 `provider:repo/path#ref`，不是 `provider:repo#ref/path`）
- [ ] 确认快捷路径之后调用的**动作函数**内部没有继续使用旧 catch-all fetch；需要区分错误时，必须使用具备探测级错误处理能力的变体

**真实案例**：自定义 registry 流程经过 3 轮 Review 仍出现 8 个 bug，其中包括：(1) 探测只在交互模式运行；(2) 暂时性错误落入错误模式；(3) giget URI 中 `#ref` 位置错误；(4) 预取模板在切换源后泄漏；(5) `--template` 快捷路径绕过探测，但 `downloadTemplateById` 内部仍使用 catch-all `fetchTemplateIndex`，把超时变成“Template not found”。

**真实案例**：Agent session 的更新提示用 `response.read(4096)` 获取 npm `latest` 元数据，然后把它当作完整 JSON 解析。`@mindfoldhq/trellis` package 元数据超过 4 KB，导致 JSON 被截断、解析静默失败，首次 session 注入没有显示更新提示。修复方式是解析前读取完整响应，并增加一个 `version` 后带有 8 KB 元数据尾部的回归用例。

---

## 跨平台模板一致性

在 Trellis 中，命令模板（例如 `record-session.md`）以相同或近似内容存在于**多个平台**。这是一个跨层边界。

### 检查表：修改任何命令模板之后

- [ ] 查找包含同一命令的所有平台：`find src/templates/*/commands/trellis/ -name "<command>.*"`
- [ ] 更新所有平台副本（Markdown `.md` 和 TOML `.toml`）
- [ ] 对 Gemini TOML：调整续行符（`\\` 与 `\`）和三引号字符串
- [ ] 运行 `/trellis:check-cross-layer`，确认没有遗漏

**真实案例**：Claude 中的 `record-session.md` 更新为使用 `--mode record`，但遗漏了 iFlow、Kilo、OpenCode 和 Gemini，最终被跨层检查发现。

---

## 生成型运行时模板的升级一致性

部分生成文件既是文档，也是运行时输入。在 Trellis 中，`.trellis/workflow.md` 会被 `get_context.py`、`workflow_phase.py`、SessionStart filter 和每轮 hook 解析。模板变更必须同时验证全新 init 和升级路径。

### 检查表：修改由运行时解析的模板之后

- [ ] 识别读取该模板的每一个运行时 parser，不要只检查负责安装文件的 writer
- [ ] 检查相关语法是否位于 tag block 等明显托管区域之外
- [ ] 验证全新 `init` 输出，以及写入旧版 `.trellis/.version` 的带版本 `update` 场景
- [ ] 使用旧版纯净模板夹具添加升级回归测试，并断言安装文件最终达到当前 package 形态
- [ ] 更新负责该运行时契约的后端 spec

**真实案例**：Codex inline 模式把工作流平台标记从 `[Codex]`/`[Kilo, Antigravity, Windsurf]` 改为 `[codex-sub-agent]`/`[codex-inline, Kilo, Antigravity, Windsurf]`。全新 init 正确，但 `trellis update` 只合并 `[workflow-state:*]` block，保留了 block 外的旧标记。结果是升级后的项目得到了新 hook 脚本，却仍使用旧工作流路由，`get_context.py --mode phase --platform codex` 可能返回空的 Phase 2.1 细节。

---

## 模式检测探测检查表

CLI 通过探测远程资源自动判断模式时（例如检查 `index.json` 是否存在，以决定使用 marketplace 还是直接下载）：

### 实现前

- [ ] 探测必须在使用其结果的**所有**代码路径运行（交互、`-y`、各种 `--flag` 组合）
- [ ] 区分 404 与暂时性错误，不能把两者都当成“未找到”
- [ ] 暂时性错误必须**中止或重试**，绝不能静默切换模式
- [ ] 上下文变化时（例如用户切换源），必须**重置**共享状态（缓存、预取数据）
- [ ] **快捷路径**（例如使用 `--template` 跳过选择器）的错误处理质量必须与探测路径一致；检查下游函数是否调用 catch-all 包装器

### 实现后

- [ ] 追踪从探测结果到模式决策分支的每条路径，不能存在意外 fallthrough
- [ ] 测试外部格式契约（giget URI、raw URL），或至少用注释记录
- [ ] 读取元数据时消费完整响应或使用 streaming parser；绝不能把固定长度前缀当成完整 JSON 解析
- [ ] 根据解析后的各部分重建组合标识符时，确认包含**所有**字段且位置**正确**（例如 `provider:repo/path#ref`，不是 `provider:repo#ref/path`）
- [ ] 确认快捷路径之后调用的**动作函数**内部没有继续使用旧 catch-all fetch；需要区分错误时，必须使用具备探测级错误处理能力的变体

**真实案例**：自定义 registry 流程经过 3 轮 Review 仍出现 8 个 bug，其中包括：(1) 探测只在交互模式运行；(2) 暂时性错误落入错误模式；(3) giget URI 中 `#ref` 位置错误；(4) 预取模板在切换源后泄漏；(5) `--template` 快捷路径绕过探测，但 `downloadTemplateById` 内部仍使用 catch-all `fetchTemplateIndex`，把超时变成“Template not found”。

**真实案例**：Agent session 的更新提示用 `response.read(4096)` 获取 npm `latest` 元数据，然后把它当作完整 JSON 解析。`@mindfoldhq/trellis` package 元数据超过 4 KB，导致 JSON 被截断、解析静默失败，首次 session 注入没有显示更新提示。修复方式是解析前读取完整响应，并增加一个 `version` 后带有 8 KB 元数据尾部的回归用例。

---

## 何时创建流程文档

以下情况应创建详细流程文档：

- 功能跨越 3 层以上
- 涉及多个团队
- 数据格式复杂
- 该功能以前造成过 bug

---

## 事件日志/投影边界

只追加日志属于跨层契约。一个事件会经过：

```
CLI 输入 → 事件 writer → events.jsonl → reader → filter → reducer → 展示
```

### 检查表：添加新的事件类别或字段之后

- [ ] 把事件类别加入中央事件分类
- [ ] 在事件层添加有类型约束的事件变体或 type guard
- [ ] 为来自用户输入或 JSON 的数组/对象字段添加归一化 helper
- [ ] 只在事件 writer 中分配 `seq`/`id`
- [ ] Filter 和 reducer 使用有类型约束的事件 guard，不使用局部类型断言
- [ ] 展示代码使用 reducer 输出或有类型约束的事件，不读取原始 JSON
- [ ] 至少添加一个回归测试，证明历史重放和实时筛选使用同一个 filter 模型

**真实案例**：Thread channel 新增了 `kind: "thread"`、`description`、`context`、label 和 `lastSeq`。首次实现能正确重放 thread 状态，但多个命令仍使用局部类型断言重新解析事件 payload 字段。修复方式是让核心事件层负责 `ThreadChannelEvent` 和 `isThreadEvent`，让 `reduceChannelMetadata` 成为唯一 channel 元数据投影，并让 `reduceThreads` 成为唯一 thread 重放 reducer。
