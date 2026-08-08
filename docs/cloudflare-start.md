# 快速部署在 Cloudflare

本文是 [README](README.md) 中部署 Cloudflare 教程的图文保姆级教程，致力于让任何人在 30 分钟内免费搭建网站

搭建网站首先需要：

- Cloudflare 账号
- GitHub 账号
- 若要使用 Cloudflare R2 保存图片，还需要在 Cloudflare 绑定 VISA、MasterCard、PayPal、GooglePay 等其中一种支付方式（不会产生费用）

## 1. 四步上线属于你的网站

### 1.1. 在 GitHub 页面 Fork 本仓库

<img width="500" alt="image" src="https://github.com/user-attachments/assets/04bb6ec5-2c0c-4bd4-9ab1-aa4140d26097" />
<img width="690" alt="image" src="https://github.com/user-attachments/assets/3216b45c-0f6f-4cf2-ae77-21ada499d72e" />

### 1.2. 访问 [dash.cloudflare.com](https://dash.cloudflare.com/) 创建 Worker

<img width="580" alt="image" src="https://github.com/user-attachments/assets/ddf0e894-582e-41a7-85e6-29ef7a61ca3c" />

点击右上角蓝色 “Create Application” 按钮，

<img width="432" alt="image" src="https://github.com/user-attachments/assets/303e93ec-52e7-448f-bed2-314aa601076e" />

选择 “Continue with GitHub”，登陆 GitHub 后选择刚刚 Fork 的仓库

<img width="608" alt="image" src="https://github.com/user-attachments/assets/38cb9cfa-fa0b-4140-a19a-6b4f9e18095d" />

### 1.3. 填写 Worker 配置并部署

<img width="610" alt="image" src="https://github.com/user-attachments/assets/dec3c10a-9e2d-413c-ac83-85ff79667698" />

Build command 填写：

```bash
pnpm build
```

Deploy command 填写：

```bash
pnpm deploy
```

完成后点击右下角蓝色 “Deploy” 按钮，Workers 会自动开始构建

### 1.4 启用 URL

等待约两分钟构建完成后，在 Domains 选项卡中开启 URL，即可访问网站

<img width="1073"  alt="image" src="https://github.com/user-attachments/assets/ac7b22af-1535-49af-8504-53f262d757fd" />

此时网站首页可访问，但点赞与管理功能尚未启用。请继续阅读下一节配置

## 2. 配置密码与密钥

### 2.1. 启用 Cloudflare R2

在 [dash.cloudflare.com](https://dash.cloudflare.com/) 搜索 R2 并启用改功能，需要绑定支付方式（R2 有免费额度，不会产生费用），中国大陆银行发行的 VISA 或 MasterCard 也可以用于绑定

⚠️ 所有密码和密钥在填入后无法查看，请务必保存好原值

### 2.2. 使用 [1Password 随机密码生成器](https://1password.com/zh-cn/password-generator) 生成两串至少 32 位的随机字符串，记下来

<img width="546" alt="image" src="https://github.com/user-attachments/assets/e26f6666-3cc4-4ab3-a4b3-5d52077fad57" />

### 2.3. 回到 Workers & Pages 详情页，找到 **Settings → Variables and Secrets**

<img width="838" alt="image" src="https://github.com/user-attachments/assets/5d446882-405b-4b6e-b60e-68f3a9f39025" />

此处添加三个 Type 为 `Secret` 的变量，Variable name 和 Value 如下：

- `ADMIN_PASSWORD`：你自己定的管理端登录密码
- `SESSION_SECRET`：刚刚生成的随机生成字符串
- `LIKE_PEPPER`：刚刚生成的随机生成字符串

<img width="436" alt="image" src="https://github.com/user-attachments/assets/b73c1ea7-0fae-413a-a675-caaa670c53a0" />

完成后点击右下角 “Deploy” 按钮

### 2.4. 验证密钥密码配置成功

访问你的网站，在主页提交一个新群

在网址后加上 `/admin` 访问管理员页面

<img width="1026" alt="image" src="https://github.com/user-attachments/assets/74ba242d-b40a-418e-a97f-22883e44bb0a" />

配置成功的标准：

- 能够正常登录管理员页面
- 主页添加一个新群管理页面可以看到
- 管理页面将群状态改为已发布后，主页能够正常点赞

### 3. 为中国大陆用户解决 DNS 污染

对于中国大陆用户，Cloudflare Workers 默认域名 `.workers.dev` 可能被 DNS 污染，导致无法访问，可以通过购买并绑定自定义域名的方式解决。具体步骤如下：

### 3.1. 在第三方平台或 Cloudflare 注册一个域名

### 3.2. 在 Cloudflare Dashboard 搜索 **Domains → Add domain → Connect a domain**，将域名添加到 Cloudflare

<img width="596" alt="image" src="https://github.com/user-attachments/assets/599f91b9-601d-4e71-9767-c0449ee181f4" />

所有设置默认就行，付费页面选择 Free

<img width="790" alt="image" src="https://github.com/user-attachments/assets/5abc36df-619f-4e0e-bbe1-b5e752d5d79b" />

### 3.3. 添加一条 DNS 记录，类型为 AAAA，名称为 `@`，内容为 `100::`

<img width="849" alt="image" src="https://github.com/user-attachments/assets/8f2706e0-5c22-483e-86d2-fc35c23c4abd" />

### 3.4. 在域名提供商的 DNS 服务器修改为 Cloudflare 提供的两个服务器地址

这里以腾讯云为例

<img width="1354"  alt="image" src="https://github.com/user-attachments/assets/75e3b730-2a6c-4ae6-b1b2-0892c6db0abd" />

### 3.5. 在 Workers & Pages → Overview → Domains → Routes → Add a domain 中添加自定义域名，选择刚才添加的域名，并绑定到 Worker

<img width="1070" alt="image" src="https://github.com/user-attachments/assets/89284cb0-a11b-40ef-bb27-88918ffd5422" />

添加后可能需要等待几分钟更新才能正常访问

### 4. 定制部署

在 GitHub 仓库修改根目录下的 `site.config.ts` 以适配你的机构：

```ts
const siteConfig: SiteConfig = {
  title: "你的网站标题",
  faviconUrl: "/favicon.svg",
  header: {
    logoUrl: "/logo.svg",
    brandLabel: "你的品牌名",
    githubUrl: "https://github.com/你的仓库",
  },
  footer: {
    name: "你的机构名称",
    contactEmail: "admin@example.com",
  },
  platforms: [/* 你的平台列表 */],
  rotation: { timezone: "Asia/Shanghai", times: ["04:01", "16:01"] },
};
```

Logo 与 Favicon 图片支持 png/jpg/svg 格式，默认放在 `public/` 文件夹（如 `public/logo.svg`），配置项以 `/` 开头引用，也可填写 `http(s)://` 绝对 URL。

默认情况下，GitHub 仓库一旦有新的 Commit， Worker 会自动重新构建
