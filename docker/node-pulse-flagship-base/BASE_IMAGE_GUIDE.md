# Base Image Setup Guide

## Overview

Node Pulse uses a pre-compiled base image (`node-pulse-flagship-base`) to dramatically speed up CI builds.

**Build time improvement:**
- Before: 17 min/arch × 2 = **34 minutes**
- After: 2-3 min/arch × 2 = **6 minutes**
- **Savings: 28 minutes per release!**

## First-Time Setup

### Step 1: Build the Base Image Manually

The base image needs to be built **once** before your app images can use it:

```bash
# Trigger the base image build via GitHub Actions UI
# Go to: Actions → Build Base Images → Run workflow
```

Or build locally and push:

```bash
cd docker/php-laravel-base

# Build for both architectures
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/YOUR_ORG/node-pulse-flagship-base:8.3 \
  -t ghcr.io/YOUR_ORG/node-pulse-flagship-base:latest \
  --push .
```

**This only needs to be done once!** (Then monthly for updates)

### Step 2: Verify Base Image is Published

Check that the image is available:

```bash
docker pull ghcr.io/YOUR_ORG/node-pulse-flagship-base:8.3
```

### Step 3: Release Your App

Now your app builds will use the pre-compiled base:

```bash
git tag v1.2.3
git push --tags
```

## How It Works

### Base Image (`node-pulse-flagship-base:8.3`)

**Contains (pre-compiled):**
- PHP 8.3 FPM Alpine
- All Laravel extensions: intl, mbstring, zip, bcmath, pcntl, pdo_pgsql, pgsql, opcache
- Ansible, Python3, SSH tools
- Production PHP configuration
- Optimized OPcache settings

**Built:**
- Monthly (automatic via cron)
- On-demand (manual trigger)
- When `docker/php-laravel-base/` changes

### App Images (flagship, etc.)

**Dockerfile.prod:**
```dockerfile
FROM ghcr.io/YOUR_ORG/node-pulse-flagship-base:8.3 AS php-base
# No PHP extension compilation needed!
# Just copy your app and go
```

**Result:** 6-minute builds instead of 34 minutes!

## Maintenance

### Updating Base Image

The base image auto-rebuilds:
1. **Monthly** - First day of each month (gets security updates)
2. **On changes** - When `docker/php-laravel-base/` files change
3. **Manual** - Trigger via GitHub Actions UI

### Adding New PHP Extensions

Edit `docker/php-laravel-base/Dockerfile`:

```dockerfile
RUN docker-php-ext-install -j$(nproc) \
    intl \
    mbstring \
    # ... existing extensions ...
    redis  # ← Add new extension
```

Commit and push - base image rebuilds automatically.

### Testing Base Image Locally

Before pushing changes:

```bash
# Build base image
cd docker/php-laravel-base
docker build -t node-pulse-flagship-base:test .

# Build app with test base
cd ../../flagship
docker build --build-arg GITHUB_REPOSITORY_OWNER=YOUR_ORG \
  -t flagship:test \
  -f Dockerfile.prod .
```

## Troubleshooting

### Build fails: "base image not found"

The base image hasn't been built yet. Run the base image workflow first:

```bash
# Go to GitHub Actions → Build Base Images → Run workflow
```

### Want to skip base image (emergency)

Temporarily revert to building from scratch:

```dockerfile
# Dockerfile.prod - temporary
FROM php:8.3-fpm-alpine AS php-base

# Add back all the RUN commands from docker/php-laravel-base/Dockerfile
```

### Check what's in the base image

```bash
docker run --rm ghcr.io/YOUR_ORG/node-pulse-flagship-base:8.3 php -m
```

## Benefits Summary

✅ **28 minutes saved per release** - Faster CI feedback
✅ **Saves GitHub Actions minutes** - Important for free tier
✅ **Smaller images** - Alpine (~100MB) vs Debian (~250MB)
✅ **Reusable** - Share base across multiple projects
✅ **Easier maintenance** - Update extensions in one place
✅ **Automatic updates** - Monthly rebuilds for security patches

## FAQ

**Q: Do I need to rebuild the base image for every app release?**
No! The base image is built once and reused. Only rebuild monthly or when adding extensions.

**Q: What if the base image build fails?**
Your app builds will fail until the base image is fixed. This prevents broken releases.

**Q: Can I use the base image locally?**
Yes! Pull it: `docker pull ghcr.io/YOUR_ORG/node-pulse-flagship-base:8.3`

**Q: Does this work with Docker Compose?**
Yes! Just set the build arg: `GITHUB_REPOSITORY_OWNER=YOUR_ORG`
