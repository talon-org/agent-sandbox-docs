# Agent Run API

Agent Run 是高层封装接口，让 AI agent 在 sandbox 内执行一个目标任务（goal），底层自动控制 Chromium + CDP + 代码执行。

::: warning V1 限制
当前为 V1 同步接口：请求阻塞直到 agent 完成或超时（最长 5 分钟）。V2 计划改为 `202 Accepted` + WebSocket 流式输出。
:::

## POST `/v1/sandboxes/`{id}/agent/run {#post-sandboxes}

在 sandbox 内启动 agent，执行指定 goal。

**需要 `developer` 角色**，sandbox 必须处于 `running` 状态。

```http
POST /v1/sandboxes/{id}/agent/run
Authorization: Bearer ask_X_...
Content-Type: application/json
```

### 请求体

```json
{
  "goal": "在 sandbox 内打开 https://example.com，截图并保存为 /workspace/screenshot.png",
  "max_steps": 20,
  "llm_model": "anthropic:claude-sonnet-4-6"
}
```

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `goal` | string | 必填 | agent 要完成的目标（自然语言描述） |
| `max_steps` | int | 20 | 最大执行步数；硬上限 100（超过会被截断） |
| `llm_model` | string | 空（harness 默认） | 使用的 LLM 模型，如 `anthropic:claude-sonnet-4-6` |

::: tip LLM API Key
LLM API Key **不在请求体传递**。应通过 [Secrets API](/api/admin#secrets) 注入为 sandbox 环境变量（如 `ANTHROPIC_API_KEY`），避免 key 出现在 audit log 中。
:::

### 响应

**200 OK**

```json
{
  "run_id": "run_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "status": "completed",
  "duration_ms": 8500,
  "steps": [
    {
      "step": 1,
      "action": "Page.navigate",
      "thought": "需要打开目标网页",
      "details": {
        "url": "https://example.com"
      }
    },
    {
      "step": 2,
      "action": "Page.screenshot",
      "thought": "截图并保存到指定路径",
      "details": {
        "path": "/workspace/screenshot.png"
      }
    },
    {
      "step": 3,
      "action": "result",
      "thought": "任务完成",
      "details": {
        "success": true,
        "message": "截图已保存到 /workspace/screenshot.png"
      }
    }
  ],
  "result": "截图已保存到 /workspace/screenshot.png，文件大小约 45KB",
  "exit_code": 0
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `run_id` | string | 此次运行的唯一 ID |
| `status` | string | `completed` / `failed` / `timeout` |
| `duration_ms` | int64 | 总耗时（毫秒） |
| `steps` | array | 执行步骤列表（见下方） |
| `result` | string | agent 最终评估结果（LLM 自我评估，不保证准确） |
| `exit_code` | int32 | `0` = browser-harness 正常退出 |
| `stderr` | string | 失败时的错误输出（用于排障） |

::: warning status vs exit_code
`status: "completed"` 表示 browser-harness 进程正常退出（`exit_code = 0`），**不代表** goal 实际达成。goal 是否达成看 `result` 字段（由 LLM 自我评估）。
:::

**steps 元素字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `step` | int | 步骤编号（从 1 开始） |
| `action` | string | 动作类型（`Page.navigate` / `Input.click` / `result` 等） |
| `thought` | string | LLM 解释为何采取此步骤 |
| `details` | object | action-specific 字段（因 action 不同而异） |

**超时响应：**

```json
{
  "run_id": "run_xxx",
  "status": "timeout",
  "duration_ms": 300000,
  "steps": [...],
  "result": "",
  "exit_code": -1
}
```

---

## 完整使用示例

```typescript
// 1. 创建并启动 sandbox（使用 code-browser image）
const sandbox = await createSandbox({ profile: 'code-browser' });
await startSandbox(sandbox.id);

// 2. 注入 LLM API Key（已提前用 Secrets API 创建 secret）
// （这一步在 createSandbox 时通过 secrets 参数完成）

// 3. 运行 agent
const result = await fetch(`${BASE_URL}/v1/sandboxes/${sandbox.id}/agent/run`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    goal: '打开 https://news.ycombinator.com，提取前 5 条新闻标题，保存为 /workspace/news.json',
    max_steps: 30,
  }),
});

const data = await result.json();

if (data.status === 'completed' && data.exit_code === 0) {
  // 读取 agent 写的文件
  const newsJson = await readFile(sandbox.id, 'news.json');
  const news = JSON.parse(newsJson);
  console.log('Top news:', news);
} else {
  console.error('Agent failed:', data.status, data.stderr);
}

// 4. 销毁 sandbox
await destroySandbox(sandbox.id);
```

---

## 与 Processes / FS API 协同

Agent Run 内部使用 Chromium（via Browser API）和 sandbox 文件系统。你可以在 agent run 前后：

- **前**：通过 [FS API](/api/fs) 写入上下文文件（如 `instructions.txt`）
- **后**：通过 [FS API](/api/fs) 读取 agent 产出的文件（截图、JSON、报告等）
- **中**：通过 [Processes API](/api/processes) 并发启动其他工具（如监控日志）
