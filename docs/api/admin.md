# Admin / Secrets / Audit API

本页涵盖三组管理类 API：

1. **Admin**：系统管理（worker 管理、sandbox 重分配、租户 quota）
2. **Secrets**：凭证管理（API key 等注入到 sandbox）
3. **Audit**：审计日志查询

---

## Secrets API

Secrets 是加密存储的键值对，可以安全地注入到 sandbox 内（作为环境变量或 tmpfs 文件），避免明文 API Key 出现在请求体 / 日志中。

### 创建 Secret

`POST /v1/secrets` — **需要 `developer` 角色**

```http
POST /v1/secrets
Authorization: Bearer ask_X_...
Content-Type: application/json
```

```json
{
  "name": "OPENAI_API_KEY",
  "value": "sk-xxxxx",
  "ttl_seconds": 86400
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | secret 名称（同租户内唯一） |
| `value` | string | 是 | 明文值（仅此时出现，存储时加密，响应不返回） |
| `ttl_seconds` | int64 | 否 | 过期时间（秒）；0 = 永不过期 |

**200 OK**

```json
{
  "id": "sec_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "name": "OPENAI_API_KEY",
  "created_at": 1716480000,
  "expires_at": 1716566400,
  "revoked": false,
  "used_by_count": 0
}
```

**注意**：响应中**永远不包含 value**。

---

### 列出 Secrets

`GET /v1/secrets` — **需要 `viewer` 角色**

```http
GET /v1/secrets
Authorization: Bearer ask_X_...
```

**200 OK**

```json
{
  "secrets": [
    {
      "id": "sec_xxx",
      "name": "OPENAI_API_KEY",
      "created_at": 1716480000,
      "expires_at": 0,
      "revoked": false,
      "used_by_count": 2
    }
  ]
}
```

`used_by_count` 是引用本 secret 的 sandbox binding 数量，用于安全评估（删前确认影响范围）。

---

### 删除 Secret

`DELETE /v1/secrets/{id}` — **需要 `developer` 角色**

```http
DELETE /v1/secrets/{id}
Authorization: Bearer ask_X_...
```

**204 No Content**

---

### 将 Secret 注入 Sandbox

在创建 sandbox 时，通过 `secrets` 字段声明注入：

```json
{
  "secrets": [
    {
      "secret_id": "sec_xxx",
      "mount_type": "env",
      "target": "OPENAI_API_KEY"
    },
    {
      "secret_id": "sec_yyy",
      "mount_type": "file",
      "target": "github-token"
    }
  ]
}
```

| `mount_type` | `target` 含义 | sandbox 内访问方式 |
|---|---|---|
| `env` | 环境变量名 | `process.env.OPENAI_API_KEY` |
| `file` | 文件名 | `cat /run/secrets/github-token` |

::: tip 安全特性
- `file` 模式挂载到 sandbox 内的 `tmpfs`，不持久化到磁盘
- sandbox 重启后 secrets 不自动恢复（内存卷语义）
- secret value 在 worker 进程内存中短暂存在后即擦除
:::

---

## Audit API

### 查询审计日志

`GET /v1/audit/events` — **需要 `viewer` 角色**（admin tenant 可看所有租户；普通 tenant 只看自己的）

```http
GET /v1/audit/events?limit=50&offset=0
Authorization: Bearer ask_X_...
```

**查询参数：**

| 参数 | 类型 | 说明 |
|---|---|---|
| `limit` | int | 每页条数（默认 50，最大 200） |
| `offset` | int | 偏移量 |

**200 OK**

```json
{
  "events": [
    {
      "id": "evt_xxx",
      "tenant_id": "tnt_xxx",
      "event_type": "sandbox.create",
      "outcome": "success",
      "actor": "ask_X_...",
      "target": "sbx_xxx",
      "remote_ip": "192.168.1.1",
      "extra": {
        "profile": "code-lite",
        "image_id": "img_xxx"
      },
      "at": 1716480000
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `event_type` | 事件类型（`sandbox.create` / `sandbox.destroy` / `auth.login` 等） |
| `outcome` | `success` / `failure` |
| `actor` | 执行操作的 API Key 或用户 |
| `target` | 操作目标（sandbox ID / user ID 等） |
| `extra` | 事件附加信息（因 event_type 不同而异） |
| `at` | 事件时间（Unix 秒） |

---

## Admin API

Admin 端点需要 **admin tenant**（通常是 bootstrap 创建的租户）认证，普通租户无法访问。

### 列出 Workers

`GET /v1/admin/workers`

```http
GET /v1/admin/workers
Authorization: Bearer <admin-api-key>
```

**200 OK**

```json
{
  "workers": [
    {
      "id": "wrk_xxx",
      "grpc_addr": "10.0.0.2:50051",
      "preview_addr": "10.0.0.2",
      "current_sandboxes": 5,
      "max_sandboxes": 20,
      "last_heartbeat": 1716480000,
      "status": "live"
    }
  ]
}
```

---

### 列出所有 Sandboxes（Admin 视角）

`GET /v1/admin/sandboxes`

```http
GET /v1/admin/sandboxes
Authorization: Bearer <admin-api-key>
```

---

### Reassign Sandbox

`POST /v1/admin/reassign` — 将 sandbox 从一个 worker 重分配到另一个 worker（用于 worker 下线 / 负载均衡）

```http
POST /v1/admin/reassign
Authorization: Bearer <admin-api-key>
Content-Type: application/json
```

```json
{
  "sandbox_id": "sbx_xxx",
  "target_worker_id": "wrk_yyy"
}
```

---

### 列出所有租户

`GET /v1/admin/tenants`

```http
GET /v1/admin/tenants
Authorization: Bearer <admin-api-key>
```

**200 OK**

```json
{
  "tenants": [
    {
      "id": "tnt_xxx",
      "name": "my-team",
      "created_at": 1716480000,
      "quota_max_sandboxes": 50,
      "active_sandboxes": 12
    }
  ]
}
```

---

### 修改租户 Quota

`PATCH /v1/admin/tenants/{id}`

```http
PATCH /v1/admin/tenants/{id}
Authorization: Bearer <admin-api-key>
Content-Type: application/json
```

```json
{
  "quota_max_sandboxes": 100
}
```

`quota_max_sandboxes: 0` 表示不限制。

---

## Baseimage 管理 (Admin)

### 列出 Baseimages

`GET /v1/images` — **所有认证用户可访问**

```http
GET /v1/images
Authorization: Bearer ask_X_...
```

**200 OK**

```json
{
  "images": [
    {
      "id": "img_xxx",
      "name": "code-lite",
      "url": "https://...",
      "sha256": "abc123...",
      "os": "linux",
      "arch": "amd64",
      "is_default": true,
      "description": "轻量代码执行环境（Node 20 + Python 3.12 + Go 1.22）",
      "created_at": 1716480000
    }
  ]
}
```

### 查询 Image 状态

`GET /v1/images/{id}/status` — 查询 image 在 worker 上的下载/准备状态

```http
GET /v1/images/{id}/status
Authorization: Bearer ask_X_...
```

**200 OK**

```json
{
  "image_id": "img_xxx",
  "stage": "ready",
  "bytes_downloaded": 524288000,
  "bytes_total": 524288000,
  "extracted_entries": 45000,
  "started_at": "2026-05-24T00:00:00Z",
  "updated_at": "2026-05-24T00:05:00Z"
}
```

`stage` 值：`unknown` | `pending` | `downloading` | `verifying` | `extracting` | `ready` | `failed`

### 注册 Baseimage (Admin)

`POST /v1/admin/images`

```http
POST /v1/admin/images
Authorization: Bearer <admin-api-key>
Content-Type: application/json
```

```json
{
  "name": "code-browser",
  "url": "https://releases.example.com/baseimages/code-browser-v1.0.tar.gz",
  "sha256": "abc123...",
  "os": "linux",
  "arch": "amd64",
  "description": "含 Chromium 的代码执行环境",
  "is_default": false
}
```

### 预热 Image (Admin)

`POST /v1/admin/images/{id}/prewarm`

```http
POST /v1/admin/images/{id}/prewarm
Authorization: Bearer <admin-api-key>
```

预热会同步阻塞（直到下载并解压完成），时间可能较长。建议配合 `GET /v1/images/{id}/status` 轮询。

### 删除 Image 记录 (Admin)

`DELETE /v1/admin/images/{id}`

```http
DELETE /v1/admin/images/{id}
Authorization: Bearer <admin-api-key>
```
