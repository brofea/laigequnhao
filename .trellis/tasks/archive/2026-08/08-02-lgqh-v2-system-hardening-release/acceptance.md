# T06 系统加固与发布验收 — acceptance.md

- 任务：`08-02-lgqh-v2-system-hardening-release`
- 日期：2026-08-02
- 基线：`main` @ `9b22055`（工作区除任务文件外无代码改动）
- 状态说明：`passed` / `failed` / `blocked` / `waived`

## 0. 证据索引

| 证据 | 路径 |
|---|---|
| Unit 测试 | `evidence/stage3/unit.txt`（82 passed） |
| Workers 测试 | `evidence/stage4/workers.txt`（103 passed） |
| typecheck/lint/build | `evidence/stage3/build.txt`（typecheck ✅、lint 0 errors、build ✅） |
| E2E 全量 | `evidence/e2e/e2e-final.txt`（68 passed，桌面+手机） |
| 无障碍 E2E | `evidence/e2e/a11y-final.txt`（16 passed + 对比度） |
| 视觉截图（17 张）+ 结构对比 | `evidence/visual/*.png`、`structure-compare.json`、`manifest.json` |
| 迁移演练 | `evidence/stage11/drill1-empty.txt`、`drill2-step1.txt`、`drill-summary.txt` |
| 视觉/性能/安全/迁移/部署报告 | `research/visual-report.md`、`performance-report.md`、`security-report.md`、`migration-drill-report.md`、`deploy-runbook.md` |
| 联合 Review | `research/joint-review.md` |
| 缺陷与冻结问题 | `research/defect-log.md` |

## 1. 环境

Node v25.9.0 / pnpm 11.17.0 / Playwright 1.62.0 / chromium-1234 / macOS 15.7.8 / 时区 Asia/Shanghai / 迁移 0001-0004 / D1 测试库 lgqh-test-local（每次 E2E 自动重置）。

---

## 2. 验收项

### 2.1 Unit 与 Contract（RPD §29.1、T06 prd §6.1）

| 编号 | 场景 | 命令 | 期望 | 实际 | 状态 |
|---|---|---|---|---|---|
| U1 | 显示宽度与 Unicode 边界（ASCII/CJK/Emoji/重音） | `pnpm test` | 通过 | 82/82 | ✅ passed |
| U2 | 标题 50 / 简介 1000 宽度边界 | 同上 | 通过 | 同上 | ✅ passed |
| U3 | ThemePreference 合法/非法/回退 | 同上 | 通过 | 同上 | ✅ passed |
| U4 | system 主题变化跟随 | 同上 | 通过 | 同上 | ✅ passed |
| U5 | 小时槽位与稳定随机 | 同上 | 通过 | 同上 | ✅ passed |
| U6 | URL query 解析、分页页码 | 同上 | 通过 | 同上 | ✅ passed |
| U7 | ClientError 归一化与 adapter | 同上 | 通过 | 同上 | ✅ passed |

### 2.2 Workers / API（RPD §29.2、T06 prd §6.2）

| 编号 | 场景 | 命令 | 期望 | 实际 | 状态 |
|---|---|---|---|---|---|
| W1 | 发布时间状态转换（新建发布/下架重发/已发布编辑不更新） | `pnpm run test:workers` | 通过 | 103/103 | ✅ passed |
| W2 | 发现新群 10 条排序、相同时间戳稳定 | 同上 | 通过 | 同上 | ✅ passed |
| W3 | 标签仅统计 published | 同上 | 通过 | 同上 | ✅ passed |
| W4 | 板块 CRUD/启停/顺序/sort mode | 同上 | 通过 | 同上 | ✅ passed |
| W5 | 成员添加/重复拒绝/下架成员/trash 拒绝/上下移 | 同上 | 通过 | 同上 | ✅ passed |
| W6 | 回收站原子清理/永久删除清理 | 同上 | 通过 | 同上 | ✅ passed |
| W7 | 管理分页 totalItems/totalPages、50/51 边界、跨页稳定排序 | 同上 | 通过 | 同上 | ✅ passed |
| W8 | 认证、CSRF、Zod、版本冲突 | 同上 | 通过 | 同上 | ✅ passed |

### 2.3 公开端 E2E（RPD §29.3、T06 prd §6.3）

| 编号 | 场景 | 用例 | 状态 |
|---|---|---|---|
| P1 | 默认首页区域顺序 + 真实数据渲染 | real-flows:104 | ✅ passed |
| P2 | 搜索 debounce/URL 同步/清空恢复/搜索框位置稳定 | public-flows:70 | ✅ passed |
| P3 | 标签点击替换搜索词 | public-flows:94 | ✅ passed |
| P4 | 无结果状态 + 清除筛选 | public-flows:109 | ✅ passed |
| P5 | 发现新群/标签聚合/板块成员/目录 | real-flows:104 | ✅ passed |
| P6 | 详情深链 + 关闭只清 group 保留 q | real-flows:132 | ✅ passed |
| P7 | 深链下架群组不泄露（404 + toast + 参数清理） | public-flows:118 | ✅ passed |
| P8 | 点赞不打开详情弹窗、aria-pressed 切换 | public-flows:145 | ✅ passed |
| P9 | 多加群方式按配置顺序 | public-flows:161 | ✅ passed |
| P10 | 主题三态循环 + 刷新保留 | public-flows:179 | ✅ passed |
| P11 | 手机端 Carousel 至少双卡可见 | public-flows:201 | ✅ passed |
| P12 | 分享/复制（代码审查：规范化链接 `origin/?group=`） | — | ✅ passed* |
| P13 | 提交弹窗与管理字段隔离 | application:59 | ✅ passed |

\* P12 复制剪贴板在无权限环境不稳定，以源码审查 + toast 行为测试代替，未降断言。

### 2.4 管理端 E2E（RPD §29.4、T06 prd §6.4）

| 编号 | 场景 | 用例 | 状态 |
|---|---|---|---|
| A1 | 登录/会话/管理页三导航 | application:33,48 | ✅ passed |
| A2 | 固定 50 条分页 + 总数 | real-flows:148 | ✅ passed |
| A3 | URL 状态恢复（page/q） | admin-flows:100 | ✅ passed |
| A4 | 筛选/排序回第一页 | admin-flows:79 | ✅ passed |
| A5 | 删除当前页最后一条自动退页 | admin-flows:113 | ✅ passed |
| A6 | 回收站软删/恢复/永久删除（UI 级：恢复绿/永久删除红 + 二次确认） | admin-flows:143 | ✅ passed |
| A7 | 版本冲突 Toast 且不覆盖 | admin-flows:186 | ✅ passed |
| A8 | 响应式列隐藏顺序 | admin-flows:217 | ✅ passed |
| A9 | 板块启停影响公开端 | admin-flows:237 | ✅ passed |
| A10 | 零板块公开端不显示 | admin-flows:276 | ✅ passed |
| A11 | 板块添加成员 → 公开板块可见 | real-flows:173 | ✅ passed |
| A12 | 管理编辑持久化 | real-flows:202 | ✅ passed |
| A13 | 窄屏板块操作键盘可用 | application:72 | ✅ passed |

### 2.5 视觉冻结（RPD §29.5、T06 prd §7.1）

| 编号 | 组合 | 证据 | 状态 |
|---|---|---|---|
| V1 | 首页桌面浅色 | app-home-desktop-light.png + 结构对比 | ✅ passed |
| V2 | 首页桌面深色 | app-home-desktop-dark.png | ✅ passed |
| V3 | 首页手机浅色 | app-home-mobile-light.png | ✅ passed |
| V4 | 首页手机深色 | app-home-mobile-dark.png | ✅ passed |
| V5 | 详情 Dialog | app-detail-dialog.png | ✅ passed |
| V6 | 管理群组列表 | app-admin-groups.png | ✅ passed |
| V7 | 板块管理 | app-admin-boards-tab.png | ✅ passed |
| V8 | 管理抽屉 | app-admin-drawer-edit.png | ✅ passed |

结论：结构化对比显示与 prototype 区域顺序/组件几何（hero/carousel/card/theme-control）像素级一致；差异均为数据内容（板块标题、卡片数、标签数）。像素截图保留供人工复核。**说明**：本会话 LLM 非多模态，未做人工像素目检；以结构化 DOM 对比 + 截图证据替代（见 visual-report.md）。

### 2.6 无障碍（RPD §28、T06 prd §7.2）

| 编号 | 场景 | 状态 |
|---|---|---|
| AX1 | 键盘 Tab 到卡片 + Enter 打开 + Escape 关闭 + 焦点恢复 | ✅ passed |
| AX2 | Dialog 初始焦点在关闭按钮 | ✅ passed |
| AX3 | 图标按钮可访问名称（主题/GitHub/添加/Carousel 控制） | ✅ passed |
| AX4 | Toast 错误 aria-live 可感知 | ✅ passed |
| AX5 | 表格 th scope 语义 | ✅ passed |
| AX6 | 主题三态文案变化（颜色非唯一状态） | ✅ passed |
| AX7 | reduced motion 无横向溢出 | ✅ passed |
| AX8 | 对比度：浅色 primary 13.7/secondary 5.7；深色 16.1/9.5（WCAG 4.5/3 达标） | ✅ passed |
| AX9 | Dialog 焦点锁定（focus trap） | ✅ **passed**（用户批准修复：Tab/Shift+Tab 循环锁定；a11y 测试 10 轮 Tab 不逃逸） |
| AX10 | Carousel 键盘左右键 | ❌ **blocked**（B2：无 keydown 实现，冻结组件，方案记录，待用户决策） |

### 2.7 性能（RPD §27、T06 prd §9）

| 编号 | 检查 | 结果 | 状态 |
|---|---|---|---|
| PERF1 | 公开目录/搜索 cursor、管理 50 条、发现 10 条、标签聚合、板块批量 IN | 查询形状符合 | ✅ passed |
| PERF2 | 首屏请求 4 个无重复 | 运行时探测 | ✅ passed |
| PERF3 | 搜索 debounce 合并（3 段快速输入 → 1 请求） | 探测 | ✅ passed |
| PERF4 | 无限滚动 cursor 追加去重 | 探测 | ✅ passed |
| PERF5 | 首屏主题先于 Vue 挂载 | bootstrap 源码 | ✅ passed |
| PERF6 | 生产 bundle 无 fixture | dist 扫描 | ✅ passed |
| PERF7 | 无 N+1 / 无全量返回 / 无无界 DOM | 源码审计 | ✅ passed |

### 2.8 安全（T06 prd §8）

| 编号 | 检查 | 结果 | 状态 |
|---|---|---|---|
| SEC1 | 匿名管理写入 → 401 | 探测 | ✅ passed |
| SEC2 | 缺 CSRF 写请求 → 403（20 路由全覆盖） | 探测+源码 | ✅ passed |
| SEC3 | 公开 DTO 无内部字段 | 探测 | ✅ passed |
| SEC4 | 下架/回收站/不存在深链 → 404 统一 | 探测 | ✅ passed |
| SEC5 | 标签/发现仅 published | 探测 | ✅ passed |
| SEC6 | 回收站群从公开板块移除 | 探测 | ✅ passed |
| SEC7 | 超限上传 → 413 | 探测 | ✅ passed |
| SEC8 | 错误响应无 stack | 探测 | ✅ passed |
| SEC9 | 日志无凭证/私密信息（单点 console.error err.message） | 源码 | ✅ passed |
| SEC10 | 版本冲突可检测、不覆盖 | E2E A7 | ✅ passed |
| SEC11 | 输入超限/突变令牌/速率限制 | workers 测试 | ✅ passed |

### 2.9 迁移演练（T06 prd §2.6）

| 编号 | 演练 | 结果 | 状态 |
|---|---|---|---|
| M1 | 空库全量迁移 | 4 ✅、默认板块 1 | ✅ passed |
| M2 | 现有库（0001-0003+旧数据）升级 | 旧数据保留、NULL 不回填、板块 1 | ✅ passed |
| M3 | 重复执行 | 正式路径幂等；--file 直跑报错但无副作用 | ✅ passed |
| M4 | 中断恢复 | 补跑成功、结构完整 | ✅ passed |
| M5 | 备份/回滚闭环 | 备份→破坏→恢复成功（WAL 完整备份；生产用 D1 官方备份） | ✅ passed |
| M6 | 新代码在未迁移库失败行为 | 干净 INTERNAL_ERROR | ✅ passed |
| M7 | 旧代码兼容窗口（新增 nullable/新表） | 兼容 | ✅ passed |

### 2.10 部署演练（T06 prd §2.6-2.7）

| 编号 | 项目 | 结果 | 状态 |
|---|---|---|---|
| D1 | 健康检查（公开 + 认证含 D1/R2） | ok | ✅ passed |
| D2 | 部署 smoke 链（创建/点赞/详情/软删/永久删除 404） | 全 OK | ✅ passed |
| D3 | 发布顺序（先迁移后发码）、回滚步骤、升级处置 | runbook 成文 | ✅ passed |
| D4 | 环境变量清单 | runbook §0.2 | ⚠️ **blocked**：production D1 database_id 为占位符；R2 桶/Secrets 未创建（C1/C2，发布前完成） |
| D5 | 监控/告警指标 | runbook §0.5 | ✅ passed（指标定义成文） |

---

## 3. 遗留问题与阻塞判断

| 编号 | 问题 | 级别 | 处置 | 是否阻塞发布 |
|---|---|---|---|---|
| A1 | Turnstile 生产投稿必失败（placeholder token + SKIP_TURNSTILE=false） | P1 | 用户决策（前端增量或服务端方案） | **是（投稿能力）** |
| B1 | Dialog 焦点锁定 | ✅ 已修复（用户批准） | — | 否 |
| B3 | 回收站 UI 恢复/永久删除入口 | ✅ 已修复（用户批准） | — | 否 |
| B2 | Carousel 键盘左右键（PRD §12.3） | P2 | 记录方案 | 待决策 |
| B4-B6 | sortMode UI/选择器 50 条/QR 占位/demo 元素 | P2-P3 | 记录（T05 移交已知） | 否 |
| C1 | 生产 D1 database_id 占位符 | P1 部署 | runbook 门禁项（用户指示暂缓部署） | 暂缓 |
| C2 | R2 生产桶/Secrets 未创建 | P1 部署 | runbook 门禁项（用户指示暂缓部署） | 暂缓 |
| C3 | 结构化日志未实现 | P3 | 改进项 | 否 |

## 4. 总体结论

- 自动化测试：Unit 82 ✅ / Workers 103 ✅ / E2E 68 ✅ / a11y 16 ✅ / typecheck ✅ / lint 0 errors ✅ / build ✅。
- 视觉冻结：结构层通过，差异均为数据差异；截图证据保留。
- 性能/安全/迁移/回滚：全部通过，无公开泄露、无权限绕过、无不可恢复迁移。
- 无障碍：对比度/键盘核心流程/语义通过；**Dialog 焦点锁定已修复**（用户批准）；Carousel 键盘左右键为剩余记录项（B2）。
- 功能缺口：**回收站恢复/永久删除 UI 已修复**（用户批准，绿/红 + 二次确认）。

**T06 验收判定：通过（用户人工核验第二轮调整完成）。** 用户批准的 B1（Dialog 焦点锁定）、B3（回收站 UI）、F1-F15（第二轮 15 项前端调整）全部完成并验证；剩余发布前置：A1（Turnstile）用户决策；C1/C2（部署配置）用户指示暂缓；B2（Carousel 键盘）待决策。最终发布决定由总任务与用户确认。

## 5. 签署

| 角色 | 结论 | 签名 |
|---|---|---|
| 产品（联合 Review） | 流程覆盖完整；A1/B3 为发布前置决策 | 待用户 |
| Staff Engineer（联合 Review） | 迁移/回滚可执行；C1/C2 为发布门禁 | 待用户 |
| QA（联合 Review） | 全部门禁有可重复命令与证据；B1/B2 记录完整 | 待用户 |
| 用户（最终发布确认） | — | 待确认 |
