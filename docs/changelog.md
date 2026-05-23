---
title: Changelog
description: Agent Sandbox Platform 版本更新记录
---

# Changelog

本文件按 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式维护。
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

> 此文件从主仓 `CHANGELOG.md` 自动同步，请勿手动修改。
> 运行 `pnpm sync:docs` 可拉取最新版本。

---

## [0.1.0] - 2026-05-23

### Security

- **P0 fs API 中间组件 symlink 穿透**：O_NOFOLLOW 只防叶子 symlink，sandbox 内 agent
  在 workspace 创中间组件 symlink 即可让 host 端 FS API 读 host 任意路径。新增
  `internal/runtime/safeopen` 包，Linux 走 `openat2` + `RESOLVE_BENEATH` +
  `RESOLVE_NO_SYMLINKS`，内核级拒绝任何 symlink 与越界路径。FSWrite 改原子写
  (temp file + 同目录 rename)，崩溃中途不留半截文件。
- **P1 fs API FSDelete TOCTOU**：safeopen 验证 fd 与后续 `RemoveAll` 之间的
  micro-window 可被换 symlink。新增 `safeopen.RemoveAllInRoot`，所有 unlinkat /
  readdir / openat 走 dir-fd 链，中间组件被换不影响删除轨迹。叶子 symlink
  按文件 unlink 自身，不跟外部目标。
- **P1 preview 子域名 sandbox-id 注入**：`Host` 头来的 sandbox-id 段强制
  `[A-Za-z0-9_-]{1,128}` 白名单，防 path traversal / NUL / 非 ASCII。
- **P1 processlog `.1` fsync + race window 缩窄**：`copytruncate` 复制到 `.1`
  后立即 fsync 防 power loss 损坏备份；锚定 `cutoff = stat.Size` 限定复制范围。
- **P1 processlog `pathLocks` 无限增长**：`ForgetPath` 接到进程删除路径，
  worker 长跑 + 进程累计删数万次内存不再泄漏。

---

## [0.1.0-rc1] - 2026-05-23

### Added

- **sandbox runtime (spec 15)**：runc adapter + OCI bundle + veth+DNAT 网络隔离
  (user namespace / cgroup v2 / netns / capability drop)
- **多租户认证**：API key 认证 + tenant quota + per-sandbox cgroup 限额 + audit log
  + secrets injection（tmpfs/env 双模式，TTL 扫描）
- **sandbox 长驻进程管理**：start / stop / list + 业务进程 stdio 滚动日志
  (copytruncate-rotate) + GET `/processes/{pid}/logs` 端点
- **PTY 流式**：WebSocket PTY 端点 + 录像 + gRPC Canceled → 正常关闭映射
- **browser endpoint**：headless Chromium + CDP + per-sandbox profile；
  sandbox netns 内装 PREROUTING REDIRECT 让 host DNAT 命中 lo:9222
- **preview 反代**：path-prefix 模式（v0.1 稳定）+ subdomain 模式（vibe coding 推荐，
  需 wildcard DNS + TLS）
- **workspace FS API**：read / write / list / delete HTTP 端点（Web IDE 核心）
- **agent run 端点**：高层 `/agent/run` + AgentRunPanel UI
- **baseimage 中心目录**：admin 主动预热 + 下载进度跟踪 + env-driven image seed
- **runtime reconcile (spec 22)**：worker 重启可绑回已有 sandbox；
  schema 持久化 `runtime_kind / bundle_path / netns_path / cgroup_path`
- **workspace 持久化 (spec 23a)**：LocalBackend + NFSBackend；worker 掉电数据不丢
- **跨节点元数据中心化 (spec 23b)**：sandbox + process 元数据双写 sandbox-api；
  管理员 ReassignSandbox
- **auto-failover (spec 23c)**：generation-based fencing + autopilot 自动
  reassign dead worker 上的 sandbox + cooldown 机制
- **sandbox pause / resume / idle auto-pause**：idle 超时自动 pause；
  stopped sandbox 允许重启；destroy-from-any-alive 状态
- **runc prewarm pool (spec 30)**：预热池减少 sandbox 冷启动延迟
- **worker 容量感知调度 (spec 32)**：all-workers-full audit + metric + sentinel 区分
- **多租户隔离**：网络出站三档策略（netfilter 落地）
- **observability**：ops server（health / metrics / audit）+ 结构化日志 + audit 精确过滤
- **cookie + CSRF 认证 (spec 19)**：移除 preview / PTY token-in-query 泄漏路径
- **gVisor (runsc) runtime adapter (spec 18)**：备用高隔离运行时基础设施
- **业务进程 PID 1 换 tini**：正确 reap reparented 子进程，避免僵尸堆积
- **单节点 systemd 部署套件**：install.sh + 完整指南 + 反代示例配置
- **web 控制台 + admin 控制台**：登录、sandbox 详情、进程预览、worker 管理、
  reassign 对话框、secrets 页面、网络策略页面、audit / metrics dashboard

### Fixed

- **chromium M112+ 强制 listen lo**：sandbox netns 内装 `PREROUTING REDIRECT`
  让 host DNAT 仍能命中 chromium lo:9222
- **127.0.0.1 → bridge 网段 DNAT 回包路径**：host `POSTROUTING` 加 `MASQUERADE`，
  loopback DNAT 回包能正常回 host
- **chromium 启动 flag**：`--crash-dumps-dir` → `--breakpad-dump-location`，
  chromium 148 crashpad 能正常启动
- **gRPC status code 映射**：client 把 gRPC code 反翻回 sentinel，HTTP 层
  status code 正确返回；ready timeout 提升至 45s

### Known Issues

- 仅 runc 隔离，不建议接外部不可信用户；gVisor 第二道隔离预计 v0.2 落地
- 单节点部署，无 sandbox-api 集群 HA，多节点方案不在 v0.1 范围
- subdomain preview 需 wildcard DNS + TLS 证书配置
- dev server preview 走 path-prefix 时，用户项目需配置对应的 `base` 前缀
