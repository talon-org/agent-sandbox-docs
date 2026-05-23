# 文件系统 API (FS)

FS API 提供对 sandbox workspace 文件的读/写/列/删操作，是 Web IDE 和 agent 文件操作的核心接口。

所有路径都相对于 sandbox workspace 根目录（容器内 `/workspace`）。

## 安全说明

::: warning 路径安全
所有路径都经过严格的 `openat2` + `RESOLVE_BENEATH` 内核级验证，彻底防止 symlink 穿透攻击。sandbox 内 agent 无法通过构造 symlink 让 FS API 读写 host 上的任意文件。
:::

---

## GET `/v1/sandboxes/`{id}/fs/{path...} {#get-sandboxes}

读取 workspace 内的文件内容。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/fs/src/app.tsx
Authorization: Bearer ask_X_...
```

### 路径说明

- 路径是相对于 workspace 根目录的相对路径
- 不需要前导 `/`，例如 `src/app.tsx` 即可
- 路径穿越（`../`）会被 403 拒绝

**响应**

**200 OK** — 响应体是文件内容（`application/octet-stream`）

**404 Not Found** — 文件不存在

**403 Forbidden** — 路径穿越或 symlink 到 workspace 外

---

## PUT `/v1/sandboxes/`{id}/fs/{path...} {#put-sandboxes}

写入文件（创建或覆盖）。

**需要 `developer` 角色**

```http
PUT /v1/sandboxes/{id}/fs/workspace/app.py
Authorization: Bearer ask_X_...
Content-Type: application/octet-stream

<file content bytes>
```

写入是原子操作：先写临时文件，成功后 rename 替换目标，避免写入中途崩溃留下损坏文件。

**响应**

**204 No Content** — 写入成功

### curl 示例

```bash
# 上传本地文件
curl -s -X PUT "$BASE_URL/v1/sandboxes/$SBX_ID/fs/src/main.py" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./main.py

# 直接写内容
curl -s -X PUT "$BASE_URL/v1/sandboxes/$SBX_ID/fs/hello.txt" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/octet-stream" \
  -d "Hello, Sandbox!"
```

---

## DELETE `/v1/sandboxes/`{id}/fs/{path...} {#delete-sandboxes}

删除文件或目录（目录递归删除）。

**需要 `developer` 角色**

```http
DELETE /v1/sandboxes/{id}/fs/dist
Authorization: Bearer ask_X_...
```

删除是安全的递归操作：即使中间路径被 symlink 替换，也不会跟随到 workspace 外。叶子 symlink 本身被删除（不跟随目标）。

**响应**

**204 No Content** — 删除成功（包含目标不存在时也返回 204）

---

## GET `/v1/sandboxes/`{id}/fs-list/{path...} {#get-sandboxes-2}

列出 workspace 内目录的内容。

**需要 `viewer` 角色**

```http
GET /v1/sandboxes/{id}/fs-list/src
Authorization: Bearer ask_X_...
```

列根目录（两种等效方式）：

```http
GET /v1/sandboxes/{id}/fs-list
GET /v1/sandboxes/{id}/fs-list/
```

**响应**

**200 OK**

```json
{
  "entries": [
    {
      "name": "app.tsx",
      "size": 2048,
      "mod_time": 1716480000,
      "is_dir": false
    },
    {
      "name": "components",
      "size": 0,
      "mod_time": 1716479000,
      "is_dir": true
    }
  ],
  "total": 2
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 文件 / 目录名（不含路径） |
| `size` | int64 | 文件大小（字节）；目录为 0 |
| `mod_time` | int64 | 最后修改时间（Unix 秒） |
| `is_dir` | bool | 是否是目录 |

---

## TypeScript 使用示例

```typescript
const BASE = 'http://localhost:18080';
const AUTH = { Authorization: `Bearer ${API_KEY}` };

// 写文件
async function writeFile(sbxId: string, path: string, content: string | Uint8Array) {
  const res = await fetch(`${BASE}/v1/sandboxes/${sbxId}/fs/${path}`, {
    method: 'PUT',
    headers: { ...AUTH, 'Content-Type': 'application/octet-stream' },
    body: content,
  });
  if (!res.ok) throw new Error(`Write failed: ${await res.text()}`);
}

// 读文件
async function readFile(sbxId: string, path: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/sandboxes/${sbxId}/fs/${path}`, {
    headers: AUTH,
  });
  if (!res.ok) throw new Error(`Read failed: ${await res.text()}`);
  return res.text();
}

// 列目录
async function listDir(sbxId: string, path = '') {
  const endpoint = path
    ? `${BASE}/v1/sandboxes/${sbxId}/fs-list/${path}`
    : `${BASE}/v1/sandboxes/${sbxId}/fs-list`;
  const res = await fetch(endpoint, { headers: AUTH });
  if (!res.ok) throw new Error(`List failed: ${await res.text()}`);
  return res.json() as Promise<{ entries: FSEntry[]; total: number }>;
}

// 删除文件
async function deleteFile(sbxId: string, path: string) {
  const res = await fetch(`${BASE}/v1/sandboxes/${sbxId}/fs/${path}`, {
    method: 'DELETE',
    headers: AUTH,
  });
  if (!res.ok) throw new Error(`Delete failed: ${await res.text()}`);
}

// 使用示例
await writeFile(sbxId, 'src/index.html', '<h1>Hello!</h1>');
const content = await readFile(sbxId, 'src/index.html');
const listing = await listDir(sbxId, 'src');
await deleteFile(sbxId, 'src/temp.txt');
```

## 注意事项

- **最大文件大小**：单次读写无硬限制，但反向代理通常有 `client_max_body_size`（nginx 默认 1MB，推荐改为 16MB）
- **二进制文件**：FS API 传输原始字节，支持所有文件类型
- **并发写**：多个并发写入同一文件是安全的（原子 rename），但可能相互覆盖，建议串行操作
- **目录创建**：PUT 会自动创建中间目录（`mkdirAll`）
