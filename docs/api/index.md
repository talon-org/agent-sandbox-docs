# API 参考概述

Talon Sandbox 提供 REST HTTP API，所有端点均以 `/v1/` 为前缀。

## 基础 URL

```
http(s)://<your-host>:18080
```

## 认证方式

支持两种认证方式：

### 1. Bearer Token（API Key）

适合 agent、脚本、服务端调用：

```http
Authorization: Bearer ask_X_your_api_key_here
```

### 2. Cookie（Session）

适合 Web 控制台（浏览器）：

先调用 `POST /v1/auth/login` 获取 session cookie，后续请求自动携带。

## 响应格式

所有成功响应返回 JSON，Content-Type 为 `application/json`。

错误响应统一格式：

```json
{
  "error": "描述错误的字符串"
}
```

HTTP 状态码含义：

| 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 资源创建成功 |
| 204 | 成功，无响应体 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 权限不足（角色不满足） |
| 404 | 资源不存在 |
| 409 | 状态冲突（如非法状态转换） |
| 412 | 前置条件不满足（如 chromium 未安装） |
| 429 | 超过速率限制 |
| 503 | 服务不可用（依赖未注入） |

## 角色与权限

租户内有三个角色：

| 角色 | 可执行操作 |
|---|---|
| `viewer` | 所有 GET 只读操作 |
| `developer` | 所有 GET + 创建/修改 sandbox、process、secrets 等写操作 |
| `owner` | 所有操作 + 管理其他用户的角色 |

## 端点列表

| 分组 | 端点 |
|---|---|
| [认证](/api/auth) | 登录、登出、当前用户、API Key 管理 |
| [Sandboxes](/api/sandboxes) | CRUD + start/stop/pause/resume/exec |
| [Processes](/api/processes) | 启动/停止长驻进程 + 日志 |
| [PTY](/api/pty) | WebSocket 交互式终端 + 录像 |
| [文件系统](/api/fs) | 读/写/列/删 workspace 文件 |
| [Browser](/api/browser) | 启动 Chromium + CDP URL |
| [Agent Run](/api/agent) | 高层 agent.run 接口 |
| [Admin / Secrets / Audit](/api/admin) | 管理员操作、secrets 管理、审计日志 |
| [错误码](/api/errors) | 错误信息对照表 |

## 速率限制

登录端点有滑动窗口速率限制（防暴力破解）。其他端点目前无速率限制，未来版本会加。
