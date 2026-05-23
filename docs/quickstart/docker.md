# Docker 本机 5 分钟试用

适合：mac / Windows 上体验、给客户 demo、开发联调。

::: warning 仅限开发 / demo
Docker Compose 使用 `localprocess` adapter，sandbox 进程与 worker 共享 PID 和网络 namespace，**没有容器隔离**。请勿在生产环境中跑不可信代码。
生产部署请看 [服务器自部署](/quickstart/self-hosted)。
:::

## 前置要求

- Docker ≥ 24，带 Compose plugin（`docker compose version` 可正常运行）
- 约 500 MB 磁盘空间（image build cache）
- 端口 `18080` 空闲（可修改）

## 第一步：克隆主仓

```bash
git clone http://x.xgit.pro/dark/agent-sandbox-platform.git
cd agent-sandbox-platform
```

## 第二步：启动服务

```bash
cd deploy/docker
docker compose up -d
```

首次启动会构建 image（node + go + debian-slim 三阶段），约 3 分钟。后续启动只启动容器，几秒完成。

可以观察启动进度：

```bash
docker compose logs -f
```

等到 `api` 容器 healthcheck 通过（约 30-60 秒）：

```bash
docker compose ps
# 期望看到 api 和 worker 都显示 "healthy"
```

## 第三步：获取管理员密码和 API Key

```bash
docker compose exec api cat /etc/agent-sandbox/bootstrap.txt
```

输出示例：

```
租户 id   : tnt_xxxxxxxxxxxxx
管理员    : admin
管理员密码: a3k9mX2qPvRs...
API Key   : ask_X_AbCdEfGhIj...
```

::: warning 请妥善保存
这些凭据只在 `bootstrap.txt` 中存一份，**不要丢失**。
:::

## 第四步：访问 Console

打开浏览器访问：

```
http://localhost:18080/console/
```

用 `admin` 和上一步的管理员密码登录。

## 第五步：冒烟测试（用 API 创建 sandbox）

```bash
API_KEY="ask_X_<从 bootstrap.txt 复制>"

# 创建 sandbox
curl -s -X POST http://localhost:18080/v1/sandboxes \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

成功响应：

```json
{
  "id": "sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "state": "created",
  "profile": ""
}
```

启动 sandbox：

```bash
SBX_ID="sbx_xxxxxxxxxxxxxxxxxxxxxxxxxx"

curl -s -X POST http://localhost:18080/v1/sandboxes/$SBX_ID/start \
  -H "Authorization: Bearer $API_KEY" | jq .
```

在 sandbox 里执行命令：

```bash
curl -s -X POST http://localhost:18080/v1/sandboxes/$SBX_ID/exec \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": ["echo", "hello from sandbox"]}' | jq .
```

## 修改端口或密钥

```bash
cd deploy/docker
cp .env.example .env
# 编辑 .env：修改 SANDBOX_HOST_PORT 等字段
docker compose up -d
```

`.env` 的值会覆盖默认配置。**不传也没问题**——首次启动会自动从 `/dev/urandom` 生成密钥，存入 named volume，后续启动复用。

## 停止和清理

```bash
# 停止服务，保留数据（下次启动还在）
docker compose down

# 停止 + 删除数据（回到全新状态）
docker compose down -v
```

## Docker Compose vs 生产部署对比

| 项目 | Docker Compose（localprocess） | 生产（runc） |
|---|---|---|
| sandbox 隔离 | 无（共享 PID/网络） | 完整（namespace + cgroup + bridge） |
| seccomp / capabilities | 无 | 默认启用 |
| 跑不可信代码 | 不建议 | 设计目标 |
| Apple Silicon mac | 支持 | 需要 linux + amd64 |
| 一键启动 | 支持 | 需要 root + Linux |

## 下一步

- [Agent SDK 快速开始](/quickstart/agent-sdk) — 用 curl / TypeScript / Python 接入 API
- [服务器自部署](/quickstart/self-hosted) — 生产环境真正隔离的 runc 部署
- [Sandbox 生命周期](/concepts/sandbox-lifecycle) — 了解状态机和操作语义
