# Architecture Decision Records

这里记录会影响后续维护决策的"做了 / 没做 / 为何没做"。新建一条 ADR 的时机:

- 实现了某方案但**决定不切默认 / 不上生产**——后续读者看到代码需要解释
- 在两个方案间做了**非显然的取舍**(选 A 不选 B,理由不在代码里)
- 推翻了之前的某个设计决定,需要给"以前为什么是那样"留个交代

ADR 不是 spec(spec 在 [`../superpowers/specs/`](../superpowers/specs/)
描述"做什么 / 怎么做")——ADR 描述"为什么这么做 / 为什么不那么做"。

## 索引

- [ADR-001: processlog pipe-relay 不作为默认 stdio 通道](ADR-001-processlog-pipe-relay-not-default.md)
  — 完整实现 + 测试通过的 pipe-relay 方案为什么不切默认(fifo 的 SIGPIPE 死结)
- [ADR-002: 控制面存储用 talon 而不是 PostgreSQL](ADR-002-storage-talon-not-postgres.md)
  — 为什么选 talon 嵌入式引擎,而非默认 PG;interface 抽象现状;反方观点

## 格式

每条 ADR 用以下骨架:

```
# ADR-NNN: <一句话决定>

- 日期:YYYY-MM-DD
- 状态:提议中 / 已决定 / 已撤回
- 相关代码:文件链接
- 相关 spec:文档链接

## 背景
(为啥这件事会被考虑)

## 拟做方案
(原本想怎么做)

## 实现 + 测试结果
(做到哪一步,跑了什么测试)

## 为什么 <这个决定>
(关键论证,数据 / 限制 / 取舍)

## 决策
(具体定下来的事,几条要点)

## 给后续维护者的提示
(代码里看到某文件 / 某 flag 时该怎么理解)

## 教训
(可索引的经验,供未来其他 ADR 引用)
```
