#!/bin/bash
# Local Release Packager for NodePulse Admiral
# Creates deployment tarball matching GitHub Actions release workflow
# Useful for local testing before pushing tags

set -e

VERSION="${1:-latest}"
RELEASE_DIR="node-pulse-admiral-${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}NodePulse Admiral - Local Release Packager${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Version: $VERSION"
echo "Release directory: $RELEASE_DIR"
echo ""

# Clean up existing release directory
if [ -d "$PROJECT_ROOT/release" ]; then
    echo "Cleaning up existing release directory..."
    rm -rf "$PROJECT_ROOT/release"
fi

# Create release directory structure
echo "Creating release directory structure..."
mkdir -p "$PROJECT_ROOT/release/$RELEASE_DIR"

cd "$PROJECT_ROOT"

# Copy essential deployment files (matches GitHub Actions workflow)
echo "Copying deployment files..."

echo "  - compose.yml"
cp compose.yml "release/$RELEASE_DIR/"

echo "  - .env.example"
cp .env.example "release/$RELEASE_DIR/"

echo "  - scripts/deploy.sh"
cp scripts/deploy.sh "release/$RELEASE_DIR/"
chmod +x "release/$RELEASE_DIR/deploy.sh"

echo "  - scripts/setup-mtls.sh"
cp scripts/setup-mtls.sh "release/$RELEASE_DIR/"
chmod +x "release/$RELEASE_DIR/setup-mtls.sh"

# Copy Caddy configuration (rename prod to Caddyfile for production use)
echo "  - caddy/Caddyfile (production)"
mkdir -p "release/$RELEASE_DIR/caddy"
cp caddy/Caddyfile.prod "release/$RELEASE_DIR/caddy/Caddyfile"

# Copy Flagship entrypoint script
echo "  - flagship/docker-entrypoint.sh"
mkdir -p "release/$RELEASE_DIR/flagship"
cp flagship/docker-entrypoint.sh "release/$RELEASE_DIR/flagship/"
chmod +x "release/$RELEASE_DIR/flagship/docker-entrypoint.sh"

# Copy Ansible playbooks (needed at runtime)
echo "  - ansible/ (playbooks)"
cp -r ansible "release/$RELEASE_DIR/ansible"

# Remove catalog directory from release (downloaded from registry at runtime)
echo "  - Excluding ansible/catalog/ (downloaded from registry)"
rm -rf "release/$RELEASE_DIR/ansible/catalog"
mkdir -p "release/$RELEASE_DIR/ansible/catalog"
cp ansible/catalog/.gitignore "release/$RELEASE_DIR/ansible/catalog/"

# Remove custom playbooks directory from release (user-specific, not for distribution)
echo "  - Excluding ansible/custom/ (user-specific uploads)"
rm -rf "release/$RELEASE_DIR/ansible/custom"
mkdir -p "release/$RELEASE_DIR/ansible/custom"
# Keep only README and .gitignore
cp ansible/custom/.gitignore "release/$RELEASE_DIR/ansible/custom/"
cp ansible/custom/README.md "release/$RELEASE_DIR/ansible/custom/"

# Copy documentation
echo "  - README.md"
cp README.md "release/$RELEASE_DIR/"

if [ -f LICENSE ]; then
    echo "  - LICENSE"
    cp LICENSE "release/$RELEASE_DIR/"
fi

# Create deployment instructions (matches GitHub Actions)
echo "Creating DEPLOYMENT.md..."
cat > "release/$RELEASE_DIR/DEPLOYMENT.md" << EOF
# Node Pulse Admiral - Deployment Instructions

## Version: $VERSION

## Quick Start

**Download and deploy:**

\`\`\`bash
# If using GitHub release (automated):
curl -LO https://github.com/YOUR_ORG/YOUR_REPO/releases/download/v${VERSION}/node-pulse-admiral-${VERSION}.tar.gz
curl -LO https://github.com/YOUR_ORG/YOUR_REPO/releases/download/v${VERSION}/node-pulse-admiral-${VERSION}.tar.gz.sha256
sha256sum -c node-pulse-admiral-${VERSION}.tar.gz.sha256

# Or if using local build:
# Just extract the tarball you created

# Extract
tar xzf node-pulse-admiral-${VERSION}.tar.gz

# Enter directory
cd node-pulse-admiral-${VERSION}

# Run deployment
sudo ./deploy.sh
\`\`\`

The deployment script will:
- Guide you through all configuration options interactively
- Set up environment variables automatically
- Bootstrap mTLS certificates for production security
- Pull pre-built Docker images from GitHub Container Registry (or local registry)
- Create initial admin user with your chosen credentials
- Start all services

**Access your dashboard:**
- Open \`http://your-server-ip\` in your browser
- Login with the admin credentials you created during deployment

## What's Included

- \`compose.yml\` - Docker Compose configuration (pulls pre-built images)
- \`deploy.sh\` - Interactive deployment script
- \`setup-mtls.sh\` - mTLS certificate bootstrap script
- \`.env.example\` - Environment variables template
- \`caddy/\` - Reverse proxy configuration
- \`ansible/\` - Ansible playbooks (mounted at runtime, supports custom playbooks)
- \`DEPLOYMENT.md\` - This file

## Docker Images

### Using GitHub Container Registry (Production)

All images are pre-built and published to GitHub Container Registry:

- \`ghcr.io/YOUR_ORG/node-pulse-migrate:${VERSION}\`
- \`ghcr.io/YOUR_ORG/node-pulse-submarines-ingest:${VERSION}\`
- \`ghcr.io/YOUR_ORG/node-pulse-submarines-digest:${VERSION}\`
- \`ghcr.io/YOUR_ORG/node-pulse-submarines-deployer:${VERSION}\`
- \`ghcr.io/YOUR_ORG/node-pulse-submarines-sshws:${VERSION}\`
- \`ghcr.io/YOUR_ORG/node-pulse-flagship:${VERSION}\`

### Using Local Registry (Testing)

For local testing with unregistry:

\`\`\`bash
# Install unregistry
curl -fsSL https://get.unregistry.dev | sh

# Push images to test server
docker pussh localhost:5000/node-pulse-migrate:${VERSION} user@test-server
docker pussh localhost:5000/node-pulse-submarines-ingest:${VERSION} user@test-server
# ... (repeat for all services)

# Or use the helper script (if available)
./scripts/push-local.sh user@test-server ${VERSION}
\`\`\`

Then modify \`compose.yml\` to use \`localhost:5000/\` prefix.

## Requirements

- Linux server (Ubuntu 22.04+ recommended)
- Docker Engine 24.0+
- Docker Compose v2.20+
- Root/sudo access
- Minimum 2GB RAM, 2 CPU cores

## Documentation

- [mTLS Setup Guide](docs/mtls-setup-guide.md) - Available in full repository
- [Ansible Deployment Guide](ansible/README.md) - Available in full repository

## Support

- Issues: https://github.com/YOUR_ORG/YOUR_REPO/issues
- Documentation: https://github.com/YOUR_ORG/YOUR_REPO
EOF

# Create tarball
echo ""
echo "Creating tarball..."
cd release
tar czf "node-pulse-admiral-${VERSION}.tar.gz" "$RELEASE_DIR/"

# Create checksums
echo "Generating checksum..."
sha256sum "node-pulse-admiral-${VERSION}.tar.gz" > "node-pulse-admiral-${VERSION}.tar.gz.sha256"

# Show results
echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Release Package Created!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Location: $PROJECT_ROOT/release/"
echo ""
echo "Files:"
ls -lh "node-pulse-admiral-${VERSION}.tar.gz"
ls -lh "node-pulse-admiral-${VERSION}.tar.gz.sha256"
echo ""
echo "Archive contents:"
tar -tzf "node-pulse-admiral-${VERSION}.tar.gz" | head -20
if [ $(tar -tzf "node-pulse-admiral-${VERSION}.tar.gz" | wc -l) -gt 20 ]; then
    echo "... (and more)"
fi
echo ""
echo "Checksum:"
cat "node-pulse-admiral-${VERSION}.tar.gz.sha256"
echo ""
echo -e "${YELLOW}================================================${NC}"
echo -e "${YELLOW}Deployment Options${NC}"
echo -e "${YELLOW}================================================${NC}"
echo ""
echo "Option 1: Deploy to remote server"
echo "  scp node-pulse-admiral-${VERSION}.tar.gz user@server:~/"
echo "  ssh user@server"
echo "  tar xzf node-pulse-admiral-${VERSION}.tar.gz"
echo "  cd node-pulse-admiral-${VERSION}"
echo "  sudo ./deploy.sh"
echo ""
echo "Option 2: Local testing with unregistry"
echo "  # Install unregistry: curl -fsSL https://get.unregistry.dev | sh"
echo "  # Build images locally first:"
echo "  docker compose -f compose.development.yml build"
echo "  # Push to test server:"
echo "  docker pussh node-pulse-migrate:latest user@test-server"
echo "  # ... (repeat for all services)"
echo ""
echo "Option 3: Test locally"
echo "  cd release/node-pulse-admiral-${VERSION}"
echo "  # Modify compose.yml to use local images or localhost:5000/"
echo "  sudo ./deploy.sh"
echo ""
