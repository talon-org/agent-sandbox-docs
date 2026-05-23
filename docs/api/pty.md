# PTY API

PTY（伪终端）提供交互式 shell 访问，通过 WebSocket 协议实现。支持全程录像，可事后 replay 审计每一个终端操作。

## GET `/v1/sandboxes/`{id}/pty {#get-sandboxes}

WebSocket 升级端点。连接后得到一个交互式 bash shell。

**需要 `developer` 角色**，sandbox 必须处于 `running` 状态。

```
WS(S) /v1/sandboxes/{id}/pty?rows=40&cols=200
Authorization: Bearer ask_X_...
```

### 查询参数

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `rows` | int | 24 | 终端行数 |
| `cols` | int | 80 | 终端列数 |

### 连接认证

WebSocket 升级请求需要携带认证信息，支持两种方式：

1. **HTTP Header**（推荐）：`Authorization: Bearer ask_X_...`
2. **Cookie**：浏览器 session cookie（Web 控制台使用）

### 消息格式

连接建立后，双向发送原始字节流：

- **客户端 → 服务端**：键盘输入（原始字节，包括控制字符如 `\r`、`\x03` 等）
- **服务端 → 客户端**：终端输出（带 ANSI 转义序列的字节流）

这是标准 VT100 终端协议，可以直接接入 `xterm.js` 等终端库渲染。

### TypeScript 示例

```typescript
import WebSocket from 'ws';

const SBX_ID = 'sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx';
const API_KEY = 'ask_X_your_api_key_here';

const ws = new WebSocket(
  `ws://localhost:18080/v1/sandboxes/${SBX_ID}/pty?rows=40&cols=200`,
  {
    headers: { Authorization: `Bearer ${API_KEY}` },
  }
);

ws.on('open', () => {
  console.log('PTY connected');

  // 发送命令（回车结尾）
  ws.send('ls -la /workspace\n');

  // 发送 Ctrl+C
  // ws.send('\x03');

  // 5 秒后关闭
  setTimeout(() => ws.close(), 5000);
});

ws.on('message', (data: Buffer) => {
  // 直接写到 stdout（带 ANSI 颜色等）
  process.stdout.write(data.toString('utf8'));
});

ws.on('close', (code, reason) => {
  console.log(`\nPTY closed: ${code} ${reason}`);
});

ws.on('error', err => {
  console.error('PTY error:', err);
});
```

### 与 xterm.js 集成（浏览器）

```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

const term = new Terminal({ theme: { background: '#1a1b26' } });
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal')!);
fitAddon.fit();

const ws = new WebSocket(
  `wss://api.example.com/v1/sandboxes/${sbxId}/pty?rows=${term.rows}&cols=${term.cols}`,
  // cookie 已自动携带，无需 headers
);

ws.binaryType = 'arraybuffer';

ws.onopen = () => {
  term.onData(data => ws.send(data));
};

ws.onmessage = ({ data }) => {
  term.write(typeof data === 'string' ? data : new Uint8Array(data));
};

ws.onclose = () => {
  term.write('\r\n\x1b[31mConnection closed\x1b[0m\r\n');
};

// 终端大小变化时通知服务器（目前通过重新连接实现）
window.addEventListener('resize', () => {
  fitAddon.fit();
});
```

---

## PTY 录像

所有 PTY 会话自动录像，以 [asciinema](https://asciinema.org/) 格式存储。

### GET `/v1/sandboxes/`{id}/recordings {#get-sandboxes-2}

列出 sandbox 的所有录像文件。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/recordings
Authorization: Bearer ask_X_...
```

**200 OK**

```json
{
  "recordings": [
    "rec_20260524_030000_abc123.cast",
    "rec_20260524_031500_def456.cast"
  ]
}
```

---

### GET `/v1/sandboxes/`{id}/recordings/{rec} {#get-sandboxes-3}

下载单个录像文件（asciinema `.cast` 格式）。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/recordings/{rec}
Authorization: Bearer ask_X_...
```

**200 OK** — 响应体是 asciinema v2 格式文件（`application/octet-stream`）

```json
{"version": 2, "width": 200, "height": 40, "timestamp": 1716480000}
[0.1, "o", "$ "]
[0.5, "o", "ls -la\r\n"]
...
```

可以用 `asciinema play` 命令播放，或接入 [asciinema-player](https://github.com/asciinema/asciinema-player) 在浏览器中渲染。

---

## 连接生命周期

| 事件 | 说明 |
|---|---|
| 连接建立 | PTY 创建，bash 进程启动 |
| 客户端断开 | PTY 收到 EOF，bash 收到 SIGHUP |
| sandbox pause | PTY 连接会被服务器关闭（code 1001），需要重连 |
| sandbox stop/destroy | PTY 连接关闭（code 1001） |

::: tip gRPC 取消映射
服务端收到 gRPC `Canceled` 状态码时，会映射为正常的 WebSocket 关闭（1000），而不是错误关闭（1006）。这意味着 sandbox 操作（如 pause）引起的 PTY 断开是正常关闭，客户端应该提示用户"会话已暂停，可以 resume 后重连"而不是显示错误。
:::
