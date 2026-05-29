# 30 秒上手

下面给两种方式:**官方 SDK**(推荐,更短更安全)和 **raw curl**(看 wire
契约用)。挑顺手的复制粘贴。完整 SDK 介绍见
[SDK 第一个请求](./agent-sdk)。

## 前置

- 一个能访问的 Talon Sandbox 实例(本机 docker 部署 `http://localhost:18080`,
  或服务器自部署见 [Docker quickstart](./docker)/[systemd quickstart](./self-hosted))
- 一个 API Key,形如 `ask_X_...`(login 后生成,或 bootstrap 时打印)

```bash
export TALON_SANDBOX_SERVER=http://localhost:18080
export TALON_SANDBOX_API_KEY=ask_X_xxxxxxxxxxxxxxxx
```

## SDK 30 秒

::: code-group

```python [Python]
# pip install talon-sandbox
import asyncio
from talon_sandbox import Sandbox

async def main():
    async with Sandbox.create(
        image="alpine-3.20",
        resources={"cpu": 2, "memory": "4GiB"},
        network="allowlist",
    ) as sb:
        print((await sb.run("uname -a")).stdout)
        await sb.spawn("python3 -m http.server 8000")
        print(await sb.expose(8000))  # → http://sb-xxx-8000.preview...

asyncio.run(main())
```

```typescript [TypeScript]
// npm install talon-sandbox
import { Sandbox } from "talon-sandbox";

const sb = await Sandbox.create({
  image: "alpine-3.20",
  resources: { cpu: 2, memory: "4GiB" },
  network: "allowlist",
});

try {
  console.log((await sb.run("uname -a")).stdout);
  await sb.spawn("python3 -m http.server 8000");
  console.log(await sb.expose(8000));
} finally {
  await sb.kill();
}
```

```go [Go]
// go get github.com/talon-org/talon-sandbox-sdk-go
package main

import (
    "context"
    "fmt"
    talonsandbox "github.com/talon-org/talon-sandbox-sdk-go"
)

func main() {
    ctx := context.Background()
    sb, _ := talonsandbox.Create(ctx,
        talonsandbox.WithImage("alpine-3.20"),
        talonsandbox.WithResources(talonsandbox.Resources{CPU: 2, Memory: "4GiB"}),
        talonsandbox.WithNetwork("allowlist"),
    )
    defer sb.Kill(ctx)

    r, _ := sb.Run(ctx, "uname -a")
    fmt.Println(r.Stdout)
    sb.Spawn(ctx, "python3 -m http.server 8000")
    exposed, _ := sb.Expose(ctx, 8000)
    fmt.Println(exposed.URL)
}
```

```csharp [C#]
// dotnet add package TalonSandbox.Sdk
using TalonSandbox.Sdk;

await using var sb = await Sandbox.CreateAsync(new CreateOptions {
    Image = "alpine-3.20",
    Resources = new Resources { Cpu = 2, Memory = "4GiB" },
    Network = "allowlist",
});

Console.WriteLine((await sb.RunAsync("uname -a")).Stdout);
await sb.SpawnAsync("python3 -m http.server 8000");
Console.WriteLine((await sb.ExposeAsync(8000)).Url);
```

```bash [CLI]
# tsb 是 talon-sandbox 的短名
SBX=$(tsb create \
    --image alpine-3.20 \
    --resources cpu=2,memory=4GiB \
    --network allowlist \
    --wait running -o id)

tsb run $SBX "uname -a"
tsb spawn $SBX "python3 -m http.server 8000"
tsb expose $SBX 8000
tsb rm $SBX
```

:::

## raw curl

不想装任何东西、想直接看 wire 协议?用下面三步:

```bash
BASE=$TALON_SANDBOX_SERVER
KEY=$TALON_SANDBOX_API_KEY
```

### 1. 拉起

```bash
SBX=$(curl -fsS -X POST "$BASE/v1/sandboxes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "alpine-3.20",
    "resources": {"cpu": 2, "memory": "4GiB"},
    "network": "allowlist"
  }' | jq -r .id)

echo "Sandbox: $SBX"
```

`network` 三档别名:
- `"allowlist"` — 默认,只放 DNS + 配置好的白名单域(生产推荐)
- `"open"` — 全开放出口(开发调试)
- `"sealed"` — 完全隔离,只有 lo

### 2. 运行

```bash
# 同步一次 exec(短任务)
curl -fsS -X POST "$BASE/v1/sandboxes/$SBX/exec" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":["sh","-c","echo hi from sandbox && uname -a"]}' | jq .

# 长跑进程(异步,拿 PID 后查日志)
PROC=$(curl -fsS -X POST "$BASE/v1/sandboxes/$SBX/processes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command":["python3","-m","http.server","8000"],
    "cwd":"/workspace"
  }' | jq -r .id)

echo "Process: $PROC"

# 读日志
curl -fsS "$BASE/v1/sandboxes/$SBX/processes/$PROC/logs?tail=20" \
  -H "Authorization: Bearer $KEY"
```

### 3. 暴露(preview)

显式 expose 端口(v2 一等公民端点):

```bash
URL=$(curl -fsS -X POST "$BASE/v1/sandboxes/$SBX/expose" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"port": 8000}' | jq -r .url)

echo "Preview: $URL"
# → http://sb-abc1d234-8000.preview.example.com
```

签名 URL(分享给第三方,自动过期):

```bash
curl -fsS -X POST "$BASE/v1/sandboxes/$SBX/expose" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"port": 8000, "sign": true, "ttl": "1h"}' | jq -r .url
# → http://sb-abc1d234-8000.preview.example.com/?token=eyJ...
```

也支持**动态端口发现**——sandbox 内任意进程绑 `0.0.0.0:N` 后平台自动认领,
不调 expose 端点也能访问。explicit 和 dynamic 两种 source 一起列:

```bash
curl -fsS "$BASE/v1/sandboxes/$SBX/expose" \
  -H "Authorization: Bearer $KEY" | jq .
# {"ports": [
#   {"port":8000, "url":"...", "source":"explicit", "signed":false},
#   {"port":3000, "url":"...", "source":"dynamic", "signed":false}
# ]}
```

详见 [概念:端口暴露](../concepts/expose-ports)。

## 收尾

```bash
curl -fsS -X DELETE "$BASE/v1/sandboxes/$SBX" \
  -H "Authorization: Bearer $KEY"
```

## 鉴权三选一

curl 同时支持三种鉴权方式,本页用了最简单的 Bearer + API key。

| 方式 | 适合 |
|---|---|
| `Authorization: Bearer ask_X_...`(API key) | 脚本 / CI / 后端服务 |
| `Authorization: Bearer <jwt>`(短期 token) | 接入到现有 SSO |
| `Cookie: sandbox_auth=...` + `X-CSRF-Token: ...` | 浏览器 / SPA(console 走这个) |

详细见 [API 参考 — 认证](../api/auth)。

## 错误处理

约定:

- `2xx` 成功;`3xx` 不会出现
- `4xx` 客户端错(请求 / 参数 / 鉴权 / 资源不存在)
- `5xx` 服务端错

错误体统一:

```json
{
  "error": {
    "code": "sandbox_not_found",
    "message": "sandbox sbx_xxx not found",
    "request_id": "req_..."
  }
}
```

把 `request_id` 报给运维方便定位。全部错误码:[API 参考 — 错误码](../api/errors)。

## CLI 备选

不想拼 curl?用 `talon-sandbox` / `tsb`(短名),
仓库:[talon-sandbox-cli](https://github.com/talon-org/talon-sandbox-cli):

```bash
# 一行起跑 + 暴露:
SBX=$(tsb create --image alpine-3.20 --resources cpu=2,memory=4GiB --network allowlist --wait running -o id)
tsb spawn $SBX "python3 -m http.server 8000"
tsb expose $SBX 8000

# 或一气呵成:
tsb create --image alpine-3.20 --resources cpu=2,memory=4GiB --network allowlist \
  --spawn "python3 -m http.server 8000" --expose 8000 --print-url
```

## 完整 API

- 完整 endpoint + schema:[OpenAPI 规格](../api/spec)
- 按主题浏览:[API 参考](../api/)
