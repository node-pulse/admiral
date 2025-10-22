# NodePulse Admiral - Deployment Scripts

This directory contains scripts for deploying and managing NodePulse Admiral.

## Quick Start

### For Production Deployment

```bash
# 1. Create release package
./scripts/release.sh v1.0.0

# 2. Copy to production server
scp nodepulse-admiral-v1.0.0.tar.gz user@server:/tmp/

# 3. On production server
ssh user@server
cd /tmp
tar -xzf nodepulse-admiral-v1.0.0.tar.gz
cd nodepulse-admiral-v1.0.0
sudo ./deploy.sh
```

### For Local Development

```bash
# Just run deploy script in the project root
cd /path/to/admiral
sudo ./scripts/deploy.sh
```

## Scripts Overview

### `release.sh` - Create Release Package

Creates a deployment package containing only necessary files (no source code).

**Usage:**
```bash
./scripts/release.sh [version]
```

**Example:**
```bash
./scripts/release.sh v1.0.0
# Creates: nodepulse-admiral-v1.0.0.tar.gz
```

**What it includes:**
- `compose.yml` - Docker Compose configuration
- `.env.example` - Environment template
- `deploy.sh` - Interactive deployment script
- `scripts/` - All deployment scripts
- `README.md` - Documentation
- `DEPLOY.md` - Deployment guide

**What it excludes:**
- Source code (`submarines/`, `flagship/`, `cruiser/`)
- Development files (`.git/`, `node_modules/`, etc.)

### `deploy.sh` - Interactive Deployment

Fully automated, interactive deployment script that:
1. Prompts for configuration (or reuses existing)
2. Creates `.env` file with user-provided values
3. Generates secure random secrets
4. Pulls Docker images from GHCR
5. Starts all services via Docker Compose
6. Installs systemd cleaner service

**Usage:**
```bash
sudo ./deploy.sh
```

**Features:**
- ✅ **Idempotent** - Safe to run multiple times
- ✅ **Interactive** - Prompts for all configuration
- ✅ **Smart defaults** - Suggests sensible values
- ✅ **Secret generation** - Auto-generates secure passwords
- ✅ **Backup** - Backs up existing `.env` before overwriting
- ✅ **Validation** - Checks prerequisites (Docker, systemd)

**Example interaction:**
```
PostgreSQL user [nodepulse]:
PostgreSQL password [auto-generated]:
PostgreSQL database name [nodepulse]:
Valkey password [auto-generated]:
...
```

### `install-systemd.sh` - Install Cleaner Service

Installs systemd timer and service for periodic database cleanup.

**Usage:**
```bash
sudo ./scripts/install-systemd.sh
```

**What it does:**
1. Installs systemd units to `/etc/systemd/system/`
2. Enables and starts the timer
3. Shows status and next scheduled runs

**Features:**
- ✅ **Hourly execution** - Runs every hour for tight retention
- ✅ **Persistent** - Catches up after downtime
- ✅ **HTTP-based** - Calls POST http://localhost:8080/admin/cleanup
- ✅ **Logging** - Logs to systemd journal
- ✅ **No credentials needed** - Just calls an HTTP endpoint

**Management commands:**
```bash
# View status
sudo systemctl status nodepulse-cleaner.timer

# View logs
sudo journalctl -u nodepulse-cleaner.service -f

# Manually trigger
sudo systemctl start nodepulse-cleaner.service

# Stop timer
sudo systemctl stop nodepulse-cleaner.timer

# Next scheduled runs
sudo systemctl list-timers nodepulse-cleaner.timer
```

## Systemd Units

### `systemd/nodepulse-cleaner.timer`

Timer configuration that schedules the cleaner service.

**Schedule:** Hourly (`OnCalendar=hourly`)

**Key features:**
- `Persistent=true` - Runs missed jobs after downtime
- `RandomizedDelaySec=300` - Adds 0-5 minute random delay

### `systemd/nodepulse-cleaner.service`

Service that runs the database cleaner.

**Key features:**
- `Type=oneshot` - Runs once and exits
- Calls `POST http://localhost:8080/admin/cleanup`
- No database credentials needed
- Logs to systemd journal
- 10-minute timeout

## Deployment Workflow

### Development to Production

```
┌──────────────┐
│  Developer   │
└──────┬───────┘
       │
       │ ./scripts/release.sh v1.0.0
       │
       ▼
┌────────────────────────────┐
│  nodepulse-admiral-v1.0.0  │
│  .tar.gz release package   │
└──────┬─────────────────────┘
       │
       │ scp to server
       │
       ▼
┌──────────────┐
│   Server     │
└──────┬───────┘
       │
       │ tar -xzf
       │
       ▼
┌──────────────┐
│  Extract     │
└──────┬───────┘
       │
       │ sudo ./deploy.sh
       │
       ▼
┌────────────────────────────┐
│  Interactive Configuration │
└──────┬─────────────────────┘
       │
       ▼
┌────────────────────────────┐
│  Docker Compose Services   │
│  + Systemd Cleaner         │
└────────────────────────────┘
```

### What Gets Deployed

```
Production Server
├── /opt/nodepulse/              # Application directory
│   ├── .env                     # Environment config (created by deploy.sh)
│   ├── compose.yml              # Docker Compose config
│   └── scripts/                 # Deployment scripts
├── /etc/nodepulse/
│   └── cleaner.env              # Cleaner configuration
└── /etc/systemd/system/
    ├── nodepulse-cleaner.timer
    └── nodepulse-cleaner.service
```

### Docker Containers (from GHCR)

- `ghcr.io/nodepulse/submarines:latest` (ingest + digest + cleaner)
- `postgres:18`
- `valkey/valkey:latest`
- Other services as defined in `compose.yml`

## Configuration Files

### `.env` (Application)

Created by `deploy.sh`, contains:
- Database credentials
- Valkey password
- JWT secrets
- API URLs
- Retention settings

**Location:** `<project-root>/.env`


## Security Notes

1. **Secrets Management**
   - `deploy.sh` auto-generates secure random secrets
   - `.env` is created with `600` permissions

2. **Network Isolation**
   - Cleaner calls HTTP endpoint (localhost:8080)
   - Database not exposed to public internet (only to Docker network)

3. **User Permissions**
   - Deployment requires `root` or `sudo`
   - Systemd services run as `root` (to access Docker)

## Troubleshooting

### Release package creation fails

```bash
# Check script permissions
chmod +x ./scripts/release.sh

# Verify you're in project root
ls -la compose.yml
```

### Deploy script can't find files

```bash
# Make sure you're running from the extracted directory
cd nodepulse-admiral-v1.0.0
sudo ./deploy.sh
```

### Systemd cleaner not running

```bash
# Check timer status
sudo systemctl status nodepulse-cleaner.timer

# Check service logs
sudo journalctl -u nodepulse-cleaner.service -n 50

# Verify Docker network
docker network ls | grep admiral

# Test cleanup endpoint
curl -X POST http://localhost:8080/admin/cleanup
```

### Docker Compose services won't start

```bash
# Check .env file
cat .env

# Verify ports aren't in use
sudo netstat -tlnp | grep -E ':(80|443|5432|6379|8080)'

# Check Docker logs
docker compose logs

# Try restarting
docker compose restart
```

## Environment Variables Reference

See `.env.example` for complete list with descriptions.

**Required:**
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DB` - Database name
- `VALKEY_PASSWORD` - Valkey password
- `JWT_SECRET` - JWT signing secret
- `BETTER_AUTH_SECRET` - Better Auth secret

**Optional:**
- `RETENTION_HOURS` - Data retention period (default: 72)
- `GIN_MODE` - Gin framework mode (debug/release)
- `INGEST_PORT` - Ingest service port (default: 8080)

## Updating Deployment

### Update to New Version

```bash
# Pull new images
docker compose pull

# Restart services
docker compose up -d

# Check logs
docker compose logs -f
```

### Update Cleaner Service

```bash
# Reinstall systemd service
sudo ./scripts/install-systemd.sh

# Restart timer
sudo systemctl restart nodepulse-cleaner.timer
```

## Support

For issues and questions:
- GitHub: https://github.com/nodepulse/admiral
- Issues: https://github.com/nodepulse/admiral/issues
