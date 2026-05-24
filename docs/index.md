---
layout: home
title: Agent Sandbox Platform
titleTemplate: AI agent 的在线沙箱

hero:
  name: "Agent Sandbox Platform"
  text: "AI agent 的在线运行环境"
  tagline: 让 AI 在完全隔离的沙箱里写代码、跑命令、开浏览器、给项目出预览 URL —— 给每个 agent 一台真正可用的工作机。
  actions:
    - theme: brand
      text: curl 30 秒上手
      link: /quickstart/curl
    - theme: alt
      text: SDK 接入
      link: /quickstart/agent-sdk
    - theme: alt
      text: Docker 部署
      link: /quickstart/docker
    - theme: alt
      text: API 参考
      link: /api/

features:
  - icon:
      light: /icons/shield.svg
      dark: /icons/shield.svg
    title: 真隔离容器
    details: 每个 sandbox 独立 PID/网络 namespace、cgroup v2 资源限额、capability drop。runc OCI 标准运行时，不是普通进程 fork。
  - icon:
      light: /icons/terminal.svg
      dark: /icons/terminal.svg
    title: 交互式 PTY
    details: WebSocket PTY 端点，原生支持交互式 shell。全程录像，可 replay 审计每一个 AI 操作。
  - icon:
      light: /icons/globe.svg
      dark: /icons/globe.svg
    title: Headless 浏览器
    details: 每个 sandbox 内置 Chromium + CDP。AI agent 可以打开网页、截图、操作 DOM，开箱即用。
  - icon:
      light: /icons/eye.svg
      dark: /icons/eye.svg
    title: 项目预览 URL
    details: sandbox 内跑 Vite/Next.js/Node 开发服务器后，自动出外部可访问的预览地址。支持 path-prefix 和 subdomain 两种模式。
  - icon:
      light: /icons/database.svg
      dark: /icons/database.svg
    title: Workspace 持久化
    details: 文件系统 overlayfs 挂载 + workspace volume。worker 重启、sandbox pause/resume，数据不丢。
  - icon:
      light: /icons/key.svg
      dark: /icons/key.svg
    title: 多租户 + 审计
    details: 每个 tenant 独立 API key、quota、secrets 注入。所有操作写入审计日志，支持合规查询。
---

## 6 种接入方式

平台暴露统一 REST + WebSocket,SDK 全部对齐 v2 表层(`Sandbox.create()` 一行
拉起、`sb.expose(port)` 一等公民、`resources={"cpu":2, "memory":"4GiB"}`
字符串单位、`run`/`spawn` 命令语义分离)。选你顺手的:

| 方式 | 适合 | 起点 |
|---|---|---|
| **curl 直调** | 试一下 / shell 脚本 / CI | [curl 30 秒上手](/quickstart/curl) |
| **Python SDK** `talon-sandbox` | AI agent 主流生态、数据脚本 | `pip install git+http://x.xgit.pro/dark/talon-sandbox-sdk-python.git` ([repo](http://x.xgit.pro/dark/talon-sandbox-sdk-python)) |
| **TypeScript SDK** `talon-sandbox` | 浏览器扩展 / Node 后端 / Electron | `npm install http://x.xgit.pro/dark/talon-sandbox-sdk-typescript.git` ([repo](http://x.xgit.pro/dark/talon-sandbox-sdk-typescript)) |
| **Go SDK** | 后端服务 / DevOps 工具 | `GOPRIVATE=x.xgit.pro go get x.xgit.pro/dark/talon-sandbox-sdk-go@latest` ([repo](http://x.xgit.pro/dark/talon-sandbox-sdk-go)) |
| **.NET SDK** `TalonSandbox.Sdk` | Windows 后端 / 企业 .NET 栈 | git clone + `dotnet pack` + 本地 NuGet feed ([repo](http://x.xgit.pro/dark/talon-sandbox-sdk-dotnet)) |
| **CLI** `talon-sandbox` / `tsb` | 现场运维 / agent fork-exec / shell 习惯 | 二进制 release([talon-sandbox-cli](http://x.xgit.pro/dark/talon-sandbox-cli)),`brew install talon-sandbox`(规划) |

六条路径语义同步——OpenAPI 是 source of truth([api/openapi.yaml](/openapi.yaml))。

::: tip SDK 包发布状态
SDK / CLI 目前**未发布**到公开 registry(PyPI / npm / NuGet / Homebrew),
从内部 Gitea 仓直装。商业化 GA 后会发,届时改成短命令:`pip install
talon-sandbox` / `npm install talon-sandbox` / `dotnet add package
TalonSandbox.Sdk` / `brew install talon-sandbox`。
:::

## 部署路径

| 场景 | 推荐路径 | 耗时 |
|---|---|---|
| mac 上本地体验 / demo | [Docker Compose](/quickstart/docker) | ~5 分钟 |
| Linux 服务器真实部署 | [systemd 自部署](/quickstart/self-hosted) | ~15 分钟 |
| 接 AI agent(curl/SDK) | [Agent SDK 指南](/quickstart/agent-sdk) | ~10 分钟 |

::: warning 生产环境注意
Docker Compose 使用 `localprocess` adapter,sandbox 进程与 worker 共享 PID/网络 namespace,**没有真隔离**。生产环境请用 systemd + runc 路径。
:::

## 核心架构概览

```
┌─────────────────────────────────────────────────────┐
│                   AI agent / SDK                    │
└──────────────────────┬──────────────────────────────┘
                       │ REST API / WebSocket
┌──────────────────────▼──────────────────────────────┐
│                  sandbox-api                        │
│   认证 / quota / 调度 / 审计 / 反向代理              │
└──────────────────────┬──────────────────────────────┘
                       │ gRPC
┌──────────────────────▼──────────────────────────────┐
│                 sandbox-worker                      │
│   runc / runsc 运行时 · PTY · browser · process      │
│   workspace overlayfs · port watcher · preview      │
└──────────────────────┬──────────────────────────────┘
                       │ OCI
┌──────────────────────▼──────────────────────────────┐
│              sandbox container                      │
│   独立 netns / pidns / cgroup v2 / capability drop   │
│   Chromium (opt) · dev server · workspace files     │
└─────────────────────────────────────────────────────┘
```

详细架构文档见主仓 `docs/architecture/`。
