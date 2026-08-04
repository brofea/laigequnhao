# 结构化日志

## 格式

通过封装 `console.debug/info/warn/error` 的小型项目 logger，每个事件输出一个 JSON 对象。请求完成事件的必填字段：

```json
{
  "level": "info",
  "event": "request.completed",
  "requestId": "uuid",
  "method": "GET",
  "route": "/api/v1/groups",
  "status": 200,
  "durationMs": 12,
  "outcome": "success"
}
```

使用事件名而不是自然语言正文，以便聚合。记录实际路由模板，不记录访客提供的完整 URL。

## 级别

- `debug`：本地/预览环境诊断细节；生产环境禁用或采样
- `info`：请求完成、登录成功、审核完成和永久删除完成
- `warn`：滥用校验、限流、过期编辑、依赖降级、可重试的部分清理
- `error`：未预期异常或关键操作重试耗尽

预期内的 4xx 结果不自动视为错误。

## 上下文

相关时加入安全标识符：群聊 ID、资源 ID、操作 ID、错误码、依赖、重试次数、构建版本和部署环境。禁止把完整群聊提交或请求体放入日志上下文。

## 脱敏

绝不记录密码、密码 hash、会话/CSRF Cookie、Authorization header、Secret、Analytics token、原始设备 ID、投票者 hash、原始 IP、提交者联系方式、包含访客数据的完整 URL 或图片字节。

Logger 负责中央 denylist/redactor。调用方仍必须只传入最少上下文，不能把脱敏功能当成任意记录数据的许可。

## 错误日志

最终错误中间件只记录一次错误。下层可以给错误附加上下文，但不得重复记录同一堆栈。生产日志使用安全的错误名称、错误码、依赖和请求 ID；堆栈仅限受控开发输出。
