# 网络策略

每个 sandbox 在创建时可以指定一个网络策略，控制容器的出站流量。策略在 sandbox 生存期内不可修改，需要不同策略时请创建新 sandbox。

## 三档策略

| v2 别名 | v1 值 | 含义 |
|---------|-------|------|
| `open` | `full-egress` | 允许所有出站流量（默认） |
| `allowlist` | `restricted-egress` | 仅放行 DNS + 配置的主机白名单 |
| `sealed` | `offline` | 完全封锁出站（loopback 与 preview 入站代理不受影响） |

未指定时，服务端默认为 `open`（全放行）。

::: tip v1 / v2 字段名
SDK v2 和文档默认使用别名（`open` / `allowlist` / `sealed`）。REST 原始字段名为 `network_policy`，取值为 `full-egress` / `restricted-egress` / `offline`，两套名称服务端等价映射。
:::

---

## `open` — 全放行（开发调试）

不加任何出站过滤。适合需要访问任意外部服务的开发调试场景。

```json
{
  "network": "open"
}
```

**适用场景**：快速原型、临时调试、网络依赖不确定时。

::: warning 生产环境不推荐
`open` 策略让 sandbox 内的代码可以访问任意公网地址，包括 agent 本不应触达的内网端点。生产环境推荐使用 `allowlist`。
:::

---

## `allowlist` — 白名单（生产推荐）

仅放行 DNS（53/udp）以及管理员配置的主机白名单，其余出站连接全部拒绝。

```json
{
  "network": "allowlist",
  "network_allowed_hosts": ["api.github.com", "pypi.org", "10.0.0.0/8"]
}
```

`network_allowed_hosts` 支持：
- 域名（如 `api.github.com`）
- IPv4 地址（如 `192.168.1.1`）
- CIDR 段（如 `10.0.0.0/8`）

**两层白名单**：最终放行范围 = 请求字段的 `network_allowed_hosts` ∪ 部署端通过环境变量预设的全局放行列表。两者取并集，请求方只能扩充到全局允许的范围内。

**适用场景**：生产 agent、CI/CD pipeline、需要访问固定外部服务（如 PyPI、npm、GitHub API）但不想全开的场景。

---

## `sealed` — 完全隔离

封锁所有出站流量。sandbox 内的进程无法主动建立任何外部连接。

```json
{
  "network": "sealed"
}
```

以下流量**不受影响**：
- loopback（`127.0.0.1`）：sandbox 内部服务互访正常
- preview 代理的**入站**流量：外部通过 preview URL 访问 sandbox 内端口仍然可用

**适用场景**：代码审查、静态分析、沙盒化执行不可信代码、需要强合规隔离的场景。

---

## 使用示例

### Python SDK

```python
from talon_sandbox import Sandbox

# 生产推荐：只放行必要的外部域
sb = await Sandbox.create(
    network="allowlist",
    network_allowed_hosts=["pypi.org", "files.pythonhosted.org"],
)

# 完全隔离：只跑本地计算，不需要任何网络
sb = await Sandbox.create(
    network="sealed",
)

# 开发调试：全开放
sb = await Sandbox.create(
    network="open",
)
```

### TypeScript SDK

```typescript
import { Sandbox } from 'talon-sandbox';

// 生产推荐
const sb = await Sandbox.create({
  network: 'allowlist',
  networkAllowedHosts: ['registry.npmjs.org', 'api.github.com'],
});

// 完全隔离
const sb2 = await Sandbox.create({ network: 'sealed' });
```

### curl

```bash
# allowlist 策略，只放行 GitHub API
curl -X POST https://api.example.com/v1/sandboxes \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "network": "allowlist",
    "network_allowed_hosts": ["api.github.com", "raw.githubusercontent.com"]
  }'
```

---

## 策略选择建议

| 场景 | 推荐策略 |
|------|----------|
| 开发调试、本地试跑 | `open` |
| 需要访问 npm / PyPI / GitHub 的 CI agent | `allowlist` + 对应域名 |
| 数据分析 / 本地计算，无需外网 | `sealed` |
| 执行不可信代码 / 代码审查 | `sealed` |
| 生产 agent，调用固定外部 API | `allowlist` + 白名单精确到域名 |

---

## 注意事项

- 策略在 sandbox 创建后**不可修改**。需要变更策略请销毁后重建。
- `allowlist` 策略下，DNS 查询始终放行（无法禁止），请勿依赖 DNS 阻断做安全控制。
- preview 代理的**入站**方向（外部访问 sandbox 内端口）与出站策略无关，三种策略均支持端口暴露。
