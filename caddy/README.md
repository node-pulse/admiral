# Caddy Configuration

This directory contains Caddy reverse proxy configurations for Node Pulse Admiral.

## Files

- **`Caddyfile`** - Local development configuration (HTTP only, no HTTPS)
- **`Caddyfile.dev`** - Alternative development configuration with subdomain routing
- **`Caddyfile.prod`** - Production configuration with automatic HTTPS via Let's Encrypt
- **`Dockerfile`** - Custom Caddy build (if needed)

## Architecture

Caddy serves as the reverse proxy and web server for all services:

```
Browser
   │
   ▼
Caddy :80 (dev) / :443 (prod)
   │
   ├──→ flagship:9000 (PHP-FPM) ──→ Laravel Admin Dashboard
   │    ↓
   │    Serves static files from flagship/public/
   │
   ├──→ submarines-ingest:8080 ──→ Metrics Ingestion API
   │
   ├──→ submarines-status:8082 ──→ Status Pages
   │
   └──→ flagship:5173 ──→ Vite HMR (dev only)
```

## Usage

### Local Development

The default `Caddyfile` is used for local development:

```bash
# Start services
docker compose up -d

# Access services
http://localhost          # Flagship (Laravel)
http://localhost:8080     # Submarines Ingest
http://localhost:8082     # Submarines Status
http://localhost:5173     # Vite HMR
```

### Production

Use `Caddyfile.prod` for production with automatic HTTPS:

1. **Set environment variables** in `.env`:

   ```bash
   ADMIN_DOMAIN=admin.example.com
   INGEST_DOMAIN=ingest.example.com
   STATUS_DOMAIN=status.example.com
   APP_DOMAIN=app.example.com
   AUTH_DOMAIN=auth.example.com
   ACME_EMAIL=admin@example.com
   ```

2. **Update compose.yml** to use production Caddyfile:

   ```yaml
   volumes:
     - ./caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro
   ```

3. **Start services:**
   ```bash
   docker compose up -d
   ```

Caddy will automatically:

- Obtain Let's Encrypt certificates
- Redirect HTTP → HTTPS
- Handle renewals

## Key Features

### PHP-FPM Integration

Caddy handles PHP-FPM natively with the `php_fastcgi` directive:

```caddyfile
root * /var/www/flagship/public

php_fastcgi flagship:9000 {
    split .php
    env APP_ENV local
}

file_server
try_files {path} {path}/ /index.php?{query}
```

This eliminates the need for nginx inside the Flagship container.

### Static File Serving

Caddy serves static files (CSS, JS, images) directly from `flagship/public/`:

```yaml
volumes:
  - ./flagship/public:/var/www/flagship/public:ro
```

### Automatic HTTPS

In production, Caddy automatically:

1. Obtains certificates from Let's Encrypt
2. Redirects HTTP → HTTPS
3. Enables HTTP/2 and HTTP/3
4. Handles certificate renewal

### Security Headers

Production config includes security headers:

```caddyfile
header {
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
    X-XSS-Protection "1; mode=block"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server  # Remove server header
}
```

## Data Storage

Caddy data is stored using bind mounts (like postgres):

```yaml
volumes:
  - ./caddy_data:/data # Certificates, etc.
  - ./caddy_config:/config # Config cache
```

These directories will be created automatically on first run.

## Logging

Logs are written to `./logs/caddy/`:

- `admin-access.log` - Flagship access logs
- `ingest-access.log` - Ingest API access logs
- `status-access.log` - Status pages access logs

All logs use JSON format for easy parsing.

## Health Checks

Caddy exposes a metrics endpoint at `:2019/metrics` for health checks:

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:2019/metrics"]
```

## Troubleshooting

### 502 Bad Gateway (PHP-FPM)

Check if Flagship PHP-FPM is running:

```bash
docker compose ps flagship
docker compose exec flagship php-fpm-healthcheck
```

### Static Files Not Loading

Verify volume mount:

```bash
docker compose exec caddy ls -la /var/www/flagship/public
```

### HTTPS Not Working

Check Caddy logs for ACME errors:

```bash
docker compose logs caddy | grep -i acme
```

Verify DNS points to your server:

```bash
dig admin.example.com
```

## Resources

- [Caddy Documentation](https://caddyserver.com/docs/)
- [PHP-FPM Directive](https://caddyserver.com/docs/caddyfile/directives/php_fastcgi)
- [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
