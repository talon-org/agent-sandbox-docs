# Mac → 服务器发布流程

mac 上不能直接 build linux/amd64 二进制（CGO 绑定了 linux/amd64 C 实现），需要用 Docker 做交叉编译。

## 完整流程概览

```
mac 上 build → tarball → scp 到服务器 → 服务器上安装
```

## 第一步：在 mac 上 Build

### 前置条件

- Docker Desktop for Mac（已运行）
- Node 20 + pnpm 9+（用于 console 前端 build）
- 约 3 GB 磁盘空间（docker build cache）

### Build 命令

```bash
# 在主仓根目录
bash scripts/release/build-bundle.sh --version v0.1.0
```

build 脚本做什么：

1. `pnpm build` 出 console SPA dist（嵌进 api 二进制）
2. 启动 `golang:1.22-bookworm` docker 容器，在里面 build 三个 linux/amd64 二进制：
   - `sandbox-api`
   - `sandbox-worker`
   - `sandbox-bootstrap`
3. 打包 binary + systemd unit + quickstart + preflight + 部署文档 + reverse-proxy 配置模板

产物：

```
dist/
├── agent-sandbox-v0.1.0-linux-amd64.tar.gz
└── agent-sandbox-v0.1.0-linux-amd64.tar.gz.sha256
```

> 第一次 build 要拉 Docker image，约 3 分钟；后续命中 cache，秒级完成。

### Build 时间参考

| 场景 | 耗时 |
|---|---|
| 首次（拉 Docker image + 编译） | ~10 分钟 |
| 有 cache（只 recompile 改动部分） | ~1-3 分钟 |
| 无代码改动（全命中 cache） | ~15 秒 |

## 第二步：传到服务器

```bash
VERSION=v0.1.0
SERVER="user@your-server.com"

# 传 tarball + checksum
scp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz ${SERVER}:/tmp/
scp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz.sha256 ${SERVER}:/tmp/
```

### 多台服务器并行传输

```bash
SERVERS="srv-01 srv-02 srv-03"
VERSION=v0.1.0

for s in $SERVERS; do
  scp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz $s:/tmp/ &
done
wait
echo "All servers received the tarball"
```

## 第三步：在服务器上安装

```bash
ssh user@your-server.com

cd /tmp
# 校验完整性
sha256sum -c agent-sandbox-v0.1.0-linux-amd64.tar.gz.sha256

# 解压
tar xzf agent-sandbox-v0.1.0-linux-amd64.tar.gz
cd agent-sandbox-v0.1.0

# 安装
sudo bash deploy/systemd/quickstart.sh
```

### 一行式（熟悉之后）

```bash
# mac 上
VERSION=v0.1.0
SERVER="user@your-server.com"

bash scripts/release/build-bundle.sh --version $VERSION
scp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz ${SERVER}:/tmp/

# 服务器上（SSH 单行执行）
ssh ${SERVER} "cd /tmp && \
  tar xzf agent-sandbox-${VERSION}-linux-amd64.tar.gz && \
  cd agent-sandbox-${VERSION} && \
  sudo bash deploy/systemd/quickstart.sh"
```

### 多服务器滚动发布

```bash
VERSION=v0.1.0
SERVERS="srv-01 srv-02 srv-03"

# 1. 先 build
bash scripts/release/build-bundle.sh --version $VERSION

# 2. 并行传输
for s in $SERVERS; do
  scp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz $s:/tmp/ &
done
wait

# 3. 串行安装（一台一台来，确认后再下一台）
for s in $SERVERS; do
  echo "Installing on $s..."
  ssh $s "cd /tmp && \
    tar xzf agent-sandbox-${VERSION}-linux-amd64.tar.gz && \
    cd agent-sandbox-${VERSION} && \
    sudo bash deploy/systemd/quickstart.sh"
  echo "$s done. Press Enter to continue..."
  read
done
```

## 在 Linux 上直接 Build（跳过 Docker）

如果你在 linux 机器上，可以省掉一层 Docker：

```bash
# 需要：go 1.22+ + CGO gcc + node 20 + pnpm
bash scripts/release/build-bundle.sh --native --version v0.1.0
```

## CI/CD 集成

GitHub Actions 示例（`tag push` 触发自动 build + 上传 release）：

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: npm install -g pnpm@9

      - name: Build bundle
        run: |
          bash scripts/release/build-bundle.sh --native --version ${{ github.ref_name }}

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/agent-sandbox-${{ github.ref_name }}-linux-amd64.tar.gz
            dist/agent-sandbox-${{ github.ref_name }}-linux-amd64.tar.gz.sha256
```

这样 `git tag v0.2.0 && git push --tags` 后，GitHub release 自动有下载链接。服务器装新版本改为：

```bash
VERSION=v0.2.0
curl -LO https://github.com/dark/agent-sandbox-platform/releases/download/${VERSION}/agent-sandbox-${VERSION}-linux-amd64.tar.gz
curl -LO https://github.com/dark/agent-sandbox-platform/releases/download/${VERSION}/agent-sandbox-${VERSION}-linux-amd64.tar.gz.sha256
sha256sum -c agent-sandbox-${VERSION}-linux-amd64.tar.gz.sha256
tar xzf agent-sandbox-${VERSION}-linux-amd64.tar.gz
cd agent-sandbox-${VERSION}
sudo bash deploy/systemd/quickstart.sh
```

## 常见问题

### Build 失败：docker 容器启动不了

```bash
docker info  # 检查 Docker Desktop 是否运行
docker pull golang:1.22-bookworm  # 手动拉 image
```

### scp 很慢

检查网络，或考虑先把 tarball 传到 CDN / 对象存储，服务器上用 `wget` / `curl` 下载：

```bash
# 传到 S3（示例）
aws s3 cp dist/agent-sandbox-${VERSION}-linux-amd64.tar.gz \
  s3://my-releases/

# 服务器上下载
ssh server "cd /tmp && \
  curl -LO https://my-releases.s3.amazonaws.com/agent-sandbox-${VERSION}-linux-amd64.tar.gz && \
  ..."
```

### sha256sum 校验失败

tarball 损坏。重新 scp 或重新 build。
