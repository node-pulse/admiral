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

    # Server settings (hardcoded - matches compose.yml port mappings)
    CONFIG["PORT"]="8080"
    CONFIG["INGEST_PORT"]="8080"
    CONFIG["STATUS_PORT"]="8082"
    CONFIG["GIN_MODE"]="release"

    echo -e "${CYAN}PORT set to '8080' (Submarines Ingest, matches compose.yml)${NC}"
    echo -e "${CYAN}STATUS_PORT set to '8082' (Submarines Status, matches compose.yml)${NC}"
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
            chmod 600 "$MASTER_KEY_FILE"
            echo -e "${GREEN}✓ New master key generated${NC}"
            echo -e "${YELLOW}⚠️  All existing SSH keys will need to be re-imported!${NC}"
        fi
    else
        echo -e "${CYAN}Generating new master key for SSH private key encryption...${NC}"

        # Generate new key (64 character hex string for AES-256)
        new_master_key=$(openssl rand -hex 32)
        echo "$new_master_key" > "$MASTER_KEY_FILE"
        chmod 600 "$MASTER_KEY_FILE"

        echo -e "${GREEN}✓ Master key generated successfully${NC}"
        echo "  Location: $MASTER_KEY_FILE"
        echo "  Format: 64-character hex (32 bytes for AES-256-CBC)"
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
    CONFIG["CACHE_STORE"]="redis"
    CONFIG["QUEUE_CONNECTION"]="redis"
    CONFIG["REDIS_CLIENT"]="phpredis"

    # These reference Valkey values
    CONFIG["REDIS_HOST"]="${CONFIG[VALKEY_HOST]}"
    CONFIG["REDIS_PORT"]="${CONFIG[VALKEY_PORT]}"
    CONFIG["REDIS_PASSWORD"]="${CONFIG[VALKEY_PASSWORD]}"

    echo -e "${CYAN}Sessions, Cache, Queue configured to use Redis (Valkey)${NC}"
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
        echo "  (Ports: 8080 ingest, 8082 status - hardcoded)"
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
PORT=${CONFIG[PORT]}
INGEST_PORT=\${PORT}
STATUS_PORT=${CONFIG[STATUS_PORT]}
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
    chmod 600 "$MASTER_KEY_FILE"

    echo -e "${GREEN}✓ Master key generated${NC}"
    echo "  Location: $MASTER_KEY_FILE"
    echo "  Format: 64-character hex (32 bytes for AES-256-CBC)"
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

# Check Caddyfile
if [ ! -f "$PROJECT_ROOT/caddy/Caddyfile" ]; then
    echo -e "${RED}Error: caddy/Caddyfile not found${NC}"
    echo -e "${YELLOW}Note: The release should include caddy/Caddyfile (production config)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ caddy/Caddyfile found${NC}"

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
if docker compose exec -T flagship php artisan db:seed --class=AdminUserSeeder; then
    echo ""
    echo -e "${GREEN}✓ Admin user created successfully${NC}"
    echo ""

    # Clean up admin credentials from .env (security best practice)
    echo "Removing admin credentials from .env file..."
    sed -i.bak '/^ADMIN_NAME=/d; /^ADMIN_EMAIL=/d; /^ADMIN_PASSWORD=/d' .env
    rm -f .env.bak  # Remove backup file created by sed
    echo -e "${GREEN}✓ Credentials removed from .env (now stored securely in database)${NC}"
else
    echo ""
    echo -e "${YELLOW}⚠️  Warning: Admin user creation failed or was skipped${NC}"
    echo -e "${YELLOW}⚠️  You may need to create an admin user manually${NC}"
    echo ""
    echo "To create admin user manually, run:"
    echo "  docker compose exec flagship php artisan db:seed --class=AdminUserSeeder"
fi

echo ""

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
echo "  Flagship Dashboard:  http://localhost (via Caddy)"
echo "  Submarines Ingest:   http://localhost:8080"
echo "  Submarines Status:   http://localhost:8082"
echo "  Vite Dev Server:     http://localhost:5173 (development)"
echo ""

echo -e "${GREEN}Admin Login Credentials:${NC}"
echo "  Email:    ${CONFIG[ADMIN_EMAIL]}"
echo "  Password: (the password you entered during setup)"
echo ""
echo -e "${YELLOW}⚠️  Important: Please change your password after first login!${NC}"
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

# =============================================================================
# Production mTLS Setup (MANDATORY)
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Production Security Setup - mTLS${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if CA already exists
CA_EXISTS=false
SUBMARINES_URL="http://submarines-ingest:8080"

if curl -sf "${SUBMARINES_URL}/internal/ca/active" 2>/dev/null | grep -q '"is_active":true'; then
    CA_EXISTS=true
    echo -e "${GREEN}✓ mTLS CA already configured${NC}"
    echo "  Skipping mTLS setup (CA already exists)"
    echo ""
    echo "  To renew/rotate the CA, run:"
    echo "    ./scripts/setup-mtls.sh --force"
    echo ""
else
    echo -e "${YELLOW}⚠️  IMPORTANT: Production deployments REQUIRE mTLS${NC}"
    echo ""
    echo "mTLS (mutual TLS) provides cryptographic authentication"
    echo "for all agents connecting to the ingest service."
    echo ""
    echo "This is a build-time architectural decision:"
    echo "  • Development builds: No mTLS (for testing)"
    echo "  • Production builds: mTLS enforced (always strict)"
    echo ""
    echo -e "${CYAN}Setting up mTLS now...${NC}"
    echo ""

    if [ -f "$PROJECT_ROOT/scripts/setup-mtls.sh" ]; then
        bash "$PROJECT_ROOT/scripts/setup-mtls.sh"

        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✓ mTLS setup complete${NC}"
            echo ""
        else
            echo ""
            echo -e "${RED}✗ mTLS setup failed${NC}"
            echo ""
            echo -e "${YELLOW}You must run setup-mtls.sh manually before deploying agents:${NC}"
            echo "  ./scripts/setup-mtls.sh"
            echo ""
            exit 1
        fi
    else
        echo -e "${RED}✗ setup-mtls.sh not found${NC}"
        echo "  Expected location: $PROJECT_ROOT/scripts/setup-mtls.sh"
        echo ""
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Configure your agents to send metrics with mTLS certificates"
echo "  2. Access the Flagship dashboard at http://localhost"
echo "  3. Update domain DNS to point to this server"
echo "  4. Review logs for any startup issues"
echo ""

echo -e "${GREEN}Happy Monitoring! 🚀${NC}"
echo ""
