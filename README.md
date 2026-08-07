<div align="center">
    <img src="https://upload.wikimedia.org/wikipedia/zh/2/2f/HBUT_logo.svg">
    <h1>HBUTQQ.SITE</h1>
    <p>为湖工学子们提供群聊发现导航网站。</p>
    <p>一个群号，连接彼此。</p>
    <p>
        <a href="https://www.gnu.org/licenses/gpl-3.0.en.html">
            <img src="https://img.shields.io/badge/license-GPL--3.0-orange" />
        </a>
        <a href="https://github.com/brofea/laigequnhao/releases">
            <img src="https://img.shields.io/github/v/tag/brofea/laigequnhao" alt="Newest Tag">
        </a>
        <a href="https://github.com/brofea">
            <img src="https://img.shields.io/badge/brofea-brofea?label=GitHub&logo=github&color=purple" alt="GitHub Profile">
        </a>
    </p>
    <p>本网站基于开源项目 <a href="https://github.com/brofea/laigequnhao">来个群号</a>，一个致力于为社区新老成员发现新群，拓展社交圈的网站</p>
    <p>支持多种平台的群号、链接、二维码多种加群加群方式，人人可分享自己的群聊</p>
</div>



<div align="center">
    <img width="1000" alt="image" src="https://github.com/user-attachments/assets/af8bd3ed-0a2b-4485-b20e-c04c33e3f1c3" />
    <img width="1000" alt="image" src="https://github.com/user-attachments/assets/1a559b41-1e16-43a5-acec-9664ba561a8a" />
</div>

## 设计语言

项目以 [HeroUI v3](https://heroui.com/) 的组件设计为基础，结合 [Neumorphism 新拟物主义](https://zh.wikipedia.org/wiki/%E6%96%B0%E6%93%AC%E7%89%A9%E8%A8%AD%E8%A8%88) 进行 Vue 化改造

强调柔和阴影、清晰层级、圆润边界与克制的动效，保持现代感的同时兼顾可读性、操作反馈和深浅色切换下的一致体验

## 项目结构

```
├── src/                    # Vue 前端应用
│   ├── app/                # App.vue, main.ts, router.ts
│   ├── features/           # 功能模块
│   │   ├── admin/          # 管理端 (认证/群聊管理/仪表盘/图片上传)
│   │   └── groups/         # 公开端 (首页/卡片/搜索/提交/点赞)
│   ├── shared/             # 前端共享 (API client/storage/组件)
│   └── views/              # 路由视图
├── worker/                 # Cloudflare Workers Module Worker 根入口
│   └── index.ts            # Hono fetch handler
├── functions/_lib/         # 复用的 Hono 应用 + routes/repositories/services/adapters
├── shared/                 # 前后端共享 (Zod 契约 + 领域类型)
├── migrations/             # D1 数据库迁移
├── tests/
│   ├── workers/            # Workers Vitest 集成测试
│   └── e2e/                # Playwright E2E 测试
├── site.config.ts          # 机构配置 (主题/平台/功能开关)
├── wrangler.jsonc          # Cloudflare Wrangler / Vite Plugin 输入配置
└── .dev.vars.example       # 本地 secrets 模板
```

## 更多信息

请访问源项目 [来个群号](https://github.com/brofea/laigequnhao) 以提交 Issue 或 PR，我们欢迎各种形式的贡献！
