---
title: Changelog
description: Talon Sandbox 版本更新记录
---

# Changelog

本文件按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式维护。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 此文件从主仓 `CHANGELOG.md` 自动同步，请勿手动修改。
> 运行 `pnpm sync:docs` 可拉取最新版本。


## [1.0.0] - 2026-05-24

第一个面向客户的稳定版本。从 v0.1 内测一次性补齐了 5 条接入方式、商业化前置
(RBAC + seccomp + sandbox-logger sidecar + ?wait=running)、生产部署双轨
(Docker dev / systemd 生产)、文档站 + Grafana dashboard 预置。

详见 [v1.0 release checklist](docs/superpowers/specs/2026-05-24-v1.0-release-checklist.md)。

### Added

- **Spec 41 — sandbox-logger sidecar**:O_RDWR self-keepalive fifo 持久 reader,
  worker 重启时业务进程不再被 SIGPIPE 杀;静态 linux 二进制随 worker 启动
  hardlink 注入 sandbox rootfs。e2e 验证:`kill -9 worker` 后业务 alive +
  日志连续无断。
- **Spec 42 — per-tenant RBAC**:owner / developer / viewer 三角色,JWT
  携带 role,`RequireRole` middleware 装饰所有 mutating 端点。`PATCH /v1/tenants/
  {tid}/users/{uid}` owner-only + last-owner 保护。`/auth/me` 返 role。
- **Spec 44 — seccomp filter**:241 syscall 白名单 (`ocibundle.DefaultSeccompProfile`)
  + 三架构 (x86_64/x86/aarch64) + `SANDBOX_DISABLE_SECCOMP` opt-out。
- **Spec 45 — API/SDK 友好端点**:network_policy 别名 (allowlist/open/sealed/deny)
  服务端层 + `POST /v1/sandboxes?wait=running` 同步生命周期 (wait_timeout 默认 60s
  上限 300s,504 timeout 返当前 state)。
- **Spec 46 — sandboxctl CLI P1**:Go + cobra 单二进制,独立 go.mod 避免污染主仓。
  命令:login / logout / whoami / create / list / get / rm / version。XDG 配置
  + OS keyring 存 API key。52 tests 全绿。P2/P3 (exec/pty/cp/preview/agent run)
  留下一版。
- **Spec 47 — prewarm 池重启 reclaim**:worker 启动时 `ReclaimPrewarmLeftovers`
  清理野 prewarm 容器(没在中心表的 runc 残留),metric
  `sandbox_prewarm_reclaimed_total{outcome}`。
- **Spec 48 — signed preview URL**:`POST /v1/sandboxes/{id}/preview-token`
  签发短期 JWT(`iss="preview"` / `aud="preview"` 与用户 JWT 隔离),`?token=`
  持票即放行 preview,跳过 cookie/CSRF/API key 流程,方便分享 demo。token 绑定
  sandbox_id + port,跨 sandbox/port 拒;TTL 默认 3600s 上限 86400s;preview
  handler 验签通过后从 URL 剥除 `?token=` 避免泄露给后端。metric
  `sandbox_preview_token_total{outcome=signed|verified|invalid|expired}`。
  12 unit tests + 9 e2e tests 全绿。
- **OpenAPI 3.1 完整 spec**:`api/openapi.yaml` 1010 行,covers 8 endpoint
  groups (auth/sandboxes/processes/fs/pty/browser/agent/admin)。
- **4 语言 SDK**:Python `agent-sandbox`(15 tests)/ TypeScript
  `@agent-sandbox/sdk`(57 tests)/ Go(56 tests, -race 绿)/ .NET
  `AgentSandbox.Sdk`(53 tests)。各自独立 git 仓,从同一份 OpenAPI 对齐字段。
  全部支持 hero 三步:create with `wait="running"` → run process → preview URL。
- **客户文档站**:VitePress 驱动 [agent-sandbox-docs](https://github.com/talon-org/agent-sandbox-docs),
  含 quickstart(curl 30s + docker + systemd + SDK)+ API 参考 9 页 +
  OpenAPI Redoc 渲染 + 部署 4 页 + 运维监控 + changelog。
- **设计 tokens**:`design-tokens/tokens.css` 8 主题 × 2 mode × 4 字体 × 3 密度
  data-attribute 组合切换,console SPA / docs 站 / 未来官网共用。
- **Grafana dashboard 预置**:`deploy/grafana/dashboards/agent-sandbox-overview.json`
  25 panels 分 5 row,$tenant_id 多选 + $DS_PROMETHEUS 数据源变量,Grafana 10+
  schema v39。配套 4 条 PromQL 告警建议。

### Deployment

- **Docker compose** (`deploy/docker/`):multi-stage Dockerfile (node-alpine SPA
  build → golang-bookworm CGO talon build → debian-slim 127MB final),3 服务 +
  4 named volumes,自动 secret 生成。**明确标 dev/test only**(localprocess
  adapter 无真隔离)。
- **systemd quickstart** (`deploy/systemd/quickstart.sh` 463 行):preflight + 7 步包装
  (install + bootstrap + enable + start + summary)。`preflight.sh` 9 项环境检查
  (内核 / runc / cgroup v2 / iptables / 网段 / netns / 必装包 / HTTPS)。
- **部署文档** `docs/deployment/README.md`:三路径入口(Docker dev / systemd
  生产 / mac → 服务器发布),build-bundle.sh tarball + scp + sha256 验证 +
  多机 fan-out。

### Changed

- **Spec 18 → runsc adapter** 默认仍 `runc`,`SANDBOX_RUNTIME=runc|runsc|localprocess`
  全局可切。gVisor 路径 e2e 通过。
- **Spec 40 stage 3** rootfs 默认切 overlay(数据驱动:prewarm pool 5 sandbox
  物理盘 hardlink 0MB / overlay 0.1MB,启动 0.050s vs 0.051s 几乎同;但 overlay
  解锁 apt/pip/npm install 等可写场景)。`SANDBOX_ROOTFS_MODE=hardlink` opt-out
  保留。

### Fixed

- **arch_prctl seccomp regression**:x86_64 glibc TLS 初始化要 `arch_prctl(ARCH_SET_FS, ...)`,
  之前默认 profile 漏掉导致所有容器进程秒崩 "Cannot allocate TLS block"。补到
  syscall 白名单 + 加 regression test (commit ef51ff4)。

### Migration from 0.1

- 升级路径:`git pull && systemctl restart agent-sandbox-{api,worker}`。
- 数据库 schema 自动 migrate(users 表加 role 字段,迁移老数据 = 每 tenant
  最小 id 升 owner)。
- 已有 sandbox 不需要重建。
- 已有 API key 继续可用(API key 路径默认 developer 角色,跟旧行为一致)。
- 之前用 `network_policy: restricted-egress` 的 SDK / 脚本仍可用;新代码推荐
  用别名 `network: allowlist` 更短。

---

## [0.1.0] - 2026-05-23

### Security

- **P0 fs API 中间组件 symlink 穿透**:O_NOFOLLOW 只防叶子 symlink,sandbox 内 agent
  在 workspace 创中间组件 symlink 即可让 host 端 FS API 读 host 任意路径。新增
  `internal/runtime/safeopen` 包,Linux 走 `openat2` + `RESOLVE_BENEATH` +
  `RESOLVE_NO_SYMLINKS`,内核级拒绝任何 symlink 与越界路径。FSWrite 改原子写
  (temp file + 同目录 rename),崩溃中途不留半截文件。FSRead 用 `io.ReadAll` +
  `LimitReader` 避免 POSIX 单次读不完整(commit ecbf448)。
- **P1 fs API FSDelete TOCTOU**:safeopen 验证 fd 与后续 `RemoveAll` 之间的
  micro-window 可被换 symlink。新增 `safeopen.RemoveAllInRoot`,所有 unlinkat /
  readdir / openat 走 dir-fd 链,中间组件被换不影响删除轨迹。叶子 symlink
  按文件 unlink 自身,不跟外部目标(commit 2d47955)。
- **P1 preview 子域名 sandbox-id 注入**:`Host` 头来的 sandbox-id 段强制
  `[A-Za-z0-9_-]{1,128}` 白名单。HTTP/2 :authority 与 raw HTTP/1.1 允许的字符比
  DNS 宽,白名单挡 path traversal / NUL / 非 ASCII(commit 2d47955)。
- **P1 processlog `.1` fsync + race window 缩窄**:`copytruncate` 复制到 `.1`
  后立即 fsync 防 power loss 损坏备份;锚定 `cutoff = stat.Size` 限定复制范围,
  缩小 truncate 期间业务进程写入的 race window。文档化 race window 接受策略
  (spec 16 完整版 pipe-relay 根治)(commit 2d47955)。
- **P1 processlog `pathLocks` 无限增长**:`ForgetPath` 接到 `deleteProcessBoth` /
  `deleteProcessesBySandboxBoth`,worker 长跑 + 进程累计删数万次内存不再泄漏
  (commit 2d47955)。

---

## [0.1.0-rc1] - 2026-05-23

### Added

- **sandbox runtime (spec 15)**:runc adapter + OCI bundle + veth+DNAT 网络隔离
  (user namespace / cgroup v2 / netns / capability drop)
- **多租户认证**:API key 认证 + tenant quota + per-sandbox cgroup 限额 + audit log
  + secrets injection(tmpfs/env 双模式,TTL 扫描)
- **sandbox 长驻进程管理**:start / stop / list + 业务进程 stdio 滚动日志
  (copytruncate-rotate) + GET `/processes/{pid}/logs` 端点
- **PTY 流式**:WebSocket PTY 端点 + 录像 + gRPC Canceled → 正常关闭映射
- **browser endpoint**:headless Chromium + CDP + per-sandbox profile;
  sandbox netns 内装 PREROUTING REDIRECT 让 host DNAT 命中 lo:9222
- **preview 反代**:path-prefix 模式(v0.1 稳定) + subdomain 模式(vibe coding 默认推荐,
  需 wildcard DNS + TLS)
- **workspace FS API**:read / write / list / delete HTTP 端点(Web IDE 核心)
- **agent run 端点**:高层 `/agent/run` + AgentRunPanel UI
- **baseimage 中心目录**:admin 主动预热 + 下载进度跟踪 + env-driven image seed;
  默认镜像迁至 `talon-baseimages v0.1.0`
- **runtime reconcile (spec 22)**:worker 重启可绑回已有 sandbox;
  schema 持久化 `runtime_kind / bundle_path / netns_path / cgroup_path`
- **workspace 持久化 (spec 23a)**:LocalBackend + NFSBackend;worker 掉电数据不丢
- **跨节点元数据中心化 (spec 23b)**:sandbox + process 元数据双写 sandbox-api;
  管理员 ReassignSandbox
- **auto-failover (spec 23c)**:generation-based fencing + autopilot 自动
  reassign dead worker 上的 sandbox + cooldown 机制
- **sandbox pause / resume / idle auto-pause**:idle 超时自动 pause(替代 stop);
  stopped sandbox 允许重启;destroy-from-any-alive 状态
- **runc prewarm pool (spec 30)**:预热池减少 sandbox 冷启动延迟
- **worker 容量感知调度 (spec 32)**:all-workers-full audit + metric + sentinel 区分
- **多租户隔离**:网络出站三档策略(netfilter 落地) + 字段贯通 DB / proto / DTO
- **observability**:ops server(health / metrics / audit) + 结构化日志 + audit 精确过滤
- **cookie + CSRF 认证 (spec 19)**:移除 preview / PTY token-in-query 泄漏路径
- **gVisor (runsc) runtime adapter (spec 18)**:备用高隔离运行时基础设施
- **业务进程 PID 1 换 tini**:正确 reap reparented 子进程,避免僵尸堆积
- **单节点 systemd 部署套件**:install.sh + 完整指南 + 反代示例配置
- **web 控制台 + admin 控制台**:登录、sandbox 详情、进程预览、worker 管理、
  reassign 对话框、secrets 页面、网络策略页面、audit / metrics dashboard;
  code-split + route lazy 加载

### Fixed

- **chromium M112+ 强制 listen lo**:sandbox netns 内装 `PREROUTING REDIRECT`
  让 host DNAT 仍能命中 chromium lo:9222(commit 6580cdd)
- **127.0.0.1 → bridge 网段 DNAT 回包路径**:host `POSTROUTING` 加 `MASQUERADE`,
  loopback DNAT 回包能正常回 host(commit b415889)
- **chromium 启动 flag**:`--crash-dumps-dir` → `--breakpad-dump-location`,
  chromium 148 crashpad 能正常启动(commit 0428ebe)
- **gRPC status code 映射**:client 把 gRPC code 反翻回 sentinel,HTTP 层
  status code 正确返回;ready timeout 提升至 45s(commit 90dcc0c)

### Known Issues

- 仅 runc 隔离,不建议接外部不可信用户;gVisor 第二道隔离预计 v0.2 落地
- 单节点部署,无 sandbox-api 集群 HA,多节点方案不在 v0.1 范围
- subdomain preview 需 wildcard DNS + TLS 证书,运维侧配置见
  `docs/deployment/single-node-systemd.md`;单域名部署 fallback 用 path-prefix
- 业务进程 stderr 偶有 dbus / fontconfig 噪声(headless chromium 行为,不影响功能)
- dev server preview 走 path-prefix 时,用户项目需配置对应的 `base` 前缀
