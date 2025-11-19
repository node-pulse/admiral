#!/bin/bash
# NodePulse Admiral - Production Deployment Script
#
# ⚠️  PRODUCTION ONLY - This script is for production deployments
# ⚠️  For development, use: docker compose -f compose.development.yml up -d
#
# This script:
# - Configures production environment variables (APP_ENV=production, hardcoded)
# - Deploys all services using compose.yml (production build)
# - ENFORCES mTLS setup (mandatory for production)
# - Creates initial admin user
#
# This script is idempotent and can be run multiple times safely

set -e

# Project root is current working directory
# In production, deploy.sh is extracted to the project root
PROJECT_ROOT="$(pwd)"

ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

# Validate project root by checking for compose.yml
if [ ! -f "$PROJECT_ROOT/compose.yml" ]; then
    echo "Error: Cannot find compose.yml in: $PROJECT_ROOT"
    echo ""
    echo "Please cd to the project root directory before running this script:"
    echo "  cd /path/to/admiral"
    echo "  sudo ./deploy.sh"
    exit 1
fi

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
LOAD_EXISTING=false
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Found existing .env file${NC}"
    echo ""
    read -p "Do you want to use existing .env configuration? (Y/n): " use_existing

    if [[ ! "$use_existing" =~ ^[Nn]$ ]]; then
        LOAD_EXISTING=true
        echo ""
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

        # Skip to deployment
        SKIP_CONFIG=true
    else
        # Backup existing .env
        backup_file="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$backup_file"
        echo ""
        echo -e "${GREEN}✓ Backed up existing .env to $backup_file${NC}"
        echo -e "${CYAN}Starting fresh configuration...${NC}"
        echo ""
    fi
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

# Configure environment variables (skip if using existing .env)
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

    # Hardcoded values (Docker Compose service names)
    CONFIG["VALKEY_HOST"]="valkey"
    CONFIG["VALKEY_PORT"]="6379"

    echo -e "${CYAN}VALKEY_HOST set to 'valkey' (Docker service name)${NC}"
    echo -e "${CYAN}VALKEY_PORT set to '6379' (default Redis port)${NC}"
    echo ""

    prompt_config "VALKEY_PASSWORD" "$(generate_secret)" "Valkey password (auto-generated)" "true"

    echo ""

    # =============================================================================
    # Submarines Configuration (Go-Gin Backend)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Submarines Configuration (Go-Gin Backend)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Hardcoded values (Docker Compose service names and defaults)
    CONFIG["DB_HOST"]="postgres"
    CONFIG["DB_PORT"]="5432"
    CONFIG["DB_SSLMODE"]="disable"

    # These reference PostgreSQL values
    CONFIG["DB_USER"]="${CONFIG[POSTGRES_USER]}"
    CONFIG["DB_PASSWORD"]="${CONFIG[POSTGRES_PASSWORD]}"
    CONFIG["DB_NAME"]="${CONFIG[POSTGRES_DB]}"

    echo -e "${CYAN}DB_HOST set to 'postgres' (Docker service name)${NC}"
    echo -e "${CYAN}DB_PORT set to '5432' (default PostgreSQL port)${NC}"
    echo -e "${CYAN}DB_SSLMODE set to 'disable' (internal Docker network)${NC}"
    echo -e "${CYAN}DB_USER, DB_PASSWORD, DB_NAME auto-set from PostgreSQL config${NC}"
    echo ""

    # Server settings
    # NOTE: Ports are hardcoded in each service's main.go (no env vars needed)
    CONFIG["GIN_MODE"]="release"

    echo -e "${CYAN}Ports hardcoded in service binaries:${NC}"
    echo -e "${CYAN}  - Ingest:   8080${NC}"
    echo -e "${CYAN}  - Status:   8081${NC}"
    echo -e "${CYAN}  - SSH WS:   6001${NC}"
    echo -e "${CYAN}  - Flagship: 8090 (Nginx)${NC}"
    echo -e "${CYAN}GIN_MODE set to 'release' (production mode)${NC}"

    echo ""

    # Security
    prompt_config "JWT_SECRET" "$(generate_secret)" "JWT secret key (auto-generated)" "true"

    echo ""

    # Certificate Configuration (hardcoded for production)
    CONFIG["CERT_VALIDITY_DAYS"]="180"

    echo -e "${CYAN}CERT_VALIDITY_DAYS set to '180' (6 months, production default)${NC}"
    echo ""

    # Note: mTLS is build-time decision, not runtime toggle
    # Production Dockerfiles always build with mTLS enabled
    # Development Dockerfiles always build without mTLS

    # =============================================================================
    # Flagship Configuration (Laravel Dashboard)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Flagship Configuration (Laravel Dashboard)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # App settings
    prompt_config "APP_NAME" "Node Pulse Admiral Flagship" "Application name"
    # APP_ENV is hardcoded to "production" - this is a production-only deployment script
    CONFIG["APP_ENV"]="production"
    prompt_config "APP_DEBUG" "false" "Enable debug mode (true/false)"
    prompt_config "APP_KEY" "$(generate_laravel_key)" "Laravel encryption key (auto-generated)" "true"
    prompt_config "APP_DOMAIN" "admiral.example.com" "Dashboard Application domain (without https://)"

    # Construct APP_URL from domain
    CONFIG["APP_URL"]="https://${CONFIG[APP_DOMAIN]}"

    # Hardcoded Laravel settings (standard defaults)
    CONFIG["APP_LOCALE"]="en"
    CONFIG["APP_FALLBACK_LOCALE"]="en"
    CONFIG["APP_FAKER_LOCALE"]="en_US"
    CONFIG["APP_MAINTENANCE_DRIVER"]="file"

    echo -e "${CYAN}APP_LOCALE, APP_FALLBACK_LOCALE set to 'en' (English)${NC}"
    echo -e "${CYAN}APP_MAINTENANCE_DRIVER set to 'file' (standard Laravel driver)${NC}"
    echo ""

    # =============================================================================
    # Master Key Generation (for SSH Private Key Encryption)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Master Key for SSH Private Key Encryption${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    SECRETS_DIR="$PROJECT_ROOT/secrets"
    MASTER_KEY_FILE="$SECRETS_DIR/master.key"

    # Create secrets directory if it doesn't exist
    mkdir -p "$SECRETS_DIR"

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

            # Generate new key (64 character hex string for AES-256)
            new_master_key=$(openssl rand -hex 32)
            echo "$new_master_key" > "$MASTER_KEY_FILE"
            chmod 644 "$MASTER_KEY_FILE"
            echo -e "${GREEN}✓ New master key generated${NC}"
            echo -e "${YELLOW}⚠️  All existing SSH keys will need to be re-imported!${NC}"
        fi
    else
        echo -e "${CYAN}Generating new master key for SSH private key encryption...${NC}"

        # Generate new key (64 character hex string for AES-256)
        new_master_key=$(openssl rand -hex 32)
        echo "$new_master_key" > "$MASTER_KEY_FILE"
        chmod 644 "$MASTER_KEY_FILE"

        echo -e "${GREEN}✓ Master key generated successfully${NC}"
        echo "  Location: $MASTER_KEY_FILE"
        echo "  Format: 64-character hex (32 bytes for AES-256-CBC)"
        echo "  Permissions: 644 (readable by containers)"
        echo ""
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANT: BACKUP THIS KEY AFTER DEPLOYMENT!${NC}"
        echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "This key encrypts all SSH private keys."
        echo "If lost, you will NOT be able to decrypt them!"
        echo ""
        echo "The deployment will show you the key location at the end."
        echo "Recommended backup locations:"
        echo "  • Password manager (1Password, Bitwarden, etc.)"
        echo "  • Encrypted USB drive"
        echo "  • Secure cloud storage (encrypted)"
        echo ""
        read -p "Press Enter to continue (you can backup the key after deployment completes)..."
    fi

    echo ""

    # Logging configuration
    CONFIG["LOG_CHANNEL"]="stack"
    CONFIG["LOG_STACK"]="single"
    CONFIG["LOG_DEPRECATIONS_CHANNEL"]="null"

    prompt_config "LOG_LEVEL" "info" "Log level (debug/info/warning/error)"

    echo -e "${CYAN}LOG_CHANNEL set to 'stack', LOG_STACK set to 'single'${NC}"
    echo ""

    # Database connection (fixed to PostgreSQL)
    CONFIG["DB_CONNECTION"]="pgsql"

    # These reference PostgreSQL values
    CONFIG["DB_DATABASE"]="${CONFIG[POSTGRES_DB]}"
    CONFIG["DB_USERNAME"]="${CONFIG[POSTGRES_USER]}"

    echo -e "${CYAN}DB_CONNECTION set to pgsql (PostgreSQL only)${NC}"
    echo -e "${CYAN}DB_DATABASE and DB_USERNAME auto-set from PostgreSQL config${NC}"
    echo ""

    # Sessions & Cache (hardcoded - using Valkey/Redis for production)
    CONFIG["SESSION_DRIVER"]="redis"
    CONFIG["SESSION_LIFETIME"]="120"
    CONFIG["SESSION_SECURE_COOKIE"]="true"  # Always true for production (HTTPS required)
    CONFIG["CACHE_STORE"]="redis"
    CONFIG["QUEUE_CONNECTION"]="redis"
    CONFIG["REDIS_CLIENT"]="phpredis"

    # These reference Valkey values
    CONFIG["REDIS_HOST"]="${CONFIG[VALKEY_HOST]}"
    CONFIG["REDIS_PORT"]="${CONFIG[VALKEY_PORT]}"
    CONFIG["REDIS_PASSWORD"]="${CONFIG[VALKEY_PASSWORD]}"

    echo -e "${CYAN}Sessions, Cache, Queue configured to use Redis (Valkey)${NC}"
    echo -e "${CYAN}SESSION_SECURE_COOKIE set to 'true' (requires HTTPS in production)${NC}"
    echo -e "${CYAN}REDIS_HOST, REDIS_PORT, REDIS_PASSWORD auto-set from Valkey config${NC}"
    echo ""

    # =============================================================================
    # Mail Configuration (Optional)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Mail Configuration (Optional)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "${CYAN}Configure email delivery?${NC}"
    echo "  1) Log only (no emails sent, for testing)"
    echo "  2) SMTP (configure mail server)"
    echo ""

    read -p "Select option [1-2] (default: 1): " mail_choice
    mail_choice="${mail_choice:-1}"

    case "$mail_choice" in
        2)
            CONFIG["MAIL_MAILER"]="smtp"
            echo ""
            prompt_config "MAIL_HOST" "smtp.example.com" "SMTP host"
            prompt_config "MAIL_PORT" "587" "SMTP port (587 for TLS, 465 for SSL)"
            prompt_config "MAIL_USERNAME" "" "SMTP username"
            prompt_config "MAIL_PASSWORD" "" "SMTP password" "true"
            prompt_config "MAIL_ENCRYPTION" "tls" "Encryption (tls/ssl/null)"
            prompt_config "MAIL_FROM_ADDRESS" "noreply@example.com" "From email address"
            CONFIG["MAIL_FROM_NAME"]="\${APP_NAME}"
            echo ""
            echo -e "${GREEN}✓ SMTP mail configured${NC}"
            ;;
        1|*)
            CONFIG["MAIL_MAILER"]="log"
            CONFIG["MAIL_HOST"]=""
            CONFIG["MAIL_PORT"]=""
            CONFIG["MAIL_USERNAME"]=""
            CONFIG["MAIL_PASSWORD"]=""
            CONFIG["MAIL_ENCRYPTION"]=""
            CONFIG["MAIL_FROM_ADDRESS"]="noreply@nodepulse.local"
            CONFIG["MAIL_FROM_NAME"]="\${APP_NAME}"
            echo ""
            echo -e "${GREEN}✓ Mail set to 'log' driver (emails logged, not sent)${NC}"
            ;;
    esac

    echo ""

    # Vite
    CONFIG["VITE_APP_NAME"]="\${APP_NAME}"

    echo ""

    # =============================================================================
    # CAPTCHA Configuration
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}CAPTCHA Anti-Bot Protection (Optional)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "${CYAN}Choose CAPTCHA provider:${NC}"
    echo "  1) Cloudflare Turnstile (recommended - privacy-friendly)"
    echo "  2) Google reCAPTCHA v2 (checkbox)"
    echo "  3) Google reCAPTCHA v3 (invisible)"
    echo "  4) None (skip CAPTCHA configuration)"
    echo ""

    read -p "Select option [1-4] (recommend: 1; default: 4): " captcha_choice
    captcha_choice="${captcha_choice:-4}"

    case "$captcha_choice" in
        1)
            CONFIG["CAPTCHA_PROVIDER"]="turnstile"
            echo ""
            echo -e "${CYAN}Get your Turnstile keys at: https://dash.cloudflare.com/${NC}"
            echo ""
            prompt_config "TURNSTILE_SITE_KEY" "" "Turnstile Site Key"
            prompt_config "TURNSTILE_SECRET_KEY" "" "Turnstile Secret Key" "true"
            CONFIG["RECAPTCHA_V2_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V2_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V3_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SCORE_THRESHOLD"]="0.5"
            ;;
        2)
            CONFIG["CAPTCHA_PROVIDER"]="recaptcha_v2"
            echo ""
            echo -e "${CYAN}Get your reCAPTCHA v2 keys at: https://www.google.com/recaptcha/admin${NC}"
            echo ""
            prompt_config "RECAPTCHA_V2_SITE_KEY" "" "reCAPTCHA v2 Site Key"
            prompt_config "RECAPTCHA_V2_SECRET_KEY" "" "reCAPTCHA v2 Secret Key" "true"
            CONFIG["TURNSTILE_SITE_KEY"]=""
            CONFIG["TURNSTILE_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V3_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SCORE_THRESHOLD"]="0.5"
            ;;
        3)
            CONFIG["CAPTCHA_PROVIDER"]="recaptcha_v3"
            echo ""
            echo -e "${CYAN}Get your reCAPTCHA v3 keys at: https://www.google.com/recaptcha/admin${NC}"
            echo ""
            prompt_config "RECAPTCHA_V3_SITE_KEY" "" "reCAPTCHA v3 Site Key"
            prompt_config "RECAPTCHA_V3_SECRET_KEY" "" "reCAPTCHA v3 Secret Key" "true"
            prompt_config "RECAPTCHA_V3_SCORE_THRESHOLD" "0.5" "Score threshold (0.0=bot to 1.0=human)"
            CONFIG["TURNSTILE_SITE_KEY"]=""
            CONFIG["TURNSTILE_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V2_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V2_SECRET_KEY"]=""
            ;;
        4|*)
            CONFIG["CAPTCHA_PROVIDER"]=""
            CONFIG["TURNSTILE_SITE_KEY"]=""
            CONFIG["TURNSTILE_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V2_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V2_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V3_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SCORE_THRESHOLD"]="0.5"
            CONFIG["CAPTCHA_ENABLED_FEATURES"]=""
            echo ""
            echo -e "${YELLOW}Skipping CAPTCHA configuration (can be enabled later)${NC}"
            ;;
    esac

    echo ""

    # Build comma-separated list of enabled features
    if [ -n "${CONFIG[CAPTCHA_PROVIDER]}" ]; then
        echo -e "${CYAN}Enable CAPTCHA for which pages?${NC}"
        enabled_features=()

        read -p "Enable for Login page? (Y/n): " enable_login
        [[ ! "$enable_login" =~ ^[Nn]$ ]] && enabled_features+=("login")

        read -p "Enable for Registration page? (Y/n): " enable_register
        [[ ! "$enable_register" =~ ^[Nn]$ ]] && enabled_features+=("register")

        read -p "Enable for Forgot Password page? (Y/n): " enable_forgot
        [[ ! "$enable_forgot" =~ ^[Nn]$ ]] && enabled_features+=("forgot_password")

        read -p "Enable for Reset Password page? (y/N): " enable_reset
        [[ "$enable_reset" =~ ^[Yy]$ ]] && enabled_features+=("reset_password")

        # Join array with commas
        CONFIG["CAPTCHA_ENABLED_FEATURES"]=$(IFS=,; echo "${enabled_features[*]}")
    else
        CONFIG["CAPTCHA_ENABLED_FEATURES"]=""
    fi

    echo ""

    # =============================================================================
    # Production Domain Configuration (Optional)
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Production Domain Configuration (Optional)${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Use APP_DOMAIN as default for FLAGSHIP_DOMAIN
    prompt_config "FLAGSHIP_DOMAIN" "${CONFIG[APP_DOMAIN]}" "Dashboard application domain (aka Flagship)"
    prompt_config "INGEST_DOMAIN" "ingest.example.com" "Ingest API domain (aka Submarines Ingest)"
    prompt_config "STATUS_DOMAIN" "status.example.com" "Status page domain"

    echo ""

    # =============================================================================
    # Admin User Registration
    # =============================================================================
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}Dashboard Admin User Registration${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Create the initial admin user for the dashboard."
    echo "You will use these credentials to log in after deployment."
    echo ""

    prompt_config "ADMIN_NAME" "Administrator" "Admin user full name"
    prompt_config "ADMIN_EMAIL" "admin@example.com" "Admin user email (used for login)"
    prompt_config "ADMIN_PASSWORD" "" "Admin user password (min 8 characters)" "true"

    # Validate password length
    while [[ ${#CONFIG["ADMIN_PASSWORD"]} -lt 8 ]]; do
        echo -e "${RED}Password must be at least 8 characters${NC}"
        prompt_config "ADMIN_PASSWORD" "" "Admin user password (min 8 characters)" "true"
    done

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
        echo "  JWT Secret: ${CONFIG[JWT_SECRET]:0:8}****"
        echo "  Ports: 8080 ingest, 8081 status (hardcoded in binaries)"
        echo ""

        echo -e "${GREEN}Flagship (Laravel):${NC}"
        echo "  App Name:   ${CONFIG[APP_NAME]}"
        echo "  App Env:    ${CONFIG[APP_ENV]} (hardcoded, production-only)"
        echo "  App Debug:  ${CONFIG[APP_DEBUG]}"
        echo "  App Domain: ${CONFIG[APP_DOMAIN]}"
        echo "  App URL:    ${CONFIG[APP_URL]}"
        echo "  App Key:    ${CONFIG[APP_KEY]:0:12}****"
        echo ""

        echo -e "${GREEN}CAPTCHA Protection:${NC}"
        if [ -n "${CONFIG[CAPTCHA_PROVIDER]}" ]; then
            echo "  Provider:          ${CONFIG[CAPTCHA_PROVIDER]}"
            echo "  Enabled Features:  ${CONFIG[CAPTCHA_ENABLED_FEATURES]}"
        else
            echo "  Status:            Disabled"
        fi
        echo ""

        echo -e "${GREEN}Production Domains (Caddy):${NC}"
        echo "  Flagship: ${CONFIG[FLAGSHIP_DOMAIN]}"
        echo "  Ingest:   ${CONFIG[INGEST_DOMAIN]}"
        echo "  Status:   ${CONFIG[STATUS_DOMAIN]}"
        echo ""

        echo -e "${GREEN}Mail Configuration:${NC}"
        if [ "${CONFIG[MAIL_MAILER]}" = "smtp" ]; then
            echo "  Driver:   SMTP"
            echo "  Host:     ${CONFIG[MAIL_HOST]}:${CONFIG[MAIL_PORT]}"
            echo "  From:     ${CONFIG[MAIL_FROM_ADDRESS]}"
        else
            echo "  Driver:   Log (emails not sent, for testing)"
        fi
        echo ""

        echo -e "${GREEN}Admin User:${NC}"
        echo "  Name:    ${CONFIG[ADMIN_NAME]}"
        echo "  Email:   ${CONFIG[ADMIN_EMAIL]}"
        echo "  Password: ********** (hidden)"
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
# PostgreSQL Configuration (Source of Truth)
# =============================================================================
POSTGRES_USER=${CONFIG[POSTGRES_USER]}
POSTGRES_PASSWORD=${CONFIG[POSTGRES_PASSWORD]}
POSTGRES_DB=${CONFIG[POSTGRES_DB]}

# =============================================================================
# Valkey/Redis Configuration (Source of Truth)
# =============================================================================
VALKEY_HOST=${CONFIG[VALKEY_HOST]}
VALKEY_PORT=${CONFIG[VALKEY_PORT]}
VALKEY_PASSWORD=${CONFIG[VALKEY_PASSWORD]}

# =============================================================================
# Submarines Configuration (Go-Gin Backend)
# =============================================================================

# Database connection (references PostgreSQL config)
DB_HOST=${CONFIG[DB_HOST]}
DB_PORT=${CONFIG[DB_PORT]}
DB_USER=\${POSTGRES_USER}
DB_PASSWORD=\${POSTGRES_PASSWORD}
DB_NAME=\${POSTGRES_DB}
DB_SSLMODE=${CONFIG[DB_SSLMODE]}

# Server settings
# NOTE: Ports are hardcoded in each service's main.go:
# - submarines-ingest: 8080
# - submarines-status: 8081
# - submarines-sshws: 6001
# - submarines-deployer: background worker (no port)
# - submarines-digest: background worker (no port)
# - flagship: 8090 (Nginx, hardcoded)
GIN_MODE=${CONFIG[GIN_MODE]}

# Security
JWT_SECRET=${CONFIG[JWT_SECRET]}

# =============================================================================
# Flagship Configuration (Laravel Dashboard)
# =============================================================================

# App settings
APP_NAME="${CONFIG[APP_NAME]}"
APP_ENV=production  # Hardcoded - this is a production-only deployment script
APP_DEBUG=${CONFIG[APP_DEBUG]}
APP_KEY=${CONFIG[APP_KEY]}
APP_DOMAIN=${CONFIG[APP_DOMAIN]}
APP_URL=${CONFIG[APP_URL]}
APP_LOCALE=${CONFIG[APP_LOCALE]}
APP_FALLBACK_LOCALE=${CONFIG[APP_FALLBACK_LOCALE]}
APP_MAINTENANCE_DRIVER=${CONFIG[APP_MAINTENANCE_DRIVER]}

# Logging
LOG_CHANNEL=${CONFIG[LOG_CHANNEL]}
LOG_STACK=${CONFIG[LOG_STACK]}
LOG_DEPRECATIONS_CHANNEL=${CONFIG[LOG_DEPRECATIONS_CHANNEL]}
LOG_LEVEL=${CONFIG[LOG_LEVEL]}

# Database (references PostgreSQL config)
DB_CONNECTION=${CONFIG[DB_CONNECTION]}
DB_DATABASE=\${POSTGRES_DB}
DB_USERNAME=\${POSTGRES_USER}
# DB_HOST, DB_PORT, DB_PASSWORD, DB_SSLMODE - uses values from Submarines section above

# Sessions & Cache (references Valkey config)
SESSION_DRIVER=${CONFIG[SESSION_DRIVER]}
SESSION_LIFETIME=${CONFIG[SESSION_LIFETIME]}
SESSION_SECURE_COOKIE=${CONFIG[SESSION_SECURE_COOKIE]}
CACHE_STORE=${CONFIG[CACHE_STORE]}
QUEUE_CONNECTION=${CONFIG[QUEUE_CONNECTION]}
REDIS_CLIENT=${CONFIG[REDIS_CLIENT]}
REDIS_HOST=\${VALKEY_HOST}
REDIS_PORT=\${VALKEY_PORT}
REDIS_PASSWORD=\${VALKEY_PASSWORD}

# Mail configuration
MAIL_MAILER=${CONFIG[MAIL_MAILER]}
MAIL_HOST=${CONFIG[MAIL_HOST]}
MAIL_PORT=${CONFIG[MAIL_PORT]}
MAIL_USERNAME=${CONFIG[MAIL_USERNAME]}
MAIL_PASSWORD=${CONFIG[MAIL_PASSWORD]}
MAIL_ENCRYPTION=${CONFIG[MAIL_ENCRYPTION]}
MAIL_FROM_ADDRESS="${CONFIG[MAIL_FROM_ADDRESS]}"
MAIL_FROM_NAME="${CONFIG[MAIL_FROM_NAME]}"

# Vite
VITE_APP_NAME="${CONFIG[VITE_APP_NAME]}"

# =============================================================================
# CAPTCHA Configuration
# =============================================================================
# Options: turnstile, recaptcha_v2, recaptcha_v3
# Leave empty or omit to disable CAPTCHA
CAPTCHA_PROVIDER=${CONFIG[CAPTCHA_PROVIDER]}

# Comma-separated list of features to enable CAPTCHA for
# Available: login, register, forgot_password, reset_password
CAPTCHA_ENABLED_FEATURES=${CONFIG[CAPTCHA_ENABLED_FEATURES]}

# Cloudflare Turnstile (get keys at: https://dash.cloudflare.com/)
TURNSTILE_SITE_KEY=${CONFIG[TURNSTILE_SITE_KEY]}
TURNSTILE_SECRET_KEY=${CONFIG[TURNSTILE_SECRET_KEY]}

# Google reCAPTCHA v2 (get keys at: https://www.google.com/recaptcha/admin)
RECAPTCHA_V2_SITE_KEY=${CONFIG[RECAPTCHA_V2_SITE_KEY]}
RECAPTCHA_V2_SECRET_KEY=${CONFIG[RECAPTCHA_V2_SECRET_KEY]}

# Google reCAPTCHA v3 (get keys at: https://www.google.com/recaptcha/admin)
RECAPTCHA_V3_SITE_KEY=${CONFIG[RECAPTCHA_V3_SITE_KEY]}
RECAPTCHA_V3_SECRET_KEY=${CONFIG[RECAPTCHA_V3_SECRET_KEY]}
RECAPTCHA_V3_SCORE_THRESHOLD=${CONFIG[RECAPTCHA_V3_SCORE_THRESHOLD]}

# =============================================================================
# Production Domain Configuration (Caddy)
# =============================================================================
FLAGSHIP_DOMAIN=${CONFIG[FLAGSHIP_DOMAIN]}
INGEST_DOMAIN=${CONFIG[INGEST_DOMAIN]}
STATUS_DOMAIN=${CONFIG[STATUS_DOMAIN]}

# =============================================================================
# Admin User Registration (Temporary - removed after seeding)
# =============================================================================
# These credentials are used only once during initial deployment
# They will be removed from .env after the admin user is created
ADMIN_NAME=${CONFIG[ADMIN_NAME]}
ADMIN_EMAIL=${CONFIG[ADMIN_EMAIL]}
ADMIN_PASSWORD=${CONFIG[ADMIN_PASSWORD]}

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

SECRETS_DIR="$PROJECT_ROOT/secrets"
MASTER_KEY_FILE="$SECRETS_DIR/master.key"

# Ensure secrets directory exists
mkdir -p "$SECRETS_DIR"

# =============================================================================
# Ensure Ansible Directory Structure Exists
# =============================================================================
echo -e "${BLUE}Ensuring ansible directory structure...${NC}"

ANSIBLE_DIR="$PROJECT_ROOT/ansible"
CATALOG_DIR="$ANSIBLE_DIR/catalog"

# Create ansible/catalog directory if it doesn't exist
if [ ! -d "$CATALOG_DIR" ]; then
    mkdir -p "$CATALOG_DIR"
    echo -e "${GREEN}✓ Created ansible/catalog directory${NC}"
else
    echo -e "${GREEN}✓ ansible/catalog directory already exists${NC}"
fi

# Set proper permissions for shared access
# The ansible/catalog directory is shared between:
# - flagship container (runs as laravel user, UID 1000)
# - submarines-deployer container (runs as root, UID 0)
# Use 777 on catalog to allow both users to write
chmod -R 777 "$CATALOG_DIR"

echo ""

if [ ! -f "$MASTER_KEY_FILE" ]; then
    echo -e "${RED}✗ Master key file not found!${NC}"
    echo "  Expected location: $MASTER_KEY_FILE"
    echo ""
    echo -e "${YELLOW}The master key should have been created during configuration.${NC}"
    echo -e "${YELLOW}Creating it now...${NC}"
    echo ""

    # Generate new key (64 character hex string for AES-256)
    new_master_key=$(openssl rand -hex 32)
    echo "$new_master_key" > "$MASTER_KEY_FILE"
    chmod 644 "$MASTER_KEY_FILE"

    echo -e "${GREEN}✓ Master key generated${NC}"
    echo "  Location: $MASTER_KEY_FILE"
    echo "  Format: 64-character hex (32 bytes for AES-256-CBC)"
    echo ""
    echo -e "${YELLOW}Remember to backup this key after deployment!${NC}"
    echo ""
else
    echo -e "${GREEN}✓ Master key file exists${NC}"
    echo "  Location: $MASTER_KEY_FILE"

    # Verify permissions (only fix if actually incorrect)
    # Use ls to check permissions (more portable than stat)
    CURRENT_PERMS=$(ls -l "$MASTER_KEY_FILE" | awk '{print $1}')
    EXPECTED_PERMS="-rw-r--r--"  # Symbolic representation of 644

    if [ "$CURRENT_PERMS" != "$EXPECTED_PERMS" ]; then
        echo -e "${YELLOW}⚠  Fixing file permissions (should be 644 for container access)${NC}"
        echo -e "${YELLOW}   Current: $CURRENT_PERMS, Expected: $EXPECTED_PERMS${NC}"
        chmod 644 "$MASTER_KEY_FILE"
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

# Pull images (compose.yml already validated at startup)
if ! docker compose pull; then
    echo -e "${YELLOW}⚠  Warning: Failed to pull some Docker images${NC}"
    echo "This may be normal if images need to be built locally."
    echo "Continuing with deployment..."
fi

# =============================================================================
# Validate required files
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Validating deployment files${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check compose.yml
if [ ! -f "$PROJECT_ROOT/compose.yml" ]; then
    echo -e "${RED}Error: compose.yml not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ compose.yml found${NC}"

# Check Caddyfile (production)
if [ -f "$PROJECT_ROOT/caddy/Caddyfile.prod" ]; then
    echo -e "${GREEN}✓ caddy/Caddyfile.prod found${NC}"
else
    echo -e "${RED}Error: caddy/Caddyfile.prod not found${NC}"
    echo -e "${YELLOW}This is a production deployment script and requires Caddyfile.prod${NC}"
    echo ""
    echo "Current directory: $PROJECT_ROOT"
    echo "Looking for: $PROJECT_ROOT/caddy/Caddyfile.prod"
    exit 1
fi

echo ""

# Check mTLS CA certificate (optional - for agent authentication)
if [ -f "$PROJECT_ROOT/secrets/certs/ca.crt" ] && openssl x509 -in "$PROJECT_ROOT/secrets/certs/ca.crt" -noout &>/dev/null 2>&1; then
    echo -e "${GREEN}✓ mTLS CA certificate found and valid${NC}"
    echo -e "${YELLOW}  Remember to uncomment CA cert mount in compose.yml and tls block in Caddyfile.prod${NC}"
else
    echo -e "${YELLOW}⚠️  mTLS not configured (optional)${NC}"
    echo -e "${CYAN}  mTLS provides secure client certificate authentication for agents.${NC}"
    echo -e "${CYAN}  To set up mTLS later, run: ./setup-mtls.sh${NC}"
fi

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
# Create initial admin user
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Creating Admin User${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Run the seeder (idempotent - safe to run multiple times)
echo "Running admin user seeder..."
echo ""

# Run the seeder and show output in real-time
# Note: Detect if we're in a TTY environment (local) or non-TTY (CI/CD)
if [ -t 1 ]; then
    # Local environment - use interactive mode (no -T flag)
    docker compose exec flagship php artisan db:seed --class=AdminUserSeeder --force
    SEEDER_EXIT_CODE=$?
else
    # CI/CD environment - use non-interactive mode (-T flag)
    docker compose exec -T flagship php artisan db:seed --class=AdminUserSeeder --force
    SEEDER_EXIT_CODE=$?
fi

echo ""

# Now we can rely on exit codes since we fixed AdminUserSeeder to exit(1) on errors
if [ $SEEDER_EXIT_CODE -eq 0 ]; then
    # Success or idempotent skip (both are OK)
    echo -e "${GREEN}✓ Admin user setup completed successfully${NC}"
    echo ""

    # Clean up admin credentials from .env (security best practice)
    # Always try to clean up if credentials exist
    if grep -q "^ADMIN_PASSWORD=" .env 2>/dev/null; then
        echo "Removing admin credentials from .env file..."
        sed -i.bak '/^ADMIN_NAME=/d; /^ADMIN_EMAIL=/d; /^ADMIN_PASSWORD=/d' .env
        rm -f .env.bak  # Remove backup file created by sed
        echo -e "${GREEN}✓ Credentials removed from .env (now stored securely in database)${NC}"
    fi
else
    # Actual failure (exit code != 0)
    echo -e "${RED}✗ Admin user seeder failed (exit code: $SEEDER_EXIT_CODE)${NC}"
    echo ""

    # Don't exit the deployment script - let it continue
    # The user can create admin manually later if needed
fi

echo ""

# =============================================================================
# Final summary
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

echo -e "${GREEN}Access URLs:${NC}"
echo "  Flagship Dashboard:  https://${CONFIG[FLAGSHIP_DOMAIN]}"
echo "  Submarines Ingest:   https://${CONFIG[INGEST_DOMAIN]}"
echo "  Submarines Status:   https://${CONFIG[STATUS_DOMAIN]}"
echo ""
echo -e "${CYAN}Note: Ensure DNS points to this server and Caddy has valid certificates${NC}"
echo ""

# Only show admin credentials if they were just created (not when using existing .env)
if [ -n "${CONFIG[ADMIN_EMAIL]}" ] && [ -n "${CONFIG[ADMIN_PASSWORD]}" ]; then
    echo -e "${GREEN}Admin Login Credentials:${NC}"
    echo "  Email:    ${CONFIG[ADMIN_EMAIL]}"
    echo "  Password: ${CONFIG[ADMIN_PASSWORD]}"
    echo ""
    echo -e "${YELLOW}⚠️  Save these credentials - they won't be shown again!${NC}"
    echo ""
else
    echo -e "${GREEN}Admin User:${NC}"
    echo "  Using existing admin account from database"
    echo ""
    echo -e "${CYAN}To update admin credentials, run:${NC}"
    echo "  sudo ./update-admin.sh"
    echo ""
fi
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

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🔑 IMPORTANT: Backup Your Master Key!${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Your SSH encryption master key is located at:"
echo "  $MASTER_KEY_FILE"
echo ""
echo "To view and backup the key, run:"
echo "  sudo cat $MASTER_KEY_FILE"
echo ""
echo "Store it securely in:"
echo "  • Password manager (recommended)"
echo "  • Encrypted USB drive"
echo "  • Secure cloud storage"
echo ""
echo "⚠️  WITHOUT THIS KEY, YOU CANNOT DECRYPT SSH PRIVATE KEYS!"
echo ""

# =============================================================================
# Production mTLS Setup (Optional)
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Production Security Setup - mTLS (Optional)${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if mTLS CA already exists (and is not empty placeholder)
CA_CERT_PATH="$PROJECT_ROOT/secrets/certs/ca.crt"

if [ -f "$CA_CERT_PATH" ] && [ -s "$CA_CERT_PATH" ]; then
    # File exists and is not empty = real CA certificate
    echo -e "${GREEN}✓ mTLS CA already configured${NC}"
    echo "  Certificate: $CA_CERT_PATH"
    echo ""
    echo "To renew/rotate the CA, run:"
    echo "  sudo ./setup-mtls.sh --force"
    echo ""
else
    # File doesn't exist or is empty placeholder
    echo -e "${CYAN}mTLS (mutual TLS) provides cryptographic authentication"
    echo "for all agents connecting to the ingest service."
    echo ""
    echo "Production builds have mTLS support built-in."
    echo "You can configure it now or skip and configure later."
    echo ""

    read -p "Do you want to configure mTLS now? (y/N): " setup_mtls

    if [[ "$setup_mtls" =~ ^[Yy]$ ]]; then
        echo ""
        echo -e "${CYAN}Setting up mTLS...${NC}"
        echo ""

        # Look for setup-mtls.sh in project root
        if [ -f "$PROJECT_ROOT/setup-mtls.sh" ]; then
            bash "$PROJECT_ROOT/setup-mtls.sh"

            if [ $? -eq 0 ]; then
                echo ""
                echo -e "${GREEN}✓ mTLS setup complete${NC}"
                echo ""
            else
                echo ""
                echo -e "${RED}✗ mTLS setup failed${NC}"
                echo ""
                echo -e "${YELLOW}You can run setup-mtls.sh manually later:${NC}"
                echo "  sudo ./setup-mtls.sh"
                echo ""
            fi
        else
            echo -e "${YELLOW}⚠  setup-mtls.sh not found in: $PROJECT_ROOT${NC}"
            echo ""
            echo "To configure mTLS later:"
            echo "  1. Ensure setup-mtls.sh is in the project root"
            echo "  2. Run: sudo ./setup-mtls.sh"
            echo ""
        fi
    else
        echo ""
        echo -e "${YELLOW}Skipping mTLS configuration${NC}"
        echo ""
        echo "To enable mTLS later, run:"
        echo "  sudo ./setup-mtls.sh"
        echo ""
        echo -e "${CYAN}Agents will connect without mTLS (server_id validation only)${NC}"
        echo ""
    fi
fi

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Configure your agents to send metrics"
echo "  2. Access the Flagship dashboard at https://${CONFIG[FLAGSHIP_DOMAIN]}"
echo "  3. Update domain DNS to point to this server"
echo "  4. Review logs for any startup issues"
echo ""

echo -e "${GREEN}Thank you for choosing Node Pulse Admiral! 🚀${NC}"
echo ""
