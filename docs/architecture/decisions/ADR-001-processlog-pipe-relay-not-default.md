# ADR-001: processlog pipe-relay 不作为默认 stdio 通道

- 日期:2026-05-23
- 状态:**Superseded by spec 41** (sandbox-logger sidecar) — 2026-05-23
- 历史状态:已决定(experimental 实现保留,默认 OFF)
- 相关代码:[`internal/runtime/processlog/pipe_relay_linux.go`](../../internal/runtime/processlog/pipe_relay_linux.go)
- 相关 spec:[2026-05-23-processlog-pipe-relay-design.md](../superpowers/specs/2026-05-23-processlog-pipe-relay-design.md)
- 取代 spec:[2026-05-23-sandbox-logger-sidecar-design.md](../superpowers/specs/2026-05-23-sandbox-logger-sidecar-design.md)

## 后续(2026-05-23)

本 ADR 列出的"worker 重启 → fifo reader 没了 → 业务 SIGPIPE 死"问题已由
**spec 41 sandbox-logger sidecar** 根治:fifo reader 角色从 worker 移到
**sandbox 内常驻 sidecar 进程**,跟业务进程同处一个 PID namespace,共享
sandbox 生命周期 → worker 进出无感,业务 stdout 永远有 reader,SIGPIPE
不再可能。

worker-side pipe-relay 实现(本 ADR 描述的 experimental 路径)**保留**
但不再推荐——优先级让位给 sidecar 路径。sidecar 路径自动启用:worker
启动时把 host 端 sandbox-logger 二进制注入 sandbox rootfs(hardlink 到
`<rootfs>/usr/local/bin/`),init script 探测到就拉起;注入失败或
baseimage 不允许 → fallback v0.1 copytruncate(本 ADR 描述的 v0.1 路径)。

e2e 实测(2026-05-23, sandbox-test-linux):创建 sandbox + 长跑业务进程 →
`kill -9 worker` → 3 秒后业务进程仍 alive,日志连续增长(285 → 314 行,
字节流无断)。本 ADR 的核心痛点**实测消除**。

## 背景

sandbox 内业务进程(用户跑的 npm/python/chromium 等)的 stdout/stderr 会落到
host 端文件。当文件超过容量上限(32 MiB)时需要 rotate(备份+清空),否则
sandbox 长跑会把盘吃光。

v0.1 的实现采用 logrotate(8) 的 **copytruncate** 风格:

```
1. cutoff := stat(主文件).Size      # 锚定 race-window 起点
2. cp 主文件[0..cutoff) → 主文件.1   # 备份
3. truncate(主文件, 0)               # 清空主文件
```

业务进程的 O_APPEND fd 在 step 3 后下一次 write 偏移自动变 0,继续写
"清空了的"主文件。**问题**:cutoff 锚定后到 truncate 完成之间(几毫秒),
业务进程写到 [cutoff..size) 的字节既不在 .1 备份里(超出 cutoff),又会
被 truncate 一起清掉——**这几 KB 字节彻底丢失**。

chromium 启动时的 dbus/fontconfig 噪声、高吞吐日志场景下能观察到几行丢失。
v0.1.0 audit 标 P1,留 spec 16 完整版根治。

## 拟做方案(pipe-relay)

业务进程 stdio 不再直接是文件 fd,而是 **fifo (named pipe)** 的 write 端。
worker 持有 fifo 的 read 端 + 后台 relay goroutine,把字节从 fifo 搬到
worker 独占持有的真实文件 fd:

```
business stdout ─┐
                 ├─→ fifo ─→ [worker relay goroutine] ─→ 真实日志文件
business stderr ─┘                                          ↑
                                                            │
                                              rotate 时只在 worker 这边
                                              close+rename+open,业务无感
```

理论收益:rotate 时 worker 自己换文件 fd,业务的 fd 始终指着 fifo,**不存在
"业务写到错位置"的 race window**。

## 实现 + 测试结果

完整实现已落地(commits 77c7e07 / 80e62c9):

- `OpenPipeRelay(path)` → 返回业务用的 BusinessWriter + worker 端 relay handle
- `ReattachRelay(path)` → worker 重启后重 open fifo 接力
- `Rotate(handle)` → close 旧 + rename + open 新,业务无感
- `UnlinkFifo(path)` → 业务结束后清理 fifo

16/16 单元测试通过,包括 **byte-exact race-free 验证**:
500 行业务写入 + 中途 rotate,主文件 + .1 加起来字节数精确等于业务写入字节数。

## 为什么不切默认 — fifo 的 SIGPIPE 死结

调研发现 **Linux fifo 的一个固有约束**:

> 当 fifo 的所有 reader 都关闭时,write 端下一次写会收到 SIGPIPE 信号
> (默认动作:终止进程)和/或 EPIPE 错误。

应用到 sandbox 的部署形态:

- worker 是 fifo 的**唯一 reader**
- worker 进程死亡(crash / OOM / systemd restart / 升级重启) = fifo 失去所有 reader
- 业务进程在那一瞬间的下一次 stdout/stderr write 会被 SIGPIPE 杀掉
- chromium / node / python 等业务都默认不处理 SIGPIPE → **直接终止**

也就是说:

| 场景 | v0.1 copytruncate(默认) | pipe-relay(拟新默认) |
|---|---|---|
| 正常运行 | 偶尔 rotate 时丢几 KB | 字节级精确不丢 |
| worker 重启 | 业务无感,继续运行 | **业务被 SIGPIPE 杀** |

worker 重启是相对常见的运维事件(版本升级、配置变更、systemd 自愈重启等),
而 rotate race 丢失的几 KB 是噪声级低危。**用"日志精确"换"业务进程在
worker 重启时全死"是不可接受的交易**。

任何 worker-side relay 设计(fifo / anon pipe / socketpair / unix socket)
都有同样的"reader 全无 → writer 被杀"语义,这是 POSIX IPC 的基本约束,
不是 fifo 独有的问题。绕不开。

## 决策

1. **v0.1 copytruncate 仍是默认** sandbox stdio 通道
2. **pipe-relay 作为 experimental 基础设施保留**——代码 + 测试都不删,API
   稳定,允许 opt-in 场景(测试 / 审计敏感场景下用户主动接受 worker 重启
   风险)
3. **真正彻底消除 race**:已由 [spec 41 sandbox-logger sidecar](../superpowers/specs/2026-05-23-sandbox-logger-sidecar-design.md)
   解决——sidecar 与业务进程共生命周期,始终持有 fifo reader (O_RDWR 自封口),
   worker 重启不影响 fifo reader 存活;sidecar 自己负责写真实日志文件。本 ADR
   作为历史决策记录保留,实际方案已切换。

## 给后续维护者的提示

如果你看到 `internal/runtime/processlog/pipe_relay_linux.go` 觉得"为啥
这文件有但 adapter 里没人调用":

- 这不是死代码,是经过完整验证的 opt-in 基础设施
- spec 41 sandbox-logger 走了不同设计路径(独立 sidecar 进程,不复用本 API),
  pipe_relay_linux.go 暂保留作为参考实现 / 测试桩;如果长期无引用可在
  spec 42+ 评估删除
- 如果你要给某个特殊业务进程接 pipe-relay,先确认那个进程不在乎 SIGPIPE
  (例如用 `signal.Notify(c, syscall.SIGPIPE)` 显式处理过的 Go 程序,或
  设置过 `signal(SIGPIPE, SIG_IGN)` 的 C 程序)

## 教训(供 ADR 索引用)

- 不为了"完成 spec"硬切一个有致命缺陷的方案
- 实现 + 测试通过 ≠ 可以上生产;必须考虑**运维场景**(worker 重启、节点
  替换、版本升级)对 IPC 语义的隐含要求
- POSIX IPC 的 "reader gone → writer SIGPIPE" 是普遍约束,任何 relay 设计
  都要先确认 reader 一直在
