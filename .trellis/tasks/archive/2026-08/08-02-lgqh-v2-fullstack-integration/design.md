# T05 全栈业务适配：技术设计规划

## 0. 设计原则

T05 不是前端重构任务，而是 adapter 和真实 API 接线任务。设计的第一原则是让现有冻结视图模型继续工作，第二原则是让真实后端错误和状态可被准确呈现，第三原则是消除生产 Mock。

任何“为了接 API 需要改组件”的结论，都必须先证明 adapter、Contract 或请求状态不能解决，并将其作为独立问题向用户提交；没有批准不得改表现。

## 1. 数据流

```text
用户操作 / 已冻结 Vue 组件
            │ 既有事件和视图模型
            ▼
composable / store / query state
            │ T05
            ▼
DTO adapter / error normalizer
            │ T05
            ▼
API client / request lifecycle
            │ T05
            ▼
真实 Hono API / T04 Contract
            │
            ▼
D1 / R2 / session
```

组件不直接理解数据库字段、HTTP 状态拼接或服务器私有错误。adapter 负责把服务端事实转换成现有 view-model；组件仍负责已有展示。

## 2. API client 设计

### 2.1 统一请求

统一请求层处理：

- base URL。
- JSON/header。
- cookie/session。
- CSRF header 或 token。
- request id。
- 超时。
- AbortSignal。
- 非 2xx 解析。
- 结构校验。
- 重试边界。

不对所有请求盲目重试。写请求、冲突、权限和校验失败不能自动重放；只对明确可安全重试的读请求考虑重试。

### 2.2 响应校验

客户端对关键响应使用共享 schema 或等价运行时校验。结构不符合 Contract 时进入可诊断错误，不把不完整 DTO 当作成功数据渲染，也不回退到假数据。

### 2.3 错误归一化

统一转换为：

```ts
type ClientError = {
  kind: 'validation' | 'unauthorized' | 'forbidden' | 'conflict' | 'not_found' | 'network' | 'server' | 'unknown'
  code?: string
  requestId?: string
  fieldErrors?: Record<string, string[]>
  retryable: boolean
}
```

具体类型以项目已有 Contract 为准；不要在各 composable 中复制不同的错误判断。

## 3. Query state 设计

每个读查询至少区分：

- idle。
- waiting/debounce。
- loading。
- refreshing。
- loading-more。
- success。
- empty。
- error。

查询状态只服务于既有表现状态。不得为了表示一个新状态而增加新的视觉组件、改变区域顺序或修改文案布局。

## 4. 竞态与取消

搜索、目录加载、板块加载和详情深链存在竞态风险。每次新 query：

1. 生成 request sequence 或 AbortController。
2. 取消可取消的旧请求。
3. 记录当前 query key。
4. 只接受仍匹配当前 key 的结果。
5. 旧错误不能覆盖新成功。
6. 组件卸载时取消请求。

点赞和保存等写请求需避免重复点击导致重复动作；以服务端 idempotency/冲突语义为准，不在客户端假装成功。

## 5. Adapter 设计

### 5.1 公开群组

适配：头像、标题、平台、摘要、点赞数量、点赞状态、公开详情、加群方式和 share id。后端敏感字段不进入公开 view-model。字段缺失时按 Contract 错误处理，不拼接猜测值。

### 5.2 板块

适配板块标题、启用状态、排序模式、成员数量、公开成员、空状态和局部错误。公开 adapter 不接收管理状态下的 deleted/trash 内容；服务端过滤是第一道防线，adapter 不作为唯一安全防线。

### 5.3 管理群组

适配固定 50 页码响应、totalItems、totalPages、page、筛选、排序、回收站和编辑字段。前端分页器使用服务端页码语义，不在客户端自行计算总页数。

### 5.4 管理板块

适配板块版本、成员位置、状态、冲突和操作结果。上移/下移/拖拽失败时把服务端返回结果传给既有回滚状态，不在 adapter 中篡改顺序。

## 6. 公开流程接线

### 6.1 首屏

首屏加载多个区域时采用并行读请求或 T04 聚合接口的既定方案。每个区域拥有自己的请求和错误结果；单板块失败不能让其他区域成功数据被删除。是否并行由 T04 Contract 与现有页面能力决定，不改变视觉。

### 6.2 搜索

搜索 query key 包含规范化 q 和 cursor。debounce 在 composing 结束后生效。清空 q 时取消搜索并恢复默认 query；旧搜索结果不覆盖默认首页。

### 6.3 详情与深链

初始化时解析 group 参数；若存在，调用真实详情接口。打开和关闭沿用 T03 既有历史行为；adapter 只提供详情数据和非敏感错误。详情成功后保留 q 等其他参数。

### 6.4 公开动作

点赞、分享、提交和复制使用已有控件和状态；T05 只连接请求、结果、错误和 Toast 状态。分享 URL 由当前域名和 group id 生成，不带 q。

## 7. 管理流程接线

### 7.1 会话

应用启动时读取既有 session 状态；需要验证时调用真实 session endpoint。401 只进入既有登录/会话失效路径，不在客户端伪造 admin=true。

### 7.2 群组列表

URL query → 参数 schema → API request → page response → 既有 table view-model。筛选、排序和搜索改变时重置 page=1；删除最后一项时由服务端/adapter 判断是否退页，保持既有分页器行为。

### 7.3 编辑与上传

草稿保存在现有表单状态中，不能以 localStorage 取代服务端。保存时发送 schema 合法 payload；上传成功只在服务端确认后更新视图；失败保留可恢复的既有表单状态。

### 7.4 板块

板块列表、排序、成员操作全部使用 T04 API。乐观更新只有在 T03 已有状态可承载时才允许；否则使用真实响应后更新。失败时恢复服务端顺序，不自行生成新提示布局。

## 8. Mock 清理设计

建立引用矩阵：

| 来源 | 生产可用 | 测试可用 | 处理 |
| --- | --- | --- | --- |
| `prototype/data` | 否 | 仅 prototype 测试 | 从正式入口移除 |
| `src/data/fixtures` | 否 | 可注入 | 与生产模块隔离 |
| API mock server | 否 | 是 | 仅测试配置启用 |
| localStorage 主题 | 是 | 是 | 非业务真相 |
| localStorage 业务数据 | 否 | 否 | 删除/阻止 |

构建后可通过静态扫描、运行时断言或打包入口检查证明生产 bundle 不加载 fixture。

## 9. 视觉冻结验证

T05 每个业务接线阶段都记录：

- 变更前截图。
- prototype v2 基线截图。
- 真实数据截图。
- 视口、主题、浏览器、时间和数据种子。
- DOM/CSS 是否变化。
- 是否只是文本/数据变化。

允许真实数据改变内容，不允许改变产品规定的布局、颜色、间距、组件状态结构和交互流程。内容长度导致的自然折行若与 prototype 夹具不同，应优先固定测试数据或记录内容规则问题，不通过改 CSS 解决。

## 10. 测试设计

### 10.1 Adapter 单元

- 正常 DTO。
- null/空数组。
- 旧 cursor/新 cursor。
- 公开过滤响应。
- 管理分页。
- field errors。
- conflict。
- unauthorized/forbidden。
- network/timeout。
- malformed DTO。

### 10.2 Composable

- 初始加载。
- debounce。
- IME composing。
- 取消旧请求。
- loading-more。
- 空结果。
- 局部错误。
- 重试。
- URL restore。
- 前进后退。
- 会话失效。

### 10.3 E2E

公开：默认首页、搜索、标签、板块、目录、详情、深链、分享、点赞、提交、空/错/重试。

管理：登录、分页、筛选、排序、编辑、上传、回收站、删除、板块 CRUD、成员操作、冲突和会话失效。

## 11. 性能设计

- 首屏请求不重复。
- 搜索 debounce 有固定时间。
- 列表分页不全量加载。
- 无限滚动只在有 cursor 时继续。
- 图片加载沿用固定比例和懒加载表现。
- 取消不可见请求。
- 大板块不产生逐成员串行请求。
- 管理页码不额外下载全部总量数据。

## 12. 安全设计

- 不在 client bundle 固化管理凭证。
- 不把私有 group DTO 写进公开状态。
- 不用前端权限判断替代服务端授权。
- 写请求复用 CSRF。
- 不自动重试不可幂等写请求。
- 统一错误不暴露内部栈。
- 会话失效清理敏感客户端状态。
- 上传资源只显示服务端确认 URL。

## 13. T04/T06 接口

### 给 T04 的反馈

发现字段缺失、错误 code 不稳定、分页不一致或公开过滤不足时，提交具体 endpoint、request、response、现有视图需求和风险；不直接改 T04 逻辑或前端设计。

### 给 T06 的移交

提交真实 API 使用矩阵、Mock 扫描结果、E2E 结果、视觉对照、构建产物、环境变量、已知问题和回滚建议。

## 14. 设计验收

- [ ] 所有改动位置属于 adapter、client、composable、store、测试或配置。
- [ ] 页面、组件、样式和交互被明确冻结。
- [ ] 生产 Mock 与测试 Mock 有隔离证据。
- [ ] 错误按稳定 code 映射。
- [ ] 竞态、取消和重试有明确规则。
- [ ] 公开/管理 DTO 有边界。
- [ ] 视觉基线有可重复截图。
- [ ] T04 和 T06 的移交条件明确。
