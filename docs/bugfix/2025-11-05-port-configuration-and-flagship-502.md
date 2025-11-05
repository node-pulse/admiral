# Bugfix: Port Configuration & Flagship 502 Errors

**Date:** 2025-11-05
**Severity:** Critical (Production Down)
**Components Affected:** Submarines (all services), Flagship, Caddy

---

## Problem Summary

Production deployment was returning 502/503 errors for the Flagship dashboard. Multiple configuration issues were discovered:

1. **Port configuration conflicts** - Generic `PORT` environment variable caused conflicts across services
2. **Base image architecture change** - Base image v1 (Alpine, no Nginx) vs v2 (Debian, Nginx + PHP-FPM)
3. **Flagship Nginx misconfiguration** - Listening on port 8000 instead of 8090
4. **PHP-FPM log directory missing** - Crash loop due to non-existent log paths
5. **Caddy health check failure** - Health check pointing to `/` (500 error) instead of `/health`
6. **Laravel config caching** - Config cached during build without APP_KEY

---

## Root Causes

### Issue 1: Port Configuration Conflicts

**Problem:**
All Submarine services (ingest, status, sshws, deployer, digest) shared the same `config.go` which read from a generic `PORT` environment variable. This caused:
- Docker Compose warnings about undefined `PORT`
- Potential port conflicts if `PORT` was set globally
- Confusion about which service uses which port

**Root Cause:**
Shared configuration struct with generic port variable instead of hardcoded ports per service.

**Files Affected:**
- `submarines/internal/config/config.go`
- `compose.yml`
- `.env.example`
- `scripts/deploy.sh`

---

### Issue 2: Base Image Architecture Change

**Problem:**
The flagship base image went through an architectural change between versions:

- **Base Image v1 (Alpine)**: PHP-FPM only, no Nginx. Caddy connected directly to PHP-FPM socket/port.
- **Base Image v2 (Debian)**: Nginx + PHP-FPM + Supervisor. Nginx acts as intermediary between Caddy and PHP-FPM.

When the base image changed, the Dockerfile and configurations weren't updated to match the new architecture.

**Issues Caused:**
1. Missing Nginx configuration files (base image had defaults, but we needed custom configs)
2. Nginx and PHP-FPM weren't properly configured to work together
3. Sites-available/sites-enabled symlinks weren't created
4. Config files from base image conflicted with our requirements

**Root Cause:**
Base image change from Alpine (PHP-FPM only) to Debian (Nginx + PHP-FPM) was not properly accounted for in the application Dockerfile.

**Why Alpine (Caddy → PHP-FPM Direct) Has Issues:**

The original Alpine architecture attempted to connect Caddy directly to PHP-FPM, but this approach has several technical limitations:

1. **FastCGI Protocol Complexity**
   - PHP-FPM speaks FastCGI, not HTTP
   - While Caddy supports FastCGI, it's designed as a reverse proxy (HTTP → HTTP), not as a web server frontend for PHP-FPM
   - Caddy's FastCGI implementation lacks fine-grained control compared to Nginx's mature `fastcgi_pass` module

2. **Static File Serving**
   - Laravel requires a web server to handle static files (CSS, JS, images) from `public/`
   - Caddy can serve static files, but when combined with PHP-FPM, it becomes complex to route:
     - Static files → Serve directly
     - PHP files → Forward to PHP-FPM
     - Non-existent files → Forward to `index.php` (Laravel routing)
   - Nginx handles this elegantly with `try_files $uri $uri/ /index.php?$query_string`

3. **Laravel's Public Directory Pattern**
   - Laravel's entry point is `public/index.php`
   - All requests must route through this file unless they're static assets
   - Nginx is specifically designed for this pattern (common in PHP frameworks)
   - Caddy requires more manual configuration to replicate this behavior

4. **PHP-FPM Process Management**
   - PHP-FPM is designed to work behind a traditional web server (Nginx, Apache)
   - It expects the web server to handle:
     - HTTP request parsing
     - Header normalization
     - Request buffering
     - Connection management
   - Connecting Caddy directly bypasses these optimizations

5. **Debugging and Monitoring**
   - Nginx provides detailed FastCGI logs and error messages
   - Easier to debug PHP-FPM connection issues with Nginx as intermediary
   - Caddy's FastCGI errors are less verbose and harder to troubleshoot

**Why Nginx Middleware Is Necessary:**

The Nginx + PHP-FPM architecture is the industry-standard approach for PHP applications:

```
External Request → Caddy (HTTPS termination, reverse proxy)
                    ↓
                  Nginx (web server, static files, FastCGI)
                    ↓
                  PHP-FPM (PHP process manager)
                    ↓
                  Laravel Application
```

**Benefits of Nginx Layer:**

- **Separation of Concerns**: Caddy handles SSL/TLS and routing, Nginx handles web serving
- **Static File Performance**: Nginx serves static assets without touching PHP-FPM
- **FastCGI Expertise**: Nginx's FastCGI implementation is battle-tested and optimized
- **Laravel Compatibility**: Nginx configuration for Laravel is well-documented and standardized
- **Buffer Management**: Nginx buffers requests/responses, protecting PHP-FPM from slow clients
- **Error Handling**: Better error pages and upstream failure handling

**Original Architecture (v1 - Alpine):**
```
Caddy → PHP-FPM (port 9000 or socket)
```
*Issue: Caddy acting as both reverse proxy AND web server for PHP-FPM*

**New Architecture (v2 - Debian):**
```
Caddy → Nginx (port 8090) → PHP-FPM (port 9000)
```
*Fixed: Proper separation - Caddy for routing, Nginx for web serving, PHP-FPM for PHP*

**Files Affected:**
- `flagship/Dockerfile.prod` (needed to copy Nginx config explicitly)
- `flagship/docker/nginx/default.conf` (needed to match new architecture)
- Base image: `ghcr.io/node-pulse/node-pulse-flagship-base:latest`

---

### Issue 3: Flagship Nginx Port Mismatch

**Problem:**
- Nginx config listening on port **8000**
- Caddy and compose.yml expecting port **8090**
- Resulted in "no upstreams available" 503 errors

**Root Cause:**
`flagship/docker/nginx/default.conf` had incorrect port (leftover from development config).

**Files Affected:**
- `flagship/docker/nginx/default.conf`

---

### Issue 4: PHP-FPM Log Directory Missing

**Problem:**
PHP-FPM crashed on startup with:
```
ERROR: Unable to create or open slowlog(/var/log/php-fpm/slow.log): No such file or directory
```

**Root Cause:**
`flagship/docker/php/www.conf` referenced `/var/log/php-fpm/` directory which didn't exist in the container. The directory was never created in the Dockerfile.

**Files Affected:**
- `flagship/docker/php/www.conf`
- `flagship/Dockerfile.prod`

---

### Issue 5: Caddy Health Check Pointing to Wrong Endpoint

**Problem:**
Caddy health check was using `health_uri /` which returned 500 (APP_KEY error), causing Caddy to mark flagship as unhealthy and return 503.

**Root Cause:**
Health check should use `/health` endpoint (Nginx static response) instead of `/` (Laravel app).

**Files Affected:**
- `caddy/Caddyfile.prod`

---

### Issue 6: Laravel Config Caching Without Runtime Environment

**Problem:**
Laravel throwing "No application encryption key has been specified" even though APP_KEY was set in environment variables.

**Root Cause:**
Dockerfile ran `php artisan config:cache` during **build time**, caching config without APP_KEY. The cached config persisted even after container started with proper .env variables. PHP OPcache made it worse by caching the old cached config.

**Files Affected:**
- `flagship/Dockerfile.prod`

---

## Solutions Implemented

### 1. Port Configuration Fix

**Changed from:** Generic `PORT` environment variable
**Changed to:** Hardcoded ports in each service's `main.go`

**Port Assignments:**
- `submarines-ingest`: 8080 (hardcoded in `cmd/ingest/main_prod.go` and `main_dev.go`)
- `submarines-status`: 8081 (hardcoded in `cmd/status/main.go`)
- `submarines-sshws`: 6001 (hardcoded in `cmd/sshws/main.go`)
- `submarines-deployer`: N/A (background worker, no port)
- `submarines-digest`: N/A (background worker, no port)
- `flagship`: 8090 (hardcoded in Nginx config)

**Changes Made:**

**File: `submarines/internal/config/config.go`**
```diff
 type Config struct {
     // Database
     ...

     // Server
-    Port    string
     GinMode string
```

Removed the entire `Port` field and `getServicePort()` function.

**File: `submarines/cmd/ingest/main_prod.go`**
```diff
     // Start server
-    addr := ":" + cfg.Port
+    const port = "8080"
+    addr := ":" + port
     log.Printf("Starting ingest service on %s ...", addr)
```

**File: `submarines/cmd/status/main.go`**
```diff
     // Start server
-    addr := ":" + cfg.Port
+    const port = "8081"
+    addr := ":" + port
     log.Printf("Starting status service on %s", addr)
```

**File: `.env.example`**
```diff
 # Server settings
-PORT=8080
-INGEST_PORT=${PORT}
-STATUS_PORT=8082
+# NOTE: Ports are hardcoded in each service's main.go:
+# - submarines-ingest: 8080
+# - submarines-status: 8081
+# - submarines-sshws: 6001
+# - submarines-deployer: background worker (no port)
+# - submarines-digest: background worker (no port)
+# - flagship: 8090 (Nginx, hardcoded)
 GIN_MODE=release
```

**File: `compose.yml`**
- No `PORT` or `SERVICE_PORT` environment variables needed
- Services use hardcoded ports from their binaries

---

### 2. Base Image Architecture Compatibility Fix

**Problem:** Flagship Dockerfile wasn't properly configured for the new Nginx + PHP-FPM base image.

**Solution:** Explicitly copy and configure Nginx, PHP-FPM, and Supervisor configs in the Dockerfile.

**File: `flagship/Dockerfile.prod`**

Added explicit config file management:

```diff
 # Copy application code
 COPY --chown=laravel:laravel . .

+# Copy Nginx, PHP-FPM, and Supervisor configurations
+COPY docker/nginx/default.conf /etc/nginx/sites-available/default
+COPY docker/php/www.conf /usr/local/etc/php-fpm.d/www.conf
+COPY docker/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
+
+# Ensure Nginx config is properly enabled
+RUN mkdir -p /etc/nginx/sites-enabled \
+    && rm -f /etc/nginx/sites-enabled/default \
+    && ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default \
+    && nginx -t
```

**Rationale:**

1. **Explicit config copying**: Don't rely on base image defaults - copy our custom configs
2. **Sites-enabled symlink**: Ensure Nginx actually uses our config (Debian convention)
3. **Build-time validation**: `nginx -t` catches config errors during build, not at runtime
4. **Overwrite base defaults**: Our configs take precedence over base image configs

**Architecture Flow (After Fix):**
```
External Request → Caddy (reverse proxy)
                     ↓
                   Nginx (port 8090, in flagship container)
                     ↓
                   PHP-FPM (port 9000, in flagship container)
                     ↓
                   Laravel Application
```

---

### 3. Flagship Nginx Port Fix

**File: `flagship/docker/nginx/default.conf`**
```diff
 server {
-    listen 8000;
+    listen 8090;
     server_name _;
     root /var/www/html/public;
```

**File: `flagship/Dockerfile.prod`**
```diff
+# Copy Nginx, PHP-FPM, and Supervisor configurations
+COPY docker/nginx/default.conf /etc/nginx/sites-available/default
+COPY docker/php/www.conf /usr/local/etc/php-fpm.d/www.conf
+COPY docker/supervisor/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
+
+# Ensure Nginx config is properly enabled
+RUN mkdir -p /etc/nginx/sites-enabled \
+    && rm -f /etc/nginx/sites-enabled/default \
+    && ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default \
+    && nginx -t
```

---

### 4. PHP-FPM Log Directory Fix

**File: `flagship/docker/php/www.conf`**
```diff
 ; Timeouts
 request_terminate_timeout = 300
 request_slowlog_timeout = 10s
-slowlog = /var/log/php-fpm/slow.log
+slowlog = /var/www/html/storage/logs/php-fpm-slow.log

 ; Environment variables
 clear_env = no

 ; PHP settings via pool
-php_admin_value[error_log] = /var/log/php-fpm/www-error.log
+php_admin_value[error_log] = /var/www/html/storage/logs/php-fpm-error.log
```

**File: `flagship/Dockerfile.prod`**
```diff
 # Create storage directories and set permissions
 RUN mkdir -p \
     storage/logs \
     ...
     && chown -R laravel:laravel storage bootstrap/cache \
     && chmod -R 775 storage bootstrap/cache \
+    && touch storage/logs/php-fpm-slow.log storage/logs/php-fpm-error.log \
+    && chown laravel:laravel storage/logs/php-fpm-*.log
```

Also updated user/group in `www.conf`:
```diff
-user = www
-group = www
+user = laravel
+group = laravel
```

---

### 5. Caddy Health Check Fix

**File: `caddy/Caddyfile.prod`**
```diff
     reverse_proxy flagship:8090 {
         ...

         # Health check
-        health_uri /
+        health_uri /health
         health_interval 10s
         health_timeout 3s
     }
```

The `/health` endpoint is a static Nginx response (200 OK) that doesn't require PHP/Laravel to be working.

---

### 6. Laravel Config Caching Fix

**File: `flagship/Dockerfile.prod`**
```diff
     && touch storage/logs/php-fpm-slow.log storage/logs/php-fpm-error.log \
     && chown laravel:laravel storage/logs/php-fpm-*.log

-# Cache Laravel configuration for production
-RUN php artisan config:cache \
-    && php artisan route:cache \
-    && php artisan view:cache \
-    && php artisan event:cache
+# Note: Config/route/view caching moved to entrypoint script
+# Cannot cache during build because .env is only available at runtime

 # Expose Nginx port
```

**Rationale:**
The `.env` file with `APP_KEY` and other runtime variables only exists when the container runs (via `env_file` in compose.yml). Caching config during build time freezes the config without these values.

**Future Enhancement:**
Consider adding config caching to the entrypoint script for production performance, but only after .env is loaded.

---

## Testing & Verification

### Manual Testing Steps

1. **Verify ports are correct:**
   ```bash
   # Check each service listens on correct port
   docker compose exec caddy wget -q -O- http://submarines-ingest:8080/health
   docker compose exec caddy wget -q -O- http://submarines-status:8081/health
   docker compose exec caddy wget -q -O- http://flagship:8090/health
   ```

2. **Verify Flagship components:**
   ```bash
   # Check Nginx is running
   docker compose exec flagship pidof nginx

   # Check PHP-FPM is running
   docker compose exec flagship pidof php-fpm

   # Check supervisor status
   docker compose exec flagship supervisorctl status
   ```

3. **Verify Laravel config:**
   ```bash
   # Check APP_KEY is loaded
   docker compose exec flagship php artisan tinker --execute="echo config('app.key');"

   # Should output: base64:... (not empty)
   ```

4. **Verify production site:**
   ```bash
   curl -I https://admiral.nodepulse.sh
   # Should return: HTTP/2 200
   ```

---

## Deployment Instructions

### Quick Hotfix (Production)

If you need to fix a running production instance:

```bash
# 1. Copy fixed Caddy config
docker compose cp caddy/Caddyfile.prod caddy:/etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile

# 2. Restart flagship to clear caches
docker compose restart flagship

# 3. Wait for health checks
sleep 15

# 4. Test
curl -I https://admiral.nodepulse.sh
```

### Full Deployment (Recommended)

```bash
# 1. Pull latest code with fixes
cd /opt/admiral
git pull

# 2. Rebuild flagship image
docker compose build flagship

# 3. Deploy
docker compose up -d

# 4. Verify
curl -I https://admiral.nodepulse.sh
docker compose ps
docker compose logs flagship --tail=50
```

---

## Prevention & Best Practices

### 1. Base Image Management
- **Do:** Document base image architecture and dependencies in README
- **Do:** Pin base image versions in production (`flagship-base:v2` not `:latest`)
- **Do:** Test base image updates in staging before production
- **Don't:** Use `:latest` tag for base images in production
- **Why:** Base image changes can break application assumptions about available services

### 2. Port Management
- **Do:** Hardcode ports in service binaries where each service has a unique default
- **Don't:** Use generic environment variables like `PORT` shared across multiple services
- **Why:** Reduces configuration complexity and prevents conflicts

### 3. Docker Build vs Runtime
- **Do:** Only cache static build artifacts (vendor, compiled assets)
- **Don't:** Cache runtime-dependent configs (Laravel config cache with .env values)
- **Why:** Build-time caching can't access runtime environment variables

### 4. Health Checks
- **Do:** Use dedicated `/health` endpoints that don't depend on application logic
- **Don't:** Use main application routes for health checks
- **Why:** Application errors won't cascade into infrastructure availability issues

### 5. Configuration Files
- **Do:** Explicitly copy and validate config files in Dockerfile
- **Don't:** Rely on base images to have correct configs
- **Why:** Makes builds reproducible and errors visible at build time (e.g., `nginx -t`)

### 6. Log Paths
- **Do:** Use existing writable directories (like Laravel's `storage/logs`)
- **Don't:** Reference directories that don't exist in the container
- **Why:** Prevents service crashes due to missing paths

---

## Related Issues

- None (first occurrence)

---

## References

- Caddy reverse proxy docs: https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- Laravel config caching: https://laravel.com/docs/11.x/configuration#configuration-caching
- Nginx FastCGI: https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html
- PHP-FPM configuration: https://www.php.net/manual/en/install.fpm.configuration.php

---

## Lessons Learned

1. **Base image changes are breaking changes**: When a base image changes architecture (Alpine → Debian, PHP-FPM only → Nginx + PHP-FPM), treat it as a major version bump requiring full testing.

2. **Explicit is better than implicit**: Hardcoding service ports in their respective binaries is clearer than environment variable magic.

3. **Separate build-time from runtime concerns**: Docker image builds should not cache runtime-dependent data.

4. **Test incrementally**: When multiple services are involved, test each layer:
   - Container → Service (health check)
   - Service → Service (internal networking)
   - Proxy → Service (Caddy → flagship)
   - External → Proxy (public HTTPS)

5. **Health checks matter**: A simple static health endpoint (`/health`) is more reliable than checking the main application route.

6. **OPcache persistence**: PHP OPcache can persist old cached configs even after files are deleted. Container restart may be needed.

7. **Document service topology**: When using multi-service containers (Nginx + PHP-FPM + Supervisor), document the internal architecture and communication flow.

---

## Appendix: Diagnostic Script

A comprehensive diagnostic script was created: `debug-flagship.sh`

This script checks:
- Container status
- Supervisor status
- PHP-FPM status
- Nginx status
- Port listening
- Network connectivity
- Configuration files
- Error logs
- Environment variables
- File permissions

**Usage:**
```bash
cd /opt/admiral
./debug-flagship.sh
```

The script is useful for quickly diagnosing similar issues in the future.
