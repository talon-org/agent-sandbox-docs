# 监控接入

平台所有进程暴露 Prometheus 兼容的 `/metrics` 端点。配套 Grafana
dashboard 随主仓发布物附带(`deploy/grafana/dashboards/`),一键 import 看面板。

## 端点

| 进程 | 端点 | 默认端口 |
|---|---|---|
| sandbox-api | `GET /metrics` | 18080 |
| sandbox-worker | `GET /metrics` | 18081 |

两个进程都允许公开 `/metrics`,但不开鉴权——靠网络层(反代/防火墙)限制
谁能 scrape。生产建议把 Prometheus 放内网,api / worker 的 18080/18081
不直接暴露公网。

## Prometheus scrape 示例

```yaml
# /etc/prometheus/prometheus.yml
scrape_configs:
  - job_name: agent-sandbox-api
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['sandbox-api:18080']
        labels:
          service: api

  - job_name: agent-sandbox-worker
    metrics_path: /metrics
    scrape_interval: 15s
    static_configs:
      - targets: ['worker-1:18081', 'worker-2:18081']
        labels:
          service: worker
```

如果是 systemd 单节点部署 + 用 Caddy 反代,可以在 Caddyfile 加个内网 IP
专属 location 让 Prometheus 也能从外面访问 `/metrics`(但要严格限制
源 IP)。

## 业务 metric 速查

| Metric | 类型 | 含义 |
|---|---|---|
| `sandbox_active_sandboxes{state}` | gauge | 各状态 sandbox 数 |
| `sandbox_pty_sessions_active` | gauge | 活跃 PTY |
| `sandbox_browser_sessions_active` | gauge | 活跃 browser |
| `sandbox_baseimage_ready_count` | gauge | cache 中已 ready 的 image 数 |
| `sandbox_http_requests_total` | counter | API QPS |
| `sandbox_http_request_duration_seconds` | histogram | API 延迟 |
| `sandbox_agent_runs_total{outcome}` | counter | /agent/run 调用 |
| `sandbox_agent_run_duration_seconds` | histogram | /agent/run 耗时 |
| `sandbox_audit_events_total{event_type,outcome}` | counter | 审计事件 |
| `sandbox_scheduler_all_workers_full_total` | counter | 调度时 worker 全满 |

完整列表见主仓 `internal/observability/metrics/registry.go`。

## Grafana dashboard

```bash
# Dashboard JSON 随发布物分发(`deploy/grafana/dashboards/agent-sandbox-overview.json`)
# Grafana UI: Dashboards → New → Import → Upload JSON → 选 Prometheus datasource
```

Dashboard 包含 5 个 row:

1. **Overview** — 顶部 6 个大数字 stat:总 sandbox / PTY / browser / image cache / API QPS / 1h 调度满载次数
2. **Sandboxes** — 按 state 分布堆叠 / 按租户 top10 / agent run 速率与延迟
3. **API health** — HTTP/gRPC QPS / 错误率 / p50-p99 latency / 热门路由
4. **Baseimage cache** — 下载字节速率 / 耗时 p95 / 各 image 累积
5. **Audit & scheduler** — 审计事件速率 / 错误 / 调度满载 / browser 启动

支持 `tenant_id` 变量(多选 + All)过滤所有面板。

## 告警建议

dashboard 不带预置 alert——告警阈值因部署规模差异大,建议自己定。下面是
一组合理起点(PromQL 形式,放到 Prometheus alertmanager 即可):

```yaml
groups:
  - name: agent-sandbox
    rules:
      # API 5xx 占比超 1% 持续 5 分钟
      - alert: AgentSandboxAPIServerErrors
        expr: |
          sum(rate(sandbox_http_requests_total{status=~"5.."}[5m]))
          / sum(rate(sandbox_http_requests_total[5m])) > 0.01
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "API 5xx 占比 > 1% 持续 5 分钟"

      # API 延迟 p99 超 2s 持续 10 分钟
      - alert: AgentSandboxAPILatencyP99
        expr: |
          histogram_quantile(0.99,
            sum by (le) (rate(sandbox_http_request_duration_seconds_bucket[5m]))
          ) > 2
        for: 10m
        labels: { severity: warning }

      # 调度满载持续触发 → 容量不足要扩 worker
      - alert: AgentSandboxSchedulerSaturated
        expr: sum(rate(sandbox_scheduler_all_workers_full_total[5m])) > 0.1
        for: 15m
        labels: { severity: warning }
        annotations:
          summary: "调度连续遇到 worker 全满 — 该扩容了"

      # 审计写失败 — 合规要求保证审计可写
      - alert: AgentSandboxAuditWriteFailed
        expr: rate(sandbox_audit_write_errors_total[5m]) > 0
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "审计日志写入失败 — 合规风险"
```

## 相关

- [部署 → Docker Compose](/deploy/docker-compose)
- [部署 → systemd 单节点](/deploy/systemd-single-node)
- [API 参考 → 错误码](/api/errors)
