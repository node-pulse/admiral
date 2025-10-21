# Traefik Setup Guide

This document explains the Traefik reverse proxy configuration for the NodePulse Admiral stack.

## Overview

Traefik has replaced Caddy as the reverse proxy, providing subdomain-based routing with automatic SSL/TLS certificates via Let's Encrypt.

## Access Structure

### Development (Direct Port Access)

Development uses direct port exposure without Traefik for simpler setup and Cloudflare Tunnel compatibility.

| Port | Service | Purpose |
|------|---------|---------|
| `8080` | submarines-ingest | Agent metrics ingestion API (hardcoded for Cloudflare Tunnel) |
| `8081` | submarines-status | Public status pages & badges |
| `8000` | flagship | Rails admin dashboard |
| `8082` | cruiser | Next.js public site |
| `4433` | kratos | Kratos public API |
| `4434` | kratos | Kratos admin API |
| `5432` | postgres | PostgreSQL database |
| `6379` | valkey | Valkey (Redis) |

### Production (replace `yourdomain.com` with your actual domain)

| Subdomain | Service | Purpose | SSL | Auth |
|-----------|---------|---------|-----|------|
| `ingest.yourdomain.com` | submarines-ingest | Agent metrics ingestion API | ✅ |
| `status.yourdomain.com` | submarines-status | Public status pages & badges | ✅ |
| `admin.yourdomain.com` | flagship | Rails admin dashboard | ✅ |
| `app.yourdomain.com` | cruiser | Next.js public site | ✅ |
| `yourdomain.com` | cruiser | Next.js public site (root) | ✅ |
| `auth.yourdomain.com` | kratos | Identity management | ✅ |

## Configuration Files

### Static Configuration

- `traefik/traefik.yml` - Main Traefik configuration
  - Entry points (HTTP, HTTPS)
  - Let's Encrypt certificate resolver
  - File provider configuration
  - Logging settings

### Dynamic Configuration

- `traefik/dynamic.production.yml` - Production routing (actual domains with SSL)

### Compose Files

- `compose.yml` - Production setup with Traefik
- `compose.development.yml` - Development setup with direct port access (no Traefik)

## Development Setup

### 1. Start the stack

```bash
docker compose -f compose.yml -f compose.development.yml up -d
```

### 2. Access services

Services are exposed on localhost with individual ports:

- **Agent API**: http://localhost:8080 (hardcoded for Cloudflare Tunnel)
- **Status pages**: http://localhost:8081
- **Admin dashboard**: http://localhost:8000
- **Public app**: http://localhost:8082
- **Kratos public API**: http://localhost:4433
- **Kratos admin API**: http://localhost:4434

### 3. Test agent ingestion

```bash
curl -X POST http://localhost:8080/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2025-10-20T12:00:00Z",
    "server_id": "test-server",
    "hostname": "test-host",
    "cpu": {"usage_percent": 45.2}
  }'
```

### 4. Cloudflare Tunnel (Optional)

The hardcoded port `8080` for submarines-ingest makes it easy to set up Cloudflare Tunnel:

```bash
# Example cloudflared config.yml
tunnel: <your-tunnel-id>
credentials-file: /path/to/credentials.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:8080
  - hostname: status.yourdomain.com
    service: http://localhost:8081
  - hostname: admin.yourdomain.com
    service: http://localhost:8000
  - hostname: app.yourdomain.com
    service: http://localhost:8082
  - service: http_status:404
```

## Production Setup

### 1. Configure DNS

Point your domain's A records to your server IP:

```
api.yourdomain.com      A    YOUR_SERVER_IP
status.yourdomain.com   A    YOUR_SERVER_IP
admin.yourdomain.com    A    YOUR_SERVER_IP
app.yourdomain.com      A    YOUR_SERVER_IP
auth.yourdomain.com     A    YOUR_SERVER_IP
traefik.yourdomain.com  A    YOUR_SERVER_IP
yourdomain.com          A    YOUR_SERVER_IP
```

### 2. Set environment variables

Create or update `.env`:

```bash
# Domain configuration
DOMAIN=yourdomain.com
```

### 3. Start production stack

```bash
# Production uses compose.yml by default
docker compose up -d
```

### 4. Verify SSL certificates

Let's Encrypt will automatically issue certificates. Check logs:

```bash
docker compose logs traefik | grep -i acme
```

Certificates are stored in: `traefik_data/letsencrypt/acme.json`

## Monitoring

Use logs and CLI tools instead of web dashboard:

```bash
# View Traefik logs
docker compose logs -f traefik

# Check routing configuration
cat traefik/dynamic.production.yml

# Test routes
curl -I https://api.yourdomain.com
```

## Health Checks

Production configuration includes health checks for all services:

- **submarines-ingest**: `/health`
- **submarines-status**: `/health`
- **flagship**: `/health`
- **cruiser**: `/api/health`
- **kratos**: `/health/ready`

## Security Features

### Production Configuration

1. **Automatic HTTPS redirect** - All HTTP traffic redirected to HTTPS
2. **Let's Encrypt SSL/TLS** - Automatic certificate management
3. **Security Headers** - HSTS, frame denial, XSS protection
4. **Rate Limiting** - 100 requests/second average, 50 burst

### Middleware

Available middlewares in production (`dynamic.production.yml`):

- `security-headers` - Security headers (HSTS, etc.)
- `rate-limit` - Rate limiting (100 req/s avg, 50 burst)

## Troubleshooting

### View Traefik logs

```bash
docker compose logs -f traefik
```

### Check routing configuration

View the dynamic configuration file to see active routers:

```bash
cat traefik/dynamic.production.yml
```

### Certificate issues

If Let's Encrypt fails:

1. Check DNS records point to your server
2. Ensure ports 80 and 443 are accessible from internet
3. Verify `ACME_EMAIL` is set correctly
4. Check Traefik logs for ACME errors
5. Delete `traefik_data/letsencrypt/acme.json` and restart (will re-issue)

### Service not accessible

1. Check service is running: `docker compose ps`
2. Check service health: `docker compose ps | grep healthy`
3. Check Traefik logs: `docker compose logs traefik`
4. Check DNS resolution: `dig yourdomain.com`
5. Test internal connectivity: `docker compose exec traefik wget -O- http://service:port/health`

## File Structure

```
admiral/
├── traefik/
│   ├── traefik.yml                  # Static configuration
│   └── dynamic.production.yml       # Production routing (SSL)
├── traefik_data/
│   └── letsencrypt/
│       └── acme.json                # SSL certificates (auto-generated)
├── logs/
│   └── traefik/
│       ├── access.log               # Access logs
│       └── traefik.log              # Traefik logs
├── compose.yml                      # Production services
└── compose.development.yml          # Development overrides (direct ports)
```

## Migration from Caddy

The old Caddy configuration has been replaced. Key differences:

1. **Subdomain-based routing** instead of path-based routing
2. **File-based configuration** for cleaner compose files
3. **Separate dev/prod configs** with different domain strategies
4. **Better health check integration**
5. **No web dashboard** - use logs and CLI instead

### Old Caddy paths → New access methods

| Old Path | New Dev Access | New Prod Access |
|----------|----------------|-----------------|
| `/metrics` | `localhost:8080/metrics` | `api.yourdomain.com/metrics` |
| `/api/*` | `localhost:8080/api/*` | `api.yourdomain.com/api/*` |
| `/admin/*` | `localhost:8000/*` | `admin.yourdomain.com/*` |
| `/*` (root) | `localhost:8082/*` | `app.yourdomain.com/*` |
| `/auth/*` | `localhost:4433/*` | `auth.yourdomain.com/*` |
| Status pages | `localhost:8081/*` | `status.yourdomain.com/*` |

## Agent Configuration

Update agent configuration based on environment:

```yaml
# /etc/node-pulse/nodepulse.yml
server:
  # Production (with Traefik subdomain)
  endpoint: "https://api.yourdomain.com/metrics"

  # Development (direct port access)
  # endpoint: "http://localhost:8080/metrics"

  # Development via Cloudflare Tunnel
  # endpoint: "https://api.yourdomain.com/metrics"

  timeout: 3s

agent:
  server_id: "auto-generated-uuid"
  interval: 5s
```

## Performance

- **Development**: No SSL overhead, direct routing
- **Production**: HTTP/2, TLS 1.3, automatic certificate renewal
- **Health checks**: 10s interval, 3s timeout
- **Rate limiting**: 100 req/s average, 50 burst

## Next Steps

1. Update agent configurations to use new `api.*` subdomain
2. Update any hardcoded URLs in Flagship/Cruiser to use subdomains
3. Set up log rotation for `logs/traefik/` directory
4. Configure firewall to allow only ports 80, 443
