---
title: API Routes Summary (Auto-generated)
description: 从 router.go 自动提取的路由列表，供开发者参考。不要手动修改此文件。
---

# API Routes Summary

> **自动生成**，不要手动修改。改 `router.go` 后运行 `pnpm gen:api` 更新。

共 56 个路由。

## 路由列表

| Method | Path | Handler | Auth |
|---|---|---|---|
| `POST` | `/v1/auth/login` | `login` | ⚪ none |
| `POST` | `/v1/auth/logout` | `logout` | ⚪ none |
| `GET` | `/v1/auth/me` | `me` | 🟡 developer |
| `POST` | `/v1/sandboxes` | `createSandbox` | 🟡 developer |
| `GET` | `/v1/sandboxes` | `listSandboxes` | 🟢 viewer |
| `GET` | `/v1/sandboxes/{id}` | `getSandbox` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/exec` | `execSandbox` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/start` | `startSandbox` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/stop` | `stopSandbox` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/pause` | `pauseSandbox` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/resume` | `resumeSandbox` | 🟡 developer |
| `DELETE` | `/v1/sandboxes/{id}` | `destroySandbox` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/pty` | `listRecordings` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/recordings` | `listRecordings` | 🟢 viewer |
| `GET` | `/v1/sandboxes/{id}/recordings/{rec}` | `getRecording` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/processes` | `startProcess` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/processes` | `listProcesses` | 🟡 developer |
| `DELETE` | `/v1/sandboxes/{id}/processes/{proc_id}` | `stopProcess` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/processes/{proc_id}/logs` | `getProcessLog` | 🟢 viewer |
| `GET` | `/v1/sandboxes/{id}/fs/{path...}` | `fsRead` | 🟡 developer |
| `PUT` | `/v1/sandboxes/{id}/fs/{path...}` | `fsWrite` | 🟡 developer |
| `DELETE` | `/v1/sandboxes/{id}/fs/{path...}` | `fsDelete` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/fs-list/{path...}` | `fsList` | 🟢 viewer |
| `GET` | `/v1/sandboxes/{id}/fs-list` | `fsList` | 🟢 viewer |
| `POST` | `/v1/sandboxes/{id}/browser` | `startBrowser` | 🟡 developer |
| `GET` | `/v1/sandboxes/{id}/browser` | `getBrowser` | 🟡 developer |
| `DELETE` | `/v1/sandboxes/{id}/browser` | `stopBrowser` | 🟡 developer |
| `POST` | `/v1/sandboxes/{id}/agent/run` | `agentRun` | 🟡 developer |
| `GET` | `/v1/secrets` | `listSecrets` | 🟡 developer |
| `POST` | `/v1/secrets` | `createSecret` | 🟡 developer |
| `DELETE` | `/v1/secrets/{id}` | `deleteSecret` | 🟡 developer |
| `PATCH` | `/v1/tenants/{tenant_id}/users/{user_id}` | `patchUserRole` | 🟠 owner |
| `GET` | `/v1/admin/workers` | `listWorkers` | 🔴 admin |
| `GET` | `/v1/admin/sandboxes` | `listSandboxes` | 🔴 admin |
| `POST` | `/v1/admin/reassign` | `reassign` | 🔴 admin |
| `GET` | `/v1/admin/tenants` | `listTenants` | 🔴 admin |
| `PATCH` | `/v1/admin/tenants/{id}` | `patchTenantQuota` | 🔴 admin |
| `GET` | `/v1/images` | `listImages` | 🔴 admin |
| `POST` | `/v1/admin/images` | `createImage` | 🔴 admin |
| `DELETE` | `/v1/admin/images/{id}` | `deleteImage` | 🔴 admin |
| `POST` | `/v1/admin/images/{id}/default` | `setDefaultImage` | 🔴 admin |
| `GET` | `/v1/images/{id}/status` | `getImageStatus` | 🔴 admin |
| `POST` | `/v1/admin/images/{id}/prewarm` | `prewarmImage` | 🔴 admin |
| `GET` | `/v1/audit/events` | `listEvents` | 🟢 viewer |
| `GET` | `/v1/metrics` | `unknown` | 🟢 viewer |
| `POST` | `/v1/internal/workers/register` | `unknown` | ⚪ none |
| `POST` | `/v1/internal/workers/{id}/heartbeat` | `unknown` | ⚪ none |
| `DELETE` | `/v1/internal/workers/{id}` | `unknown` | ⚪ none |
| `POST` | `/v1/internal/sandboxes` | `unknown` | ⚪ none |
| `DELETE` | `/v1/internal/sandboxes/{id}` | `unknown` | ⚪ none |
| `POST` | `/v1/internal/processes` | `unknown` | ⚪ none |
| `DELETE` | `/v1/internal/processes/{id}` | `unknown` | ⚪ none |
| `GET` | `/v1/internal/workers/{id}/sandboxes` | `unknown` | ⚪ none |
| `GET` | `/v1/internal/workers/{id}/processes` | `unknown` | ⚪ none |
| `POST` | `/v1/internal/admin/reassign` | `unknown` | ⚪ none |
| `GET` | `/v1/sandboxes/{id}/preview/{port}` | `previewRedirect` | 🟢 viewer |

## DTO 结构体列表

- `SandboxDTO`
- `CreateRequest`
- `TenantDTO`
- `TenantListResponse`
- `PatchTenantQuotaRequest`
- `CreateSecretRequest`
- `SecretDTO`
- `SecretListResponse`
- `SecretBindingRequest`
- `SecretBindingDTO`
- `ImageDTO`
- `ImageListResponse`
- `ImageStatusDTO`
- `CreateImageRequest`
- `SetDefaultImageRequest`
- `ListResponse`
- `ExecRequest`
- `ExecResponse`
- `ErrorResponse`
- `RecordingListResponse`
- `ProcessDTO`
- `StartProcessRequest`
- `ProcessListResponse`
- `WorkerRegisterRequest`
- `WorkerRegisterResponse`
- `WorkerHeartbeatRequest`
- `AuditEventDTO`
- `BrowserDTO`
- `AgentRunRequest`
- `AgentRunStep`
- `AgentRunResponse`
- `FSEntry`
- `FSListResponse`

---

*Generated at 2026-05-23T19:28:57.712Z*