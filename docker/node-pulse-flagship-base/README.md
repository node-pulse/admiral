# Node Pulse Flagship Base Image

Pre-built PHP 8.3 FPM Alpine image with common Laravel extensions compiled.

## What's Included

- **Base**: `php:8.3-fpm-alpine`
- **PHP Extensions**: intl, mbstring, zip, bcmath, pcntl, pdo_pgsql, pgsql, opcache
- **Tools**: curl, git, openssh-client, python3, ansible, sshpass
- **Configuration**: Production PHP.ini, Optimized OPcache

## Image Tags

- `ghcr.io/node-pulse/node-pulse-flagship-base:8.3` - PHP 8.3 (stable)
- `ghcr.io/node-pulse/node-pulse-flagship-base:latest` - Latest version

## Usage

```dockerfile
FROM ghcr.io/node-pulse/node-pulse-flagship-base:8.3

# Your app-specific configuration here
# No need to compile PHP extensions!
```

## Building Locally

```bash
docker build -t node-pulse-flagship-base:8.3 .
```

## Why This Image?

Building PHP extensions from source takes 15-20 minutes per architecture in CI. By pre-compiling extensions into a base image:

- ✅ **App builds: 17min → 3min** (saves 14 min per build)
- ✅ **Smaller Alpine images** (~100MB vs ~250MB Debian)
- ✅ **Faster CI feedback** - Know about errors sooner
- ✅ **Reusable** - Share across multiple Laravel projects

## Maintenance

This image is rebuilt:

- **Monthly** - To get latest Alpine security updates
- **On-demand** - When Dockerfile changes
- **When needed** - For PHP version updates

See `.github/workflows/build-base-images.yml` for automation.
