# T05 → T06 移交包（2026-08-02）

## 1. 真实 API 接线矩阵

### 公开端

| 区域 | 真实来源 | 适配输出 | 状态 |
|---|---|---|---|
| 发现新群 | `GET /discover` | `useDiscover` → Carousel items | ✅ |
| 标签聚合 | `GET /tags` | `useTags` → tag-card counts | ✅ |
| 公开板块 | `GET /boards` | `usePublicBoards` → DemoBoard 视图 | ✅ |
| 目录/搜索 | `GET /groups?q=&cursor=` | `useGroupDirectory`（既有） | ✅ |
| 详情深链 | `GET /groups/:id` | `useGroupDetail`（`?group=` 驱动） | ✅ |
| 分享 | 浏览器剪贴板 + `origin/?group=` | `shareGroup` | ✅ |
| 点赞 | `PUT/DELETE /groups/:id/like` | `useLikedGroups`（既有） | ✅ |
| 提交 | `POST /submissions` | 既有 + 本地 `SKIP_TURNSTILE` 旁路 | ⚠️ Turnstile 缺口 |

### 管理端

| 区域 | 真实来源 | 适配 | 状态 |
|---|---|---|---|
| 登录/会话/退出 | `POST/GET/DELETE /admin/session` | `useAdminAuth`（既有） | ✅ |
| 群组列表 | `GET /admin?page=&status=&q=&sortBy=&sortDir=` | `useAdminGroups`（页码 50 + URL 状态） | ✅ |
| 新建/编辑 | `POST/PATCH /admin` | `toAdminPayload` + version | ✅ |
| 软删/恢复/永久删 | `DELETE /admin/:id`、`POST restore`、`DELETE trash/groups/:id` | composable | ✅ |
| 图片/QR 上传 | `POST /admin/assets` | AdminEditForm 真实上传（管理模式） | ✅ |
| 板块 CRUD/排序/成员 | `/admin/boards*` 全套 | `useAdminBoards` | ✅ |
| 板块删除/成员上下移/移除 | 同上 | BoardManagement emit 接线 | ✅ |
| 运行数据 | `/admin/health`、`/admin/dashboard`、analytics | `useDashboard`（既有） | ✅ |

## 2. Mock 清理证据

- `src/data/fixtures.ts` 的 `demoBoards`/`demoTags`/`demoGroups` 已从生产引用移除（仅保留 DemoGroup/DemoBoard **类型**与状态标签映射 `groupStatusLabels/groupStatusTones`，供冻结组件使用）。
- 构建产物扫描：`grep -rl "设计师交换站|demoBoards|demoTags|demoGroups" dist/assets/` → **无结果**（tree-shaking 移除）。
- 生产路径无 `prototype/` 引用、无业务 localStorage（仅 theme/deviceId/likedIds 客户端偏好）。
- API 失败无假数据 fallback：所有区域请求失败进入对应错误状态，不回退 fixture。

## 3. 错误/状态映射（按稳定 code）

| 服务端 code | 客户端 kind | 表现 |
|---|---|---|
| VALIDATION/PAYLOAD/UNSUPPORTED | validation | 表单/Toast 字段错误 |
| AUTH_REQUIRED/AUTH_FAILED | unauthorized | 登录/会话失效路径 |
| FORBIDDEN | forbidden | 权限错误 Toast，不伪造成功 |
| VERSION/STATE_CONFLICT | conflict | 冲突提示 + 服务端顺序恢复 |
| NOT_FOUND | not_found | 深链非敏感错误 + 清理 group 参数 |
| RATE_LIMITED | network(可重试) | 通用错误 Toast |
| INTERNAL/DEPENDENCY | server(可重试) | 通用错误 Toast |
| 网络/超时/非 JSON/malformed DTO | network | 可重试错误 |

`toClientError` 为唯一归一化入口（`src/shared/api/client.ts`），composable 不复制错误判断。

## 4. 竞态与取消

- 搜索/目录/发现/标签/板块/详情/管理列表均使用 AbortController；卸载取消。
- 管理列表 URL 自写不重触发（syncedKey 守卫）；前进/后退恢复。
- 搜索清空恢复默认首页；旧响应不覆盖新查询（abort + key 守卫）。

## 5. 本地运行说明

```bash
npm run db:migrate:local        # 应用 0004（本地 lgqh-dev）
npm run pages:dev:local         # wrangler :8788（.dev.vars ADMIN_PASSWORD=123456）
npm run dev                     # vite :5173
```
E2E：`npm run test:e2e`（自动起独立服务 + `.e2e-state` 干净库；`tests/e2e/.dev.vars` 密码 `test-admin-password`，LOGIN_MAX_ATTEMPTS 已调 100 供测试）。

## 6. 测试结果（2026-08-02）

```
npm test           → 7 files / 82 passed（含新增 client 错误归一化 9 例）
npm run test:workers → 11 files / 103 passed
npm run test:e2e   → 20 passed（桌面+手机；含新增真实数据 flows 5 例 ×2）
npm run typecheck / lint / build / format → 通过（0 errors；format 仅 6 个既有文件警告）
```

## 7. 已知缺口（移交 T06 / 需用户决策）

1. **Turnstile（生产阻塞）**：公开投稿仍发送 `turnstileToken: "placeholder"`；仅本地 `SKIP_TURNSTILE=true` 可用。生产环境投稿必然失败。需要后续集成 Turnstile widget（表现层增量）或服务端替代方案。
2. **sortMode 无法在管理 UI 修改**：冻结的 `BoardEditForm` 无排序模式控件；T04 API 支持，需 UI 增量或接受默认 `manual_asc`。
3. **QR 加群方式管理**：冻结 UI 的 QR 上传已接真实 asset API，但旧数据/占位文案（"二维码占位区域"）仍显示；编辑弹窗内的"已模拟移除头像"已替换为真实移除。
4. **板块添加群组选择器**：冻结的 `BoardAddGroupForm` 仅客户端搜索，候选池为管理列表前 50 条（published+delisted）；超过 50 条时服务端搜索选择器缺失。
5. **管理列表 loading 状态**：冻结模板无管理端加载骨架；请求期间表格保持旧数据（无假 loading UI，未新增）。
6. **板块描述字段**：后端无 description（RPD 24.2），编辑保存仅提交标题/启停。
7. **demo 占位元素保留**：sample-state-bar、"仅视觉样例"徽章、QR 占位、演示分页文案属 T03 冻结基线，未删除；其中分页器已接真实页码。

## 8. 视觉冻结记录

- 仅 3 个 `.vue` 文件改动（用户批准的最小接线）：`VisualShell`（数据绑定/处理器/分页数值）、`BoardManagement`（3 个新 emit）、`AdminEditForm`（上传处理器）。
- 无 CSS/Tailwind/class/布局/Dialog 结构/交互顺序变化；无新增视觉组件。
- prototype/ 零修改。
