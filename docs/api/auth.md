# 认证 API

Talon Sandbox 支持两种认证方式：用户名/密码 Session（Web 控制台）和 API Key（程序调用）。

## POST `/v1/auth/login` {#post-auth-login}

用户名密码登录，获取 session cookie。

**不需要认证**（登录入口）

### 请求

```http
POST /v1/auth/login
Content-Type: application/json
```

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**响应**

**200 OK** — 登录成功，响应头设置 `Set-Cookie: sandbox_session=...`

```json
{
  "tenant_id": "tnt_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "admin",
  "role": "owner"
}
```

**401 Unauthorized**

```json
{ "error": "auth: unauthorized" }
```

**429 Too Many Requests** — 触发速率限制（防暴力破解）

### 说明

- Cookie 有效期由服务器配置（默认 24h）
- 后续请求自动携带 cookie，无需显式传 Authorization 头
- 对于 API Key 调用，不需要调用此端点

---

## POST `/v1/auth/logout` {#post-auth-logout}

注销当前 session，清除 cookie。

**需要认证**

```http
POST /v1/auth/logout
```

**响应**

**200 OK**

```json
{ "ok": true }
```

---

## GET `/v1/auth/me` {#get-auth-me}

获取当前认证用户的信息。

**需要认证**

```http
GET /v1/auth/me
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{
  "tenant_id": "tnt_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "username": "admin",
  "role": "owner",
  "is_admin_tenant": true
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `tenant_id` | string | 当前租户 ID |
| `username` | string | 用户名 |
| `role` | string | `viewer` / `developer` / `owner` |
| `is_admin_tenant` | bool | 是否是管理员租户（可访问 /v1/admin/* 端点） |

---

## API Key 认证

API Key 在 bootstrap 时生成（形如 `ask_X_...`），用于程序调用，无需登录流程。

每个请求在 `Authorization` 头传递：

```http
Authorization: Bearer ask_X_your_api_key_here
```

### API Key 特性

- **不过期**（除非管理员主动 revoke）
- **按租户隔离**：只能操作本租户的资源
- **角色**：bootstrap 生成的 API Key 具有 `developer` 权限

::: tip 最佳实践
- 在 CI/CD、agent 脚本中使用 API Key，不要用用户名密码
- 不要在客户端代码中硬编码 API Key，使用环境变量
- 用 [Secrets API](/api/admin#secrets) 把 API Key 注入到 sandbox 内（不通过环境变量传给 agent）
:::

---

## 用户角色管理

### PATCH `/v1/tenants/`{tenant_id}/users/{user_id} {#patch-tenants}

修改租户内某个用户的角色。

**需要 `owner` 角色**

```http
PATCH /v1/tenants/{tenant_id}/users/{user_id}
Authorization: Bearer ask_X_...
Content-Type: application/json
```

```json
{
  "role": "developer"
}
```

合法角色值：`viewer` | `developer` | `owner`

**响应**

**200 OK**

```json
{ "ok": true }
```

**403 Forbidden** — 权限不足（非 owner）

**404 Not Found** — 用户或租户不存在
