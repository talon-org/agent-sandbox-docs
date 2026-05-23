# 错误码参考

所有错误响应使用统一格式：

```json
{ "error": "<error message>" }
```

## HTTP 状态码映射

| HTTP 状态码 | 含义 | 常见场景 |
|---|---|---|
| `400 Bad Request` | 请求参数错误 | 非法 `network_policy` 值、负数 quota |
| `401 Unauthorized` | 未认证 | 缺少 Authorization header、token 已过期 |
| `403 Forbidden` | 权限不足 | viewer 尝试写操作、非 owner 修改角色 |
| `404 Not Found` | 资源不存在 | sandbox / process / secret / image 不存在 |
| `409 Conflict` | 状态冲突 | 非法状态转换（如 stop 一个 created sandbox） |
| `412 Precondition Failed` | 前置条件不满足 | Chromium 未安装、worker fenced |
| `429 Too Many Requests` | 速率限制 | 登录接口暴力破解防护 |
| `503 Service Unavailable` | 服务依赖未注入 | AuditStore / ImageStore 为 nil |

## 错误消息对照表

### 认证 / 授权

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `auth: unauthorized` | 401 | token 无效、已过期或不存在 |
| `auth: tenant not found` | 401 | token 对应的租户不存在 |
| `auth: user not found` | 404 | 用户不存在 |
| `auth: api key not found` | 401 | API Key 不存在或已 revoke |
| `auth: ambiguous username across tenants` | 400 | 用户名在多个租户下存在（不应发生，保守处理） |

### Sandbox

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `sandbox: not found` | 404 | 指定 sandbox 不存在（或已删除） |
| `sandbox: invalid state transition` | 409 | 请求的操作在当前状态下不合法 |

**状态转换错误示例：**

| 当前状态 | 操作 | 错误 |
|---|---|---|
| `created` | `stop` | 409 invalid state transition |
| `stopped` | `resume` | 409 invalid state transition |
| `lost` | `start` | 409 invalid state transition |
| `destroyed` | 任何 | 404 not found |
| `paused` | `stop` | 409 invalid state transition |

### Process

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `process: not found` | 404 | 进程不存在 |

### Worker

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `worker: not found` | 404 | worker 节点不在注册表 |
| `worker: no live worker available` | 503 | 没有任何活跃 worker（全部离线） |
| `worker: all live workers at capacity` | 503 | 有 worker 但全部满载（`current >= max`） |
| `worker: fenced by newer generation` | 412 | worker 的 generation 已被更新的 worker 取代 |

::: tip no live worker vs all workers at capacity
- `no live worker`：部署问题，检查 worker 服务是否在运行
- `all workers at capacity`：容量问题，考虑增加 worker 节点或提高 `SANDBOX_MAX_SANDBOXES` 配置
:::

### Image

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `image: not found` | 404 | 指定 image_id 不存在 |

### Secret

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `secret: not found` | 404 | secret 不存在或已 revoke |
| `secret: name already exists for tenant` | 409 | 同一租户下已有同名 secret |

### Browser

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `browser: chromium not installed in sandbox` | 412 | sandbox 内未安装 Chromium（需要 code-browser image） |
| `browser: not running` | 404 | Chromium 进程未运行（先调 POST /browser 启动） |
| `browser: CDP endpoint did not become ready` | 504 | Chromium 启动超时，CDP `/json/version` 未就绪 |

### Recording

| 错误消息 | HTTP | 说明 |
|---|---|---|
| `recording: not found` | 404 | 录像文件不存在 |

---

## 客户端错误处理建议

```typescript
async function apiCall(url: string, options: RequestInit) {
  const res = await fetch(url, options);

  if (res.ok) return res;

  const body = await res.json().catch(() => ({ error: res.statusText }));
  const message = body.error || 'Unknown error';

  switch (res.status) {
    case 401:
      // 重新认证 / 刷新 token
      throw new AuthError(message);

    case 404:
      // 资源已删除或不存在，不重试
      throw new NotFoundError(message);

    case 409:
      if (message.includes('invalid state transition')) {
        // 轮询 sandbox 状态后重试
        throw new StateConflictError(message);
      }
      throw new ConflictError(message);

    case 503:
      if (message.includes('at capacity')) {
        // 等待后重试（指数退避）
        throw new CapacityError(message);
      }
      throw new ServiceUnavailableError(message);

    default:
      throw new APIError(res.status, message);
  }
}
```
