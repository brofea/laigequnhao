# 视觉样例

这是独立的 Vue + Vite 视觉原型，仅使用固定夹具和本地状态，不连接后端。

## 启动

在仓库根目录执行：

```bash
pnpm exec vite --config prototype/vite.config.ts
```

浏览器访问 <http://127.0.0.1:4174>。原型使用独立 Vite root 和 `prototype/` 入口，不注册正式 Router，也不被根目录生产构建引用。

## 验证

```bash
pnpm exec vue-tsc --noEmit -p prototype/tsconfig.json
pnpm exec vitest run --config prototype/vitest.config.ts
pnpm exec playwright test --config prototype/playwright.config.ts
pnpm exec vite build --config prototype/vite.config.ts
```

页面品牌标题为“找一个值得加入的群”，首页 Hero 大标题最大 48px。顶部“添加新群”打开复用完整编辑结构的公开提交 Dialog（只读待审核状态、允许头像和二维码图片上传，提交按钮为“提交群组”）；管理工作台的“添加新群”打开独立的完整管理编辑 Dialog。板块管理还提供复用编辑字段的“新增板块” Dialog，以及仅在输入非空搜索词后显示迷你头像和群名的“板块内添加新群” Dialog。所有原型交互只修改当前页面内存，不会请求真实 API；正式上传契约为单个 IP/设备每小时最多成功一次。管理端包含群组、板块和固定 Mock 的运行数据页，设计系统包含详情/Dialog、表格、自定义 Neumorphism 下拉和状态样例。主题按钮按 system/light/dark 循环，删除 `prototype/` 不会改变正式 `src/`、`shared/`、`functions/` 或正式测试入口。
