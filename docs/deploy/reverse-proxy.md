# 反向代理配置

Talon Sandbox 的 sandbox-api 默认监听 `127.0.0.1:18080`，需要前置一个反向代理来提供：

- HTTPS 终止和证书管理
- WebSocket 升级透传（PTY / CDP / preview）
- 客户端真实 IP 透传
- 长连接超时配置

## 关键配置要点

::: warning 必读：WebSocket 和长连接
以下特性如果配置不当会导致功能异常：

1. **WebSocket upgrade 透传** — PTY、CDP screencast、preview 全走 WebSocket
2. **关闭 proxy_buffering** — 流式 / 长连接必须关闭
3. **超长超时（24h）** — sandbox 任务可能跑数小时，反代绝对不能主动断
4. **X-Forwarded-Proto** — sandbox-api 据此决定 cookie Secure 属性和 wss URL
:::

---

## Caddy（推荐）

Caddy 自动管理 ACME 证书，WebSocket 和长连接透传是内置默认行为，配置最简单。

### 安装

```bash
# Debian/Ubuntu
sudo apt install caddy

# 或从官网安装最新版
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### Caddyfile

```caddy
# /etc/caddy/Caddyfile

your.domain.com {
    encode gzip zstd

    reverse_proxy 127.0.0.1:18080 {
        # 长连接超时：CDP screencast / PTY / agent run 都是长跑——给到 24h
        transport http {
            response_header_timeout 5m
            read_timeout 24h
            keepalive 30s
            keepalive_idle_conns 50
        }

        # 透传客户端真实 IP
        header_up X-Real-IP {remote_host}
    }

    log {
        output stderr
        format console
        level INFO
    }
}

# 可选：重定向 www
# www.your.domain.com {
#     redir https://your.domain.com{uri} permanent
# }
```

### 启用

```bash
sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

Caddy 会自动向 Let's Encrypt 申请证书，并自动续期。

---

## nginx + certbot

### 安装 nginx

```bash
sudo apt install nginx python3-certbot-nginx
```

### nginx 配置

```nginx
# /etc/nginx/sites-available/agent-sandbox

# WS upgrade map（放在 http 块顶层，多 vhost 共用）
# 如果 nginx.conf 里已有此 map，删掉这段
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name your.domain.com;

    # HTTP → HTTPS 强转
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your.domain.com;

    # certbot 会自动填这两行
    ssl_certificate     /etc/letsencrypt/live/your.domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your.domain.com/privkey.pem;

    # TLS 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 上传大小：fs API 可能有较大文件
    client_max_body_size 16m;

    access_log /var/log/nginx/agent-sandbox.access.log;
    error_log  /var/log/nginx/agent-sandbox.error.log warn;

    location / {
        proxy_pass http://127.0.0.1:18080;

        # WebSocket / 长连接必备
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;

        # 透传客户端信息 / 协议 / Host
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 长跑 sandbox 任务不该被反代断（24h vs nginx 默认 60s）
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
        proxy_connect_timeout 60s;
    }

    # 健康检查（可选，给外部监控直接 ping）
    location = /healthz {
        proxy_pass http://127.0.0.1:18080/healthz;
        access_log off;
    }
}
```

### 启用 + 申请证书

```bash
# 软链启用
sudo ln -s /etc/nginx/sites-available/agent-sandbox /etc/nginx/sites-enabled/
sudo nginx -t

# 先用 HTTP 验证申请证书（certbot 自动改配置加 ssl_* 行）
sudo certbot --nginx -d your.domain.com

# 重载
sudo systemctl reload nginx
```

certbot 会自动续期（cron 或 systemd timer）。

---

## Cloudflare 作为反代

如果域名在 Cloudflare 管理，可以用 Cloudflare Proxy（橙云）：

1. DNS 设置 A 记录指向服务器 IP，开启 Proxy（橙云图标）
2. Cloudflare Dashboard > Rules > Configuration Rules：
   - 匹配 `your.domain.com`，关闭 **Rocket Loader**
3. Cloudflare Dashboard > Network：确认 **WebSockets** 已开启
4. SSL/TLS 模式设为 **Full (strict)**（服务器端需有有效证书）

::: warning Cloudflare 超时
Cloudflare 免费版 HTTP 连接超时为 100 秒，会导致长跑 sandbox 任务中断。如果需要跑超过 100 秒的 agent run，建议用直连 nginx/Caddy 而不是 Cloudflare Proxy。
:::

---

## Subdomain 模式 Preview（可选）

如果需要每个 sandbox 有独立的预览子域名（如 `sbx_xxx-3000.preview.your.domain.com`），需要额外配置：

### 1. Wildcard DNS

```
*.preview.your.domain.com → server-ip
```

### 2. Wildcard 证书

**Caddy**（自动处理 wildcard，需要 DNS challenge）：

```caddy
*.preview.your.domain.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }

    reverse_proxy 127.0.0.1:18080 {
        transport http {
            read_timeout 24h
        }
        header_up X-Real-IP {remote_host}
    }
}
```

**certbot**（手动 DNS challenge）：

```bash
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  -d "*.preview.your.domain.com"
```

### 3. sandbox-api 配置

在 `/etc/agent-sandbox/env` 添加：

```bash
SANDBOX_PREVIEW_DOMAIN_SUFFIX=.preview.your.domain.com
```

重启 api 服务后，sandbox 响应中的 preview URL 会自动变为 subdomain 格式。

---

## 验证配置

```bash
# 检查 HTTPS 是否正常
curl -I https://your.domain.com/healthz

# 检查 WebSocket（用 wscat）
npm install -g wscat
wscat -c "wss://your.domain.com/v1/sandboxes/sbx_xxx/pty" \
  -H "Authorization: Bearer $API_KEY"

# 检查证书
echo | openssl s_client -connect your.domain.com:443 2>/dev/null | openssl x509 -noout -dates
```
