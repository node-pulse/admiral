# Caddy 502 Bad Gateway Fix - Summary

## Problem

Caddy was returning `502 Bad Gateway` errors when trying to proxy requests to the Flagship (Laravel) service. The error logs showed:
```
dial tcp 192.168.97.8:8090: connect: connection refused
```

## Root Cause

The development setup had a configuration mismatch:

1. **Dev Entrypoint Issue**: The `docker-entrypoint-dev.sh` script was starting Laravel's built-in dev server on port 9000 instead of starting Nginx+PHP-FPM via supervisor on port 8090.

2. **Missing Configuration Files**: The `Dockerfile.dev` was not copying the custom PHP-FPM and Nginx configuration files from the repository. Instead, it was using the base image's configuration which:
   - Configured PHP-FPM to listen on a Unix socket (`/run/php/php-fpm.sock`)
   - Configured Nginx to expect PHP-FPM on that socket
   - But the socket was never being created

## Solution

### Development Environment (compose.development.yml)

1. **Updated `docker-entrypoint-dev.sh`**:
   - Changed from starting `php artisan serve` (port 9000) to starting supervisor
   - Added creation of `/run/php/` directory (no longer needed with TCP configuration)
   - Now starts Nginx+PHP-FPM via supervisor on port 8090
   - Still starts Vite dev server on port 5173 for HMR

2. **Updated `Dockerfile.dev`**:
   - Added `COPY docker/php/www.conf` - Configures PHP-FPM to listen on TCP `127.0.0.1:9000`
   - Added `COPY docker/nginx/default.conf` - Configures Nginx to proxy to `127.0.0.1:9000`
   - Added Nginx config symlink setup to ensure proper configuration loading

### Production Environment (compose.yml)

The production `Dockerfile.prod` already had the correct configuration files copied, but:

1. **Added Entrypoint Script Copy**:
   - Production Dockerfile was missing the `COPY docker-entrypoint.sh` line
   - Added the copy and chmod commands to make it executable
   - The entrypoint script handles Laravel caching and storage permissions

## Configuration Architecture

### PHP-FPM Configuration (`docker/php/www.conf`)
```conf
user = laravel
group = laravel
listen = 127.0.0.1:9000  # TCP instead of Unix socket
pm = dynamic
pm.max_children = 50
...
```

### Nginx Configuration (`docker/nginx/default.conf`)
```nginx
server {
    listen 8090;
    root /var/www/html/public;

    location ~ \.php$ {
        fastcgi_pass 127.0.0.1:9000;  # Matches PHP-FPM TCP listen
        ...
    }
}
```

### Supervisor Configuration (`docker/supervisor/supervisord.conf`)
```ini
[program:nginx]
command=nginx -g "daemon off;"

[program:php-fpm]
command=php-fpm -F
```

## Testing

After the fix, all services are working:

```bash
# Development
curl -I http://127.0.0.1:8000  # Returns HTTP 200 OK via Caddy -> Nginx -> PHP-FPM

# Direct test inside container
docker compose -f compose.development.yml exec flagship curl -I http://127.0.0.1:8090  # Works
```

## Production Deployment

To apply the fix to production:

1. Upload `debug-flagship-production.sh` to the production server
2. Run the diagnostic script to confirm the issue
3. Rebuild the Flagship image:
   ```bash
   docker compose build flagship
   ```
4. Restart the service:
   ```bash
   docker compose up -d flagship
   ```

The diagnostic script will help verify that:
- The correct Nginx and PHP-FPM configs are in place
- PHP-FPM is listening on TCP port 9000
- Nginx can communicate with PHP-FPM
- Supervisor is managing both processes correctly

## Files Modified

1. `flagship/docker-entrypoint-dev.sh` - Fixed to start supervisor instead of Laravel dev server
2. `flagship/Dockerfile.dev` - Added COPY commands for custom configs
3. `flagship/Dockerfile.prod` - Added entrypoint script copy (was missing)
4. `caddy/Caddyfile.dev` - No changes needed (already correct)

## Diagnostic Tool

Created `debug-flagship-production.sh` to help diagnose similar issues on production. Upload and run on production server:

```bash
scp debug-flagship-production.sh production-server:/opt/admiral/
ssh production-server "cd /opt/admiral && chmod +x debug-flagship-production.sh && ./debug-flagship-production.sh"
```
