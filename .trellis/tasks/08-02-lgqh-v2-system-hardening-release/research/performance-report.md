# T06 性能检查报告（阶段九）

- 日期：2026-08-02
- 方法：源码查询形状审计 + 运行时请求探测（本地 workerd + vite，真实 API）
- 环境：Node v25.9.0 / Chromium 1280x800 / Asia/Shanghai

## 1. 服务端查询形状（源码审计）

| 检查项 | 结论 | 证据 |
|---|---|---|
| 公开目录/搜索 cursor 分页 | ✅ LIMIT 50 + cursor，无全量返回 | group-repository.ts:598 `LIMIT ? OFFSET ?`；目录用 cursor `listPublicCursor`（轮换内存循环，批量 loadRelated） |
| 发现新群最多 10 条 | ✅ `LIMIT ?` bind(limit=10) | group-repository.ts:364-372 |
| 标签单次聚合 | ✅ 一次 `GROUP BY` 聚合，JOIN groups 过滤 published | tag-repository.ts:10-15 |
| 板块成员无 N+1 | ✅ `listMembersByBoards` 批量 `IN (...)` 一次取回 | board-repository.ts:194-209 |
| 管理列表固定 50 条 | ✅ pageSize=50，`LIMIT ? OFFSET ?`，totalItems/totalPages | group-repository.ts:564-598 |
| 关联数据批量加载 | ✅ loadRelated 用 `IN (...)` 三表并行（tags/methods/details） | group-repository.ts:122-165 |
| hourly_random 不写库 | ✅ 纯函数 stableShuffle（FNV-1a + mulberry32），无 DB 写 | board-sort-service.ts:30-79 |
| 小时槽位站点时区 | ✅ `Intl.DateTimeFormat` timeZone 参数，非服务器本地时区 | board-sort-service.ts:14-28 |

## 2. 客户端运行时探测

| 检查项 | 结果 | 结论 |
|---|---|---|
| 首屏 API 请求数 | 4 个（groups?limit=50 / discover / tags / boards），无重复 | ✅ |
| 搜索 debounce（快速连续输入） | "性能群" 3 段快速输入仅触发 **1 个**请求 | ✅ debounce 300ms 合并有效 |
| 搜索请求取消/竞态 | useGroupDirectory.load 先 `controller.abort()` 再发新请求；watch q 驱动 | ✅ |
| 无限滚动 cursor | 滚动后追加 1 次 cursor 请求（`?cursor=...&limit=50`），无重复 URL | ✅ 追加去重 |
| 图片懒加载 | GroupCard 用 CSS 头像（avatarState 渲染），无 img 标签 → 无布局跳动问题 | ✅ |
| 首屏主题 | theme/bootstrap 在 main.ts 挂载前执行（模块导入即应用），html data-theme 先于 Vue 渲染 | ✅ |
| 大板块表格 | BoardManagement 固定高度成员表内部滚动（board-members 容器） | ✅ |
| 生产 bundle 无 fixture | dist 扫描：demoBoards/demoTags/demoGroups/设计师交换站 均 0 命中；"示例大学" 为 site.config 默认值（部署时替换），非 fixture | ✅ |

## 3. 观察记录

- 快速输入 3 段（每 80ms）触发 1 个搜索请求；慢速输入（每 >300ms）逐字触发属于预期（debounce 窗口已过）。
- 无限滚动在 60+ 群数据集上：初始 50 卡片 → 滚动后 76（60 seed + 既有数据），第二次 cursor 请求正常。

## 4. 结论

性能验收标准（PRD §27、T06 prd §9）全部满足，无全量返回、无 N+1、无重复请求、无无界 DOM。未发现需要回派或阻塞的问题。
