# T06 缺陷与冻结问题记录（阶段十三前置汇总）

状态：`记录` = 只记录不改（冻结/前端）；`回派` = 转交其他任务；`T06` = 本任务处理。

## A. 发布阻塞候选

| # | 缺陷 | 证据 | 处置 | 阻塞 |
|---|---|---|---|---|
| A1 | **Turnstile 生产阻塞**：公开投稿 `turnstileToken: "placeholder"` 固定值；production env `SKIP_TURNSTILE=false`，生产投稿必然失败 | T05 移交 §7-1；wrangler.jsonc env.production.vars；dist 扫描确认 placeholder 进入 bundle | 用户决策（前端表现增量/服务端替代） | 高 |

## B. 前端冻结问题（已获用户批准修复）

| # | 缺陷 | 状态 |
|---|---|---|
| B1 | **Dialog 无焦点锁定（focus trap）** | ✅ **已修复**（用户批准）：Dialog.vue 增加 Tab/Shift+Tab 循环锁定 + 焦点拉回；a11y E2E 恢复锁定断言（10 轮 Tab 不逃逸） |
| B2 | **Carousel 无键盘左右键**：PRD §12.3 要求键盘左右方向键操作，Carousel.vue 无 keydown 处理 | ⏳ 待决策（P2，未批准，仅记录方案） |
| B3 | **管理端回收站 UI 无"恢复/永久删除"入口** | ✅ **已修复**（用户批准）：AdminTable 回收站模式行操作显示「恢复」（success 绿）与「永久删除」（danger 红，二次确认"确认永久删除/取消"）；窄屏下回收站操作不被隐藏；VisualShell 接线 adminDirectory.restore/purge；E2E 升级为 UI 级验证（桌面+手机通过） |
| B4 | sortMode 无管理 UI（T05 移交 §7-2） | 记录（待决策） |
| B5 | 板块添加群组选择器候选池仅前 50 条（T05 §7-4） | 记录（待决策） |
| B6 | QR 加群方式旧数据占位文案、demo 占位元素保留（T05 §7-3/7） | 记录（待决策） |

## C. 回派 T04 / T05

| # | 缺陷 | 证据 | 回派 | 阻塞 |
|---|---|---|---|---|
| C1 | 生产 D1 `database_id` 为占位符 `"production"`（wrangler.jsonc env.production），发布前必须替换真实 ID | wrangler.jsonc:65 | 部署配置（T06 runbook 已记录，发布门禁） | 高（发布前修复） |
| C2 | R2 生产桶/Secrets 未创建（R2_PUBLIC_BASE_URL 等需 wrangler secret put） | runbook §0.2 | 部署配置 | 高（发布前完成） |
| C3 | 结构化日志事件（request.completed 等）未实现（logging-guidelines spec 目标），当前仅 error-handler 单点 console.error | security-report §4 | 记录为改进项（非阻塞） | 无 |

## D. T06 已处理（测试基础设施 + 用户批准前端调整）

### 测试基础设施
- 补齐 Playwright：新增 `tests/e2e/public-flows.spec.ts`、`admin-flows.spec.ts`、`a11y-flows.spec.ts`，E2E 总数 20 → 68（desktop+mobile）。
- 结构化视觉对照（`structure-compare.json`）与 a11y 对比度数据。

### 用户人工核验后批准的前端调整（第二轮）
| # | 修改 | 文件 |
|---|---|---|
| F1 | 删除主页 sample-state-bar（含 previewState 演示逻辑），搜索/列表改真实 API 状态 | VisualShell.vue、index.css |
| F2 | **点赞数显示 bug**：seed 脚本 `like_count` 为随机值但 likes 表行数不同 → 点赞时后端 COUNT 覆盖显示跳变。修复 seed-local.mjs（行数=count）并就地修复 seed-local.sql（140 组全对齐） | seed-local.mjs、seed-local.sql |
| F3 | 点赞 toast 文案改"已点赞" | VisualShell.vue |
| F4 | 加群方式展示顺序固定：群号→邀请链接→二维码（adapter 排序，与存储解耦） | adapters.ts |
| F5 | 详情 Dialog 二维码文案"扫描下方二维码"，渲染真实图片 | VisualShell.vue |
| F6 | 详情 Dialog 二维码"保存"按钮：网页端触发下载，iOS 端引导长按保存（系统弹"存储图像"多选框） | VisualShell.vue、Icon.vue |
| F7 | 删除"字段与 v1 抽屉一致"字样 | AdminEditForm.vue |
| F8 | 上传提示改"最大上传 5MB 图片，支持多种格式"（与 LOGO/QR 5MB 原始限制一致）；**提交限流 bug 修复**：PRD 为"单 IP/设备每小时成功提交新群组 1 次"，原实现每小时 5 次 | AdminEditForm.vue、submission-service.ts、api-guidelines.md |
| F9 | 添加新群 Dialog 增加"私密联系方式"（提交者填写，仅管理可见），不显示审核备注；contact 接入提交 API | AdminEditForm.vue、fixtures.ts、VisualShell.vue |
| F10 | 每种加群方式最多添加一个（同类型去重） | AdminEditForm.vue |
| F11 | admin/login 排版：登录卡片限宽 420px 居中（原无样式） | index.css |
| F12 | 管理页点赞数核对：与主页同源（likeCount），seed 修复后一致 | — |
| F13 | 永久删除改为独立小尺寸确认 Dialog（purge-confirm-dialog），去掉行内取消按钮 | AdminTable.vue、VisualShell.vue、index.css |
| F14 | **板块页编辑群组后表格不更新 bug**：板块成员标题来自服务端快照，保存后未刷新 → 修复为保存成功后 reload 板块与候选池 | VisualShell.vue |
| F15 | admin 顶栏去掉"添加新群"按钮（仅公开端保留） | VisualShell.vue |

## E. 已知风险（记录）

- E1：migration 无降级脚本（T04 移交 §6），回滚依赖 D1 备份补偿（阶段十一演练）。
- E2：E2E 共享 .e2e-state 数据库，跨测试文件可能污染（已通过唯一标题 + 现场恢复缓解）。
