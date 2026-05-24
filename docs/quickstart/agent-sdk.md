# SDK 第一个请求

四语言 SDK(talon-sandbox 系列)统一表层 — 装包、写 5 行、跑起来。本页演示
完整的"创建 → 跑命令 → 暴露端口 → 销毁"流程,4 个语言并列。

## 前置

- 一个能访问的 Agent Sandbox 实例(本机 Docker:`http://localhost:18080`,
  或服务器自部署见 [Docker quickstart](./docker) / [systemd quickstart](./self-hosted))
- 一个 API Key,形如 `ask_X_...`(login 后生成,或 bootstrap 时打印)
- 网络:`network="allowlist"` 默认放 DNS + 配置好的白名单域;`"open"` 全
  开放出口;`"sealed"` 完全隔离(只有 lo)

## 安装

::: code-group

```bash [Python]
pip install talon-sandbox
```

```bash [TypeScript]
npm install talon-sandbox
```

```bash [Go]
go get x.xgit.pro/dark/talon-sandbox-sdk-go
```

```bash [.NET]
dotnet add package TalonSandbox.Sdk
```

```bash [CLI]
# Homebrew(规划中)
brew install talon-sandbox

# 源码安装(立即可用)
go install x.xgit.pro/dark/talon-sandbox-cli@latest
# 安装后两个名字都能用:talon-sandbox / tsb(短名)
```

:::

## Hero 示例 — 拉起一个 dev server 并拿到 preview URL

::: code-group

```python [Python]
import asyncio
import os
from talon_sandbox import Sandbox

async def main():
    async with Sandbox.create(
        image="node:20-bookworm",
        resources={"cpu": 2, "memory": "4GiB"},
        network="allowlist",
        timeout="30m",
        api_key=os.environ["TALON_SANDBOX_API_KEY"],
        base_url=os.environ["TALON_SANDBOX_SERVER"],
    ) as sb:
        await sb.fs.write_text("/workspace/app.py",
            "print('hello from sandbox')\n")
        result = await sb.run("python3 /workspace/app.py")
        print(result.stdout)  # → hello from sandbox

        proc = await sb.spawn("python3 -m http.server 8000")
        url = await sb.expose(8000)
        print(f"Preview: {url}")
        # → http://sb-xxx-8000.preview.example.com

        # async with 退出时自动 kill,sandbox 被销毁
        await asyncio.sleep(60)

asyncio.run(main())
```

```typescript [TypeScript]
import { Sandbox } from "talon-sandbox";

const sb = await Sandbox.create({
  image: "node:20-bookworm",
  resources: { cpu: 2, memory: "4GiB" },
  network: "allowlist",
  timeout: "30m",
  apiKey: process.env.TALON_SANDBOX_API_KEY!,
  baseUrl: process.env.TALON_SANDBOX_SERVER!,
});

try {
  await sb.fs.writeText("/workspace/app.js",
    "console.log('hello from sandbox')\n");
  const result = await sb.run("node /workspace/app.js");
  console.log(result.stdout);  // → hello from sandbox

  const proc = await sb.spawn("npx http-server -p 8000");
  const url = await sb.expose(8000);
  console.log(`Preview: ${url}`);
  // → http://sb-xxx-8000.preview.example.com

  await new Promise(r => setTimeout(r, 60_000));
} finally {
  await sb.kill();
}
```

```go [Go]
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "time"

    talonsandbox "x.xgit.pro/dark/talon-sandbox-sdk-go"
)

func main() {
    ctx := context.Background()

    sb, err := talonsandbox.Create(ctx,
        talonsandbox.WithImage("node:20-bookworm"),
        talonsandbox.WithResources(talonsandbox.Resources{CPU: 2, Memory: "4GiB"}),
        talonsandbox.WithNetwork("allowlist"),
        talonsandbox.WithTimeout("30m"),
        talonsandbox.WithAPIKey(os.Getenv("TALON_SANDBOX_API_KEY")),
        talonsandbox.WithBaseURL(os.Getenv("TALON_SANDBOX_SERVER")),
    )
    if err != nil {
        log.Fatal(err)
    }
    defer sb.Kill(ctx)

    if err := sb.Files.WriteText(ctx, "/workspace/app.js",
        "console.log('hello from sandbox')\n"); err != nil {
        log.Fatal(err)
    }

    result, err := sb.Run(ctx, "node /workspace/app.js")
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(result.Stdout)  // → hello from sandbox

    _, err = sb.Spawn(ctx, "npx http-server -p 8000")
    if err != nil {
        log.Fatal(err)
    }

    exposed, err := sb.Expose(ctx, 8000)
    if err != nil {
        log.Fatal(err)
    }
    fmt.Printf("Preview: %s\n", exposed.URL)

    time.Sleep(60 * time.Second)
}
```

```csharp [C#]
using TalonSandbox.Sdk;

await using var sb = await Sandbox.CreateAsync(new CreateOptions {
    Image = "node:20-bookworm",
    Resources = new Resources { Cpu = 2, Memory = "4GiB" },
    Network = "allowlist",
    Timeout = "30m",
    ApiKey = Environment.GetEnvironmentVariable("TALON_SANDBOX_API_KEY"),
    BaseUrl = Environment.GetEnvironmentVariable("TALON_SANDBOX_SERVER"),
});

await sb.Files.WriteTextAsync("/workspace/app.js",
    "console.log('hello from sandbox')\n");
var result = await sb.RunAsync("node /workspace/app.js");
Console.WriteLine(result.Stdout);  // → hello from sandbox

await sb.SpawnAsync("npx http-server -p 8000");
var url = await sb.ExposeAsync(8000);
Console.WriteLine($"Preview: {url.Url}");

await Task.Delay(TimeSpan.FromMinutes(1));
// await using 退出时自动 kill
```

```bash [CLI]
# 一行起跑 + 暴露:
SBX=$(tsb create \
    --image node:20-bookworm \
    --resources cpu=2,memory=4GiB \
    --network allowlist \
    --wait running \
    -o id)

tsb run $SBX "python3 -c 'print(\"hello from sandbox\")'"
tsb spawn $SBX "npx http-server -p 8000"
tsb expose $SBX 8000
# → http://sb-xxx-8000.preview.example.com

# 收尾
tsb rm $SBX
```

:::

## 设计原则

四语言 SDK 表层一致(详见
[Spec 49 — SDK v2 API 表层设计](http://x.xgit.pro/dark/agent-sandbox-platform/src/branch/main/docs/superpowers/specs/2026-05-24-sdk-v2-api-design.md))。

- **概念扁平** — `sb.run` / `sb.spawn` / `sb.expose` / `sb.fs` / `sb.terminal`,
  没有嵌套的 `sb.processes.create()` 这种 RPC 风格
- **字符串单位** — `memory="4GiB"`,`timeout="30m"`,`ttl="6h"`(不是 `memory_bytes` /
  `idle_timeout_seconds`)
- **async first-class** — 所有 IO 都是 async/await
- **资源管理** — `async with` / `await using` / `defer sb.Kill()` 自动清理
- **命名抄 unix-docker-Pitcher** — `run`(同步,unix system())/ `spawn`(异步,
  fork+exec)/ `kill`(销毁)

## 常用操作速查

### 文件系统

::: code-group

```python [Python]
await sb.fs.write_text("/workspace/main.py", "print('hi')")
text = await sb.fs.read_text("/workspace/main.py")
entries = await sb.fs.list("/workspace")
await sb.fs.remove("/workspace/old.py")
exists = await sb.fs.exists("/workspace/main.py")
```

```typescript [TypeScript]
await sb.fs.writeText("/workspace/main.py", "print('hi')");
const text = await sb.fs.readText("/workspace/main.py");
const entries = await sb.fs.list("/workspace");
await sb.fs.remove("/workspace/old.py");
const exists = await sb.fs.exists("/workspace/main.py");
```

```go [Go]
sb.Files.WriteText(ctx, "/workspace/main.py", "print('hi')")
text, _ := sb.Files.ReadText(ctx, "/workspace/main.py")
entries, _ := sb.Files.List(ctx, "/workspace")
sb.Files.Remove(ctx, "/workspace/old.py")
exists, _ := sb.Files.Exists(ctx, "/workspace/main.py")
```

```csharp [C#]
await sb.Files.WriteTextAsync("/workspace/main.py", "print('hi')");
var text = await sb.Files.ReadTextAsync("/workspace/main.py");
var entries = await sb.Files.ListAsync("/workspace");
await sb.Files.RemoveAsync("/workspace/old.py");
var exists = await sb.Files.ExistsAsync("/workspace/main.py");
```

```bash [CLI]
echo "print('hi')" | tsb cp - $SBX:/workspace/main.py
tsb cp $SBX:/workspace/main.py ./main.py
```

:::

### 交互式终端(PTY)

::: code-group

```python [Python]
async with sb.terminal.open(cmd="/bin/bash") as pty:
    await pty.write("ls -la /workspace\n")
    async for chunk in pty:
        print(chunk, end="")
```

```typescript [TypeScript]
const pty = await sb.terminal.open({ cmd: "/bin/bash" });
pty.on("data", chunk => process.stdout.write(chunk));
await pty.write("ls -la /workspace\n");
await pty.close();
```

```go [Go]
import "x.xgit.pro/dark/talon-sandbox-sdk-go/terminal"

pty, _ := terminal.Open(ctx, sb, "/bin/bash")
defer pty.Close(ctx)
pty.Write(ctx, []byte("ls -la /workspace\n"))
// 读 pty.Output() channel 获取输出
```

```csharp [C#]
await using var pty = await sb.Terminal.OpenAsync("/bin/bash");
pty.OnData += chunk => Console.Write(chunk);
await pty.WriteAsync("ls -la /workspace\n");
```

```bash [CLI]
tsb pty $SBX --cmd /bin/bash
# 当前终端进入 raw 模式,Ctrl-D 退出
```

:::

### 端口暴露 — 签名 URL(给第三方)

::: code-group

```python [Python]
exposed = await sb.expose(8000, sign=True, ttl="1h")
print(exposed.url)
# → http://sb-xxx-8000.preview.example.com/?token=eyJ...
```

```typescript [TypeScript]
const exposed = await sb.expose(8000, { sign: true, ttl: "1h" });
console.log(exposed.url);
```

```go [Go]
exposed, _ := sb.Expose(ctx, 8000,
    talonsandbox.WithSign(true),
    talonsandbox.WithTTL("1h"))
fmt.Println(exposed.URL)
```

```csharp [C#]
var exposed = await sb.ExposeAsync(8000, new ExposeOptions {
    Sign = true, Ttl = "1h"
});
Console.WriteLine(exposed.Url);
```

```bash [CLI]
tsb expose $SBX 8000 --sign --ttl 1h
```

:::

完整 expose 模型(显式 vs 动态、签名、自定义 subdomain)见
[端口暴露](/concepts/expose-ports)。

### 暂停 / 恢复

::: code-group

```python [Python]
await sb.pause()    # 软暂停,进程冻结,workspace 保留
await sb.resume()   # 毫秒级恢复
```

```typescript [TypeScript]
await sb.pause();
await sb.resume();
```

```go [Go]
sb.Pause(ctx)
sb.Resume(ctx)
```

```csharp [C#]
await sb.PauseAsync();
await sb.ResumeAsync();
```

```bash [CLI]
tsb pause $SBX
tsb resume $SBX
```

:::

## 鉴权与配置

三种方式,SDK 默认从环境变量读:

| 环境变量 | 用途 |
|---|---|
| `TALON_SANDBOX_SERVER` | API base URL,如 `http://localhost:18080` |
| `TALON_SANDBOX_API_KEY` | API key,形如 `ask_X_...` |

`Sandbox.create()` 的 `api_key` / `base_url` 参数会覆盖环境变量。

CLI 还支持 `~/.config/talon-sandbox/config.yaml` 多 context 配置:

```bash
tsb login --server http://localhost:18080
tsb whoami
```

## 偏好 raw HTTP?

如果你想直接拼 `curl` / `fetch` 看 wire 契约,跳到
[curl 30 秒上手](./curl) — 那篇覆盖了同样的流程但全程 raw HTTP。

完整 OpenAPI 规格在 [API 参考](../api/)。

## 下一步

- [Sandbox 生命周期](../concepts/sandbox-lifecycle) — 状态机
- [端口暴露](../concepts/expose-ports) — explicit vs dynamic、签名 URL
- [签名 Preview URL](../concepts/signed-preview) — 安全模型
- [API 参考](../api/) — REST 完整接口

## v1 SDK?

v1(`agent-sandbox` / `@agent-sandbox/sdk` / `agent-sandbox-sdk-go`)已废弃,
2026-11-24 归档前只接 P0 安全 fix。30 分钟迁移指南:
[v1 → v2 SDK migration](http://x.xgit.pro/dark/agent-sandbox-platform/src/branch/main/docs/migration/v1-to-v2-sdk.md)。
