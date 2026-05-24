# Agent SDK — 第一个请求

本文展示如何用 curl、TypeScript 和 Python 接入 Agent Sandbox Platform，完成以下完整流程：

1. 创建 sandbox
2. 启动 sandbox
3. 启动一个进程（如 `pnpm dev`）
4. 读取进程日志
5. 销毁 sandbox

::: tip 官方 SDK(v2,talon-sandbox)
四语言 SDK + CLI 已发布,推荐直接用,比 raw HTTP 更短更安全:

| 语言 | 安装 | 仓库 |
|---|---|---|
| Python | `pip install talon-sandbox` | [talon-sandbox-sdk-python](http://x.xgit.pro/dark/talon-sandbox-sdk-python) |
| TypeScript | `npm install talon-sandbox` | [talon-sandbox-sdk-typescript](http://x.xgit.pro/dark/talon-sandbox-sdk-typescript) |
| Go | `go get x.xgit.pro/dark/talon-sandbox-sdk-go` | [talon-sandbox-sdk-go](http://x.xgit.pro/dark/talon-sandbox-sdk-go) |
| .NET | `dotnet add package TalonSandbox.Sdk` | [talon-sandbox-sdk-dotnet](http://x.xgit.pro/dark/talon-sandbox-sdk-dotnet) |
| CLI | `brew install talon-sandbox`(规划) | [talon-sandbox-cli](http://x.xgit.pro/dark/talon-sandbox-cli) |

下面示例 Python / TS 代码段用 raw `httpx` / `fetch` 帮你理解 HTTP 契约;
**实际项目用 SDK 更短**,例如:

```python
from talon_sandbox import Sandbox
async with Sandbox.create(image="alpine-3.20", network="allowlist") as sb:
    await sb.spawn("python3 -m http.server 8000")
    print(await sb.expose(8000))
```

v1 SDK(`agent-sandbox`)已废弃,见
[v1→v2 迁移指南](http://x.xgit.pro/dark/agent-sandbox-platform/src/branch/main/docs/migration/v1-to-v2-sdk.md)。
:::

## 前置条件

你已经有一个运行中的 Agent Sandbox Platform（[Docker 版](/quickstart/docker) 或 [服务器版](/quickstart/self-hosted)），并拿到了 API Key（形如 `ask_X_...`）。

## 基础概念

- **Sandbox**：一个隔离的运行环境，有独立的文件系统、网络和进程空间
- **Process**：sandbox 内的长驻进程（如开发服务器）
- **PTY**：交互式终端（WebSocket 连接）
- **Preview URL**：sandbox 内进程对外暴露的 URL

## 示例：创建 sandbox → 运行进程 → 查看日志 → 销毁

::: code-group

```bash [curl]
# ============================================================
# 配置
# ============================================================
BASE_URL="http://localhost:18080"
API_KEY="ask_X_your_api_key_here"

# ============================================================
# 1. 创建 sandbox
# ============================================================
SANDBOX=$(curl -s -X POST "$BASE_URL/v1/sandboxes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "profile": "code-lite",
    "cpu_millis": 1000,
    "memory_bytes": 536870912,
    "idle_timeout_seconds": 300
  }')

SBX_ID=$(echo $SANDBOX | jq -r '.id')
echo "Created sandbox: $SBX_ID"
# → Created sandbox: sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================================================
# 2. 启动 sandbox
# ============================================================
curl -s -X POST "$BASE_URL/v1/sandboxes/$SBX_ID/start" \
  -H "Authorization: Bearer $API_KEY" | jq .
# → {"id":"sbx_xxx","state":"running",...}

# ============================================================
# 3. 在 sandbox 里执行一次性命令
# ============================================================
curl -s -X POST "$BASE_URL/v1/sandboxes/$SBX_ID/exec" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": ["node", "--version"]}' | jq .
# → {"stdout":"v20.11.0\n","stderr":"","exit_code":0}

# ============================================================
# 4. 启动长驻进程（如 HTTP 服务器）
# ============================================================
PROCESS=$(curl -s -X POST "$BASE_URL/v1/sandboxes/$SBX_ID/processes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "command": ["python3", "-m", "http.server", "8000"],
    "cwd": "/workspace",
    "expose_ports": [8000]
  }')

PROC_ID=$(echo $PROCESS | jq -r '.id')
echo "Started process: $PROC_ID"

# ============================================================
# 5. 等一秒让服务器启动，然后读日志
# ============================================================
sleep 1

curl -s "$BASE_URL/v1/sandboxes/$SBX_ID/processes/$PROC_ID/logs" \
  -H "Authorization: Bearer $API_KEY"
# → "Serving HTTP on 0.0.0.0 port 8000 ..."

# ============================================================
# 6. 访问 preview URL
# ============================================================
# path-prefix 模式（默认）：
# http://localhost:18080/v1/sandboxes/<sbx_id>/preview/8000/

# ============================================================
# 7. 停止进程
# ============================================================
curl -s -X DELETE "$BASE_URL/v1/sandboxes/$SBX_ID/processes/$PROC_ID" \
  -H "Authorization: Bearer $API_KEY"

# ============================================================
# 8. 销毁 sandbox
# ============================================================
curl -s -X DELETE "$BASE_URL/v1/sandboxes/$SBX_ID" \
  -H "Authorization: Bearer $API_KEY"
echo "Sandbox destroyed"
```

```typescript [TypeScript]
// pnpm add node-fetch  （Node 18+ 内置 fetch，无需安装）

const BASE_URL = 'http://localhost:18080';
const API_KEY = 'ask_X_your_api_key_here';

const headers = {
  'Authorization': `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

// ============================================================
// 类型定义
// ============================================================
interface Sandbox {
  id: string;
  state: 'created' | 'running' | 'stopped' | 'paused' | 'destroyed' | 'failed' | 'lost';
  profile: string;
  cpu_millis?: number;
  memory_bytes?: number;
}

interface Process {
  id: string;
  sandbox_id: string;
  command: string[];
  pid: number;
  state: 'running' | 'exited' | 'killed' | 'failed';
  exit_code: number;
  expose_ports?: number[];
  host_ports?: Record<number, number>;
}

// ============================================================
// 1. 创建 sandbox
// ============================================================
async function createSandbox(): Promise<Sandbox> {
  const res = await fetch(`${BASE_URL}/v1/sandboxes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      profile: 'code-lite',
      cpu_millis: 1000,
      memory_bytes: 512 * 1024 * 1024,  // 512 MB
      idle_timeout_seconds: 300,          // 5 分钟无操作自动 pause
    }),
  });
  if (!res.ok) throw new Error(`Create sandbox failed: ${await res.text()}`);
  return res.json();
}

// ============================================================
// 2. 启动 sandbox
// ============================================================
async function startSandbox(id: string): Promise<Sandbox> {
  const res = await fetch(`${BASE_URL}/v1/sandboxes/${id}/start`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Start sandbox failed: ${await res.text()}`);
  return res.json();
}

// ============================================================
// 3. 执行一次性命令
// ============================================================
async function exec(id: string, command: string[]) {
  const res = await fetch(`${BASE_URL}/v1/sandboxes/${id}/exec`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error(`Exec failed: ${await res.text()}`);
  return res.json() as Promise<{ stdout: string; stderr: string; exit_code: number }>;
}

// ============================================================
// 4. 启动长驻进程
// ============================================================
async function startProcess(sandboxId: string, command: string[], ports: number[] = []): Promise<Process> {
  const res = await fetch(`${BASE_URL}/v1/sandboxes/${sandboxId}/processes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      command,
      cwd: '/workspace',
      expose_ports: ports,
    }),
  });
  if (!res.ok) throw new Error(`Start process failed: ${await res.text()}`);
  return res.json();
}

// ============================================================
// 5. 读取进程日志
// ============================================================
async function getProcessLogs(sandboxId: string, processId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}/v1/sandboxes/${sandboxId}/processes/${processId}/logs`,
    { headers },
  );
  if (!res.ok) throw new Error(`Get logs failed: ${await res.text()}`);
  return res.text();
}

// ============================================================
// 6. 销毁 sandbox
// ============================================================
async function destroySandbox(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v1/sandboxes/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Destroy sandbox failed: ${await res.text()}`);
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('Creating sandbox...');
  const sandbox = await createSandbox();
  console.log(`Sandbox created: ${sandbox.id}`);

  console.log('Starting sandbox...');
  await startSandbox(sandbox.id);
  console.log('Sandbox running');

  console.log('Running node --version...');
  const result = await exec(sandbox.id, ['node', '--version']);
  console.log('node version:', result.stdout.trim());

  console.log('Starting HTTP server...');
  const process = await startProcess(sandbox.id, ['python3', '-m', 'http.server', '8000'], [8000]);
  console.log(`Process started: ${process.id}`);

  // 等待服务器启动
  await new Promise(resolve => setTimeout(resolve, 1000));

  const logs = await getProcessLogs(sandbox.id, process.id);
  console.log('Process logs:', logs);

  // Preview URL（path-prefix 模式）
  const previewUrl = `${BASE_URL}/v1/sandboxes/${sandbox.id}/preview/8000/`;
  console.log('Preview URL:', previewUrl);

  console.log('Destroying sandbox...');
  await destroySandbox(sandbox.id);
  console.log('Done');
}

main().catch(console.error);
```

```python [Python]
import time
import httpx  # pip install httpx

BASE_URL = "http://localhost:18080"
API_KEY = "ask_X_your_api_key_here"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

client = httpx.Client(base_url=BASE_URL, headers=headers, timeout=30.0)

# ============================================================
# 1. 创建 sandbox
# ============================================================
print("Creating sandbox...")
res = client.post("/v1/sandboxes", json={
    "profile": "code-lite",
    "cpu_millis": 1000,
    "memory_bytes": 512 * 1024 * 1024,  # 512 MB
    "idle_timeout_seconds": 300,
})
res.raise_for_status()
sandbox = res.json()
sbx_id = sandbox["id"]
print(f"Sandbox created: {sbx_id}")

# ============================================================
# 2. 启动 sandbox
# ============================================================
print("Starting sandbox...")
res = client.post(f"/v1/sandboxes/{sbx_id}/start")
res.raise_for_status()
print(f"State: {res.json()['state']}")

# ============================================================
# 3. 执行一次性命令
# ============================================================
print("Running python3 --version...")
res = client.post(f"/v1/sandboxes/{sbx_id}/exec", json={
    "command": ["python3", "--version"]
})
res.raise_for_status()
result = res.json()
print(f"stdout: {result['stdout'].strip()}")
print(f"exit_code: {result['exit_code']}")

# ============================================================
# 4. 写入文件
# ============================================================
print("Writing a file...")
content = b"print('Hello from sandbox!')\n"
res = client.put(
    f"/v1/sandboxes/{sbx_id}/fs/workspace/hello.py",
    content=content,
    headers={**headers, "Content-Type": "application/octet-stream"},
)
res.raise_for_status()
print("File written")

# ============================================================
# 5. 启动长驻进程
# ============================================================
print("Starting HTTP server...")
res = client.post(f"/v1/sandboxes/{sbx_id}/processes", json={
    "command": ["python3", "-m", "http.server", "8000"],
    "cwd": "/workspace",
    "expose_ports": [8000],
})
res.raise_for_status()
process = res.json()
proc_id = process["id"]
print(f"Process started: {proc_id} (pid={process['pid']})")

# ============================================================
# 6. 等待启动 + 读日志
# ============================================================
time.sleep(1)

res = client.get(f"/v1/sandboxes/{sbx_id}/processes/{proc_id}/logs")
res.raise_for_status()
print(f"Logs:\n{res.text}")

# Preview URL
preview_url = f"{BASE_URL}/v1/sandboxes/{sbx_id}/preview/8000/"
print(f"Preview URL: {preview_url}")

# ============================================================
# 7. 列出进程
# ============================================================
res = client.get(f"/v1/sandboxes/{sbx_id}/processes")
res.raise_for_status()
print(f"Processes: {[p['id'] for p in res.json()['processes']]}")

# ============================================================
# 8. 销毁 sandbox
# ============================================================
print("Destroying sandbox...")
res = client.delete(f"/v1/sandboxes/{sbx_id}")
res.raise_for_status()
print("Done")
```

:::

## 使用 PTY（交互式终端）

PTY 通过 WebSocket 连接。以下是 TypeScript 示例（使用 `ws` 库）：

```typescript
// pnpm add ws @types/ws
import WebSocket from 'ws';

const SBX_ID = 'sbx_xxx';
const BASE_URL = 'ws://localhost:18080';
const API_KEY = 'ask_X_your_api_key_here';

// 连接 PTY（终端尺寸可选）
const ws = new WebSocket(
  `${BASE_URL}/v1/sandboxes/${SBX_ID}/pty?rows=40&cols=200`,
  { headers: { Authorization: `Bearer ${API_KEY}` } }
);

ws.on('open', () => {
  console.log('PTY connected');
  // 发送命令
  ws.send('ls -la /workspace\n');
});

ws.on('message', (data: Buffer) => {
  // 输出是原始终端字节流（ANSI 转义序列等）
  process.stdout.write(data.toString());
});

ws.on('close', () => console.log('PTY disconnected'));
```

## 常见使用模式

### 上传文件到 sandbox

```bash
# 上传本地文件
curl -s -X PUT "$BASE_URL/v1/sandboxes/$SBX_ID/fs/workspace/app.py" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./app.py

# 列目录
curl -s "$BASE_URL/v1/sandboxes/$SBX_ID/fs-list/workspace" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

### Sandbox pause / resume

```bash
# pause（冻结进程，内存保留）
curl -s -X POST "$BASE_URL/v1/sandboxes/$SBX_ID/pause" \
  -H "Authorization: Bearer $API_KEY"

# resume（从冻结状态恢复，毫秒级）
curl -s -X POST "$BASE_URL/v1/sandboxes/$SBX_ID/resume" \
  -H "Authorization: Bearer $API_KEY"
```

## 下一步

- [API 参考 — Sandboxes](/api/sandboxes) — 完整的 CRUD 和状态操作
- [API 参考 — Processes](/api/processes) — 进程管理和日志
- [API 参考 — PTY](/api/pty) — WebSocket PTY 协议详情
- [Sandbox 生命周期](/concepts/sandbox-lifecycle) — 理解状态机
