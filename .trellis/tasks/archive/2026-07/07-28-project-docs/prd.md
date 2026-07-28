# project-docs PRD

## 目标

编写项目 README（Quick Start + Cloudflare 部署指南）+ 人工测试检查清单，让新开发者快速上手，让部署者了解完整流程。

## 范围

### README.md

- 项目简介（中文）
- 技术栈一览
- 项目结构树
- 前置要求（Node.js、pnpm、Cloudflare 账号）
- Quick Start（本地开发 5 步走）
- Cloudflare 部署指南（Pages + D1 + R2 + Secrets）
- 可用命令参考
- 链接到 Trellis 规范

### 人工测试清单 (TESTING.md)

- 环境准备检查
- 公开首页测试（11 项）
- 提交群聊测试（5 项）
- 点赞测试（4 项）
- 管理登录测试（3 项）
- 管理员群聊管理测试（6 项）
- 仪表盘测试（3 项）
- 图片上传测试（4 项）
- 结果记录模板

## 不在范围

- API 文档（已有 shared/contracts）
- 架构设计文档（已有 .trellis/tasks/*/design.md）

## 验收标准

- `AC-01`：README.md 包含完整的 Quick Start（≤5 步即可从零到本地运行）
- `AC-02`：README.md 包含 Cloudflare 部署流程（Pages + D1 + R2 + Secrets 设置）
- `AC-03`：TESTING.md 覆盖所有已实现功能的测试步骤
- `AC-04`：两份文件均为简体中文，技术术语保持原样
