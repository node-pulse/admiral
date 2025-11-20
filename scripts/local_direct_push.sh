#!/bin/bash
# Push locally built images to remote server using unregistry
# Usage: ./scripts/push-local.sh user@server [version]

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 user@server [version]"
    echo ""
    echo "Examples:"
    echo "  $0 user@test-server"
    echo "  $0 user@test-server 1.2.3"
    exit 1
fi

TARGET="$1"
VERSION="${2:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Push Local Images to Remote Server${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Target: $TARGET"
echo "Version: $VERSION"
echo ""

# Check if docker pussh is available
if ! command -v docker-pussh &> /dev/null; then
    echo -e "${YELLOW}⚠️  docker pussh not found${NC}"
    echo ""
    echo "Installing unregistry..."
    curl -fsSL https://get.unregistry.dev | sh
    echo ""
fi

# List of services to push
SERVICES=(
    "node-pulse-migrate"
    "node-pulse-submarines-ingest"
    "node-pulse-submarines-digest"
    "node-pulse-submarines-deployer"
    "node-pulse-submarines-sshws"
    "node-pulse-flagship"
)

echo -e "${GREEN}Pushing images to $TARGET...${NC}"
echo ""

for service in "${SERVICES[@]}"; do
    IMAGE="${service}:${VERSION}"

    echo -e "${BLUE}Pushing ${IMAGE}...${NC}"

    if docker-pussh "$IMAGE" "$TARGET"; then
        echo -e "${GREEN}✓ ${IMAGE} pushed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to push ${IMAGE}${NC}"
        exit 1
    fi

    echo ""
done

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}All images pushed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. SSH to server: ssh $TARGET"
echo "  2. Verify images: docker images | grep node-pulse"
echo "  3. Deploy: cd node-pulse-${VERSION} && sudo ./deploy.sh"
echo ""
