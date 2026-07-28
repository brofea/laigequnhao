# public-mvp PRD

## 目标

实现公开首页 MVP：群聊卡片、游标分页、搜索、复制群号、确定性轮换、匿名点赞、纯文本提交。访客无需登录即可浏览和提交。

## 范围

### D1 数据库
- `migrations/0001_initial.sql`：`groups`、`group_tags`、`join_methods`、`submission_details`、`likes`、`rate_limits` 六张表
- UUID TEXT 主键；`groups` 含 `rotation_key`、`like_count`、`version`、`status`、`deleted_at`、`purge_state`

### API 路由
- `GET /api/v1/groups`：游标分页 + 搜索 + 轮换排序 + `PublicGroupDto`
- `POST /api/v1/submissions`：Zod 校验 + Turnstile + 频率限制 → `pending`
- `PUT/DELETE /api/v1/groups/:id/like`：幂等 + X-Device-Id + pepper hash + 原子计数
- `GET /api/v1/health`：补充 D1 连通检测

### 轮换算法
- 配置 IANA 时区 + 固定纪元 → `rotationOrdinal` → `rotation_key, id` 排序 → 循环位移

### 前端
- `GroupCard.vue`：Logo/标题/平台/性质/标签/状态/点赞/加群按钮
- `SubmissionDialog.vue`：纯文本表单 + 校验
- `useGroupDirectory`：游标分页 + URL 搜索词 + AbortController
- `useLikedGroups`：localStorage 匿名 ID + 乐观更新 + 回滚
- `useClipboard`：复制 + 反馈
- `src/shared/api/client.ts`：fetch 封装 + Zod 解析

## 不在范围
- 管理员认证/审核/编辑/删除/仪表盘
- 图片上传/R2、深色模式、响应式精修、二维码公开展示

## 验收标准（13 条）
- `AC-01`：首页加载已发布/已下架群聊，按轮换顺序展示
- `AC-02`：卡片展示全部公开字段 + 加群按钮
- `AC-03`：游标分页正常
- `AC-04`：搜索过滤标题/标签，保持轮换顺序
- `AC-05`：清空搜索恢复完整序列
- `AC-06`：复制群号成功/失败有反馈
- `AC-07`：点赞切换正确，刷新后状态一致
- `AC-08`：有效提交写入 D1 `pending`
- `AC-09`：无效提交返回校验错误
- `AC-10`：公开 API 不泄露私有字段
- `AC-11`：同一窗口顺序确定，下一窗口位移
- `AC-12`：lint/typecheck/test 通过
- `AC-13`：Workers Vitest 集成测试覆盖核心流程
