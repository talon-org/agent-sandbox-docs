# curl 30 秒上手

不装 SDK,不装 CLI——一行 `curl` 看效果。

> 本页是"我想验证一下平台能用"的最短路径。要做完整集成请看
> [Agent SDK 第一个请求](./agent-sdk)(Python / TS / Go / C#)
> 或 [sandboxctl CLI](#cli-备选)。

## 前置

- 一个能访问的 Agent Sandbox 实例(本机 docker 部署 `http://localhost:18080`,
  或服务器自部署见 [Docker quickstart](./docker)/[systemd quickstart](./self-hosted))
- 一个 API Key,形如 `ask_X_...`(login 后生成,或 bootstrap 时打印)

```bash
export BASE=http://localhost:18080
export KEY=ask_X_xxxxxxxxxxxxxxxx
```

## 三步走

### 1. 拉起

```bash
SBX=$(curl -fsS -X POST "$BASE/v1/sandboxes" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "alpine-3.20",
    "cpu_millis": 2000,
    "memory_bytes": 4294967296,
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
    "cwd":"/workspace",
    "expose_ports":[8000]
  }' | jq -r .id)

echo "Process: $PROC"

# 读日志
curl -fsS "$BASE/v1/sandboxes/$SBX/processes/$PROC/logs?tail=20" \
  -H "Authorization: Bearer $KEY"
```

### 3. 暴露(preview)

`processes` 创建时 `expose_ports: [8000]` 平台会自动 DNAT,通过
preview 域转发到 sandbox 内部 8000:

```bash
curl -fsS "$BASE/v1/sandboxes/$SBX" \
  -H "Authorization: Bearer $KEY" \
  | jq '.preview_urls'
# → [{"port":8000,"url":"http://sbx-xxxxxxxx-8000.preview.example.com"}]
```

也支持动态端口发现——sandbox 内任意进程绑 `0.0.0.0:N` 后,平台自动
认领并返回 preview URL,见 [概念:端口暴露](../concepts/sandbox-lifecycle#preview)。

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

不想拼 curl?用 `sandboxctl`(在做,见 [Spec 46](http://x.xgit.pro/dark/agent-sandbox-platform/src/branch/main/docs/superpowers/specs/2026-05-24-sandboxctl-cli-design.md)):

```bash
sandboxctl create --image alpine-3.20 --cpu 2 --memory 4Gi --network allowlist --wait running -o id \
  | xargs -I{} sandboxctl exec {} -- 'echo hi from sandbox && uname -a'
```

## 完整 API

- 完整 endpoint + schema:[OpenAPI 规格](../api/spec)
- 按主题浏览:[API 参考](../api/)
