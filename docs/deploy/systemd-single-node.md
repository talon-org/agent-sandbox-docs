# systemd 单节点部署详解

本文是单节点 Linux 服务器部署的完整参考文档，包含字段详解、手动部署步骤和排障指南。

快速路径（推荐大多数用户）见 [服务器自部署快速开始](/quickstart/self-hosted)。本文适合想要完全控制每一步的高级运维场景。

## 系统要求

| 项目 | 最低要求 | 推荐 |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| 架构 | x86_64 | x86_64 |
| 内核 | ≥ 5.10 | ≥ 6.1 |
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 20 GB | 100 GB+ |
| cgroup | v2 unified | v2 unified |

必装系统包：

```bash
# Ubuntu/Debian
apt-get install -y runc iptables iproute2 ca-certificates curl jq

# RHEL/Rocky
dnf install -y runc iptables iproute2 ca-certificates curl jq
```

## 服务组件

部署后有三个 systemd unit：

| Unit | 说明 |
|---|---|
| `agent-sandbox-bootstrap.service` | 一次性，seed admin tenant + API Key，完成后退出 |
| `agent-sandbox-api.service` | 常驻，HTTP API + console 前端 |
| `agent-sandbox-worker.service` | 常驻，sandbox 运行时（runc + browser + PTY） |

## 配置文件

主配置文件：`/etc/agent-sandbox/env`

权限：`0600`（只有 `agent-sandbox` 用户可读）

### 必填字段

| 字段 | 说明 |
|---|---|
| `SANDBOX_JWT_SECRET` | JWT 签名密钥（建议 32+ 字节随机字符串） |
| `SANDBOX_SECRETS_KEY` | Secrets 加密密钥（建议 32+ 字节） |
| `SANDBOX_INTERNAL_TOKEN` | worker 注册 token（建议 32+ 字节随机字符串） |

`quickstart.sh` 会自动从 `/dev/urandom` 生成并写入这三个字段。手动路径需要自己填：

```bash
SANDBOX_JWT_SECRET=$(openssl rand -hex 32)
SANDBOX_SECRETS_KEY=$(openssl rand -hex 32)
SANDBOX_INTERNAL_TOKEN=$(openssl rand -hex 32)
```

### 可选字段

| 字段 | 默认值 | 说明 |
|---|---|---|
| `SANDBOX_API_ADDR` | `127.0.0.1:18080` | api 监听地址 |
| `SANDBOX_PUBLIC_DOMAIN` | 空 | 公开域名（用于 HTTPS cookie / preview URL） |
| `SANDBOX_PREVIEW_DOMAIN_SUFFIX` | 空 | subdomain 模式 preview 的域名后缀 |
| `SANDBOX_DEFAULT_CPU_MILLIS` | `1000` | sandbox 默认 CPU 配额（1000 = 1 核） |
| `SANDBOX_DEFAULT_MEMORY_BYTES` | `536870912` | sandbox 默认内存（512 MB） |
| `SANDBOX_MAX_SANDBOXES` | `0`（不限） | worker 最大并发 sandbox 数 |
| `SANDBOX_ROOTFS_MODE` | `hardlink` | rootfs 模式：`hardlink` / `overlay` |
| `SANDBOX_DEFAULT_NETWORK_POLICY` | `full-egress` | 默认网络出站策略 |
| `SANDBOX_LOG_LEVEL` | `info` | 日志级别：`debug` / `info` / `warn` / `error` |
| `SANDBOX_BASE_IMAGE_URL` | 内置默认 | 默认 baseimage 下载地址 |

修改配置后需要重启服务：

```bash
sudo systemctl restart agent-sandbox-api agent-sandbox-worker
```

## 手动部署步骤

### 步骤一：preflight 检查

```bash
cd agent-sandbox-v0.1.0
bash deploy/systemd/preflight.sh
```

preflight 检查项：
- 内核版本 ≥ 5.10
- cgroup v2 已启用（`/sys/fs/cgroup/cgroup.controllers` 非空）
- `runc` 在 PATH 且可执行
- `iptables` 在 PATH
- `ip` 命令可用
- 没有端口 18080 冲突
- HTTPS 出口可达（用于拉 baseimage）

输出示例：

```
✅  kernel 6.1.0 >= 5.10
✅  cgroup v2 enabled (cpu memory pids io)
✅  runc found: /usr/sbin/runc
✅  iptables found: /usr/sbin/iptables
✅  iproute2 ip found
✅  port 18080 free
✅  HTTPS egress OK (github.com reachable)

All preflight checks passed.
```

### 步骤二：安装 binary 和 unit 文件

```bash
sudo bash deploy/systemd/install.sh
```

安装位置：

| 文件 | 目标位置 |
|---|---|
| `sandbox-api` | `/usr/local/bin/sandbox-api` |
| `sandbox-worker` | `/usr/local/bin/sandbox-worker` |
| `sandbox-bootstrap` | `/usr/local/bin/sandbox-bootstrap` |
| unit 文件 | `/etc/systemd/system/agent-sandbox-*.service` |
| env 模板 | `/etc/agent-sandbox/env`（密钥字段为 `REPLACE_ME_*`） |

创建系统用户：`agent-sandbox`（nologin）

### 步骤三：填写密钥

```bash
sudo nano /etc/agent-sandbox/env
```

替换所有 `REPLACE_ME_*` 字段，或运行：

```bash
sudo sed -i \
  "s/REPLACE_ME_JWT/$(openssl rand -hex 32)/; \
   s/REPLACE_ME_SECRETS/$(openssl rand -hex 32)/; \
   s/REPLACE_ME_INTERNAL/$(openssl rand -hex 32)/" \
  /etc/agent-sandbox/env
```

### 步骤四：启动服务

```bash
sudo systemctl daemon-reload

# bootstrap（一次性，seed admin）
sudo systemctl enable --now agent-sandbox-bootstrap
# 等待完成（通常 3-5 秒）
sudo systemctl status agent-sandbox-bootstrap

# api + worker
sudo systemctl enable --now agent-sandbox-api agent-sandbox-worker
```

### 步骤五：验证

```bash
# 查看日志
sudo journalctl -u agent-sandbox-api -u agent-sandbox-worker -f

# 看 admin 密码
sudo cat /var/lib/agent-sandbox/bootstrap.txt

# 测试 API
curl http://localhost:18080/healthz
```

## 数据目录

| 路径 | 内容 |
|---|---|
| `/etc/agent-sandbox/` | 配置文件（env, 证书等） |
| `/var/lib/agent-sandbox/` | 数据目录（sandbox rootdir, workspace, DB） |
| `/var/log/agent-sandbox/` | 日志（也可以从 journalctl 看） |

## 升级

```bash
# 1. 停止服务
sudo systemctl stop agent-sandbox-api agent-sandbox-worker

# 2. 备份数据（可选但建议）
sudo cp -a /var/lib/agent-sandbox /var/lib/agent-sandbox.bak

# 3. 安装新版本（idempotent，不会覆盖已有密钥）
cd /tmp/agent-sandbox-v0.2.0
sudo bash deploy/systemd/quickstart.sh

# 4. 确认配置（检查是否有新增必填字段）
sudo diff /etc/agent-sandbox/env.new /etc/agent-sandbox/env  # 如有

# 5. 启动新版本
sudo systemctl start agent-sandbox-api agent-sandbox-worker
```

## 日常维护

### 查看状态

```bash
sudo systemctl status agent-sandbox-api agent-sandbox-worker
```

### 重启服务

```bash
sudo systemctl restart agent-sandbox-api agent-sandbox-worker
```

### 查看实时日志

```bash
sudo journalctl -u agent-sandbox-api -u agent-sandbox-worker -f
```

### 搜索错误日志

```bash
sudo journalctl -u agent-sandbox-api --since "1 hour ago" -p err
```

## 排障

### `failed to setup cgroup`

内核 cgroup v2 未启用：

```bash
# 检查
cat /sys/fs/cgroup/cgroup.controllers
# 如果空或命令报错，说明是 cgroup v1

# Ubuntu 22.04 启用 cgroup v2
sudo grubby --update-kernel=ALL --args="systemd.unified_cgroup_hierarchy=1"
sudo reboot
```

### `iptables: No chain/target/match by that name`

iptables 版本问题（某些系统用 nftables 后端）：

```bash
# 检查
iptables --version
# 如果显示 nf_tables，尝试：
sudo apt install iptables-legacy
sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
```

### sandbox 启动超时

可能是 baseimage 还在下载：

```bash
# 检查 worker 日志
sudo journalctl -u agent-sandbox-worker -f | grep -i image

# 或者用 API 查询 image 状态
curl http://localhost:18080/v1/images/<img_id>/status \
  -H "Authorization: Bearer $API_KEY" | jq .stage
```

### 端口冲突

```bash
ss -tlnp | grep 18080
# 找到占用进程，决定是 kill 还是改 api 端口

# 改端口
sudo nano /etc/agent-sandbox/env
# SANDBOX_API_ADDR=127.0.0.1:19090
sudo systemctl restart agent-sandbox-api
```
