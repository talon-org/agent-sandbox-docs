# 服务器自部署

适合：给 AI agent 真正运行代码的生产 Linux 服务器，需要真容器隔离。

## 系统要求

| 项目 | 要求 |
|---|---|
| OS | Linux x86_64（Ubuntu 22.04+ / Debian 12+ / Rocky 9+，内核 ≥ 5.10） |
| 架构 | x86_64（arm64 需自行从源码构建） |
| cgroup | cgroup v2 unified hierarchy（现代发行版默认） |
| 权限 | root |
| 必装包 | `runc` `iptables` `iproute2` `curl` `jq` |
| 端口 | 18080 空闲（可改） |
| 网络 | HTTPS 出口能访问 GitHub release（下载 baseimage 用） |

::: tip preflight 自检
`quickstart.sh` 第一步会自动检查所有前置条件，缺啥给具体的 `apt-get` / `dnf` 安装命令。
:::

## 第一步：构建 release tarball（在 mac 或 linux 上）

**在 mac 上**（使用 Docker 交叉编译）：

```bash
# 拿到主仓代码(暂未开源,需向团队申请)
git clone <agent-sandbox-platform 仓库地址>
cd agent-sandbox-platform

# 构建 linux/amd64 tarball
bash scripts/release/build-bundle.sh --version v0.1.0
```

产物：

```
dist/agent-sandbox-v0.1.0-linux-amd64.tar.gz
dist/agent-sandbox-v0.1.0-linux-amd64.tar.gz.sha256
```

**在 linux 开发机上**（直接编译，需要 go 1.22+ + node 20 + pnpm）：

```bash
bash scripts/release/build-bundle.sh --native --version v0.1.0
```

## 第二步：传到生产服务器

```bash
scp dist/agent-sandbox-v0.1.0-linux-amd64.tar.gz <user>@<server>:/tmp/
scp dist/agent-sandbox-v0.1.0-linux-amd64.tar.gz.sha256 <user>@<server>:/tmp/
```

## 第三步：在服务器上安装

```bash
ssh <user>@<server>

# 校验完整性
cd /tmp
sha256sum -c agent-sandbox-v0.1.0-linux-amd64.tar.gz.sha256

# 解压
tar xzf agent-sandbox-v0.1.0-linux-amd64.tar.gz
cd agent-sandbox-v0.1.0

# 一键安装（preflight 检查 → 安装 binary + unit → 生密钥 → 启动服务）
sudo bash deploy/systemd/quickstart.sh
```

`quickstart.sh` 自动完成以下步骤：

1. **preflight** — 检查内核版本 / cgroup v2 / runc / iptables / 网段 / HTTPS 出口
2. **install** — 安装 binary 到 `/usr/local/bin/sandbox-{api,worker,bootstrap}`，安装 unit 到 `/etc/systemd/system/`
3. **生成密钥** — 从 `/dev/urandom` 生成三个密钥，写入 `/etc/agent-sandbox/env`（权限 0600）
4. **bootstrap** — 运行一次性 service，seed admin tenant + API key
5. **enable + start** — systemctl 启动 api + worker
6. **总结** — 打印 admin 密码 / API key / console URL / 日志命令

安装完成后输出示例：

```
✅  Agent Sandbox Platform 已启动

Console:   http://<server-ip>:18080/console/
管理员:    admin
密码:      Xk3mP9qR...
API Key:   ask_X_AbCdEf...

日志: sudo journalctl -u agent-sandbox-api -u agent-sandbox-worker -f
```

## 带域名 + HTTPS

告诉 quickstart 公开域名（TLS 在反代层做）：

```bash
sudo bash deploy/systemd/quickstart.sh --domain sandbox.example.com
```

然后配置反向代理，详见 [反向代理配置](/deploy/reverse-proxy)。

## 预览（dry-run）

不修改任何文件，只打印每一步会做什么：

```bash
sudo bash deploy/systemd/quickstart.sh --dry-run
```

## 验证安装

```bash
# 看日志
sudo journalctl -u agent-sandbox-api -u agent-sandbox-worker -f

# 检查服务状态
sudo systemctl status agent-sandbox-api agent-sandbox-worker

# 测试 API
API_KEY="ask_X_<从安装输出复制>"
curl -s http://localhost:18080/v1/sandboxes \
  -H "Authorization: Bearer $API_KEY" | jq .
```

## 常见排障

### 服务起不来

```bash
sudo systemctl status agent-sandbox-{api,worker,bootstrap}
sudo journalctl -u agent-sandbox-api --since "5 minutes ago"
```

常见原因：

| 错误信息 | 解决方法 |
|---|---|
| `permission denied` on `/sys/fs/cgroup` | 系统不是 cgroup v2，运行 `cat /sys/fs/cgroup/cgroup.controllers` 检查 |
| `runc: not found` | `apt install runc` 或 `dnf install runc` |
| `iptables: chain SANDBOX-* not found` | 不致命，worker 自动建链 |
| 端口冲突 | `ss -tlnp \| grep 18080`，修改 env 里 `SANDBOX_API_ADDR` |

### 忘记 admin 密码

密码只在 bootstrap 时打印一次。重置方法：

```bash
# 查看 bootstrap.txt
sudo cat /var/lib/agent-sandbox/bootstrap.txt
```

## 升级

```bash
# 停止旧版本
sudo systemctl stop agent-sandbox-api agent-sandbox-worker

# 安装新版本（env 和密钥不会被覆盖，quickstart idempotent）
cd /tmp/agent-sandbox-v0.2.0
sudo bash deploy/systemd/quickstart.sh

# 启动新版本
sudo systemctl start agent-sandbox-api agent-sandbox-worker
```

## 卸载

```bash
sudo systemctl stop agent-sandbox-{api,worker,bootstrap}
sudo systemctl disable agent-sandbox-{api,worker,bootstrap}
sudo rm /etc/systemd/system/agent-sandbox-*.service
sudo rm -rf /etc/agent-sandbox /var/lib/agent-sandbox
sudo rm -f /usr/local/bin/sandbox-{api,worker,bootstrap}
sudo userdel agent-sandbox  # 可选
sudo systemctl daemon-reload
```

## 下一步

- [Mac → 服务器发布流程](/deploy/from-mac-to-server) — 详细的 build + scp 流程
- [反向代理配置](/deploy/reverse-proxy) — Caddy / nginx + HTTPS
- [systemd 单节点详解](/deploy/systemd-single-node) — 字段详解和手动步骤
- [Agent SDK 快速开始](/quickstart/agent-sdk) — 接入 API 第一个请求
