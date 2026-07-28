# 工作区索引

> 记录所有开发者与 AI Agent 协作产生的工作记录。

---

## 概览

本目录跟踪项目中所有开发者使用 AI Agent 完成工作的记录。

### 文件结构

```text
workspace/
|-- index.md              # 本文件：总索引
+-- {developer}/          # 每位开发者的目录
    |-- index.md          # 包含 session 历史的个人索引
    |-- tasks/            # 任务文件
    |   |-- *.json        # 活动任务
    |   +-- archive/      # 按月份归档的任务
    +-- journal-N.md      # 按顺序编号的 journal 文件
```

---

## 活跃开发者

| 开发者 | 最近活动 | Session 数量 | 当前文件 |
|--------|----------|--------------|----------|
| 暂无 | - | - | - |

---

## 开始使用

### 新开发者

运行初始化脚本：

```bash
python ./.trellis/scripts/init_developer.py <your-name>
```

该脚本会：

1. 创建开发者身份文件，该文件由 Git 忽略；
2. 创建个人进度目录；
3. 创建个人索引；
4. 创建首个 journal 文件。

### 已有开发者

1. 获取开发者名称：

   ```bash
   python ./.trellis/scripts/get_developer.py
   ```

2. 读取个人索引：

   ```bash
   cat .trellis/workspace/$(python ./.trellis/scripts/get_developer.py)/index.md
   ```

---

## 规范

### Journal 文件规则

- 每个 journal 文件最多 **2000 行**；
- 达到上限后创建 `journal-{N+1}.md`；
- 创建新文件时同步更新个人 `index.md`。

### Session 记录格式

每个 session 应包含：

- 摘要：一句话说明；
- 分支：执行工作的分支；
- 主要变更：修改了什么；
- Git 提交：commit hash 和 message；
- 后续步骤：下一步要做什么。

---

## Session 模板

```markdown
## Session {N}：{标题}

**日期**：YYYY-MM-DD
**任务**：{task-name}
**分支**：`{branch-name}`

### 摘要

{一句话摘要}

### 主要变更

- {变更 1}
- {变更 2}

### Git 提交

| Hash | Message |
|------|---------|
| `abc1234` | {commit message} |

### 测试

- [OK] {测试结果}

### 状态

[OK] **已完成** / # **进行中** / [P] **阻塞**

### 后续步骤

- {后续步骤 1}
- {后续步骤 2}
```

---

**语言要求**：所有文档必须以简体中文为主。
