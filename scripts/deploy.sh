#!/bin/bash
# NodePulse Admiral - Interactive Deployment Script
# This script is idempotent and can be run multiple times safely

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Node Pulse Admiral - Interactive Deployment${NC}"
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

# Function to generate random secret
generate_secret() {
    openssl rand -base64 32 | tr -d '=+/' | cut -c1-32
}

# Function to generate Laravel APP_KEY format
generate_laravel_key() {
    # Generate 32 random bytes and base64 encode them
    # Remove any newlines to ensure clean output
    local key=$(openssl rand -base64 32 | tr -d '\n')
    echo "base64:${key}"
}

# Associative arrays to store configuration
declare -A CONFIG
declare -A DEFAULTS
declare -A DESCRIPTIONS

# Load existing .env if it exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Found existing .env file${NC}"
    echo "Loading current values as defaults..."
    echo ""

    # Parse existing .env file
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue

        # Remove quotes and trim whitespace
        value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
        CONFIG["$key"]="$value"
    done < "$ENV_FILE"

    echo -e "${GREEN}✓ Loaded existing configuration${NC}"
    echo ""
fi

# Function to prompt for input with default value and description
prompt_config() {
    local key="$1"
    local default="$2"
    local description="$3"
    local is_secret="${4:-false}"

    # Use existing value as default if available
    if [ -n "${CONFIG[$key]}" ]; then
        default="${CONFIG[$key]}"
    fi

    local value
    local display_default="$default"

    # Mask secrets in display
    if [ "$is_secret" = "true" ] && [ -n "$default" ] && [ "$default" != "changeme-use-strong-password" ] && [ "$default" != "changeme-use-strong-secret" ]; then
        display_default="${default:0:8}****"
    fi

    echo -e "${CYAN}$description${NC}"

    if [ -n "$default" ]; then
        read -p "$key [$display_default]: " value
        value="${value:-$default}"
    else
        read -p "$key: " value
        while [ -z "$value" ]; do
            echo -e "${RED}This field is required${NC}"
            read -p "$key: " value
        done
    fi

    CONFIG["$key"]="$value"
}

# Check if user wants to reconfigure
RECONFIGURE=false
if [ -f "$ENV_FILE" ]; then
    read -p "Do you want to reconfigure all settings? (y/N): " reconfigure_input
    if [[ "$reconfigure_input" =~ ^[Yy]$ ]]; then
        RECONFIGURE=true
        # Backup existing .env
        backup_file="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$backup_file"
        echo -e "${GREEN}✓ Backed up existing .env to $backup_file${NC}"
        echo ""
    else
        echo -e "${GREEN}Using existing .env file${NC}"
        echo "Proceeding with deployment..."
        echo ""
        SKIP_CONFIG=true
    fi
fi

# Configure environment variables
if [ "$SKIP_CONFIG" != "true" ]; then
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}Environment Configuration${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    # =============================================================================
    # PostgreSQL Configuration
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}PostgreSQL Configuration${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    prompt_config "POSTGRES_USER" "admiral" "PostgreSQL database user"
    prompt_config "POSTGRES_PASSWORD" "$(generate_secret)" "PostgreSQL password (auto-generated)" "true"
    prompt_config "POSTGRES_DB" "node_pulse_admiral" "PostgreSQL database name"

    echo ""

    # =============================================================================
    # Valkey/Redis Configuration
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Valkey/Redis Configuration${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    prompt_config "VALKEY_PASSWORD" "$(generate_secret)" "Valkey password (auto-generated)" "true"

    echo ""

    # =============================================================================
    # Ory Kratos Configuration
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Ory Kratos Configuration${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    prompt_config "KRATOS_LOG_LEVEL" "info" "Kratos log level (debug/info/warning/error)"

    echo ""

    # =============================================================================
    # Submarines Configuration (Go-Gin Backend)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Submarines Configuration (Go-Gin Backend)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Database connection (mirrors PostgreSQL settings)
    CONFIG["DB_HOST"]="postgres"
    CONFIG["DB_PORT"]="5432"
    CONFIG["DB_USER"]="${CONFIG[POSTGRES_USER]}"
    CONFIG["DB_PASSWORD"]="${CONFIG[POSTGRES_PASSWORD]}"
    CONFIG["DB_NAME"]="${CONFIG[POSTGRES_DB]}"
    CONFIG["DB_SSLMODE"]="disable"

    echo -e "${CYAN}Database connection settings auto-configured from PostgreSQL${NC}"
    echo ""

    # Valkey connection
    CONFIG["VALKEY_HOST"]="valkey"
    CONFIG["VALKEY_PORT"]="6379"

    echo -e "${CYAN}Valkey connection settings auto-configured${NC}"
    echo ""

    # Kratos endpoints
    CONFIG["KRATOS_PUBLIC_URL"]="http://kratos:4433"
    CONFIG["KRATOS_ADMIN_URL"]="http://kratos:4434"

    echo -e "${CYAN}Kratos endpoints auto-configured${NC}"
    echo ""

    # Server settings
    prompt_config "PORT" "8080" "Submarines API port"
    prompt_config "INGEST_PORT" "8080" "Ingest service port"
    prompt_config "STATUS_PORT" "8082" "Status service port"
    prompt_config "GIN_MODE" "release" "Gin mode (debug/release)"

    echo ""

    # Security
    prompt_config "JWT_SECRET" "$(generate_secret)" "JWT secret key (auto-generated)" "true"

    echo ""

    # Digest worker
    prompt_config "DIGEST_ID" "digest-1" "Digest worker ID"

    echo ""

    # =============================================================================
    # Flagship Configuration (Laravel Dashboard)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Flagship Configuration (Laravel Dashboard)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # App settings
    prompt_config "APP_NAME" "NodePulse Flagship" "Application name"
    prompt_config "APP_ENV" "production" "Application environment (local/production)"
    prompt_config "APP_DEBUG" "false" "Enable debug mode (true/false)"
    prompt_config "APP_KEY" "$(generate_laravel_key)" "Laravel encryption key (auto-generated)" "true"
    prompt_config "APP_URL" "http://localhost:3000" "Application URL"
    prompt_config "APP_LOCALE" "en" "Application locale"
    prompt_config "APP_FALLBACK_LOCALE" "en" "Fallback locale"
    prompt_config "APP_FAKER_LOCALE" "en_US" "Faker locale for testing"
    prompt_config "APP_MAINTENANCE_DRIVER" "file" "Maintenance mode driver"

    echo ""

    # =============================================================================
    # Master Key Generation (for SSH Private Key Encryption)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Master Key for SSH Private Key Encryption${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    MASTER_KEY_FILE="$PROJECT_ROOT/flagship/config/master.key"

    if [ -f "$MASTER_KEY_FILE" ]; then
        echo -e "${YELLOW}✓ Master key file already exists${NC}"
        echo "  Location: $MASTER_KEY_FILE"
        echo ""
        read -p "Keep existing master key? (Y/n): " keep_master
        if [[ ! "$keep_master" =~ ^[Nn]$ ]]; then
            echo -e "${GREEN}✓ Using existing master key${NC}"
        else
            # Backup existing key
            backup_file="$MASTER_KEY_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$MASTER_KEY_FILE" "$backup_file"
            echo -e "${GREEN}✓ Backed up existing key to $backup_file${NC}"

            # Generate new key (simple random string, 32 characters)
            new_master_key=$(openssl rand -hex 16)
            echo "$new_master_key" > "$MASTER_KEY_FILE"
            chmod 600 "$MASTER_KEY_FILE"
            echo -e "${GREEN}✓ New master key generated${NC}"
            echo -e "${YELLOW}⚠️  All existing SSH keys will need to be re-imported!${NC}"
        fi
    else
        echo -e "${CYAN}Generating new master key for SSH private key encryption...${NC}"

        # Create config directory if it doesn't exist
        mkdir -p "$(dirname "$MASTER_KEY_FILE")"

        # Generate new key (simple random string, 32 characters)
        new_master_key=$(openssl rand -hex 16)
        echo "$new_master_key" > "$MASTER_KEY_FILE"
        chmod 600 "$MASTER_KEY_FILE"

        echo -e "${GREEN}✓ Master key generated successfully${NC}"
        echo "  Location: $MASTER_KEY_FILE"
        echo "  Permissions: 600 (owner read/write only)"
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANT: BACKUP THIS KEY!${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "This key encrypts all SSH private keys."
        echo "If lost, you will NOT be able to decrypt them!"
        echo ""
        echo "Recommended backups:"
        echo "  • Password manager"
        echo "  • Encrypted USB drive"
        echo "  • Secure cloud storage"
        echo ""
        read -p "Press Enter to continue after backing up the key..."
    fi

    echo ""

    # Logging
    prompt_config "LOG_CHANNEL" "stack" "Log channel (stack/single/daily)"
    prompt_config "LOG_STACK" "single" "Log stack channels"
    prompt_config "LOG_DEPRECATIONS_CHANNEL" "null" "Deprecations log channel"
    prompt_config "LOG_LEVEL" "info" "Log level (debug/info/warning/error)"

    echo ""

    # Database (uses backend schema shared with Submarines)
    CONFIG["DB_CONNECTION"]="pgsql"
    CONFIG["DB_DATABASE"]="${CONFIG[POSTGRES_DB]}"
    CONFIG["DB_USERNAME"]="${CONFIG[POSTGRES_USER]}"

    echo -e "${CYAN}Database connection auto-configured from PostgreSQL${NC}"
    echo ""

    # Sessions & Cache (Valkey/Redis)
    CONFIG["SESSION_DRIVER"]="redis"
    CONFIG["SESSION_LIFETIME"]="120"
    CONFIG["CACHE_STORE"]="redis"
    CONFIG["QUEUE_CONNECTION"]="redis"
    CONFIG["REDIS_CLIENT"]="phpredis"
    CONFIG["REDIS_HOST"]="valkey"
    CONFIG["REDIS_PORT"]="6379"
    CONFIG["REDIS_PASSWORD"]="${CONFIG[VALKEY_PASSWORD]}"

    echo -e "${CYAN}Redis/Valkey session and cache settings auto-configured${NC}"
    echo ""

    # Submarines API endpoint
    CONFIG["SUBMARINES_API_URL"]="http://submarines-ingest:8080"

    echo -e "${CYAN}Submarines API endpoint auto-configured${NC}"
    echo ""

    # Mail
    prompt_config "MAIL_MAILER" "log" "Mail driver (smtp/log/etc)"
    prompt_config "MAIL_FROM_ADDRESS" "noreply@nodepulse.local" "Mail from address"
    CONFIG["MAIL_FROM_NAME"]="\${APP_NAME}"

    echo ""

    # Vite
    CONFIG["VITE_APP_NAME"]="\${APP_NAME}"

    echo ""

    # =============================================================================
    # Cruiser Configuration (Next.js Frontend)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Cruiser Configuration (Next.js Frontend)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Public URLs (accessible from browser)
    prompt_config "NEXT_PUBLIC_API_URL" "http://localhost:8080" "Public API URL (browser-accessible)"
    prompt_config "NEXT_PUBLIC_KRATOS_URL" "http://localhost:4433" "Public Kratos URL (browser-accessible)"

    echo ""

    # Server-side URLs (internal)
    CONFIG["API_URL"]="http://submarines-ingest:8080"

    echo -e "${CYAN}Internal API URL auto-configured${NC}"
    echo ""

    # Better Auth
    prompt_config "BETTER_AUTH_SECRET" "$(generate_secret)" "Better Auth secret (auto-generated)" "true"
    prompt_config "BETTER_AUTH_URL" "http://localhost:3000" "Better Auth URL"

    echo ""

    # =============================================================================
    # Production Domain (Optional)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Production Domain (Optional)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    prompt_config "DOMAIN" "yourdomain.com" "Production domain (for Traefik/SSL)"

    echo ""

    # =============================================================================
    # Construct DATABASE_URL
    # =============================================================================
    DATABASE_URL="postgres://${CONFIG[POSTGRES_USER]}:${CONFIG[POSTGRES_PASSWORD]}@postgres:5432/${CONFIG[POSTGRES_DB]}?sslmode=disable"
    CONFIG["DATABASE_URL"]="$DATABASE_URL"

    # =============================================================================
    # Review Configuration
    # =============================================================================
    while true; do
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}Configuration Review${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""

        echo -e "${GREEN}PostgreSQL:${NC}"
        echo "  User:     ${CONFIG[POSTGRES_USER]}"
        echo "  Password: ${CONFIG[POSTGRES_PASSWORD]:0:8}****"
        echo "  Database: ${CONFIG[POSTGRES_DB]}"
        echo ""

        echo -e "${GREEN}Valkey/Redis:${NC}"
        echo "  Password: ${CONFIG[VALKEY_PASSWORD]:0:8}****"
        echo ""

        echo -e "${GREEN}Submarines (Go-Gin):${NC}"
        echo "  Port:       ${CONFIG[PORT]}"
        echo "  Ingest:     ${CONFIG[INGEST_PORT]}"
        echo "  Status:     ${CONFIG[STATUS_PORT]}"
        echo "  Gin Mode:   ${CONFIG[GIN_MODE]}"
        echo "  JWT Secret: ${CONFIG[JWT_SECRET]:0:8}****"
        echo ""

        echo -e "${GREEN}Flagship (Laravel):${NC}"
        echo "  App Name:   ${CONFIG[APP_NAME]}"
        echo "  App Env:    ${CONFIG[APP_ENV]}"
        echo "  App Debug:  ${CONFIG[APP_DEBUG]}"
        echo "  App URL:    ${CONFIG[APP_URL]}"
        echo "  App Key:    ${CONFIG[APP_KEY]:0:12}****"
        echo ""

        echo -e "${GREEN}Cruiser (Next.js):${NC}"
        echo "  API URL:         ${CONFIG[NEXT_PUBLIC_API_URL]}"
        echo "  Kratos URL:      ${CONFIG[NEXT_PUBLIC_KRATOS_URL]}"
        echo "  Better Auth URL: ${CONFIG[BETTER_AUTH_URL]}"
        echo ""

        echo -e "${GREEN}Production:${NC}"
        echo "  Domain: ${CONFIG[DOMAIN]}"
        echo ""

        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        read -p "Is this configuration correct? (yes/no/restart): " confirm

        case "$confirm" in
            [Yy]es|[Yy])
                echo ""
                echo -e "${GREEN}✓ Configuration confirmed${NC}"
                echo ""
                break
                ;;
            [Nn]o|[Nn])
                echo ""
                echo -e "${YELLOW}Configuration aborted by user${NC}"
                echo "Exiting without making changes..."
                exit 0
                ;;
            [Rr]estart|[Rr])
                echo ""
                echo -e "${YELLOW}Restarting configuration...${NC}"
                echo ""
                # Clear CONFIG array and restart
                unset CONFIG
                declare -A CONFIG
                exec "$0" "$@"
                ;;
            *)
                echo -e "${RED}Invalid option. Please enter 'yes', 'no', or 'restart'${NC}"
                echo ""
                ;;
        esac
    done

    # =============================================================================
    # Write .env file
    # =============================================================================
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Writing .env file..."
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    cat > "$ENV_FILE" << EOF
# =============================================================================
# PostgreSQL Configuration
# =============================================================================
POSTGRES_USER=${CONFIG[POSTGRES_USER]}
POSTGRES_PASSWORD=${CONFIG[POSTGRES_PASSWORD]}
POSTGRES_DB=${CONFIG[POSTGRES_DB]}

# =============================================================================
# Valkey/Redis Configuration
# =============================================================================
VALKEY_PASSWORD=${CONFIG[VALKEY_PASSWORD]}

# =============================================================================
# Ory Kratos Configuration
# =============================================================================
KRATOS_LOG_LEVEL=${CONFIG[KRATOS_LOG_LEVEL]}

# =============================================================================
# Submarines Configuration (Go-Gin Backend)
# =============================================================================

# Database connection
DB_HOST=${CONFIG[DB_HOST]}
DB_PORT=${CONFIG[DB_PORT]}
DB_USER=${CONFIG[DB_USER]}
DB_PASSWORD=${CONFIG[DB_PASSWORD]}
DB_NAME=${CONFIG[DB_NAME]}
DB_SSLMODE=${CONFIG[DB_SSLMODE]}

# Valkey connection
VALKEY_HOST=${CONFIG[VALKEY_HOST]}
VALKEY_PORT=${CONFIG[VALKEY_PORT]}

# Kratos endpoints
KRATOS_PUBLIC_URL=${CONFIG[KRATOS_PUBLIC_URL]}
KRATOS_ADMIN_URL=${CONFIG[KRATOS_ADMIN_URL]}

# Server settings
PORT=${CONFIG[PORT]}
INGEST_PORT=${CONFIG[INGEST_PORT]}
STATUS_PORT=${CONFIG[STATUS_PORT]}
GIN_MODE=${CONFIG[GIN_MODE]}

# Security
JWT_SECRET=${CONFIG[JWT_SECRET]}

# Digest worker
DIGEST_ID=${CONFIG[DIGEST_ID]}

# =============================================================================
# Flagship Configuration (Laravel Dashboard)
# =============================================================================

# App settings
APP_NAME="${CONFIG[APP_NAME]}"
APP_ENV=${CONFIG[APP_ENV]}
APP_DEBUG=${CONFIG[APP_DEBUG]}
APP_KEY=${CONFIG[APP_KEY]}
APP_URL=${CONFIG[APP_URL]}
APP_LOCALE=${CONFIG[APP_LOCALE]}
APP_FALLBACK_LOCALE=${CONFIG[APP_FALLBACK_LOCALE]}
APP_FAKER_LOCALE=${CONFIG[APP_FAKER_LOCALE]}
APP_MAINTENANCE_DRIVER=${CONFIG[APP_MAINTENANCE_DRIVER]}

# Logging
LOG_CHANNEL=${CONFIG[LOG_CHANNEL]}
LOG_STACK=${CONFIG[LOG_STACK]}
LOG_DEPRECATIONS_CHANNEL=${CONFIG[LOG_DEPRECATIONS_CHANNEL]}
LOG_LEVEL=${CONFIG[LOG_LEVEL]}

# Database (uses 'backend' schema shared with Submarines)
DB_CONNECTION=${CONFIG[DB_CONNECTION]}
DB_DATABASE=${CONFIG[DB_DATABASE]}
DB_USERNAME=${CONFIG[DB_USERNAME]}
# DB_HOST, DB_PORT, DB_PASSWORD, DB_SSLMODE - uses values from Submarines section above

# Sessions & Cache (Valkey/Redis)
SESSION_DRIVER=${CONFIG[SESSION_DRIVER]}
SESSION_LIFETIME=${CONFIG[SESSION_LIFETIME]}
CACHE_STORE=${CONFIG[CACHE_STORE]}
QUEUE_CONNECTION=${CONFIG[QUEUE_CONNECTION]}
REDIS_CLIENT=${CONFIG[REDIS_CLIENT]}
REDIS_HOST=${CONFIG[REDIS_HOST]}
REDIS_PORT=${CONFIG[REDIS_PORT]}
REDIS_PASSWORD=${CONFIG[REDIS_PASSWORD]}

# Submarines API endpoint (server-side calls)
SUBMARINES_API_URL=${CONFIG[SUBMARINES_API_URL]}

# Mail (optional, defaults to log)
MAIL_MAILER=${CONFIG[MAIL_MAILER]}
MAIL_FROM_ADDRESS="${CONFIG[MAIL_FROM_ADDRESS]}"
MAIL_FROM_NAME="${CONFIG[MAIL_FROM_NAME]}"

# Vite
VITE_APP_NAME="${CONFIG[VITE_APP_NAME]}"

# =============================================================================
# Cruiser Configuration (Next.js Frontend)
# =============================================================================

# Public URLs (accessible from browser)
NEXT_PUBLIC_API_URL=${CONFIG[NEXT_PUBLIC_API_URL]}
NEXT_PUBLIC_KRATOS_URL=${CONFIG[NEXT_PUBLIC_KRATOS_URL]}

# Server-side URLs (internal, uses values from Submarines section)
API_URL=${CONFIG[API_URL]}
# KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL - uses values from Submarines section above

# Better Auth
BETTER_AUTH_SECRET=${CONFIG[BETTER_AUTH_SECRET]}
BETTER_AUTH_URL=${CONFIG[BETTER_AUTH_URL]}

# =============================================================================
# Production Configuration
# =============================================================================
DOMAIN=${CONFIG[DOMAIN]}

# =============================================================================
# Auto-Generated Values
# =============================================================================
# DATABASE_URL is used by some services (e.g., Better Auth)
DATABASE_URL=${CONFIG[DATABASE_URL]}

# =============================================================================
# Notes
# =============================================================================
# This file was generated by scripts/deploy.sh
# Generated at: $(date)
# Backup files are stored with timestamp if regenerated
EOF

    chmod 600 "$ENV_FILE"
    echo -e "${GREEN}✓ .env file created successfully${NC}"
    echo ""
fi

# =============================================================================
# Verify Master Key Exists
# =============================================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Verifying Master Key${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

MASTER_KEY_FILE="$PROJECT_ROOT/flagship/config/master.key"

if [ ! -f "$MASTER_KEY_FILE" ]; then
    echo -e "${RED}✗ Master key file not found!${NC}"
    echo "  Expected location: $MASTER_KEY_FILE"
    echo ""
    echo -e "${YELLOW}The master key should have been created during configuration.${NC}"
    echo -e "${YELLOW}Creating it now...${NC}"
    echo ""

    # Create config directory if it doesn't exist
    mkdir -p "$(dirname "$MASTER_KEY_FILE")"

    # Generate new key
    new_master_key=$(openssl rand -hex 16)
    echo "$new_master_key" > "$MASTER_KEY_FILE"
    chmod 600 "$MASTER_KEY_FILE"

    echo -e "${GREEN}✓ Master key generated${NC}"
    echo "  Location: $MASTER_KEY_FILE"
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: BACKUP THIS KEY!${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This key encrypts all SSH private keys."
    echo "Store it securely in a password manager or encrypted backup."
    echo ""
    read -p "Press Enter to continue after backing up the key..."
    echo ""
else
    echo -e "${GREEN}✓ Master key file exists${NC}"
    echo "  Location: $MASTER_KEY_FILE"

    # Verify permissions
    PERMS=$(stat -f "%A" "$MASTER_KEY_FILE" 2>/dev/null || stat -c "%a" "$MASTER_KEY_FILE" 2>/dev/null)
    if [ "$PERMS" != "600" ]; then
        echo -e "${YELLOW}⚠  Fixing file permissions (should be 600)${NC}"
        chmod 600 "$MASTER_KEY_FILE"
        echo -e "${GREEN}✓ Permissions corrected${NC}"
    fi

    # Verify file is not empty
    if [ ! -s "$MASTER_KEY_FILE" ]; then
        echo -e "${RED}✗ Master key file is empty!${NC}"
        echo "Please regenerate the master key or restore from backup."
        exit 1
    fi

    echo ""
fi

# =============================================================================
# Pull Docker images
# =============================================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Pulling Docker Images${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

cd "$PROJECT_ROOT"
docker compose pull

# =============================================================================
# Start services
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Starting Services${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

docker compose up -d

# =============================================================================
# Wait for services to be healthy
# =============================================================================
echo ""
echo "Waiting for services to be ready..."
sleep 5

# =============================================================================
# Show service status
# =============================================================================
echo ""
docker compose ps

# =============================================================================
# Final summary
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

echo -e "${GREEN}Services Status:${NC}"
docker compose ps
echo ""

echo -e "${GREEN}Access URLs:${NC}"
echo "  Flagship Dashboard:  http://localhost:3000"
echo "  Cruiser Frontend:    http://localhost:3001"
echo "  Submarines API:      http://localhost:8080"
echo "  Status Service:      http://localhost:8082"
echo "  Kratos Public API:   http://localhost:4433"
echo "  Kratos Admin API:    http://localhost:4434"
echo ""

echo -e "${GREEN}Useful Commands:${NC}"
echo ""
echo "  View all logs:"
echo "    docker compose logs -f"
echo ""
echo "  View specific service logs:"
echo "    docker compose logs -f submarines-ingest"
echo "    docker compose logs -f submarines-digest"
echo "    docker compose logs -f flagship"
echo ""
echo "  Restart services:"
echo "    docker compose restart"
echo ""
echo "  Stop services:"
echo "    docker compose down"
echo ""
echo "  Access PostgreSQL:"
echo "    docker compose exec postgres psql -U ${CONFIG[POSTGRES_USER]:-admiral} -d ${CONFIG[POSTGRES_DB]:-node_pulse_admiral}"
echo ""
echo "  Access Valkey CLI:"
echo "    docker compose exec valkey valkey-cli"
echo ""

echo -e "${YELLOW}Configuration Files:${NC}"
echo "  Environment: $ENV_FILE"
if [ -n "$(ls -A $ENV_FILE.backup.* 2>/dev/null)" ]; then
    echo "  Backups:     $PROJECT_ROOT/.env.backup.*"
fi
echo ""

echo -e "${YELLOW}Security Notes:${NC}"
echo "  ⚠️  Keep your .env file secure (contains secrets)"
echo "  ⚠️  Database password: ${CONFIG[POSTGRES_PASSWORD]:0:4}****"
echo "  ⚠️  File permissions set to 600 (owner read/write only)"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Configure your agents to send metrics to: http://<your-ip>:8080/metrics"
echo "  2. Access the Flagship dashboard at http://localhost:3000"
echo "  3. Set up SSL/TLS in production (configure Traefik)"
echo "  4. Review logs for any startup issues"
echo ""

echo -e "${GREEN}Happy Monitoring! 🚀${NC}"
echo ""
