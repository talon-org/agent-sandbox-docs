# Sandboxes API

sandbox 是平台的核心资源，代表一个完全隔离的运行环境。

所有端点需要 `developer` 角色（GET 只读端点需要 `viewer` 及以上）。

## Sandbox 能力速查

一张表看全 sandbox 的所有能力。

| 能力 | 字段 / 端点 | 说明 |
|------|------------|------|
| **镜像** | `image` | 指定容器镜像（如 `node:20-bookworm`）；空 = 使用默认镜像 |
| **CPU** | `resources.cpu` | 浮点 core 数，如 `0.5`、`2`；0 = 使用 worker 默认值 |
| **内存** | `resources.memory` | 字符串单位，如 `"4GiB"`；空 = 使用 worker 默认值 |
| **磁盘** | `resources.disk` | 字符串单位，如 `"20GiB"`；空 = 使用 worker 默认值 |
| **进程数上限** | `resources.pids_limit` | 最大并发进程数；0 = 使用 worker 默认值 |
| **空闲超时** | `timeout` | duration 字符串，如 `"30m"`；sandbox 无操作超过此时长自动 pause；空 = 禁用 |
| **硬性 TTL** | `ttl` | duration 字符串，如 `"6h"`；从创建时间起超过此时长自动 destroy；空 = 禁用 |
| **网络策略** | `network` | `open`（全放行）/ `allowlist`（白名单）/ `sealed`（完全隔离）；见[网络策略](/concepts/sandbox-network) |
| **主机白名单** | `network_allowed_hosts` | `[]string`；配合 `allowlist` 使用，支持域名 / IP / CIDR |
| **凭证注入** | `secrets[]` | 将已创建的 secret 以 `env` 或 `file` 方式注入 sandbox |
| **环境变量** | `env` | `map[string]string`；sandbox 启动时注入的环境变量 |
| **标签** | `labels` | `map[string]string`；用户自定义标签，用于过滤和识别 |
| **可读名称** | `name` | 自定义名称；空时 UI 显示 id |
| **任务描述** | `task` | 本次任务的文字描述，显示在控制台概览 |
| **启动等待** | `?wait=running` | query 参数；服务端阻塞直到 sandbox 进入 running 后再返回 |
| **执行命令** | `POST /{id}/exec` | 同步执行一次性命令，返回 stdout / stderr / exit_code |
| **长驻进程** | `POST /{id}/processes` | 启动后台进程，支持 env / cwd / 声明暴露端口 |
| **端口暴露** | `POST /{id}/expose` | 注册端口并获得 preview URL；支持自定义子域名和签名 token |
| **文件系统** | `/v1/sandboxes/{id}/fs/*` | 列目录、读文件、写文件 |
| **交互式终端** | WebSocket `/{id}/pty` | 交互式 PTY，全程录像为 asciicast v2 格式 |
| **浏览器** | `POST /{id}/browser` | 启动 Chromium，通过 CDP 协议控制 |
| **Agent Run** | `POST /{id}/agent/run` | 自动化 agent 步骤执行，最多 100 步 |
| **录制** | `GET /{id}/recordings/*` | 获取 PTY 会话录像（asciicast v2 格式） |

duration 字符串格式：`30s` / `5m` / `2h` / `1d` / `1w`（扩展支持 `d` / `w` 单位）。

size 字符串格式：`512MiB` / `4GiB` / `20GB`（binary KiB/MiB/GiB 和 decimal KB/MB/GB 均接受，大小写不敏感）。

## POST `/v1/sandboxes` {#post-sandboxes}

创建 sandbox。

**需要 `developer` 角色**

```http
POST /v1/sandboxes
Authorization: Bearer ask_X_...
Content-Type: application/json
```

### 请求体（v2 推荐）

```json
{
  "image": "node:20-bookworm",
  "resources": {
    "cpu": 2,
    "memory": "4GiB",
    "disk": "10GiB"
  },
  "timeout": "30m",
  "ttl": "6h",
  "network": "allowlist",
  "env": { "NODE_ENV": "development" },
  "labels": { "project": "agent-x" },
  "secrets": [
    {
      "secret_id": "sec_xxx",
      "mount_type": "env",
      "target": "OPENAI_API_KEY"
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `image` | string | 否 | 镜像标签（如 `node:20-bookworm`）；空 → worker 默认 |
| `resources.cpu` | number | 否 | CPU 核数，支持小数（如 `0.5`）；0 = worker 默认 |
| `resources.memory` | string | 否 | 内存上限，字符串单位（`512MiB` / `4GiB` / `2GB`）；空 = worker 默认 |
| `resources.disk` | string | 否 | 磁盘上限，字符串单位；空 = worker 默认 |
| `timeout` | string | 否 | 无操作自动 pause（`30s` / `5m` / `2h` / `1d`）；空 = 禁用 |
| `ttl` | string | 否 | 绝对生存时间，同 duration 格式；空 = 禁用 |
| `network` | string | 否 | `sealed` / `allowlist` / `open`（别名，见下）；空 = 默认 |
| `env` | object | 否 | 环境变量 dict |
| `labels` | object | 否 | 自定义标签 dict |
| `secrets` | array | 否 | 注入的凭证列表（见下方说明） |

**network 别名：**

| 别名 | 含义 |
|---|---|
| `sealed` | 完全断网，只有 lo |
| `allowlist` | DNS + 配置好的白名单域（生产推荐） |
| `open` | 允许所有出站（开发调试） |

**duration 字符串** — `30s` / `5m` / `2h` / `1d` / `1w`，扩展 Go ParseDuration
加 `d` / `w` 单位。

**size 字符串** — `512KiB` / `4GiB` / `2GB` / `1TiB`，binary（KiB/MiB/GiB）
和 decimal（KB/MB/GB）都接受，大小写不敏感。

**secrets 元素字段：**

| 字段 | 说明 |
|---|---|
| `secret_id` | 已创建的 secret ID |
| `mount_type` | `file`（挂载为 tmpfs 文件）或 `env`（注入为环境变量） |
| `target` | `file` 模式：`/run/secrets/<target>`；`env` 模式：环境变量名 |

**响应**

**201 Created**

响应体始终用规范化后的字段（v2 风格）：

```json
{
  "id": "sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "created",
  "image": "node:20-bookworm",
  "resources": {
    "cpu": 2,
    "memory": "4GiB",
    "disk": "10GiB"
  },
  "timeout": "30m",
  "ttl": "6h",
  "network": "allowlist",
  "created_at": 1716480000
}
```

::: tip 调用方便利
请求时也支持 `?wait=running`（Spec 45）— 服务端 block 到 sandbox 进入 running
再返回，省一轮 polling。SDK `Sandbox.create()` 默认带上这个 query。
:::

---

## GET `/v1/sandboxes` {#get-sandboxes}

列出当前租户所有 sandbox。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{
  "sandboxes": [
    {
      "id": "sbx_xxx",
      "state": "running",
      "profile": "code-lite",
      "created_at": 1716480000
    }
  ]
}
```

---

## GET `/v1/sandboxes/`{id} {#get-sandboxes-2}

获取单个 sandbox 详情。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}
Authorization: Bearer ask_X_...
```

**响应**

**200 OK** — 返回 `SandboxDTO`（字段同 POST 响应）

**404 Not Found**

```json
{ "error": "sandbox: not found" }
```

---

## POST `/v1/sandboxes/`{id}/start {#post-sandboxes-2}

启动 sandbox（`created` / `stopped` → `running`）。

**需要 `developer` 角色**

```http
POST /v1/sandboxes/{id}/start
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{ "id": "sbx_xxx", "state": "running", ... }
```

**409 Conflict** — 状态不允许 start

```json
{ "error": "sandbox: invalid state transition" }
```

---

## POST `/v1/sandboxes/`{id}/stop {#post-sandboxes-3}

停止 sandbox（`running` → `stopped`）。所有进程会被 kill。

**需要 `developer` 角色**

```http
POST /v1/sandboxes/{id}/stop
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{ "id": "sbx_xxx", "state": "stopped", ... }
```

---

## POST `/v1/sandboxes/`{id}/pause {#post-sandboxes-4}

暂停 sandbox（`running` → `paused`）。进程被冻结，内存保留。

**需要 `developer` 角色**

```http
POST /v1/sandboxes/{id}/pause
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{ "id": "sbx_xxx", "state": "paused", ... }
```

---

## POST `/v1/sandboxes/`{id}/resume {#post-sandboxes-5}

恢复 sandbox（`paused` → `running`）。毫秒级恢复。

**需要 `developer` 角色**

```http
POST /v1/sandboxes/{id}/resume
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{ "id": "sbx_xxx", "state": "running", ... }
```

---

## POST `/v1/sandboxes/`{id}/exec {#post-sandboxes-6}

在 sandbox 内执行一次性命令（同步，等待完成返回结果）。

**需要 `developer` 角色**

sandbox 必须处于 `running` 状态。

```http
POST /v1/sandboxes/{id}/exec
Authorization: Bearer ask_X_...
Content-Type: application/json
```

```json
{
  "command": ["bash", "-c", "echo $HOME && ls /workspace"]
}
```

**响应**

**200 OK**

```json
{
  "stdout": "/root\napp.py\npackage.json\n",
  "stderr": "",
  "exit_code": 0
}
```

::: warning 同步阻塞
`exec` 是同步接口，会等待命令完成才返回。不适合长时间运行的命令（如服务器启动）——那类用 [processes](/api/processes) 端点。
:::

---

## DELETE `/v1/sandboxes/`{id} {#delete-sandboxes}

销毁 sandbox（任意 alive 状态 → `destroyed`）。所有数据永久删除。

**需要 `developer` 角色**

```http
DELETE /v1/sandboxes/{id}
Authorization: Bearer ask_X_...
```

**响应**

**204 No Content** — 销毁成功

**404 Not Found** — sandbox 不存在

---

## POST `/v1/sandboxes/`{id}/expose {#expose}

显式暴露 sandbox 内一个端口，返回 preview URL（Spec 50）。

**需要 `developer` 角色**

```http
POST /v1/sandboxes/{id}/expose
Authorization: Bearer ask_X_...
Content-Type: application/json
```

### 请求体

```json
{
  "port": 5173,
  "subdomain": "my-app",
  "sign": true,
  "ttl": "1h"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `port` | int | 是 | 容器端口（1–65535） |
| `subdomain` | string | 否 | 自定义 subdomain；空 → 用 `sb-{id}-{port}` |
| `sign` | bool | 否 | 是否生成签名 token（Spec 48）；默认 `false` |
| `ttl` | string | 否 | 签名 token 有效期（duration string）；默认 `1h`，最大 `24h` |

**响应**

**201 Created**

```json
{
  "port": 5173,
  "url": "http://sb-xxx-5173.preview.example.com",
  "source": "explicit",
  "signed": false
}
```

签名时 URL 带 `?token=` query：

```json
{
  "port": 5173,
  "url": "http://sb-xxx-5173.preview.example.com/?token=eyJ...",
  "source": "explicit",
  "signed": true,
  "expires_at": "2026-05-24T15:04:05Z"
}
```

---

## DELETE `/v1/sandboxes/`{id}/expose/{port} {#unexpose}

取消显式暴露。**注意**：动态发现源（Spec 39）暴露的端口无法 unexpose，要关掉
端口需要 kill 持有该端口的进程。

**需要 `developer` 角色**

```http
DELETE /v1/sandboxes/{id}/expose/{port}
Authorization: Bearer ask_X_...
```

**响应**

- **204 No Content** — 取消成功
- **404 Not Found** — 该端口没被显式 expose 过

---

## GET `/v1/sandboxes/`{id}/expose {#list-expose}

列出 sandbox 当前所有暴露的端口（显式 + 动态发现）。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/expose
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{
  "ports": [
    {
      "port": 5173,
      "url": "http://sb-xxx-5173.preview.example.com",
      "source": "explicit",
      "signed": false
    },
    {
      "port": 3000,
      "url": "http://sb-xxx-3000.preview.example.com",
      "source": "dynamic",
      "signed": false
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `source` | `explicit`（通过 POST `/expose` 显式注册）或 `dynamic`（port-watcher sidecar 自动发现，Spec 39） |
| `signed` | 是否带签名 token |

详见 [端口暴露概念](/concepts/expose-ports)。

---

## Sandbox DTO 字段说明（响应）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | sandbox ID（`sbx_` + 24 hex） |
| `state` | string | 当前状态，见[生命周期](/concepts/sandbox-lifecycle) |
| `image` | string | 镜像标签 |
| `resources.cpu` | number | CPU 核数 |
| `resources.memory` | string | 内存上限（如 `4GiB`） |
| `resources.disk` | string | 磁盘上限 |
| `resources.pids_limit` | int64 | PID 数量上限 |
| `timeout` | string | 空闲自动 pause（duration string） |
| `ttl` | string | 绝对生存时间（duration string） |
| `network` | string | 网络策略别名（`sealed` / `allowlist` / `open`） |
| `env` | object | 环境变量 dict |
| `labels` | object | 自定义标签 dict |
| `last_active_at` | int64 | 最后活跃时间（Unix 秒） |
| `created_at` | int64 | 创建时间（Unix 秒） |
| `secrets` | array | 绑定的凭证（元数据，不含 value） |

---

## Signed Preview Token {#signed-preview-token}

Issue a short-lived token that lets anyone holding it access the preview proxy for a specific port — no account required.

See [Signed Preview URL](/concepts/signed-preview) for the full guide.

### POST `/v1/sandboxes/{id}/preview-token`

**Requires developer or owner role**

```http
POST /v1/sandboxes/{id}/preview-token
Authorization: Bearer ask_X_...
Content-Type: application/json

{
  "port": 5173,
  "ttl_seconds": 3600
}
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `port` | int | yes | Container port to authorise (1–65535) |
| `ttl_seconds` | int64 | no | Token lifetime in seconds (default 3600, max 86400) |

**Response — 201 Created**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-05-24T15:04:05Z"
}
```

Use the token by appending `?token=<value>` to the preview URL:

```
https://api.example.com/v1/sandboxes/sbx_xxx/preview/5173/?token=eyJ...
```

The token is stripped before forwarding to the upstream app and cannot be used on any other endpoint.

**Error responses**

| Code | Meaning |
|---|---|
| 400 | `port` out of range or request body invalid |
| 401 | Not authenticated |
| 403 | Insufficient role (viewer) |
| 404 | Sandbox not found |
