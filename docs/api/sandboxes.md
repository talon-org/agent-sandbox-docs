# Sandboxes API

sandbox 是平台的核心资源，代表一个完全隔离的运行环境。

所有端点需要 `developer` 角色（GET 只读端点需要 `viewer` 及以上）。

## POST `/v1/sandboxes` {#post-sandboxes}

创建 sandbox。

**需要 `developer` 角色**

```http
POST /v1/sandboxes
Authorization: Bearer ask_X_...
Content-Type: application/json
```

### 请求体

```json
{
  "profile": "code-lite",
  "image_id": "img_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "cpu_millis": 1000,
  "memory_bytes": 536870912,
  "pids_limit": 256,
  "idle_timeout_seconds": 300,
  "ttl_seconds": 3600,
  "network_policy": "full-egress",
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
| `profile` | string | 否 | sandbox 模板标识（如 `code-lite`） |
| `image_id` | string | 否 | 指定 baseimage；空 → 使用默认 image |
| `cpu_millis` | int64 | 否 | CPU 配额（1000 = 1 核）；0 = worker 默认 |
| `memory_bytes` | int64 | 否 | 内存上限（字节）；0 = worker 默认 |
| `pids_limit` | int64 | 否 | PID 数量上限；0 = worker 默认 |
| `idle_timeout_seconds` | int64 | 否 | 无操作自动 pause 超时（秒）；0 = 禁用 |
| `ttl_seconds` | int64 | 否 | 绝对生存时间（秒）；0 = 禁用 |
| `network_policy` | string | 否 | `offline` / `restricted-egress` / `full-egress`；空 = worker 默认 |
| `secrets` | array | 否 | 注入的凭证列表（见下方说明） |

**secrets 元素字段：**

| 字段 | 说明 |
|---|---|
| `secret_id` | 已创建的 secret ID |
| `mount_type` | `file`（挂载为 tmpfs 文件）或 `env`（注入为环境变量） |
| `target` | `file` 模式：`/run/secrets/<target>`；`env` 模式：环境变量名 |

**network_policy 说明：**

| 值 | 含义 |
|---|---|
| `offline` | 完全断网（无出站） |
| `restricted-egress` | 仅允许私有地址段（RFC1918） |
| `full-egress` | 允许所有出站（默认） |

**响应**

**201 Created**

```json
{
  "id": "sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "created",
  "profile": "code-lite",
  "image_id": "img_xxx",
  "cpu_millis": 1000,
  "memory_bytes": 536870912,
  "idle_timeout_seconds": 300,
  "network_policy": "full-egress",
  "created_at": 1716480000
}
```

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

## Sandbox DTO 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | sandbox ID（`sbx_` + 24 hex） |
| `state` | string | 当前状态，见[生命周期](/concepts/sandbox-lifecycle) |
| `profile` | string | sandbox 模板标识 |
| `image_id` | string | 使用的 baseimage ID |
| `cpu_millis` | int64 | CPU 配额（毫核） |
| `memory_bytes` | int64 | 内存上限（字节） |
| `pids_limit` | int64 | PID 数量上限 |
| `idle_timeout_seconds` | int64 | 空闲自动 pause 超时 |
| `ttl_seconds` | int64 | 绝对生存时间 |
| `last_active_at` | int64 | 最后活跃时间（Unix 秒） |
| `created_at` | int64 | 创建时间（Unix 秒） |
| `network_policy` | string | 网络出站策略 |
| `secrets` | array | 绑定的凭证（元数据，不含 value） |
