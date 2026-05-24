# 端口暴露 — preview URL 完整模型

平台让 sandbox 内的任何 HTTP 服务器(dev server / API / static site)对外可
访问,不需要 nginx 配置、不需要申请域名、不需要 SSH 隧道。一行 `sb.expose(port)`
就有一个公网可访问的 URL。

本页讲完整模型:URL 长什么样、端口怎么被认领、签名 URL 怎么用、子域怎
么自定义。

## 一行起步

::: code-group

```python [Python]
from talon_sandbox import Sandbox

async with Sandbox.create(image="node:20-bookworm", network="allowlist") as sb:
    await sb.spawn("npm run dev")
    print(await sb.expose(5173))
# → https://sb-abc1d234-5173.preview.talon-sandbox.dev
```

```typescript [TypeScript]
import { Sandbox } from "talon-sandbox";

await using sb = await Sandbox.create({ image: "node:20-bookworm", network: "allowlist" });
await sb.spawn("npm run dev");
console.log(await sb.expose(5173));
```

```go [Go]
sb, _ := sandbox.Create(ctx, sandbox.Opts{Image: "node:20-bookworm", Network: "allowlist"})
defer sb.Kill(ctx)
sb.Spawn(ctx, "npm run dev")
url, _ := sb.Expose(ctx, 5173)
fmt.Println(url)
```

```csharp [.NET]
using TalonSandbox;
await using var sb = await Sandbox.CreateAsync(new() {
    Image = "node:20-bookworm", Network = "allowlist"
});
await sb.SpawnAsync("npm run dev");
Console.WriteLine(await sb.ExposeAsync(5173));
```

```bash [curl]
curl -fsS -X POST $BASE/v1/sandboxes/$SBX/expose \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"port": 5173}' | jq -r .url
```

:::

## URL 长什么样

默认格式:

```
https://sb-{shortid}-{port}.preview.{your-domain}
```

- `{shortid}` — sandbox id 前 8 位(短化避免 URL 过长)
- `{port}` — sandbox 内监听端口
- `{your-domain}` — 自部署时配的 preview 域,默认 `talon-sandbox.dev`

例:`https://sb-abc1d234-5173.preview.talon-sandbox.dev`

支持自定义子域:

```python
url = await sb.expose(5173, subdomain="my-demo")
# → https://my-demo-5173.preview.talon-sandbox.dev
```

冲突时 SDK 返 `ConflictError`(HTTP 409)——可自行加随机后缀重试。

## 两种端口来源

平台同时支持两种端口认领,你不用选,都通:

### 1. Dynamic discovery(默认开)

sandbox 内 sidecar 监听 LISTEN socket 变化,任何进程绑 `0.0.0.0:N` 自动
认领并生成 preview URL。无需 SDK 调用,**零配置**:

```python
sb = await Sandbox.create(...)
await sb.spawn("npm run dev")    # vite 默认 5173
# 不调 sb.expose() 也能访问:
urls = await sb.exposed()        # 含 5173,source="dynamic"
```

适合 vibe coding:你不知道项目用什么端口,跑起来再说。

### 2. Explicit expose(白名单)

`sb.expose(port)` 显式注册端口,**不要求进程已经在 listen**——DNAT 提前
准备,进程一启动立刻通:

```python
await sb.expose(5173)            # 准备好
await sb.spawn("npm run dev")    # 一启动就能访问
```

适合 CI / 脚本场景:启动顺序确定,提前 expose 避免 race。

### 准入策略

`expose` 列表 = dynamic ∪ explicit,任一命中即放行。

| 进程 listen | 显式 expose | 结果 |
|---|---|---|
| 是 | 是 | 通(走 explicit 准入 + dynamic 端口翻译) |
| 是 | 否 | 通(dynamic) |
| 否 | 是 | DNAT 准备好,但进程没 listen → 后端 502 |
| 否 | 否 | 403(不在准入列表) |

## 签名 URL(分享给第三方)

默认 preview URL 受平台鉴权保护——浏览器需要 cookie + CSRF 才能访问。
但分享 demo 给同事 / 客户 / 老板时不想给他们账号,用签名 URL:

```python
url = await sb.expose(5173, sign=True, ttl="1h")
# → https://sb-abc1-5173.preview.talon-sandbox.dev/?token=eyJ...
# 任何人持这个 URL 都能直接访问,1 小时后过期
```

签名 URL 的安全性:

- token 绑定 `(sandbox_id, port)`,跨 sandbox / 跨 port 访问拒
- TTL 默认 3600s,上限 86400s(一天)
- token 走 query string(`?token=`),不能用 `Authorization` header(浏览器
  分享场景拿不到 header)
- preview handler 验签通过后从 URL 剥除 `?token=`,**不会泄露给后端
  sandbox**(后端日志看不到 token)
- 不能用 token 调控制面 API(只能进 preview 流量)
- TTL 到期自动失效;要立即失效就 `kill` sandbox

详见 [Signed Preview URL](./signed-preview)。

## 自部署:wildcard DNS + cert

preview URL 用 wildcard 子域,自部署需要:

1. **wildcard DNS 记录**:`*.preview.your-domain.com → 你的反代 IP`
2. **wildcard TLS 证书**:Let's Encrypt 的 DNS-01 challenge 能签
   `*.preview.your-domain.com`,Caddy / nginx-proxy 自动续签

详见 [反向代理配置](../deploy/reverse-proxy)。

单域名部署(没有 wildcard)时 fallback 用 path-prefix 模式:
`https://api.your-domain.com/v1/sandboxes/{sb_id}/preview/{port}/`。

## 取消暴露 / 列表

```python
# 列所有(含 dynamic + explicit)
ports = await sb.exposed()
# [ExposedPort(port=5173, url="...", signed=False, source="explicit"),
#  ExposedPort(port=3000, url="...", signed=False, source="dynamic")]

# 取消(只能取消 explicit;dynamic 跟着进程退出自动清)
await sb.unexpose(5173)
```

## 限制

- 每 sandbox 最多 16 个并发暴露端口(默认,管理员可配)
- 端口范围 1-65535,但 1-1024 通常没意义(sandbox 内进程 cap drop)
- `subdomain` 字符集 `[a-z0-9-]{1,40}`,跨 sandbox 全局唯一性是 best-effort
  (短随机 id 撞概率极低,自定义 subdomain 冲突返 409)
- WebSocket 升级走同一个 URL,Origin 校验同 path-prefix preview
- TLS 由反代终结,sandbox 内进程 listen HTTP 即可

## 关联

- [Sandbox 生命周期](./sandbox-lifecycle)
- [签名 Preview URL](./signed-preview)
- [反向代理配置(wildcard cert)](../deploy/reverse-proxy)
- 完整 API:[POST /v1/sandboxes/{id}/expose](../api/spec)
