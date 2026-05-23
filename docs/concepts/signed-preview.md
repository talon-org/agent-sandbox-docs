# Signed Preview URL

Signed preview URLs let you share a sandbox preview with anyone — no account or API key required on the recipient side. The link works for a bounded TTL, then automatically expires.

## Use case

You are vibe-coding and want to show the running result to a colleague.

Without signed preview URLs you would need to give them your API key or create a temporary user account. With signed preview URLs you issue a token that is:

- Scoped to exactly one sandbox and one port
- Time-limited (default 1 hour, max 24 hours)
- Accepted by the preview proxy without any other credential

## Issue a token

```http
POST /v1/sandboxes/{id}/preview-token
Authorization: Bearer <your-api-key-or-jwt>
Content-Type: application/json

{
  "port": 5173,
  "ttl_seconds": 3600
}
```

Response:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2026-05-24T15:04:05Z"
}
```

**Permission:** requires developer or owner role. Viewers cannot issue tokens — this prevents read-only users from distributing preview access beyond their own role.

## Share the preview URL

Append `?token=<value>` to the preview URL and share it:

```
https://api.example.com/v1/sandboxes/sbx_xxx/preview/5173/?token=eyJ...
```

Or with the subdomain pattern (if configured):

```
https://sbx_xxx-5173.preview.example.com/?token=eyJ...
```

The recipient opens the URL in a browser. No login, no account.

## TTL and expiry

| Parameter | Default | Maximum |
|---|---|---|
| `ttl_seconds` | 3 600 (1 hour) | 86 400 (24 hours) |

Values above the maximum are silently clamped to 86 400.

After the TTL expires the token is rejected with 401. Issue a new token to continue sharing.

## Security properties

| Property | Detail |
|---|---|
| Sandbox scope | Token is cryptographically bound to `sandbox_id`; cannot access a different sandbox |
| Port scope | Token is bound to the specific port signed at issue time |
| Control-plane isolation | Preview tokens cannot call any API other than the preview proxy |
| Token stripping | The `?token=` parameter is removed before forwarding to the upstream app, so it does not appear in the sandbox app's own logs |
| Expiry | Tokens expire at the `exp` claim; no server-side state is needed |
| No revocation (v1) | Tokens cannot be individually revoked before expiry. Use short TTLs for sensitive demos. |
| No cookie, no CSRF | Tokens travel via query string only and are not stored in cookies |

## Subdomain mode

The subdomain middleware rewrites `Host: sbx-5173.preview.example.com` into the equivalent path-prefix URL before auth runs, so `?token=` is preserved in the query string and the handler sees it correctly.

## Access log considerations

The `?token=` parameter appears in the URL. The sandbox-api logging middleware records only `URL.Path` (not query string) so the token does not appear in sandbox-api's own access log. However:

- TLS terminators or upstream load balancers may log the full URL. Consult your infrastructure logging policy before sharing long-lived tokens.
- Use short TTLs to limit the blast radius if a URL is inadvertently logged.

## curl example

```bash
# Issue a token
TOKEN=$(curl -s -X POST https://api.example.com/v1/sandboxes/sbx_xxx/preview-token \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"port": 5173, "ttl_seconds": 3600}' | jq -r .token)

# Use the token (no auth header needed)
curl "https://api.example.com/v1/sandboxes/sbx_xxx/preview/5173/?token=$TOKEN"
```

## Related

- [Sandbox lifecycle](sandbox-lifecycle.md)
- [Preview API reference](../api/sandboxes.md)
