# 代码复用思考指南

> **目的**：创建新代码前先停下来思考——它是否已经存在？

---

## 问题

**重复代码是造成不一致 bug 的首要来源。**

复制粘贴或重写现有逻辑时：

- Bug 修复不会同步传播
- 行为会随时间逐渐分化
- 代码库会越来越难理解

---

## 编写新代码之前

### 第一步：先搜索

```bash
# 搜索相似函数名
grep -r "functionName" .

# 搜索相似逻辑
grep -r "keyword" .
```

### 第二步：提出这些问题

| 问题 | 如果答案为“是”…… |
|------|------------------|
| 是否存在相似函数？ | 使用或扩展它 |
| 其他地方是否使用了这个模式？ | 遵循现有模式 |
| 这能否成为共享 utility？ | 在正确位置创建它 |
| 我是否正在从另一个文件复制代码？ | **停止**——提取到共享位置 |

---

## 常见重复模式

### 模式 1：复制粘贴函数

**反例**：把校验函数复制到另一个文件

**正例**：提取到共享 utility，在需要处导入

### 模式 2：相似组件

**反例**：创建一个与现有组件有 80% 相似度的新组件

**正例**：使用 props/variant 扩展现有组件

### 模式 3：重复常量

**反例**：在多个文件中定义同一个常量

**正例**：建立单一事实来源，并在所有位置导入

### 模式 4：重复提取 Payload 字段

**反例**：多个使用方分别在局部断言同一 JSON/事件字段：

```typescript
const description = (ev as { description?: string }).description;
const context = (ev as { context?: ContextEntry[] }).context;
```

即使代码只有两行，这也是重复的契约逻辑。每个使用方都形成了自己对“有效 payload”的定义。

**正例**：把 decoder、type guard 或投影放在数据负责方旁边：

```typescript
if (isThreadEvent(ev)) {
  renderThreadEvent(ev);
}
```

**规则**：同一个无类型 payload 字段被 2 个以上位置读取时，在添加第三个读取方之前创建共享 type guard、normalizer 或投影。

---

## 何时抽象

**应当抽象的情况**：

- 相同代码出现 3 次以上
- 逻辑复杂到容易产生 bug
- 可能有多人需要使用

**不应抽象的情况**：

- 只使用一次
- 简单的一行代码
- 抽象比重复本身更复杂

---

## 批量修改之后

在多个文件中完成相似修改后：

1. **Review**：是否覆盖了所有实例？
2. **搜索**：使用 grep 查找遗漏。
3. **思考**：是否应该抽象？

### Reducer 应使用穷尽结构

状态由动作型值（`action`、`kind`、`status`、`phase`）派生时，优先使用一个 `switch` reducer，不要分散使用 `if/else` 更新。

```typescript
// 反例——动作专属的状态转换难以审查
if (action === "opened") { ... }
else if (action === "comment") { ... }
else if (action === "status") { ... }

// 正例——由一个 reducer 负责完整转换表
switch (event.action) {
  case "opened":
    ...
    return;
  case "comment":
    ...
    return;
}
```

当事件日志是事实来源时，这一点很重要。Reducer 是有文档记录的重放模型；展示代码和命令不应复制重放模型的局部逻辑。

---

## Commit 前检查表

- [ ] 已搜索现有相似代码
- [ ] 没有本应共享的复制粘贴逻辑
- [ ] 共享 decoder 之外没有重复提取无类型 payload 字段
- [ ] 常量只在一个位置定义
- [ ] 相似模式使用同一种结构
- [ ] Reducer/action 转换集中在一个 reducer 或 command dispatcher 中

---

## 易错点：Python if/elif/else 穷尽检查

**问题**：Python 的 if/elif/else 链没有编译期穷尽检查。给 `Literal` 类型（例如 `Platform`）添加新值时，现有 if/elif/else 链会静默落入 `else`，并使用错误的默认值。

**现象**：新平台只能部分工作——部分方法返回 Claude 默认值，而不是平台专属值，且不会抛出错误。

**示例**（`cli_adapter.py`）：

```python
# 反例："gemini" 落入 else，返回 "claude"
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    else:
        return "claude"  # gemini 静默得到 "claude"！

# 正例：为每个平台设置显式分支
@property
def cli_name(self) -> str:
    if self.platform == "opencode":
        return "opencode"
    elif self.platform == "gemini":
        return "gemini"
    else:
        return "claude"
```

**预防**：向 Python `Literal` 类型添加新值时，搜索所有基于该类型分支的 if/elif/else 链，并添加显式分支。不要假设 `else` 对新值仍然正确。

---

## 易错点：产生相同输出的不对称机制

**问题**：两种不同机制必须生成同一组文件时（例如 init 使用递归目录复制，而 update 使用手动 `files.set()`），结构修改（重命名、移动、新增子目录）只会通过自动机制传播。手动机制会静默偏离。

**现象**：Init 完全正常，但 update 把文件创建在错误路径，或彻底漏掉文件。

**预防**：

- **最佳方案**：消除不对称——让手动路径调用自动路径，例如让 `collectTemplateFiles()` 调用 `getAllScripts()`，不再维护自己的列表。
- **无法避免不对称时**：添加回归测试，对比两种机制的输出。
- 迁移目录结构时，搜索所有引用旧结构的代码路径。

**真实示例**：`trellis update` 曾为 `getAllScripts()` 已经跟踪的 11 个脚本另行维护一份手动 `files.set()` 列表。修复方式是用 `for..of getAllScripts()` 循环替换手动列表。参见 v0.4.0-beta.3 中对 `update.ts` 的重构。

---

## 模板文件注册（Trellis 专项）

向 `src/templates/trellis/scripts/` 添加新文件时：

**唯一注册点**：`src/templates/trellis/index.ts`

1. 添加 `export const xxxScript = readTemplate("scripts/path/file.py");`
2. 加入 `getAllScripts()` Map

只需这两步。`commands/update.ts` 直接使用 `getAllScripts()`，无需手动同步其他列表。

**重要性**：未在 `getAllScripts()` 中注册时，`trellis update` 不会把该文件同步到用户项目，bug 修复和新功能也无法传播。

**历史**：v0.4.0-beta.3 之前，`update.ts` 有一份手工维护的文件列表，经常与 `getAllScripts()` 不同步，导致 11 个 Python 文件在 `trellis update` 期间被静默跳过。最终通过删除重复列表并把 `getAllScripts()` 作为单一事实来源解决。

### 新脚本快速检查表

```bash
# 添加新的 .py 文件后，确认它位于 getAllScripts() 中：
grep -l "newFileName" src/templates/trellis/index.ts  # 应有匹配结果
```

### 模板同步约定

`.trellis/scripts/`（项目自用版本）与 `packages/cli/src/templates/trellis/scripts/`（模板版本）必须保持完全一致。编辑 `.trellis/scripts/` 后始终执行同步：

```bash
rsync -av --delete --exclude='__pycache__' .trellis/scripts/ packages/cli/src/templates/trellis/scripts/
```

**易错点**：使用错误的源路径/目标路径运行 rsync，可能创建嵌套的垃圾目录（例如 `.trellis/scripts/packages/cli/...`）。运行前务必再次核对路径。
