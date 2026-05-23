# ADR-002: 控制面存储用 talon 而不是 PostgreSQL

- 日期:2026-05-23
- 状态:已决定(v0.1 上线即采用)
- 相关代码:
  - [`internal/storage/store.go`](../../internal/storage/store.go) — `Store` 接口
  - [`internal/storage/auth_store.go`](../../internal/storage/auth_store.go) — `AuthStore` 接口
  - [`internal/storage/talon/`](../../internal/storage/talon/) — talon 实现
- 深度评估:[`docs/architecture/talon-as-data-layer-assessment.md`](../architecture/talon-as-data-layer-assessment.md)

## 背景

sandbox 平台的控制面数据(tenant / user / api_key / sandbox / process /
image / audit / worker / session 等)需要一个存储后端。业界默认选择是
PostgreSQL——SQL 标准、生态成熟、运维熟悉。

这个项目选了 talon(`github.com/darkmice/talon-sdk-go`,内部 superclaw-db
引擎)。本 ADR 解释这个非默认选择。

完整对比和"talon 能做 / 不能做什么"在
[talon-as-data-layer-assessment.md](../architecture/talon-as-data-layer-assessment.md)
有 357 行深度评估,这里只总结决策视角的关键论证。

## 决策

控制面数据(sandbox / process / image / auth 等)用 **talon**。
数据面数据(workspace 文件、rootfs upper、log 二进制等)**不用 talon**——
那些走 backend bundle / workspace / fs(见
[`internal/runtime/bundle/`](../../internal/runtime/bundle/)、
[`internal/storage/workspace/`](../../internal/storage/workspace/))。

## 为什么不用 PostgreSQL

不是 "PG 不好",而是这个项目的**部署形态和 talon 更匹配**:

1. **嵌入式 / 单进程**:talon SDK 是 Go 进程内嵌的 KV+SQL 引擎,不需要单独
   运行一个 DB 进程。sandbox-api 和 sandbox-worker 直接 `tsdk.Open(dir)`
   开数据目录就用。PG 需要单独跑 postgres 进程 + 网络配置 + 用户/权限管理,
   对自托管运维(目标用户是"想跑自己 vibe coding 平台的中小团队")是
   额外负担。

2. **部署 footprint 小**:开发机 / 演示机 / 小规模生产**只需要二进制 +
   一个数据目录**。`scripts/dev/up.sh` 5 秒起一套完整环境;PG 方案至少需要
   docker-compose 把 postgres 加进去,新人 onboarding 复杂度上一个量级。

3. **数据规模匹配**:控制面记录是"行数 << 10 万"量级(假设 1000 用户 ×
   100 sandbox/user × 10 process/sandbox = 100 万行,这是极端值)。talon
   在 GB 级数据规模下读写性能足够,不需要 PG 的查询规划器 / 并发事务那种
   级别的能力。

4. **多模型一体**:talon 同时是 KV、SQL、向量、FTS 引擎(详见
   [架构评估文档](../architecture/talon-as-data-layer-assessment.md))。
   后续做"audit query 全文检索"、"session memory 向量召回"等功能时
   不用再叠一个 elasticsearch / qdrant。

5. **作者背景**:platform 的作者 `darkmice` 同时是 talon 引擎作者——
   talon SDK 有问题可以直接定位修复,不存在"上游不响应"风险。这是
   **战略选择**:在自家技术栈深度上加杠杆,不是"用 PG 还是 talon"的中立
   决策。

## 为什么不用 PostgreSQL 的反方观点

诚实记录:

- **运维社区熟悉度**:PG 的备份、监控、调优工具链(pgbench / pg_stat /
  pg_repack)远比 talon 成熟。生产规模上去后这点会有压力。
- **HA / 集群**:PG 有 patroni / Citus / 分片方案,talon 目前是单进程
  嵌入式,HA 需要应用层做(目前没做)。
- **SQL 生态工具**:DBeaver / DataGrip / metabase 等可视化 / BI 工具
  直接连 PG;talon 没有同款 GUI 客户端,运维查数要走 ops 端点或自己写
  Go 程序。

我们接受这些权衡,因为:
1. 平台的运维边界目前是"小团队自托管",不需要 HA / 集群
2. 应用内有 admin console / ops 端点提供管理 UI,不依赖第三方 GUI
3. 真正规模上来要切 PG 时,`Store` / `AuthStore` 已经是 interface,
   写一个 `internal/storage/postgres/` 实现替换即可,**没有 hardcode 风险**

## interface 抽象现状(2026-05-23 复核)

为了"以后能换"这点,storage 层已经做了完整 interface 抽象:

- `storage.Store` interface(49 方法):sandbox / process / image /
  worker / audit / session 等所有控制面数据 CRUD
- `storage.AuthStore` interface(14 方法):tenant / user / api_key
- 两个 interface 都只有 talon 一个实现(`internal/storage/talon/`),
  非 talon 实现要求**满足相同契约**

任何调用方(handlers / services / pilots)都依赖 interface 而不是 talon
struct——切换实现是替换 New 调用,不是改散落各处的业务代码。

## 给后续维护者的提示

- **不要在业务代码里直接 import `talon-sdk-go`**——必须经过
  `internal/storage/talon/` 包,这是抽象边界
- **看到 `internal/storage/talon/` 里用 raw SQL string 拼参数**:
  talon SDK v0.2.x 没有 prepared statement API,必须手动 quote
  (`quote(s)` helper 在 [`store.go:41`](../../internal/storage/talon/store.go))。
  这是 talon SDK 的限制,不是 SQL 注入安全漏洞(quote 已做转义和 NUL 检查)
- **想切 PG**:照 `internal/storage/talon/` 包结构镜像写一个
  `internal/storage/postgres/`,跑现有的 storage interface 测试套件
  (`internal/storage/talon/*_test.go` 大多数测试是 interface 级,
  能复用)
- **看到 [[talon-engine-constraints]] 这种 memory 引用**:这是开发者
  本地 memory 系统,不在仓库里;它记录了 talon 引擎的几个非显然 SQL/SDK
  限制(同一进程不能同一目录开两个 store 等),代码注释里也有标注

## 教训(供 ADR 索引用)

- 技术选型不是"哪个更好",而是"哪个**和我们的部署形态、规模、目标用户、
  团队能力**最匹配"
- 早期抽 interface 的工程成本极低(就是写个 type 定义),收益是"以后想换不
  改业务代码";不存在"为了换而换",而是"为了**不必换**而抽"
- 写 ADR 时**记录反方观点**——以后如果决策真的要被推翻,有迹可循
