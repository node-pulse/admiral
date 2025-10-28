# mTLS Setup Guide

This guide explains how to bootstrap the mTLS infrastructure for Node Pulse **production deployments**.

## ⚠️ Important

**mTLS is MANDATORY for production.** This is a build-time architectural decision:

- ✅ **Production builds** (`compose.yml`): mTLS always enforced (cannot be disabled)
- ❌ **Development builds** (`compose.development.yml`): No mTLS (for testing only)

## Overview

The mTLS setup process:
1. Generates master encryption key (if not exists)
2. Creates self-signed Certificate Authority (10-year validity)
3. Exports CA certificate for Caddy
4. Rebuilds submarines with mTLS enabled (production binary)
5. Verifies setup in database

## Setup Method: Automated Script

Use the bash script for all mTLS operations. This handles everything automatically.

### Initial Setup

```bash
# Full setup (interactive)
./scripts/setup-mtls.sh

# Custom CA name and validity
./scripts/setup-mtls.sh --name="Production CA 2025" --validity=7300
```

### Renew CA Certificate

```bash
# Renew CA (same script, just run it again)
./scripts/setup-mtls.sh --force
```

### What It Does

- ✅ Generates master key (if not exists)
- ✅ Creates CA in database
- ✅ Exports CA certificate to `./secrets/certs/ca.crt`
- ✅ **Rebuilds submarines-ingest with mTLS enabled**
- ✅ Restarts services automatically

### Output Example

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Node Pulse mTLS Bootstrap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/7] Checking prerequisites...
  ✓ Directories created/verified
  ✓ Submarines API reachable

[2/7] Checking master encryption key...
  ✓ Master key found

[3/7] Checking for existing Certificate Authority...
  ✓ No existing CA found - will create new one

[4/7] Creating self-signed Certificate Authority...
  ✓ Created CA: Node Pulse Production CA
  ✓ CA ID: 1
  ✓ Valid until: 2035-10-28T12:00:00+00:00

[5/7] Exporting CA certificate...
  ✓ Exported CA certificate to: ./secrets/certs/ca.crt

[6/7] Verifying setup...
  ✓ CA certificate file exists
  ✓ Active CA verified via API

[7/7] Rebuilding submarines with mTLS enabled...
  ✓ Rebuild complete
  ✓ Service restarted with mTLS enabled

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✓ mTLS Bootstrap Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ CA Name: Node Pulse Production CA
  ✓ Certificate: ./secrets/certs/ca.crt

Next Steps:
  1. Deploy agents with certificates:
     ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml

  2. Monitor mTLS status in admin UI:
     System Settings > Security > mTLS Authentication

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Production Requirement

**⚠️ mTLS is MANDATORY for production deployments.**

The deployment script (`scripts/deploy.sh`) will automatically run `setup-mtls.sh` when `APP_ENV=production`:

```bash
# When APP_ENV=production is set during deployment:
# deploy.sh automatically runs:
./scripts/setup-mtls.sh
```

### Why is mTLS Mandatory?

This is a **build-time architectural decision**:

- **Development builds** (`compose.development.yml`): Compiled without mTLS for testing
- **Production builds** (`compose.yml`): Compiled with mTLS, always enforced

You cannot disable mTLS in production - it's part of the binary itself.

## Script Options

| Option | Description | Default |
|--------|-------------|---------|
| `--force` | Force recreate CA even if one exists | false |
| `--name <name>` | CA name | "Node Pulse Production CA" |
| `--validity <days>` | CA validity in days | 3650 (10 years) |
| `--help` | Show help message | - |

## Prerequisites

Before running the setup:

1. **Production deployment**: This is for production only
   ```bash
   # Use production compose file
   docker compose -f compose.yml up -d
   ```

2. **Database migrated**: Run migrations first
   ```bash
   docker compose -f compose.yml up flagship-migrate
   ```

3. **Services running**: Ensure all services are up
   ```bash
   docker compose -f compose.yml ps
   ```

4. **Docker installed**: Script needs Docker to rebuild submarines
5. **Submarines accessible**: API must be reachable at http://submarines-ingest:8080

## What Gets Created

### Files Created

```
secrets/
├── master.key          # 32-byte master encryption key
└── certs/
    └── ca.crt          # CA certificate (PEM format)
```

### Database Records

```sql
-- 1 record in certificate_authorities table
INSERT INTO admiral.certificate_authorities (
    name, certificate_pem, private_key_encrypted,
    valid_from, valid_until, is_active
) VALUES (...);
```

## Troubleshooting

### Error: "No active CA found"

The CA creation failed. Check:
- Submarines is running: `docker compose ps submarines-ingest`
- Database connection is working
- Logs: `docker compose logs submarines-ingest`

### Error: "Failed to export CA certificate"

File permissions issue. Check:
- Directory exists: `ls -la secrets/certs/`
- Write permissions: `chmod 755 secrets/certs`

### CA Already Exists Warning

If a CA already exists and you run without `--force`:
- Script will ask for confirmation
- Use `--force` to skip confirmation
- Old CA is NOT deactivated automatically (manual operation)

### Rebuilding Takes Time

The script rebuilds submarines-ingest which may take 2-5 minutes depending on your system.

## Next Steps After Setup

The script handles everything automatically. Just proceed to:

1. **Generate agent certificates** via Flagship UI or API
   ```bash
   curl -X POST http://localhost/api/servers/{server}/certificate
   ```

2. **Deploy certificates to agents** using Ansible
   ```bash
   ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml
   ```

## Security Notes

- **Master key**: Stored in `secrets/master.key` - keep this file secure
- **CA private key**: Encrypted in database using master key
- **CA certificate**: Public, can be shared (needed by Caddy)
- **Backup**: Backup `secrets/` directory - losing master.key means losing access to all private keys

## See Also

- [mTLS Implementation Guide](./mtls-guide.md)
- [Certificate Management API](./api-certificates.md)
- [Ansible Deployment](../flagship/ansible/docs/)
