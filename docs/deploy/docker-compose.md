# Docker Compose 部署（开发 / Demo）

本文档详细说明 Docker Compose 路径的配置、自定义和排障方法。

::: warning 仅限开发 / Demo
Docker Compose 使用 `localprocess` adapter，sandbox 与 worker 共享 PID/网络 namespace，无容器隔离。**不建议用于生产**。
生产部署见 [systemd 单节点](/deploy/systemd-single-node)。
:::

## 目录结构

```
deploy/docker/
├── compose.yml      # 主 Compose 配置
├── .env.example     # 环境变量模板
├── Dockerfile       # 多阶段 build
└── entrypoint.sh    # 容器启动脚本
```

## 启动

```bash
cd deploy/docker
docker compose up -d
```

## 配置

### 环境变量

复制模板：

```bash
cp .env.example .env
```

`.env` 可配置项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SANDBOX_HOST_PORT` | `18080` | 宿主机绑定端口 |
| `SANDBOX_JWT_SECRET` | 自动生成 | JWT 签名密钥 |
| `SANDBOX_SECRETS_KEY` | 自动生成 | Secrets 加密密钥 |
| `SANDBOX_INTERNAL_TOKEN` | 自动生成 | worker 注册 token |

如果不传 `.env`，首次启动会从 `/dev/urandom` 生成所有密钥，落到 named volume，后续启动复用。**密钥不会因 `docker compose down`（不加 `-v`）而丢失。**

### 修改端口

```bash
# .env
SANDBOX_HOST_PORT=8080
```

```bash
docker compose up -d
```

## Compose 配置细节

`compose.yml` 包含两个核心服务：

**api**：sandbox-api + console 前端
- 监听 `0.0.0.0:${SANDBOX_HOST_PORT}`
- healthcheck 等待 `/healthz` 就绪
- 依赖 `bootstrap` 完成 seed

**worker**：sandbox-worker（inline 模式，与 api 在同一容器网络）

**bootstrap**：一次性 service，seed admin tenant 并写 `bootstrap.txt`

## 日志

```bash
# 查看所有服务日志
docker compose logs -f

# 只看 api
docker compose logs -f api

# 只看 worker
docker compose logs -f worker
```

## 执行命令

```bash
# 进入 api 容器 shell
docker compose exec api bash

# 查看 bootstrap 凭据
docker compose exec api cat /etc/agent-sandbox/bootstrap.txt
```

## 停止和清理

```bash
# 停止服务（保留数据）
docker compose down

# 停止 + 删除所有 volume（完全重置）
docker compose down -v

# 重新 build image（修改了 Dockerfile 后）
docker compose build --no-cache
docker compose up -d
```

## 排障

### bootstrap 容器异常退出

```bash
docker compose logs bootstrap
```

常见原因：
- talon DB 文件权限问题 → 用 `docker compose down -v` 重置数据

### api healthcheck 一直失败

```bash
docker compose logs api | tail -50
```

可能是 bootstrap 未完成——api 在等 bootstrap 的 DB seed。通常等 30-60 秒会就绪。

### 端口被占用

```bash
lsof -i :18080
# 改 .env 里的 SANDBOX_HOST_PORT
```

## 与生产的差异说明

| 特性 | Docker Compose | systemd + runc |
|---|---|---|
| sandbox 隔离 | 无（共享 PID + 网络） | OCI namespace + cgroup v2 |
| 进程安全 | 共享 host 进程树 | 独立 PID namespace |
| 网络策略 | 无（共享 host 网络） | netfilter 三档策略 |
| PTY 录像 | 支持 | 支持 |
| Browser (CDP) | 支持（需安装 Chromium） | 支持 |
| FS API | 支持 | 支持 |
| Apple Silicon | 支持 | 不支持（需要 linux/amd64） |
