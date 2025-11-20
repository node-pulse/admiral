# Node Pulse Admiral - Deployment Guide

Complete guide for deploying Node Pulse Admiral in development and production environments.

## Table of Contents

- [Quick Start (Production)](#quick-start-production)
- [Development Environment](#development-environment)
- [Production Deployment](#production-deployment)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Advanced Topics](#advanced-topics)

---

## Quick Start (Production)

### 1. Create Release Package

```bash
# On development machine
cd /path/to/admiral
./scripts/release.sh v1.0.0
```

This creates `nodepulse-admiral-v1.0.0.tar.gz` containing:

- Docker Compose configuration
- Deployment scripts
- Environment template

### 2. Deploy to Production

```bash
# Copy to server
scp nodepulse-admiral-v1.0.0.tar.gz user@server:/opt/

# On production server
ssh user@server
cd /opt
tar -xzf nodepulse-admiral-v1.0.0.tar.gz
cd nodepulse-admiral-v1.0.0

# Run interactive deployment
sudo ./deploy.sh
```

The deployment script will:

1. ✅ Prompt for configuration (database passwords, secrets, etc.)
2. ✅ Auto-generate secure random secrets
3. ✅ Create `.env` file
4. ✅ Pull Docker images from GHCR
5. ✅ Start all services

---

## Development Environment

Development environment uses direct port exposure for simplicity and Cloudflare Tunnel compatibility.

### Start Development Stack

```bash
# Start all services
docker compose -f compose.yml -f compose.development.yml up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Service Access

| Port | Service             | URL                   |
| ---- | ------------------- | --------------------- |
| 80   | Flagship (Laravel)  | http://localhost      |
| 8080 | Submarines Ingest   | http://localhost:8080 |
| 8082 | Submarines Status   | http://localhost:8082 |
| 5173 | Vite HMR (dev only) | http://localhost:5173 |
| 5432 | PostgreSQL          | localhost:5432        |
| 6379 | Valkey (Redis)      | localhost:6379        |

### Health Checks (Development)

```bash
curl http://localhost:8080/health       # Submarines Ingest
curl http://localhost:8082/health       # Submarines Status
curl http://localhost/                  # Flagship (via Caddy)
```

### Cloudflare Tunnel (Optional)

Use Cloudflare Tunnel for development with SSL without exposing ports.

1. Install cloudflared:

```bash
# macOS
brew install cloudflared

# Linux
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

2. Login and create tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create nodepulse
```

3. Create config.yml:

```yaml
tunnel: <your-tunnel-id>
credentials-file: /path/to/<tunnel-id>.json

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

4. Start tunnel:

```bash
cloudflared tunnel run nodepulse
```

---

## Production Deployment

Production uses Caddy reverse proxy with automatic SSL/TLS via Let's Encrypt.

### Prerequisites

1. Domain name with DNS configured
2. Server with ports 80, 443 accessible from internet
3. Docker and Docker Compose installed

### Production Configuration

1. **Configure domain in `.env`**:

```bash
FLAGSHIP_DOMAIN=yourdomain.com
```

All services will be available under this single domain:
- Dashboard: `https://yourdomain.com/`
- Metrics Ingestion: `https://yourdomain.com/ingest/metrics/prometheus`
- SSH WebSocket: `wss://yourdomain.com/ssh/`

2. **Update compose.yml to use production Caddyfile**:

```yaml
caddy:
  volumes:
    - ./caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro
```

3. **Create directories for Caddy data**:

```bash
mkdir -p caddy_data caddy_config logs/caddy
```

### Deploy

```bash
# Start production stack
docker compose up -d

# Check certificate issuance
docker compose logs caddy | grep -i acme

# Verify services
docker compose ps
```

### Production URLs

| Subdomain             | Service           | Purpose                   |
| --------------------- | ----------------- | ------------------------- |
| admin.yourdomain.com  | Flagship          | Admin dashboard (PHP-FPM) |
| ingest.yourdomain.com | Submarines Ingest | Agent API (port 8080)     |
| status.yourdomain.com | Submarines Status | Public status (port 8082) |

---

## Architecture

### What Gets Deployed

**Docker Containers (from GHCR):**

- **submarines-ingest** - Metrics ingestion API `:8080`
- **submarines-digest** - Background worker (Valkey → PostgreSQL + Cleanup)
- **submarines-status** - Public status pages `:8082`
- **submarines-sshws** - SSH WebSocket terminal `:6001`
- **postgres** - PostgreSQL 18 database `:5432`
- **valkey** - Message buffer `:6379`
- **flagship** - Laravel dashboard (Nginx + PHP-FPM architecture)
  - Internal: Nginx serves static files on `:8090`, proxies PHP to PHP-FPM on `:9000`
  - External: Accessed via Caddy reverse proxy
- **caddy** - Edge reverse proxy with automatic HTTPS `:80/:443`
  - Routes traffic to flagship (:8090), submarines services, SSH WebSocket

**Background Workers:**

- **Digest Worker**:
  - Consumes metrics from Valkey Stream, writes to PostgreSQL
  - Runs cleanup every 1 minute (coupled with digest - if digest stops, cleanup stops too)

### Data Flow

```
Agents → Ingest → Valkey Stream → Digest Worker → PostgreSQL
         :8080    (buffer)        (consume + cleanup)
                                  ↓ every 1 min
                                  Cleanup old metrics
                                  (reads retention from DB)
```

---

## Configuration

### Environment Variables (.env)

Created interactively by `deploy.sh`:

````bash
# Database
POSTGRES_USER=nodepulse
POSTGRES_PASSWORD=<auto-generated>
POSTGRES_DB=nodepulse

# Valkey
VALKEY_PASSWORD=<auto-generated>

# Backend
JWT_SECRET=<auto-generated>
GIN_MODE=release
INGEST_PORT=8080

# Production only
DOMAIN=yourdomain.com


### Data Retention

Data retention is controlled by the **flagship settings table** in the database:

- **Default**: 24 hours
- **Cleanup frequency**: Every 1 minute
- **Runs in**: Digest worker (coupled together)
- **Why coupled?**: If digest stops, cleanup stops too (prevents wiping all data when ingestion is down)

---

## Monitoring & Maintenance

### Verify Services

```bash
# Docker services
docker compose ps

# Should see submarines-digest running
````

### View Logs

```bash
# All services
docker compose logs -f

# Specific services
docker compose logs -f submarines-ingest
docker compose logs -f submarines-digest

# Cleanup activity (runs in digest worker)
docker compose logs -f submarines-digest | grep "CLEANUP"
```

### Cleanup Activity

```bash
# View recent cleanup runs
docker compose logs --tail=50 submarines-digest | grep CLEANUP

# Watch cleanup in real-time
docker compose logs -f submarines-digest | grep CLEANUP

# Expected output every minute:
# [CLEANUP] Running cleanup at 2025-10-22T12:34:56Z
# [CLEANUP] ✓ Completed successfully
```

### Database Access

```bash
docker compose exec postgres psql -U nodepulse -d nodepulse

# Check metrics count
SELECT COUNT(*) FROM backend.metrics;

# Check oldest metric
SELECT MIN(timestamp) FROM backend.metrics;

# Should not be older than retention period (default 24h)
```

### Health Checks

```bash
# Ingest endpoint
curl http://localhost:8080/health

# Database
docker compose exec postgres pg_isready

# Valkey
docker compose exec valkey valkey-cli ping
```

### Metrics

```bash
# Recent metrics
docker compose exec postgres psql -U nodepulse -d nodepulse -c \
  "SELECT COUNT(*), MAX(timestamp) FROM backend.metrics WHERE timestamp > NOW() - INTERVAL '1 hour'"

# Check data retention
docker compose exec postgres psql -U nodepulse -d nodepulse -c \
  "SELECT MIN(timestamp), MAX(timestamp), NOW() - MIN(timestamp) as age FROM backend.metrics"
```

### Management

```bash
# Restart services
docker compose restart

# Update to new version
docker compose pull
docker compose up -d

# Stop services
docker compose down

# Backup database
docker compose exec postgres pg_dump -U nodepulse nodepulse > backup.sql
```

### Backup & Restore

**Backup:**

```bash
# Backup database
docker compose exec postgres pg_dump -U nodepulse nodepulse > backup.sql

# Backup volumes
docker run --rm \
  -v admiral_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz -C /data .
```

**Restore:**

```bash
# Restore database
docker compose exec -T postgres psql -U nodepulse nodepulse < backup.sql

# Restore volumes
docker run --rm \
  -v admiral_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_data.tar.gz -C /data
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check logs
docker compose logs

# Check ports
sudo netstat -tlnp | grep -E ':(80|443|5432|6379|8080)'

# Verify .env
cat .env

# Restart specific service
docker compose restart [service-name]
```

### Port Conflicts

```bash
# Check what's using a port
lsof -i :8080

# Kill process on port
kill -9 $(lsof -t -i :8080)
```

### Cleanup Not Running

```bash
# Check digest worker status (cleanup runs here)
docker compose ps submarines-digest

# View cleanup logs
docker compose logs submarines-digest | grep CLEANUP

# Check for errors
docker compose logs submarines-digest | grep -i error

# Restart digest worker
docker compose restart submarines-digest
```

### Database Connection Issues

```bash
# Check PostgreSQL logs
docker compose logs postgres

# Test PostgreSQL connection
docker compose exec postgres psql -U nodepulse -d nodepulse

# Verify submarines is running
docker compose ps submarines-ingest

# Test connection from digest worker
docker compose logs submarines-digest | grep "Connected to PostgreSQL"
```

### Data Not Being Cleaned

```bash
# Check retention setting in database (flagship settings table)
docker compose exec postgres psql -U nodepulse -d nodepulse -c \
  "SELECT key, value FROM admiral.settings WHERE key LIKE '%retention%'"

# Check for old data
docker compose exec postgres psql -U nodepulse -d nodepulse -c \
  "SELECT MIN(timestamp), MAX(timestamp), COUNT(*) FROM backend.metrics"

# Check cleanup logs for errors
docker compose logs submarines-digest | grep CLEANUP | tail -50
```

### SSL Certificate Issues

```bash
# View Caddy logs
docker compose logs caddy | grep -i error

# Check certificate status
docker compose logs caddy | grep -i acme

# Restart Caddy to retry certificate issuance
docker compose restart caddy

# Clear Caddy data to force new certificate request
rm -rf caddy_data/*
docker compose restart caddy
```

---

## Security

### Secrets Management

- All secrets auto-generated by `deploy.sh`
- `.env` created with `600` permissions (owner-only)
- Never commit `.env` to version control

### Network Security

- Database not exposed to public internet
- Only Docker network `node-pulse-admiral` can access internal services
- Use firewall to restrict access to ingest endpoint if needed
- Caddy handles SSL/TLS termination automatically

### Security Checklist

**Production:**

- [ ] Change default passwords in `.env`
- [ ] Configure firewall (allow 80, 443, optionally 22)
- [ ] Set up fail2ban for SSH protection
- [ ] Enable automatic updates
- [ ] Regular database backups
- [ ] Monitor Caddy access logs (logs/caddy/)
- [ ] Use strong JWT_SECRET
- [ ] Backup master.key file securely (encrypts SSH keys)
- [ ] Configure domain DNS to point to server

**Development:**

- [ ] Don't expose development environment to internet
- [ ] Use Cloudflare Tunnel instead of port forwarding
- [ ] Keep development secrets separate from production

### Updates

```bash
# Keep system updated
sudo apt update && sudo apt upgrade

# Update Docker images regularly
docker compose pull
docker compose up -d
```

---

## Advanced Topics

### Custom Retention Period

Retention is stored in the **flagship settings table** (default: 24 hours).

To change it, update the database:

```bash
docker compose exec postgres psql -U nodepulse -d nodepulse -c \
  "UPDATE admiral.settings SET value = '168' WHERE key = 'metrics_retention_hours'"
```

Or via Flagship admin dashboard (if available).

**Note**: Changes take effect on the next cleanup run (every 1 minute).

### Change Cleanup Frequency

Cleanup runs every 1 minute by default (hardcoded in digest worker). To change:

1. Edit `submarines/cmd/digest/main.go`:

   ```go
   cleanupTicker := time.NewTicker(5 * time.Minute) // Change to 5 minutes
   ```

2. Rebuild and redeploy digest service

Current frequency provides:

- **60 runs/hour** - Very tight retention guarantees
- **Low overhead** - Fast DELETE query
- **Coupled with digest** - Safety mechanism (stops if digest stops)

### Test Cleanup

```bash
# View cleanup logs in real-time
docker compose logs -f submarines-digest | grep CLEANUP

# Expected output every minute:
# [CLEANUP] Running cleanup at 2025-10-22T12:34:56Z
# [CLEANUP] ✓ Completed successfully

# Force restart to trigger immediate run
docker compose restart submarines-digest
```

### Scale Digest Workers

For high throughput, run multiple digest instances:

```bash
docker compose up -d --scale submarines-digest=3
```

Each digest worker will:

- Consume from the same Valkey Stream using consumer groups
- Run cleanup independently (safe due to idempotent DELETE)

### High Availability

For production HA setup:

1. **Multiple Digest Workers**: Scale digest service (each will run cleanup independently - safe due to idempotent DELETE)
2. **PostgreSQL Replication**: Set up streaming replication
3. **Valkey Cluster**: Use Valkey in cluster mode
4. **Load Balancer**: Front ingest with nginx/haproxy

---

## Files and Locations

```
/opt/nodepulse-admiral-v1.0.0/
├── .env                        # Environment config (secrets)
├── compose.yml                 # Docker Compose config
└── deploy.sh                   # Deployment script
```

## Support

- **Documentation**: See `scripts/README.md` for detailed script documentation
- **GitHub**: https://github.com/nodepulse/admiral
- **Issues**: https://github.com/nodepulse/admiral/issues
- **caddy/README.md**: Detailed Caddy configuration and troubleshooting
- **CLAUDE.md**: Project overview and architecture
