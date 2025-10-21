# Deployment Guide - NodePulse Admiral

Quick reference for deploying NodePulse Admiral in different environments.

## Table of Contents

- [Development](#development)
- [Production](#production)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Related Documentation](#related-documentation)

## Development

Development environment uses direct port exposure without reverse proxy for simplicity and Cloudflare Tunnel compatibility.

### Quick Start

```bash
# Start all services
docker compose -f compose.yml -f compose.development.yml up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Service Access

| Port | Service | URL |
|------|---------|-----|
| 8080 | Submarines Ingest | http://localhost:8080 |
| 8081 | Submarines Status | http://localhost:8081 |
| 8000 | Flagship (Rails) | http://localhost:8000 |
| 8082 | Cruiser (Next.js) | http://localhost:8082 |
| 4433 | Kratos Public API | http://localhost:4433 |
| 4434 | Kratos Admin API | http://localhost:4434 |
| 5432 | PostgreSQL | localhost:5432 |
| 6379 | Valkey (Redis) | localhost:6379 |

### Port Assignment Strategy

- **8080**: Submarines Ingest (hardcoded for Cloudflare Tunnel)
- **8081**: Submarines Status (public status pages)
- **8000**: Flagship (admin dashboard)
- **8082**: Cruiser (public app)

## Production

Production uses Traefik reverse proxy with automatic SSL/TLS via Let's Encrypt.

### Prerequisites

1. Domain name with DNS configured
2. Server with ports 80, 443 accessible from internet
3. Environment variables configured in `.env`

### Configuration

```bash
# .env file
DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

### SSL Setup

```bash
# Create htpasswd for basic auth
htpasswd -nb admin your-secure-password > traefik/.htpasswd

# Ensure acme.json has correct permissions
mkdir -p traefik_data/letsencrypt
touch traefik_data/letsencrypt/acme.json
chmod 600 traefik_data/letsencrypt/acme.json
```

### Deploy

```bash
# Start production stack
docker compose up -d

# Check certificate issuance
docker compose logs traefik | grep -i acme

# Verify services
docker compose ps
```

### Production URLs

| Subdomain | Service | Purpose |
|-----------|---------|---------|
| api.yourdomain.com | Submarines Ingest | Agent API |
| status.yourdomain.com | Submarines Status | Public status |
| admin.yourdomain.com | Flagship | Admin dashboard (auth required) |
| app.yourdomain.com | Cruiser | Public site |
| auth.yourdomain.com | Kratos | Identity API |
| traefik.yourdomain.com | Traefik | Dashboard (auth required) |

## Cloudflare Tunnel

Use Cloudflare Tunnel for development with SSL without exposing ports.

### Setup

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
  # Agent API (port 8080 is hardcoded)
  - hostname: api.yourdomain.com
    service: http://localhost:8080

  # Public status pages
  - hostname: status.yourdomain.com
    service: http://localhost:8081

  # Admin dashboard
  - hostname: admin.yourdomain.com
    service: http://localhost:8000

  # Public app
  - hostname: app.yourdomain.com
    service: http://localhost:8082

  # Kratos auth
  - hostname: auth.yourdomain.com
    service: http://localhost:4433

  # Catch-all
  - service: http_status:404
```

4. Start tunnel:
```bash
cloudflared tunnel run nodepulse
```

### Configure DNS

In Cloudflare dashboard, add CNAME records:

```
api.yourdomain.com    CNAME  <tunnel-id>.cfargotunnel.com
status.yourdomain.com CNAME  <tunnel-id>.cfargotunnel.com
admin.yourdomain.com  CNAME  <tunnel-id>.cfargotunnel.com
app.yourdomain.com    CNAME  <tunnel-id>.cfargotunnel.com
auth.yourdomain.com   CNAME  <tunnel-id>.cfargotunnel.com
```

### Benefits

- SSL/TLS without Let's Encrypt setup
- No port forwarding needed
- DDoS protection
- Global CDN
- Works with development environment

## Health Checks

### Development

```bash
# Test each service
curl http://localhost:8080/health  # Submarines Ingest
curl http://localhost:8081/health  # Submarines Status
curl http://localhost:8000/health  # Flagship
curl http://localhost:8082/api/health  # Cruiser
curl http://localhost:4433/health/ready  # Kratos
```

### Production

```bash
# Via Traefik subdomains
curl https://api.yourdomain.com/health
curl https://status.yourdomain.com/health
curl https://admin.yourdomain.com/health
curl https://app.yourdomain.com/api/health
curl https://auth.yourdomain.com/health/ready
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs -f [service-name]

# Check service status
docker compose ps

# Restart specific service
docker compose restart [service-name]
```

### Port conflicts

```bash
# Check what's using a port
lsof -i :8080

# Kill process on port
kill -9 $(lsof -t -i :8080)
```

### Database connection issues

```bash
# Test PostgreSQL connection
docker compose exec postgres psql -U postgres -d node_pulse_admiral

# Check database logs
docker compose logs postgres
```

### SSL certificate issues

```bash
# View Traefik logs
docker compose logs traefik | grep -i error

# Delete and recreate certificate
rm traefik_data/letsencrypt/acme.json
touch traefik_data/letsencrypt/acme.json
chmod 600 traefik_data/letsencrypt/acme.json
docker compose restart traefik
```

## Security Checklist

### Production

- [ ] Change default passwords in `.env`
- [ ] Update `.htpasswd` with strong passwords
- [ ] Configure firewall (allow 80, 443, optionally 22)
- [ ] Set up fail2ban for Traefik logs
- [ ] Enable automatic updates
- [ ] Regular database backups
- [ ] Monitor Traefik access logs
- [ ] Restrict Traefik dashboard access (port 8888)
- [ ] Use strong JWT_SECRET and BETTER_AUTH_SECRET

### Development

- [ ] Don't expose development environment to internet
- [ ] Use Cloudflare Tunnel instead of port forwarding
- [ ] Keep development secrets separate from production

## Backup & Restore

### Backup

```bash
# Backup database
docker compose exec postgres pg_dump -U postgres node_pulse_admiral > backup.sql

# Backup volumes
docker run --rm \
  -v admiral_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz -C /data .
```

### Restore

```bash
# Restore database
docker compose exec -T postgres psql -U postgres node_pulse_admiral < backup.sql

# Restore volumes
docker run --rm \
  -v admiral_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_data.tar.gz -C /data
```

## Related Documentation

- [TRAEFIK.md](./TRAEFIK.md) - Detailed Traefik configuration and troubleshooting
- [TESTING.md](./TESTING.md) - Testing guide for development
- [CLAUDE.md](../CLAUDE.md) - Project overview and architecture
- [Makefile](../Makefile) - Common development commands

## Environment Variables

Key environment variables in `.env`:

```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=node_pulse_admiral

# Valkey
VALKEY_PASSWORD=<strong-password>

# Rails
SECRET_KEY_BASE=<generate-with-rails-secret>
RAILS_ENV=production

# JWT
JWT_SECRET=<strong-secret>

# Better Auth
BETTER_AUTH_SECRET=<strong-secret>

# Production only
DOMAIN=yourdomain.com
ACME_EMAIL=admin@yourdomain.com
```

Generate secrets:
```bash
# Rails secret
docker compose run --rm flagship bundle exec rails secret

# Random secret
openssl rand -hex 64
```
