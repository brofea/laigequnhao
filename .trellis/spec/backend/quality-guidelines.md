# Pages Functions 质量规范

## 必须通过的门禁

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:workers
pnpm build
```

同时遵循[测试策略](../guides/testing-strategy.md)。

提交必须遵循[项目 Git 提交规范](../guides/index.md#git-提交规范强制)：使用约定式提交、必填 scope、中文摘要与中文 body，并且只提交当前任务文件。

## 必须使用的模式

- Web Standard API 和显式 Cloudflare binding
- HTTP 边界使用 Zod 校验
- 参数化 D1 语句和中央行 mapper
- 分离公开投影和管理员投影
- 每个管理员路由都使用认证中间件
- 不安全的管理员方法使用同源/CSRF 保护
- 请求 ID 以及最终错误/日志中间件
- 幂等点赞命令和可重试的多资源操作
- 相互独立的预览环境 D1/R2 binding

## 安全 Review

- 响应、日志、客户端 bundle 或测试夹具中不得出现 Secret 或私有字段。
- 公开 serializer 使用白名单，禁止先展开对象再删除字段。
- 登录、提交、点赞和上传限制在服务端执行。
- 校验 URL 协议、WebP 签名、大小、尺寸和已配置枚举。
- 测试 Cookie 标记、过期、退出登录、篡改失败和 Origin 行为。
- D1 查询不得插入访客提供的值。
- 新增或修改的面向项目成员的文档以简体中文为主。

## 测试要求

- Repository 测试在隔离的本地 D1 中应用真实 migration。
- API 集成测试使用 D1/R2 binding 在 `workerd` 中运行。
- 契约测试覆盖每一种成功和错误信封。
- 测试覆盖四种状态、软删除、恢复、永久删除重试、重复点赞、过期版本、限流和依赖不可用。
- 排名和过期测试使用固定时钟。
- Workers 测试必须消费 R2/fetch 响应体。

## 禁止做法

- 使用仅限 Node 的 API；除非生产 compatibility flag 是有意设置、已有文档且经过测试
- 未更新架构决策就引入 ORM
- 使用使静态资源调用 Functions 的 catch-all 路由
- 全局可变请求状态
- 宽松 CORS
- 使用 `SELECT *` 生成响应
- 测试仅因 Workers Vitest pool 注入了生产环境中不存在的 Node compatibility 而通过
