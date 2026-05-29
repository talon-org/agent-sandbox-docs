# 部署到 Cloudflare Pages

## 1. Push 到 GitHub / Gitea

确保代码已推送到 GitHub（`talon-org/agent-sandbox-docs`）。

```bash
git remote add origin https://github.com/talon-org/agent-sandbox-docs.git
git push -u origin main
```

## 2. Cloudflare Pages Dashboard 操作

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** > **Create** > **Pages**
3. 点击 **Connect to Git** → 选择你的 Git 提供商
4. 选择 `agent-sandbox-docs` 仓库
5. 配置构建设置：

   | 字段 | 值 |
   |---|---|
   | Framework preset | **VitePress** |
   | Build command | `pnpm build` |
   | Build output directory | `docs/.vitepress/dist` |
   | Node.js version | `20` |

6. 点击 **Save and Deploy**

几分钟后自动出 `<project>.pages.dev` 可访问地址。

## 3. 自动部署

之后每次 `git push main`，Cloudflare Pages 会自动触发重新构建。PR 分支也会生成预览 URL（格式：`<branch>.<project>.pages.dev`）。

## 4. 自定义域名（可选，后期）

1. 进入 Cloudflare Dashboard > Pages > 你的项目 > **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入你的域名（如 `docs.sandbox.example.com`）
4. 如果域名在 Cloudflare 管理，DNS 会自动配置；否则按提示添加 CNAME 记录
5. HTTPS 证书通过 Cloudflare 自动签发（无需 certbot）

## 5. 环境变量（可选）

如需在构建时注入环境变量（如 Analytics ID 等），在 Pages 项目 > **Settings** > **Environment variables** 添加。

## 注意事项

- 不需要 `wrangler.toml`——Pages 静态站部署不需要 Worker 配置
- `docs/.vitepress/cache/` 已加入 `.gitignore`，不会被提交
- 构建产物 `docs/.vitepress/dist/` 由 Pages 自动生成，也不提交
