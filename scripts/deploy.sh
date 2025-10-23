#!/bin/bash
# NodePulse Admiral - Interactive Deployment Script
# This script is idempotent and can be run multiple times safely

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}NodePulse Admiral - Interactive Deployment${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root or with sudo${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker first: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Function to prompt for input with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local value

    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " value
        value="${value:-$default}"
    else
        read -p "$prompt: " value
        while [ -z "$value" ]; do
            echo -e "${RED}This field is required${NC}"
            read -p "$prompt: " value
        done
    fi

    eval "$var_name='$value'"
}

# Function to generate random secret
generate_secret() {
    openssl rand -base64 32 | tr -d '=+/' | cut -c1-32
}

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}.env file already exists!${NC}"
    read -p "Do you want to reconfigure? (y/N): " reconfigure
    if [[ ! "$reconfigure" =~ ^[Yy]$ ]]; then
        echo "Skipping environment configuration"
        SKIP_ENV_CONFIG=true
    else
        # Backup existing .env
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${GREEN}Backed up existing .env${NC}"
    fi
fi

# Configure environment variables
if [ "$SKIP_ENV_CONFIG" != "true" ]; then
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}Environment Configuration${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    # PostgreSQL Configuration
    echo -e "${GREEN}PostgreSQL Configuration:${NC}"
    prompt_with_default "PostgreSQL user" "nodepulse" POSTGRES_USER
    prompt_with_default "PostgreSQL password" "$(generate_secret)" POSTGRES_PASSWORD
    prompt_with_default "PostgreSQL database name" "nodepulse" POSTGRES_DB

    echo ""

    # Valkey Configuration
    echo -e "${GREEN}Valkey (Redis) Configuration:${NC}"
    prompt_with_default "Valkey password" "$(generate_secret)" VALKEY_PASSWORD

    echo ""

    # Backend Configuration
    echo -e "${GREEN}Backend Configuration:${NC}"
    prompt_with_default "Ingest port" "8080" INGEST_PORT
    prompt_with_default "Gin mode (debug/release)" "release" GIN_MODE
    prompt_with_default "JWT secret" "$(generate_secret)" JWT_SECRET

    echo ""

    # Frontend Configuration
    echo -e "${GREEN}Frontend Configuration:${NC}"
    prompt_with_default "Public API URL" "http://localhost:8080" NEXT_PUBLIC_API_URL
    prompt_with_default "Public Kratos URL" "http://localhost:4433" NEXT_PUBLIC_KRATOS_URL
    prompt_with_default "Better Auth secret" "$(generate_secret)" BETTER_AUTH_SECRET
    prompt_with_default "Better Auth URL" "http://localhost:3000" BETTER_AUTH_URL

    echo ""

    # Cleaner Configuration
    echo -e "${GREEN}Cleaner Configuration:${NC}"
    prompt_with_default "Data retention (hours)" "72" RETENTION_HOURS

    echo ""

    # Rails Master Key Configuration (for SSH key encryption)
    echo -e "${GREEN}Rails Configuration:${NC}"
    MASTER_KEY_FILE="$PROJECT_ROOT/flagship/config/master.key"

    if [ -f "$MASTER_KEY_FILE" ]; then
        echo -e "${YELLOW}✓ Using existing Rails master key${NC}"
    else
        echo "Generating new Rails master key..."
        RAILS_MASTER_KEY=$(generate_secret)
        mkdir -p "$PROJECT_ROOT/flagship/config"
        echo "$RAILS_MASTER_KEY" > "$MASTER_KEY_FILE"
        chmod 600 "$MASTER_KEY_FILE"
        echo -e "${GREEN}✓ Generated new Rails master key at flagship/config/master.key${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANT: Backup this file immediately!${NC}"
    fi

    echo ""

    # Construct DATABASE_URL
    DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?sslmode=disable&search_path=better_auth"

    # Write .env file
    echo "Writing .env file..."
    cat > "$ENV_FILE" << EOF
# PostgreSQL Configuration
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB


# Valkey Configuration
VALKEY_PASSWORD=$VALKEY_PASSWORD

# Ory Kratos Configuration
KRATOS_LOG_LEVEL=info

# Backend Configuration (Go-Gin)
INGEST_PORT=$INGEST_PORT
GIN_MODE=$GIN_MODE
JWT_SECRET=$JWT_SECRET

# Frontend Configuration (Next.js)
# Public URLs (accessible from browser)
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
NEXT_PUBLIC_KRATOS_URL=$NEXT_PUBLIC_KRATOS_URL

# Better Auth Configuration
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
BETTER_AUTH_URL=$BETTER_AUTH_URL

# Database URL for Better Auth (Next.js)
DATABASE_URL=$DATABASE_URL

# Rails Configuration (Flagship Dashboard)
RAILS_ENV=production
SECRET_KEY_BASE=$(generate_secret)

# Cleaner Configuration
RETENTION_HOURS=$RETENTION_HOURS
EOF

    chmod 600 "$ENV_FILE"
    echo -e "${GREEN}✓ .env file created${NC}"
fi

# Pull Docker images
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Pulling Docker Images${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

cd "$PROJECT_ROOT"
docker compose pull

# Start services
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Starting Services${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

docker compose up -d

# Wait for services to be healthy
echo ""
echo "Waiting for services to be ready..."
sleep 5

# Show service status
docker compose ps

# Final summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Services Status:"
docker compose ps
echo ""

echo -e "${GREEN}Useful Commands:${NC}"
echo ""
echo "  View all logs:"
echo "    docker compose logs -f"
echo ""
echo "  View specific service logs:"
echo "    docker compose logs -f submarines-ingest"
echo "    docker compose logs -f submarines-digest"
echo ""
echo "  View cleanup activity:"
echo "    docker compose logs -f submarines-digest | grep CLEANUP"
echo ""
echo "  Restart services:"
echo "    docker compose restart"
echo ""
echo "  Stop services:"
echo "    docker compose down"
echo ""
echo "  Access PostgreSQL:"
echo "    docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
echo ""

echo -e "${YELLOW}Configuration Files:${NC}"
echo "  Environment:     $ENV_FILE"
echo "  Rails Master Key: $PROJECT_ROOT/flagship/config/master.key"
echo ""

echo -e "${YELLOW}Important:${NC}"
echo "  - Keep your .env file secure (contains secrets)"
echo "  - Database password: ${POSTGRES_PASSWORD:0:4}****"
echo "  - Data retention: ${RETENTION_HOURS:-72} hours"
echo ""
echo -e "${YELLOW}⚠️  CRITICAL - Backup Required:${NC}"
echo "  - Rails master key: flagship/config/master.key"
echo "  - This key encrypts all SSH private keys in the database"
echo "  - If lost, encrypted SSH keys CANNOT be recovered!"
echo "  - Recommended: Copy to password manager immediately"
echo ""

echo -e "${YELLOW}SSH Key Management:${NC}"
echo "  - Access SSH keys management: http://localhost:3000/private_keys"
echo "  - SSH keys are encrypted using the Rails master key"
echo "  - See flagship/SSH_SETUP.md for detailed instructions"
echo ""
