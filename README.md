# Agent Sandbox Platform — 帮助文档站

[English](#english) | 中文

这是 [Agent Sandbox Platform](https://github.com/talon-org/agent-sandbox-platform) 的官方帮助文档站，使用 VitePress 构建，部署在 Cloudflare Pages。

**主仓库**: [talon-org/agent-sandbox-platform](https://github.com/talon-org/agent-sandbox-platform)  
**文档站仓库**: 本仓库（独立维护）

## 本地开发

```bash
pnpm install
pnpm dev         # 启动 dev server http://localhost:5173
pnpm build       # 构建静态站点到 docs/.vitepress/dist/
pnpm preview     # 本地预览构建产物
```

## 更新文档内容

```bash
# 从主仓同步 CHANGELOG、ADR 等
pnpm sync:docs

# 重新生成 API 参考页（读主仓 dto.go / router.go）
pnpm gen:api
```

## 目录结构

```
docs/
├── index.md               首页
├── quickstart/            快速开始（3 篇）
├── concepts/              核心概念
├── api/                   API 参考（自动生成）
├── deploy/                部署指南（4 篇）
├── changelog.md           版本记录（sync:docs 同步）
└── .vitepress/
    ├── config.ts          站点配置
    ├── theme/             主题 + 样式
    └── components/        自定义组件
scripts/
├── gen-api-ref.ts         API ref 生成脚本
└── sync-from-main-repo.sh 内容同步脚本
```

## 部署

见 [DEPLOYMENT.md](DEPLOYMENT.md)。

---

## English

This is the official documentation site for [Agent Sandbox Platform](https://github.com/talon-org/agent-sandbox-platform), built with VitePress and deployed on Cloudflare Pages.

**Main repo**: [talon-org/agent-sandbox-platform](https://github.com/talon-org/agent-sandbox-platform) (read-only reference)  
**This repo**: documentation only (maintained separately)

### Local dev

```bash
pnpm install && pnpm dev
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for Cloudflare Pages setup.
