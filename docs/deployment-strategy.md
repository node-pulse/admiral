# NodePulse Admiral - Deployment Strategy

## Overview

This document outlines the multi-environment Docker Compose deployment strategy for **NodePulse Admiral** (the control plane), using GitHub Container Registry (GHCR) for production image distribution.

---

## Architecture (Admiral Stack Deployment Only)

### Two-Compose File Strategy

1. **`compose.yml`** - Production (Default)
   - Contains `image:` references to GHCR
   - Pulls pre-built, tagged images
   - No build context (faster deployments)
   - Optimized for production settings
   - Used for production deployments

2. **`compose.development.yml`** - Development & CI/CD
   - Contains `build:` directives for local development
   - Used by GitHub Actions to build and test images
   - Developers use this for local development
   - Fast iteration with hot reload

---

## Image Tagging Strategy

### Custom Services (Build from Source)

| Service | Registry | Tagging Strategy | Example |
|---------|----------|------------------|---------|
| `submarines` | GHCR | Semantic (minor) | `ghcr.io/USERNAME/node-pulse-submarines:1.2` |
| `flagship` | GHCR | Semantic (minor) | `ghcr.io/USERNAME/node-pulse-flagship:2.1` |
| `cruiser` | GHCR | Semantic (minor) | `ghcr.io/USERNAME/node-pulse-cruiser:0.3` |

**Versioning Format**: `MAJOR.MINOR` (omit patch for latest minor release)

### Third-Party Services (Docker Hub/Official)

| Service | Registry | Tagging Strategy | Example |
|---------|----------|------------------|---------|
| `postgres` | Docker Hub | Git SHA (pinned) | `postgres:18-alpine@sha256:abc123...` |
| `valkey` | Docker Hub | Git SHA (pinned) | `valkey/valkey:latest@sha256:def456...` |
| `pgweb` | Docker Hub | Git SHA (pinned) | `sosedoff/pgweb:latest@sha256:012jkl...` |
| `caddy` | Docker Hub | Git SHA (pinned) | `caddy:2-alpine@sha256:345mno...` |

**Why Git SHA for third-party?**
- Ensures reproducible builds
- Prevents surprise breaking changes from upstream
- Security: audit exact image versions

---

## File Structure

```
admiral/
├── compose.yml                   # Production (image: only)
├── compose.development.yml       # Development & CI/CD (with build:)
├── .github/
│   └── workflows/
│       ├── build-and-push.yml    # Build & push to GHCR
│       └── deploy-production.yml # Deploy to production server
├── docs/
│   ├── deployment-strategy.md    # This file
│   └── runbook.md                # Operations guide
└── scripts/
    ├── build-local.sh            # Local development build
    └── deploy-prod.sh            # Production deployment helper
```

---

## Workflow

### 1. Development (Local)

```bash
# Use development compose file (builds locally)
docker compose -f compose.development.yml up -d

# Make changes to code
# Test locally

# Commit and push
git add .
git commit -m "feat: add new metric type"
git push origin feature/new-metrics
```

**What happens:**
- `compose.development.yml` builds images from local source code
- Fast iteration cycle
- All services run with `build:` context

---

### 2. CI/CD Pipeline (GitHub Actions)

#### Trigger: Push to `main` or version tag

```bash
git tag v1.3.0
git push origin v1.3.0
```

#### GitHub Actions Workflow:

```yaml
# .github/workflows/build-and-push.yml

on:
  push:
    branches: [main]
    tags: ['v*.*.*']

jobs:
  build-submarines:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
      - name: Set up Docker Buildx
      - name: Login to GHCR
      - name: Extract version (1.3.0 → 1.3)
      - name: Build and push
        tags:
          - ghcr.io/USERNAME/node-pulse-submarines:1.3
          - ghcr.io/USERNAME/node-pulse-submarines:latest
```

**Output:**
- ✅ Images pushed to GHCR with semantic tags
- ✅ `latest` tag updated
- ✅ Minor version tag created (e.g., `1.3`)

---

### 3. Production Deployment

#### Option A: Manual Deployment

```bash
# SSH to production server
ssh production-server

cd /opt/node-pulse-admiral

# Pull latest production compose file
git pull origin main

# Use default compose.yml (production)
docker compose pull
docker compose up -d

# Verify
docker compose ps
```

#### Option B: Automated Deployment (GitHub Actions)

```yaml
# .github/workflows/deploy-production.yml

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        default: 'production'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        run: |
          ssh user@production-server << 'EOF'
            cd /opt/node-pulse-admiral
            git pull origin main
            docker compose pull
            docker compose up -d
          EOF
```

---

## compose.yml vs compose.development.yml

### Production (`compose.yml`) - Default

```yaml
services:
  submarines:
    image: ghcr.io/USERNAME/node-pulse-submarines:1.2
    # NO build: section
    restart: unless-stopped
    # ... production settings

  postgres:
    image: postgres:18-alpine@sha256:abc123def456...
    restart: unless-stopped
    # ... production hardening
```

**Characteristics:**
- Only `image:` references (no `build:`)
- Pinned third-party images with SHA256
- Production settings (`restart: unless-stopped`, resource limits)
- Security hardening

---

### Development (`compose.development.yml`)

```yaml
services:
  submarines:
    build:
      context: ./submarines
      dockerfile: Dockerfile
    # ... rest of config

  postgres:
    image: postgres:18-alpine
    # ... dev settings
```

**Characteristics:**
- Has `build:` sections
- Uses generic image tags (e.g., `postgres:18-alpine`)
- Development-friendly settings (hot reload, verbose logging)

---

## Environment Variables

### Development (`.env`)

```bash
# Development defaults
POSTGRES_PASSWORD=postgres
VALKEY_PASSWORD=valkeypassword
GIN_MODE=debug
RAILS_ENV=development
```

### Production (`.env.production`)

```bash
# Production (strong passwords, production mode)
POSTGRES_PASSWORD=<strong-password>
VALKEY_PASSWORD=<strong-password>
GIN_MODE=release
RAILS_ENV=production

# GHCR credentials (for private repos)
GHCR_USERNAME=<github-username>
GHCR_TOKEN=<github-pat>
```

**Security Note:** Never commit `.env.production` to git!

---

## Image Digest Pinning (Third-Party)

### Why Pin with SHA256?

```yaml
# ❌ BAD: Can change unexpectedly
image: postgres:18-alpine

# ✅ GOOD: Immutable, auditable
image: postgres:18-alpine@sha256:abc123def456...
```

### How to Get SHA256 Digest

```bash
# Pull the image
docker pull postgres:18-alpine

# Get the digest
docker inspect postgres:18-alpine --format='{{index .RepoDigests 0}}'
# Output: postgres:18-alpine@sha256:abc123def456...
```

### Update Process

1. Pull new image version locally
2. Test thoroughly in staging
3. Extract SHA256 digest
4. Update `compose.yml` with digest
5. Commit and deploy

---

## GitHub Actions Secrets

Configure these secrets in GitHub repo settings:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `GHCR_TOKEN` | GitHub PAT with `write:packages` | `ghp_xxxxxxxxxxxx` |
| `PROD_SSH_KEY` | SSH private key for production server | `-----BEGIN OPENSSH...` |
| `PROD_HOST` | Production server hostname | `prod.example.com` |
| `PROD_USER` | SSH username | `deploy` |

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing in CI
- [ ] Semantic version tag created (`v1.x.x`)
- [ ] Images successfully pushed to GHCR
- [ ] Database migrations reviewed
- [ ] Backup current production database
- [ ] Review `compose.yml` changes

### Deployment

- [ ] SSH to production server
- [ ] Pull latest code (`git pull`)
- [ ] Pull new images (`docker compose pull`)
- [ ] Run migrations if needed
- [ ] Deploy (`docker compose up -d`)
- [ ] Verify services are healthy (`docker compose ps`)

### Post-Deployment

- [ ] Check application logs (`docker compose logs -f`)
- [ ] Verify metrics ingestion working
- [ ] Test authentication flows
- [ ] Monitor resource usage
- [ ] Update deployment log

---

## Rollback Strategy

### Quick Rollback (Same Images)

```bash
# Restart services to previous state
docker compose restart

# If needed, restore database from backup
# (See backup/restore procedures)
```

### Full Rollback (Previous Image Version)

```bash
# Edit compose.yml to use previous tag
# Example: Change 1.3 → 1.2

# Pull old images
docker compose pull

# Deploy
docker compose up -d
```

---

## Best Practices

### 1. Never Mix Build and Image in Production
- Production should ONLY use `image:`, never `build:`
- Ensures consistency and faster deployments

### 2. Always Test Images in Staging First
- Pull GHCR images to staging environment
- Run full integration tests
- Only promote to production after validation

### 3. Semantic Versioning Discipline
- `MAJOR.MINOR.PATCH` for all custom services
- Bump `MAJOR` for breaking changes
- Bump `MINOR` for new features
- Bump `PATCH` for bugfixes
- Use `MAJOR.MINOR` tags in production (e.g., `1.3`)

### 4. Monitor Image Sizes
```bash
# Check image sizes
docker images | grep node-pulse

# Keep images lean:
# - Multi-stage builds
# - Alpine base images
# - .dockerignore files
```

### 5. Security Scanning
```yaml
# Add to GitHub Actions
- name: Scan image for vulnerabilities
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/USERNAME/node-pulse-submarines:1.3
```

---

## Troubleshooting

### "Failed to pull image from GHCR"

**Cause:** Authentication failure

**Solution:**
```bash
# Login to GHCR
echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull image
docker compose pull
```

### "Image not found in registry"

**Cause:** Tag doesn't exist or CI build failed

**Solution:**
```bash
# Check available tags on GitHub
# Visit: https://github.com/USERNAME/REPO/pkgs/container/node-pulse-submarines

# Verify CI workflow completed successfully
```

### "Service won't start after deployment"

**Cause:** Configuration mismatch or missing env vars

**Solution:**
```bash
# Check logs
docker compose logs submarines

# Verify environment variables
docker compose config

# Compare with previous working version
git diff HEAD~1 compose.yml
```

---

## Next Steps

1. **Update `compose.yml`** - Production with GHCR images and SHA256 pinning
2. **Create `compose.development.yml`** - Development with build directives
3. **Set up GitHub Actions** - Build and push workflows
4. **Configure GHCR** - Repository settings and permissions
5. **Test staging deployment** - Validate full workflow
6. **Document runbook** - Operational procedures

---

## References

- [Docker Compose Spec](https://docs.docker.com/compose/compose-file/)
- [GHCR Documentation](https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Semantic Versioning](https://semver.org/)
- [Docker Image Digests](https://docs.docker.com/engine/reference/commandline/pull/#pull-an-image-by-digest-immutable-identifier)
