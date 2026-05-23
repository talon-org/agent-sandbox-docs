# Browser API

Browser API 提供 headless Chromium 控制能力，通过 CDP（Chrome DevTools Protocol）接口让 AI agent 操作浏览器。

每个 sandbox 有独立的 Chromium 进程和 profile，互不干扰。

## 前置条件

sandbox 使用的 baseimage 必须预装 Chromium（`chromium-browser` 包）。官方 `code-browser` image 默认包含。

如果使用自定义 image 没有 Chromium，调用 start browser 会返回 `412 Precondition Failed`，错误信息为 `browser: chromium not installed in sandbox`。

---

## POST `/v1/sandboxes/`{id}/browser {#post-sandboxes}

在 sandbox 内启动 headless Chromium，返回 CDP WebSocket URL。

**需要 `developer` 角色**，sandbox 必须处于 `running` 状态。

```http
POST /v1/sandboxes/{id}/browser
Authorization: Bearer ask_X_...
```

请求体可以为空（`{}`）。

**响应**

**200 OK**（或 **201 Created**，首次启动）

```json
{
  "sandbox_id": "sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "process_id": "proc_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "cdp_port": 9222,
  "cdp_path": "/devtools/browser/abc123def456-...",
  "cdp_ws_url": "wss://api.example.com/v1/sandboxes/sbx_xxx/preview/9222/devtools/browser/abc123def456",
  "host_port": 32801
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `sandbox_id` | string | sandbox ID |
| `process_id` | string | Chromium 对应的 process ID |
| `cdp_port` | int32 | 容器内 CDP 端口（固定 9222） |
| `cdp_path` | string | CDP WebSocket 路径 |
| `cdp_ws_url` | string | **主要使用此字段**：经过 sandbox-api 认证代理的 CDP WS URL |
| `host_port` | int32 | host 端口（排障用，通常不需要直接使用） |

::: tip 使用 cdp_ws_url
`cdp_ws_url` 是经过 sandbox-api 反向代理的 URL，自动处理认证（cookie / Bearer）和 WebSocket 升级。CDP 客户端直接连接此 URL 即可，无需关心底层 host_port 和 DNAT 细节。
:::

**412 Precondition Failed** — Chromium 未安装

```json
{ "error": "browser: chromium not installed in sandbox" }
```

**409 Conflict** — sandbox 状态不允许

---

## GET `/v1/sandboxes/`{id}/browser {#get-sandboxes}

查询当前 browser 状态（Chromium 是否在运行）。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/browser
Authorization: Bearer ask_X_...
```

**响应**

**200 OK** — 同 POST 响应格式

**404 Not Found** — Chromium 未运行

```json
{ "error": "browser: not running" }
```

---

## DELETE `/v1/sandboxes/`{id}/browser {#delete-sandboxes}

停止 Chromium 进程。

**需要 `developer` 角色**

```http
DELETE /v1/sandboxes/{id}/browser
Authorization: Bearer ask_X_...
```

**响应**

**204 No Content**

---

## 使用 CDP 控制浏览器

连接 `cdp_ws_url` 后，可以使用标准 CDP 命令控制浏览器。

### TypeScript 示例（使用 Playwright）

```typescript
import { chromium } from 'playwright';

// 1. 启动 browser
const res = await fetch(`${BASE_URL}/v1/sandboxes/${sbxId}/browser`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}` },
});
const { cdp_ws_url } = await res.json();

// 2. Playwright 连接 CDP
const browser = await chromium.connectOverCDP(cdp_ws_url);
const context = browser.contexts()[0];
const page = await context.newPage();

// 3. 操作浏览器
await page.goto('https://example.com');
const title = await page.title();
console.log('Title:', title);

const screenshot = await page.screenshot();
// 保存截图...

// 4. 完成后停止
await browser.disconnect();
await fetch(`${BASE_URL}/v1/sandboxes/${sbxId}/browser`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${API_KEY}` },
});
```

### TypeScript 示例（使用 puppeteer）

```typescript
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserWSEndpoint: cdp_ws_url,
});

const page = await browser.newPage();
await page.goto('https://example.com');
const content = await page.content();
console.log(content.substring(0, 500));

await browser.disconnect();
```

### Python 示例（使用 playwright）

```python
from playwright.sync_api import sync_playwright
import httpx

# 启动 browser
client = httpx.Client(headers={"Authorization": f"Bearer {API_KEY}"})
res = client.post(f"{BASE_URL}/v1/sandboxes/{sbx_id}/browser")
res.raise_for_status()
cdp_ws_url = res.json()["cdp_ws_url"]

# 控制浏览器
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(cdp_ws_url)
    context = browser.contexts[0]
    page = context.new_page()

    page.goto("https://example.com")
    print(page.title())

    screenshot = page.screenshot()
    with open("screenshot.png", "wb") as f:
        f.write(screenshot)

    browser.disconnect()
```

---

## 技术细节

### CDP 端口访问路径

由于 Chromium M112+ 强制监听 `127.0.0.1`（loopback），CDP WebSocket 无法直接从 host 访问。平台在 sandbox 的 network namespace 内自动配置 PREROUTING REDIRECT：

```
容器内 Chromium :9222 (lo)
  → sandbox netns PREROUTING REDIRECT
  → host DNAT :32801 (host_port)
  → sandbox-api /preview/9222/ 反向代理
  → cdp_ws_url
```

这一切对 CDP 客户端完全透明——直接使用 `cdp_ws_url` 即可。

### 连接稳定性

- CDP 连接是长连接，建议在 agent session 期间保持单个连接，不要频繁重连
- 如果连接断开（sandbox pause / 网络中断），重新调用 `GET /browser` 获取新的 `cdp_ws_url` 后重连
- `cdp_path`（browser UUID）在 Chromium 进程重启后会变化，不能缓存

### 录像和审计

通过 PTY 录像的所有 bash 操作都有记录。browser 操作目前不单独录像，但 audit log 会记录 `browser.start` 和 `browser.stop` 事件。
