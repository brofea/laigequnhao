# Vue Composable 规范

## 目的

Composable 负责可复用的有状态行为。它们不渲染 UI，也不得把互不相关的职责隐藏在单一的 `useApp()` 抽象后。

## 形态

- 文件和导出函数按 `useThing` 命名。
- 接收有类型约束的 options；测试需要控制依赖时接收注入的适配器。
- 返回 `readonly()` 状态和显式命令。
- 在生命周期钩子中清理监听器、定时器、对象 URL 和进行中的请求。
- 派生值放在 `computed` 中；computed getter 内禁止执行副作用。

## 数据请求

所有请求都通过 `src/shared/api/client.ts` 发出。功能 composable 负责加载/错误状态和 `AbortController` 取消逻辑。搜索或路由变化后，必须忽略过期响应。

每一份服务端状态缓存只能有一个负责方。MVP 不使用 Pinia，也不使用第二套请求缓存。管理员变更后默认重新请求；只有小型且经过测试的乐观更新明显更清晰时才例外。

## 浏览器适配器

剪贴板、本地存储、主题媒体查询、图片 canvas 转换和对象 URL 清理应放在聚焦单一职责的 composable 或 `src/shared/browser/` 中。持久化 JSON 先按 `unknown` 解析；无效数据必须安全重置。

`useLikedGroups` 负责本地匿名设备 ID 和已点赞 ID 集合，但不计算全局点赞数。`useImageProcessor` 绝不上传源文件；它只返回最终 WebP blob 和已验证的元数据。

## 错误行为

对外暴露有类型约束、可安全展示给用户的错误或状态，不暴露原始异常。保留 `requestId`，使支持人员和日志可以关联同一次失败。

## 禁止做法

- 有条件地调用 composable
- 使用 watcher 重复一份 computed 值
- 多个 composable 写入同一个本地存储 key
- 自动重试校验、认证或限流错误
- 在前端 composable 中导入 Cloudflare 或 D1 类型
