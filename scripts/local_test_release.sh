#!/bin/bash
# Local Test Release - Complete Workflow
# Builds images locally, pushes to server, and deploys
# Usage: ./scripts/local_test_release.sh <version> <server>

set -e

VERSION="${1}"
SERVER="${2}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [ -z "$VERSION" ] || [ -z "$SERVER" ]; then
    echo "Usage: $0 <version> <server>"
    echo ""
    echo "Arguments:"
    echo "  version    Version tag (e.g., v0.9.10, dev-test)"
    echo "  server     Remote server (e.g., root@23.82.96.87)"
    echo ""
    echo "Example:"
    echo "  $0 v0.9.10 root@23.82.96.87"
    echo ""
    echo "This will:"
    echo "  1. Build all Docker images locally"
    echo "  2. Push images to production server"
    echo "  3. Deploy to /opt/admiral on the server"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

IMAGES=(
    "node-pulse-migrate"
    "node-pulse-submarines-ingest"
    "node-pulse-submarines-digest"
    "node-pulse-submarines-deployer"
    "node-pulse-submarines-status"
    "node-pulse-submarines-sshws"
    "node-pulse-flagship"
)

echo -e "${BLUE}========================================================${NC}"
echo -e "${BLUE}NodePulse Admiral - Local Test Release${NC}"
echo -e "${BLUE}========================================================${NC}"
echo ""
echo "Version: $VERSION"
echo "Server:  $SERVER"
echo ""
echo "This will:"
echo "  1. Build all Docker images locally"
echo "  2. Push images to server"
echo "  3. Create release tarball"
echo "  4. Deploy to /opt/admiral"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi
echo ""

# ==============================================================================
# STEP 1: Build Docker Images Locally
# ==============================================================================
echo -e "${YELLOW}[1/4] Building Docker images locally...${NC}"
cd "$PROJECT_ROOT"

echo "  → Building migrate..."
docker build -t "node-pulse-migrate:${VERSION}" -f migrate/Dockerfile migrate/

echo "  → Building submarines-ingest..."
docker build -t "node-pulse-submarines-ingest:${VERSION}" -f submarines/Dockerfile.ingest submarines/

echo "  → Building submarines-digest..."
docker build -t "node-pulse-submarines-digest:${VERSION}" -f submarines/Dockerfile.digest submarines/

echo "  → Building submarines-deployer..."
docker build -t "node-pulse-submarines-deployer:${VERSION}" -f submarines/Dockerfile.deployer submarines/

echo "  → Building submarines-status..."
docker build -t "node-pulse-submarines-status:${VERSION}" -f submarines/Dockerfile.status submarines/

echo "  → Building submarines-sshws..."
docker build -t "node-pulse-submarines-sshws:${VERSION}" -f submarines/Dockerfile.sshws submarines/

echo "  → Building flagship..."
docker build -t "node-pulse-flagship:${VERSION}" -f flagship/Dockerfile flagship/

echo ""
echo -e "${GREEN}✓ All images built successfully${NC}"
echo ""

# ==============================================================================
# STEP 2: Push Images to Server
# ==============================================================================
echo -e "${YELLOW}[2/4] Pushing images to server...${NC}"

# Auto-detect transfer method
if command -v docker-pussh &> /dev/null; then
    echo "  → Using unregistry (docker-pussh) - fast method"
    echo ""

    for IMAGE in "${IMAGES[@]}"; do
        echo "  → Pushing ${IMAGE}:${VERSION}..."
        docker-pussh "${IMAGE}:${VERSION}" "$SERVER"
    done
else
    echo "  → Using docker save/load - standard method"
    echo "  → (Install unregistry for faster transfers: curl -fsSL https://get.unregistry.dev | sh)"
    echo ""

    TARBALL="/tmp/nodepulse-images-${VERSION}.tar"

    echo "  → Creating image tarball..."
    IMAGE_LIST=()
    for IMAGE in "${IMAGES[@]}"; do
        IMAGE_LIST+=("${IMAGE}:${VERSION}")
    done

    docker save -o "$TARBALL" "${IMAGE_LIST[@]}"
    SIZE=$(du -h "$TARBALL" | cut -f1)
    echo "  → Tarball created: $SIZE"

    echo "  → Copying to server..."
    scp "$TARBALL" "${SERVER}:/tmp/"

    echo "  → Loading images on server..."
    ssh "$SERVER" "docker load -i /tmp/nodepulse-images-${VERSION}.tar && rm -f /tmp/nodepulse-images-${VERSION}.tar"

    echo "  → Cleaning up local tarball..."
    rm -f "$TARBALL"
fi

echo ""
echo -e "${GREEN}✓ All images pushed to server${NC}"
echo ""

# ==============================================================================
# STEP 3: Create Release Tarball
# ==============================================================================
echo -e "${YELLOW}[3/4] Creating release tarball...${NC}"

RELEASE_DIR="node-pulse-admiral-${VERSION}"

# Clean up existing release directory
if [ -d "$PROJECT_ROOT/release" ]; then
    rm -rf "$PROJECT_ROOT/release"
fi

mkdir -p "$PROJECT_ROOT/release/$RELEASE_DIR"

# Copy essential deployment files
echo "  → Copying deployment files..."
cp compose.yml "release/$RELEASE_DIR/"
cp .env.example "release/$RELEASE_DIR/"
cp scripts/deploy.sh "release/$RELEASE_DIR/"
chmod +x "release/$RELEASE_DIR/deploy.sh"
cp scripts/deploy_test.sh "release/$RELEASE_DIR/"
chmod +x "release/$RELEASE_DIR/deploy_test.sh"
cp scripts/setup-mtls.sh "release/$RELEASE_DIR/"
chmod +x "release/$RELEASE_DIR/setup-mtls.sh"

# Copy Caddy configuration (production)
mkdir -p "release/$RELEASE_DIR/caddy"
cp caddy/Caddyfile.prod "release/$RELEASE_DIR/caddy/Caddyfile"

# Copy Flagship entrypoint
mkdir -p "release/$RELEASE_DIR/flagship"
cp flagship/docker-entrypoint.sh "release/$RELEASE_DIR/flagship/"
chmod +x "release/$RELEASE_DIR/flagship/docker-entrypoint.sh"

# Copy Ansible playbooks
cp -r ansible "release/$RELEASE_DIR/ansible"

# Remove catalog (downloaded from registry at runtime)
rm -rf "release/$RELEASE_DIR/ansible/catalog"
mkdir -p "release/$RELEASE_DIR/ansible/catalog"
cp ansible/catalog/.gitignore "release/$RELEASE_DIR/ansible/catalog/"

# Remove custom playbooks (user-specific)
rm -rf "release/$RELEASE_DIR/ansible/custom"
mkdir -p "release/$RELEASE_DIR/ansible/custom"
cp ansible/custom/.gitignore "release/$RELEASE_DIR/ansible/custom/"
cp ansible/custom/README.md "release/$RELEASE_DIR/ansible/custom/"

# Copy documentation
cp README.md "release/$RELEASE_DIR/"
[ -f LICENSE ] && cp LICENSE "release/$RELEASE_DIR/"

# Modify compose.yml to use local images (remove ghcr.io references)
echo "  → Modifying compose.yml for local images..."
cd "$PROJECT_ROOT/release/$RELEASE_DIR"
cp compose.yml compose.yml.original
sed -i.bak \
    -e "s|ghcr.io/[^/]*/node-pulse-|node-pulse-|g" \
    compose.yml
rm compose.yml.bak

# Create tarball
cd "$PROJECT_ROOT/release"
echo "  → Creating tarball..."
tar czf "node-pulse-admiral-${VERSION}.tar.gz" "$RELEASE_DIR/"

# Create checksum
echo "  → Generating checksum..."
sha256sum "node-pulse-admiral-${VERSION}.tar.gz" > "node-pulse-admiral-${VERSION}.tar.gz.sha256"

echo ""
echo -e "${GREEN}✓ Release tarball created${NC}"
echo ""

# ==============================================================================
# STEP 4: Deploy to Server
# ==============================================================================
echo -e "${YELLOW}[4/4] Deploying to server...${NC}"

# Copy tarball to server
echo "  → Copying deployment package to server..."
scp "$PROJECT_ROOT/release/node-pulse-admiral-${VERSION}.tar.gz" "${SERVER}:/tmp/"

# Deploy on server
echo "  → Running deployment on server..."
ssh "$SERVER" bash << REMOTE_SCRIPT
set -e

echo "  → Stopping existing services..."
cd /opt/admiral 2>/dev/null && docker compose down 2>/dev/null || true

echo "  → Backing up existing .env (if exists)..."
if [ -f /opt/admiral/.env ]; then
    cp /opt/admiral/.env /tmp/admiral.env.backup
fi

echo "  → Extracting new version..."
mkdir -p /opt/admiral
tar xzf /tmp/node-pulse-admiral-${VERSION}.tar.gz -C /opt/admiral --strip-components=1

echo "  → Restoring .env..."
if [ -f /tmp/admiral.env.backup ]; then
    mv /tmp/admiral.env.backup /opt/admiral/.env
fi

echo "  → Running test deployment (uses local images)..."
cd /opt/admiral
./deploy_test.sh

echo "  → Cleaning up..."
rm -f /tmp/node-pulse-admiral-${VERSION}.tar.gz

echo ""
echo "========================================================="
echo "Deployment complete!"
echo "========================================================="
REMOTE_SCRIPT

echo ""
echo -e "${GREEN}========================================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================================${NC}"
echo ""
echo "Version: $VERSION"
echo "Server:  $SERVER"
echo ""
echo "Local release tarball:"
echo "  $PROJECT_ROOT/release/node-pulse-admiral-${VERSION}.tar.gz"
echo ""
echo "Access your dashboard:"
echo "  http://$(echo $SERVER | cut -d@ -f2)"
echo ""
echo "Check deployment logs:"
echo "  ssh $SERVER 'cd /opt/admiral && docker compose logs -f'"
echo ""
