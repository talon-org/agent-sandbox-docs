# 签名 Preview URL

签名 preview URL 让你把 sandbox 里跑起来的应用分享给任何人——对方不需要账号、
不需要 API key。链接在指定的 TTL 内可用,到期自动失效。

## 适用场景

你在 vibe-coding,想把跑起来的效果发给同事看一下。

不用签名 URL 的话,你要么把自己的 API key 给对方,要么给对方建临时账号。用签名
preview URL 你只要 issue 一个 token,它:

- 只对一个 sandbox 的一个端口生效
- 有时效(默认 1 小时,最多 24 小时)
- preview 代理直接放行,不需要其他鉴权

## 拿一个 token

::: tip SDK 一行搞定
直接用 `sb.expose(port, sign=True, ttl="1h")` 拿到带 token 的 URL,详见
[端口暴露](/concepts/expose-ports)。下面的 `/preview-token` 端点是底层 wire
接口,SDK 不能用的场景再直接调。
:::

```http
POST /v1/sandboxes/{id}/preview-token
Authorization: Bearer <你的 API key 或 JWT>
Content-Type: application/json

{
  "port": 5173,
  "ttl_seconds": 3600
}
```

响应:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-05-24T15:04:05Z"
}
```

**权限要求:** 需要 developer 或 owner 角色。viewer 不能签 token——避免只读用户
把 preview 访问权扩散到自己角色之外。

## 分享 preview URL

把 `?token=<值>` 拼到 preview URL 后面分享出去:

```
https://api.example.com/v1/sandboxes/sbx_xxx/preview/5173/?token=eyJ...
```

或者用 subdomain 模式(需要配置 wildcard DNS):

```
https://sbx_xxx-5173.preview.example.com/?token=eyJ...
```

对方浏览器打开就能用。不用登录,不需要账号。

## TTL 和过期

| 参数 | 默认 | 上限 |
|---|---|---|
| `ttl_seconds` | 3 600(1 小时) | 86 400(24 小时) |

超过上限会被静默裁到 86 400。

TTL 过期后 token 被 401 拒绝。需要继续分享就重新签一个。

## 安全属性

| 属性 | 说明 |
|---|---|
| sandbox 隔离 | token 在密码学上绑定 `sandbox_id`,无法访问其他 sandbox |
| 端口隔离 | token 绑定签发时指定的端口 |
| 控制面隔离 | preview token 只能调 preview 代理,不能调任何其他 API |
| token 剥离 | `?token=` 参数在转发给后端 app 之前会被剥掉,不会出现在 sandbox app 自己的日志里 |
| 过期 | token 凭 `exp` claim 过期,无需服务端状态 |
| 不支持单独吊销 | token 在过期前无法主动吊销,敏感场景用短 TTL |
| 不走 cookie、无 CSRF | token 只走 query string,不会写 cookie |

## Subdomain 模式

subdomain 中间件会把 `Host: sbx-5173.preview.example.com` 重写成等价的
path-prefix URL,然后才进鉴权,所以 `?token=` 在 query string 里被原样保留,handler
能拿到。

## access log 注意事项

`?token=` 会出现在 URL 里。sandbox-api 的日志中间件只记 `URL.Path`(不记
query string),所以 token 不会出现在 sandbox-api 自己的 access log 里。但是:

- TLS 终结点 / 上游负载均衡器**可能**记录完整 URL。分享长 TTL 的 token 前请确认
  你的基础设施日志策略。
- 用短 TTL 限制 URL 被意外记录后的影响面。

## curl 示例

```bash
# 签一个 token
TOKEN=$(curl -s -X POST https://api.example.com/v1/sandboxes/sbx_xxx/preview-token \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"port": 5173, "ttl_seconds": 3600}' | jq -r .token)

# 用 token(不需要 auth header)
curl "https://api.example.com/v1/sandboxes/sbx_xxx/preview/5173/?token=$TOKEN"
```

## 相关

- [Sandbox 生命周期](sandbox-lifecycle.md)
- [Sandboxes API 参考](../api/sandboxes.md)
