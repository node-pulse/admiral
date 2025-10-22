#!/bin/bash
# Create a release package for NodePulse Admiral deployment
# This extracts only the necessary files for deployment (no source code)

set -e

VERSION="${1:-latest}"
RELEASE_DIR="nodepulse-admiral-${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "================================================"
echo "NodePulse Admiral - Release Packager"
echo "================================================"
echo ""
echo "Version: $VERSION"
echo "Release directory: $RELEASE_DIR"
echo ""

# Clean up existing release directory
if [ -d "$RELEASE_DIR" ]; then
    echo "Removing existing release directory..."
    rm -rf "$RELEASE_DIR"
fi

# Create release directory structure
echo "Creating release directory structure..."
mkdir -p "$RELEASE_DIR"

# Copy deployment files
echo "Copying deployment files..."

# Docker Compose and environment
cp "$PROJECT_ROOT/compose.yml" "$RELEASE_DIR/"
cp "$PROJECT_ROOT/.env.example" "$RELEASE_DIR/"

# Copy deploy script
if [ -f "$PROJECT_ROOT/scripts/deploy.sh" ]; then
    cp "$PROJECT_ROOT/scripts/deploy.sh" "$RELEASE_DIR/"
fi

# Copy documentation
if [ -f "$PROJECT_ROOT/README.md" ]; then
    cp "$PROJECT_ROOT/README.md" "$RELEASE_DIR/"
fi

# Create deployment README
cat > "$RELEASE_DIR/DEPLOY.md" << 'EOF'
# NodePulse Admiral - Deployment Guide

## Quick Start

```bash
# 1. Run the interactive deployment script
sudo ./deploy.sh

# 2. The script will:
#    - Prompt for environment variables
#    - Create .env file
#    - Start Docker Compose services (includes cleaner worker)
```

## Manual Deployment

### 1. Configure Environment

```bash
cp .env.example .env
nano .env  # Edit with your settings
```

### 2. Start Services

```bash
docker compose pull  # Pull latest images
docker compose up -d
```

### 3. Verify Deployment

```bash
# Check services
docker compose ps

# View logs
docker compose logs -f submarines-ingest
docker compose logs -f submarines-digest
docker compose logs -f submarines-cleaner
```

## Updating

```bash
# Pull latest images
docker compose pull

# Restart services
docker compose up -d
```

## Monitoring

```bash
# Service status
docker compose ps

# Logs
docker compose logs -f [service-name]
docker compose logs -f submarines-cleaner

# Database
docker compose exec postgres psql -U nodepulse -d nodepulse
```

## Troubleshooting

### Services won't start
```bash
# Check logs
docker compose logs

# Verify .env file
cat .env

# Check ports
sudo netstat -tlnp | grep -E ':(80|443|5432|6379|8080)'
```

### Cleaner not running
```bash
# Check cleaner service status
docker compose ps submarines-cleaner

# View cleaner logs
docker compose logs -f submarines-cleaner

# Restart cleaner
docker compose restart submarines-cleaner
```

### Database connection issues
```bash
# Check PostgreSQL
docker compose exec postgres pg_isready

# Check if cleaner can connect
docker compose logs submarines-cleaner | grep -i "connect"
```

## Directory Structure

```
nodepulse-admiral-{version}/
├── compose.yml              # Docker Compose configuration
├── .env.example             # Environment variables template
├── deploy.sh                # Interactive deployment script
├── README.md                # Project documentation
└── DEPLOY.md                # This file
```

## Configuration Files

- **compose.yml**: Docker services configuration
- **.env**: Environment variables (create from .env.example)
- **/etc/nodepulse/cleaner.env**: Cleaner service configuration

## Support

For issues and questions:
- GitHub: https://github.com/nodepulse/admiral
- Documentation: See README.md
EOF

# Make deploy script executable
if [ -f "$RELEASE_DIR/deploy.sh" ]; then
    chmod +x "$RELEASE_DIR/deploy.sh"
fi

# Create archive
echo ""
echo "Creating tarball..."
tar -czf "${RELEASE_DIR}.tar.gz" "$RELEASE_DIR"

# Create checksum
echo "Generating checksum..."
sha256sum "${RELEASE_DIR}.tar.gz" > "${RELEASE_DIR}.tar.gz.sha256"

# Show results
echo ""
echo "================================================"
echo "Release Package Created!"
echo "================================================"
echo ""
echo "Files:"
ls -lh "${RELEASE_DIR}.tar.gz"
ls -lh "${RELEASE_DIR}.tar.gz.sha256"
echo ""
echo "Contents:"
tar -tzf "${RELEASE_DIR}.tar.gz" | head -20
echo ""
echo "Checksum:"
cat "${RELEASE_DIR}.tar.gz.sha256"
echo ""
echo "To deploy:"
echo "  1. Copy ${RELEASE_DIR}.tar.gz to your server"
echo "  2. Extract: tar -xzf ${RELEASE_DIR}.tar.gz"
echo "  3. cd ${RELEASE_DIR}"
echo "  4. sudo ./deploy.sh"
echo ""
