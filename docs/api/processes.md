# Processes API

Processes 是 sandbox 内的长驻进程（如开发服务器、测试 runner、构建工具）。

与 `exec`（同步一次性命令）的区别：processes 在后台持续运行，可以监听端口提供预览 URL，并通过日志 API 读取 stdout/stderr。

## POST `/v1/sandboxes/`{id}/processes {#post-sandboxes}

在 sandbox 内启动一个长驻进程。

**需要 `developer` 角色**，sandbox 必须处于 `running` 状态。

```http
POST /v1/sandboxes/{id}/processes
Authorization: Bearer ask_X_...
Content-Type: application/json
```

### 请求体

```json
{
  "command": ["pnpm", "dev", "--host", "0.0.0.0"],
  "env": ["PORT=3000", "NODE_ENV=development"],
  "cwd": "myapp"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `command` | string[] | 是 | 命令 argv，`command[0]` 为可执行文件 |
| `env` | string[] | 否 | 额外环境变量，`KEY=value` 格式 |
| `cwd` | string | 否 | 相对 workspace 根目录的子路径；空 = workspace 根目录 |

::: tip 端口暴露已独立
v2 起，端口暴露从进程对象解耦，独立成
[POST `/v1/sandboxes/{id}/expose`](/api/sandboxes#expose) 端点（Spec 50）。
进程内任意绑 `0.0.0.0:N` 后还会被动态发现自动认领（Spec 39），不调 expose
也能列出。详见 [端口暴露](/concepts/expose-ports)。

v1 字段 `expose_ports` 在 v2.0 已**移除**——既不在请求体接受、也不在响应里返回。
:::

**响应**

**201 Created**

```json
{
  "id": "proc_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "sandbox_id": "sbx_xxx",
  "command": ["pnpm", "dev", "--host", "0.0.0.0"],
  "pid": 12345,
  "state": "running",
  "exit_code": -1,
  "started_at": 1716480000,
  "exited_at": 0
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 进程 ID（`proc_` + 24 hex） |
| `sandbox_id` | string | 所属 sandbox ID |
| `command` | string[] | 启动命令 |
| `pid` | int32 | 容器内 PID |
| `state` | string | `running` / `exited` / `killed` / `failed` |
| `exit_code` | int32 | 退出码；`-1` 表示被信号终止；进程运行中值不定 |
| `started_at` | int64 | 启动时间（Unix 秒） |
| `exited_at` | int64 | 退出时间（Unix 秒）；`0` 表示尚未退出 |

---

## GET `/v1/sandboxes/`{id}/processes {#get-sandboxes}

列出 sandbox 内所有进程（含已退出的）。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/processes
Authorization: Bearer ask_X_...
```

**响应**

**200 OK**

```json
{
  "processes": [
    {
      "id": "proc_xxx",
      "state": "running",
      "command": ["pnpm", "dev"],
      ...
    }
  ]
}
```

---

## GET `/v1/sandboxes/`{id}/processes/{proc_id}/logs {#get-sandboxes-2}

读取进程的 stdout + stderr 日志。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/processes/{proc_id}/logs
Authorization: Bearer ask_X_...
```

**响应**

**200 OK** — 响应体是纯文本（`text/plain`），进程输出内容

```
  VITE v5.2.0  ready in 312 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://0.0.0.0:3000/
```

**404 Not Found** — 进程不存在或日志文件不存在

### 日志说明

- stdout 和 stderr 合并到同一文件（`proc-<id>.log`）
- 日志文件会滚动（超过 10 MB 滚动到 `.log.1`）
- 该端点只返回最新的日志文件内容（不含 `.log.1` 历史）

---

## DELETE `/v1/sandboxes/`{id}/processes/{proc_id} {#delete-sandboxes}

停止（kill）一个进程。

**需要 `developer` 角色**

```http
DELETE /v1/sandboxes/{id}/processes/{proc_id}
Authorization: Bearer ask_X_...
```

**响应**

**204 No Content** — 进程已 kill（或已退出）

**404 Not Found** — 进程不存在

---

## 常见使用模式

### 等待服务器就绪

进程启动后服务器不一定立刻就绪。推荐 poll 日志或直接用预览 URL 测试：

```typescript
// 等待 Vite 就绪
async function waitForVite(sbxId: string, procId: string, maxWait = 30000) {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const logs = await getProcessLogs(sbxId, procId);
    if (logs.includes('ready in')) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Vite did not start in time');
}
```

### 读取退出码

```typescript
// 等待进程退出并获取退出码
async function waitForProcess(sbxId: string, procId: string) {
  while (true) {
    const res = await listProcesses(sbxId);
    const proc = res.processes.find(p => p.id === procId);
    if (!proc) throw new Error('Process not found');
    if (proc.state !== 'running') return proc;
    await new Promise(r => setTimeout(r, 500));
  }
}
```

### 运行测试并获取结果

```typescript
// 启动测试进程，等待退出，读取输出
const proc = await startProcess(sbxId, ['pnpm', 'test', '--run']);
const result = await waitForProcess(sbxId, proc.id);

if (result.exit_code !== 0) {
  const logs = await getProcessLogs(sbxId, proc.id);
  console.error('Tests failed:', logs);
}
```
