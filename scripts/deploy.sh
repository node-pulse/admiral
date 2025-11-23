#!/bin/bash
# NodePulse Admiral - Production Deployment Script
#
# ⚠️  PRODUCTION ONLY - This script is for production deployments
# ⚠️  For development, use: docker compose -f compose.development.yml up -d
#
# This script:
# - Configures production environment variables (APP_ENV=production, hardcoded)
# - Deploys all services using compose.yml (production build)
# - Creates initial admin user
# - mTLS can be enabled later via Flagship dashboard UI
#
# This script is idempotent and can be run multiple times safely

set -e

# Project root is current working directory
# In production, deploy.sh is extracted to the project root
PROJECT_ROOT="$(pwd)"

ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"

# =============================================================================
# Language Selection
# =============================================================================
echo ""
echo "Please select your preferred language / 请选择您的首选语言:"
echo "  1) English"
echo "  2) 中文 (Chinese)"
echo ""
read -p "Select language / 选择语言 [1-2] (default: 1): " lang_choice
lang_choice="${lang_choice:-1}"

case "$lang_choice" in
    2)
        LANG_FILE="$PROJECT_ROOT/scripts/lang/cn.sh"
        ;;
    1|*)
        LANG_FILE="$PROJECT_ROOT/scripts/lang/en.sh"
        ;;
esac

# Load language file
if [ ! -f "$LANG_FILE" ]; then
    echo "Error: Language file not found: $LANG_FILE"
    echo "错误：找不到语言文件：$LANG_FILE"
    exit 1
fi

source "$LANG_FILE"

# Validate project root by checking for compose.yml
if [ ! -f "$PROJECT_ROOT/compose.yml" ]; then
    echo "${MSG_ERROR_COMPOSE_NOT_FOUND} $PROJECT_ROOT"
    echo ""
    echo "${MSG_HELP_CD}"
    echo "  cd /path/to/admiral"
    echo "  sudo ./deploy.sh"
    exit 1
fi

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_TITLE}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}${MSG_ERROR_NOT_ROOT}${NC}"
    echo "${MSG_USAGE} $0"
    exit 1
fi

# Check prerequisites
echo "${MSG_CHECKING_PREREQUISITES}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}${MSG_ERROR_DOCKER_NOT_INSTALLED}${NC}"
    echo "${MSG_INSTALL_DOCKER}"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}${MSG_ERROR_COMPOSE_NOT_INSTALLED}${NC}"
    echo "${MSG_INSTALL_COMPOSE}"
    exit 1
fi

echo -e "${GREEN}${MSG_PREREQUISITES_PASSED}${NC}"
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
    echo -e "${YELLOW}${MSG_FOUND_EXISTING_ENV}${NC}"
    echo ""
    read -p "${MSG_USE_EXISTING_ENV}" use_existing

    if [[ ! "$use_existing" =~ ^[Nn]$ ]]; then
        LOAD_EXISTING=true
        echo ""
        echo "${MSG_LOADING_DEFAULTS}"
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

        echo -e "${GREEN}${MSG_LOADED_CONFIG}${NC}"
        echo ""

        # Skip to deployment
        SKIP_CONFIG=true
    else
        # Backup existing .env
        backup_file="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$backup_file"
        echo ""
        echo -e "${GREEN}${MSG_BACKED_UP_ENV} $backup_file${NC}"
        echo -e "${CYAN}${MSG_STARTING_FRESH}${NC}"
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
            echo -e "${RED}${MSG_FIELD_REQUIRED}${NC}"
            read -p "$key: " value
        done
    fi

    CONFIG["$key"]="$value"
}

# Configure environment variables (skip if using existing .env)
if [ "$SKIP_CONFIG" != "true" ]; then
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}${MSG_ENV_CONFIG}${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""

    # =============================================================================
    # PostgreSQL Configuration
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_POSTGRES_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    prompt_config "POSTGRES_USER" "admiral" "${MSG_POSTGRES_USER}"
    prompt_config "POSTGRES_PASSWORD" "$(generate_secret)" "${MSG_POSTGRES_PASSWORD}" "true"
    prompt_config "POSTGRES_DB" "node_pulse_admiral" "${MSG_POSTGRES_DB}"

    echo ""

    # =============================================================================
    # Valkey/Redis Configuration
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_VALKEY_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    # Hardcoded values (Docker Compose service names)
    CONFIG["VALKEY_HOST"]="valkey"
    CONFIG["VALKEY_PORT"]="6379"

    echo -e "${CYAN}${MSG_VALKEY_HOST_SET}${NC}"
    echo -e "${CYAN}${MSG_VALKEY_PORT_SET}${NC}"
    echo ""

    prompt_config "VALKEY_PASSWORD" "$(generate_secret)" "${MSG_VALKEY_PASSWORD}" "true"

    echo ""

    # =============================================================================
    # Submarines Configuration (Go-Gin Backend)
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_SUBMARINES_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    # Hardcoded values (Docker Compose service names and defaults)
    CONFIG["DB_HOST"]="postgres"
    CONFIG["DB_PORT"]="5432"
    CONFIG["DB_SSLMODE"]="disable"

    # These reference PostgreSQL values
    CONFIG["DB_USER"]="${CONFIG[POSTGRES_USER]}"
    CONFIG["DB_PASSWORD"]="${CONFIG[POSTGRES_PASSWORD]}"
    CONFIG["DB_NAME"]="${CONFIG[POSTGRES_DB]}"

    echo -e "${CYAN}${MSG_DB_HOST_SET}${NC}"
    echo -e "${CYAN}${MSG_DB_PORT_SET}${NC}"
    echo -e "${CYAN}${MSG_DB_SSLMODE_SET}${NC}"
    echo -e "${CYAN}${MSG_DB_AUTO_SET}${NC}"
    echo ""

    # Server settings
    # NOTE: Ports are hardcoded in each service's main.go (no env vars needed)
    CONFIG["GIN_MODE"]="release"

    echo -e "${CYAN}${MSG_PORTS_HARDCODED}${NC}"
    echo -e "${CYAN}${MSG_PORT_INGEST}${NC}"
    echo -e "${CYAN}${MSG_PORT_STATUS}${NC}"
    echo -e "${CYAN}${MSG_PORT_SSHWS}${NC}"
    echo -e "${CYAN}${MSG_PORT_FLAGSHIP}${NC}"
    echo -e "${CYAN}${MSG_GIN_MODE_SET}${NC}"

    echo ""

    # Security
    prompt_config "JWT_SECRET" "$(generate_secret)" "${MSG_JWT_SECRET}" "true"

    echo ""

    # Certificate Configuration (hardcoded for production)
    CONFIG["CERT_VALIDITY_DAYS"]="180"

    echo -e "${CYAN}${MSG_CERT_VALIDITY_SET}${NC}"
    echo ""

    # Note: mTLS is build-time decision, not runtime toggle
    # Production Dockerfiles always build with mTLS enabled
    # Development Dockerfiles always build without mTLS

    # =============================================================================
    # Flagship Configuration (Laravel Dashboard)
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_FLAGSHIP_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    # App settings
    prompt_config "APP_NAME" "Node Pulse Admiral Flagship" "${MSG_APP_NAME}"
    # APP_ENV is hardcoded to "production" - this is a production-only deployment script
    CONFIG["APP_ENV"]="production"
    prompt_config "APP_DEBUG" "false" "${MSG_APP_DEBUG}"
    prompt_config "APP_KEY" "$(generate_laravel_key)" "${MSG_APP_KEY}" "true"
    prompt_config "APP_DOMAIN" "admiral.example.com" "${MSG_APP_DOMAIN}"

    # Construct APP_URL from domain
    CONFIG["APP_URL"]="https://${CONFIG[APP_DOMAIN]}"

    # Hardcoded Laravel settings (standard defaults)
    CONFIG["APP_LOCALE"]="en"
    CONFIG["APP_FALLBACK_LOCALE"]="en"
    CONFIG["APP_FAKER_LOCALE"]="en_US"
    CONFIG["APP_MAINTENANCE_DRIVER"]="file"

    echo -e "${CYAN}${MSG_APP_LOCALE_SET}${NC}"
    echo -e "${CYAN}${MSG_APP_MAINTENANCE_SET}${NC}"
    echo ""

    # =============================================================================
    # Master Key Generation (for SSH Private Key Encryption)
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_MASTER_KEY_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    SECRETS_DIR="$PROJECT_ROOT/secrets"
    MASTER_KEY_FILE="$SECRETS_DIR/master.key"

    # Create secrets directory if it doesn't exist
    mkdir -p "$SECRETS_DIR"

    if [ -f "$MASTER_KEY_FILE" ]; then
        echo -e "${YELLOW}${MSG_MASTER_KEY_EXISTS}${NC}"
        echo "${MSG_MASTER_KEY_LOCATION} $MASTER_KEY_FILE"
        echo ""
        read -p "${MSG_KEEP_MASTER_KEY}" keep_master
        if [[ ! "$keep_master" =~ ^[Nn]$ ]]; then
            echo -e "${GREEN}${MSG_USING_EXISTING_KEY}${NC}"
        else
            # Backup existing key
            backup_file="$MASTER_KEY_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$MASTER_KEY_FILE" "$backup_file"
            echo -e "${GREEN}${MSG_BACKED_UP_KEY} $backup_file${NC}"

            # Generate new key (64 character hex string for AES-256)
            new_master_key=$(openssl rand -hex 32)
            echo "$new_master_key" > "$MASTER_KEY_FILE"
            chmod 600 "$MASTER_KEY_FILE"
            echo -e "${GREEN}${MSG_NEW_KEY_GENERATED}${NC}"
            echo -e "${YELLOW}${MSG_REENCRYPT_WARNING}${NC}"
        fi
    else
        echo -e "${CYAN}${MSG_GENERATING_KEY}${NC}"

        # Generate new key (64 character hex string for AES-256)
        new_master_key=$(openssl rand -hex 32)
        echo "$new_master_key" > "$MASTER_KEY_FILE"
        chmod 600 "$MASTER_KEY_FILE"

        echo -e "${GREEN}${MSG_KEY_GENERATED}${NC}"
        echo "${MSG_MASTER_KEY_LOCATION} $MASTER_KEY_FILE"
        echo "${MSG_KEY_FORMAT}"
        echo "${MSG_KEY_PERMISSIONS}"
        echo ""
        echo -e "${YELLOW}================================================${NC}"
        echo -e "${YELLOW}${MSG_BACKUP_KEY_WARNING}${NC}"
        echo -e "${YELLOW}================================================${NC}"
        echo ""
        echo "${MSG_KEY_ENCRYPTS}"
        echo "${MSG_KEY_LOST}"
        echo ""
        echo "${MSG_KEY_BACKUP_INFO}"
        echo "${MSG_KEY_BACKUP_LOCATIONS}"
        echo "${MSG_KEY_BACKUP_PASSWORD_MANAGER}"
        echo "${MSG_KEY_BACKUP_USB}"
        echo "${MSG_KEY_BACKUP_CLOUD}"
        echo ""
        read -p "${MSG_PRESS_ENTER}"
    fi

    echo ""

    # Logging configuration
    CONFIG["LOG_CHANNEL"]="stack"
    CONFIG["LOG_STACK"]="single"
    CONFIG["LOG_DEPRECATIONS_CHANNEL"]="null"

    prompt_config "LOG_LEVEL" "info" "${MSG_LOG_LEVEL}"

    echo -e "${CYAN}${MSG_LOG_CHANNEL_SET}${NC}"
    echo ""

    # Database connection (fixed to PostgreSQL)
    CONFIG["DB_CONNECTION"]="pgsql"

    # These reference PostgreSQL values
    CONFIG["DB_DATABASE"]="${CONFIG[POSTGRES_DB]}"
    CONFIG["DB_USERNAME"]="${CONFIG[POSTGRES_USER]}"

    echo -e "${CYAN}${MSG_DB_CONNECTION_SET}${NC}"
    echo -e "${CYAN}${MSG_DB_DATABASE_AUTO_SET}${NC}"
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

    echo -e "${CYAN}${MSG_SESSION_CONFIG}${NC}"
    echo -e "${CYAN}${MSG_SESSION_SECURE_SET}${NC}"
    echo -e "${CYAN}${MSG_REDIS_AUTO_SET}${NC}"
    echo ""

    # =============================================================================
    # Mail Configuration (Optional)
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_MAIL_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    echo -e "${CYAN}${MSG_MAIL_CONFIGURE}${NC}"
    echo "${MSG_MAIL_OPTION_LOG}"
    echo "${MSG_MAIL_OPTION_SMTP}"
    echo ""

    read -p "${MSG_MAIL_SELECT}" mail_choice
    mail_choice="${mail_choice:-1}"

    case "$mail_choice" in
        2)
            CONFIG["MAIL_MAILER"]="smtp"
            echo ""
            prompt_config "MAIL_HOST" "smtp.example.com" "${MSG_MAIL_HOST}"
            prompt_config "MAIL_PORT" "587" "${MSG_MAIL_PORT}"
            prompt_config "MAIL_USERNAME" "" "${MSG_MAIL_USERNAME}"
            prompt_config "MAIL_PASSWORD" "" "${MSG_MAIL_PASSWORD}" "true"
            prompt_config "MAIL_ENCRYPTION" "tls" "${MSG_MAIL_ENCRYPTION}"
            prompt_config "MAIL_FROM_ADDRESS" "noreply@example.com" "${MSG_MAIL_FROM}"
            CONFIG["MAIL_FROM_NAME"]="\${APP_NAME}"
            echo ""
            echo -e "${GREEN}${MSG_SMTP_CONFIGURED}${NC}"
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
            echo -e "${GREEN}${MSG_MAIL_LOG_SET}${NC}"
            ;;
    esac

    echo ""

    # Vite
    CONFIG["VITE_APP_NAME"]="\${APP_NAME}"

    echo ""

    # =============================================================================
    # CAPTCHA Configuration
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_CAPTCHA_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    echo -e "${CYAN}${MSG_CAPTCHA_CHOOSE}${NC}"
    echo "${MSG_CAPTCHA_TURNSTILE}"
    echo "${MSG_CAPTCHA_RECAPTCHA_V2}"
    echo "${MSG_CAPTCHA_RECAPTCHA_V3}"
    echo "${MSG_CAPTCHA_NONE}"
    echo ""

    read -p "${MSG_CAPTCHA_SELECT}" captcha_choice
    captcha_choice="${captcha_choice:-4}"

    case "$captcha_choice" in
        1)
            CONFIG["CAPTCHA_PROVIDER"]="turnstile"
            echo ""
            echo -e "${CYAN}${MSG_CAPTCHA_TURNSTILE_URL}${NC}"
            echo ""
            prompt_config "TURNSTILE_SITE_KEY" "" "${MSG_CAPTCHA_TURNSTILE_SITE_KEY}"
            prompt_config "TURNSTILE_SECRET_KEY" "" "${MSG_CAPTCHA_TURNSTILE_SECRET}" "true"
            CONFIG["RECAPTCHA_V2_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V2_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V3_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SCORE_THRESHOLD"]="0.5"
            ;;
        2)
            CONFIG["CAPTCHA_PROVIDER"]="recaptcha_v2"
            echo ""
            echo -e "${CYAN}${MSG_CAPTCHA_RECAPTCHA_V2_URL}${NC}"
            echo ""
            prompt_config "RECAPTCHA_V2_SITE_KEY" "" "${MSG_CAPTCHA_RECAPTCHA_V2_SITE_KEY}"
            prompt_config "RECAPTCHA_V2_SECRET_KEY" "" "${MSG_CAPTCHA_RECAPTCHA_V2_SECRET}" "true"
            CONFIG["TURNSTILE_SITE_KEY"]=""
            CONFIG["TURNSTILE_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SITE_KEY"]=""
            CONFIG["RECAPTCHA_V3_SECRET_KEY"]=""
            CONFIG["RECAPTCHA_V3_SCORE_THRESHOLD"]="0.5"
            ;;
        3)
            CONFIG["CAPTCHA_PROVIDER"]="recaptcha_v3"
            echo ""
            echo -e "${CYAN}${MSG_CAPTCHA_RECAPTCHA_V3_URL}${NC}"
            echo ""
            prompt_config "RECAPTCHA_V3_SITE_KEY" "" "${MSG_CAPTCHA_RECAPTCHA_V3_SITE_KEY}"
            prompt_config "RECAPTCHA_V3_SECRET_KEY" "" "${MSG_CAPTCHA_RECAPTCHA_V3_SECRET}" "true"
            prompt_config "RECAPTCHA_V3_SCORE_THRESHOLD" "0.5" "${MSG_CAPTCHA_RECAPTCHA_V3_THRESHOLD}"
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
            echo -e "${YELLOW}${MSG_CAPTCHA_SKIPPED}${NC}"
            ;;
    esac

    echo ""

    # Build comma-separated list of enabled features
    if [ -n "${CONFIG[CAPTCHA_PROVIDER]}" ]; then
        echo -e "${CYAN}${MSG_CAPTCHA_ENABLE_PAGES}${NC}"
        enabled_features=()

        read -p "${MSG_CAPTCHA_LOGIN}" enable_login
        [[ ! "$enable_login" =~ ^[Nn]$ ]] && enabled_features+=("login")

        read -p "${MSG_CAPTCHA_REGISTER}" enable_register
        [[ ! "$enable_register" =~ ^[Nn]$ ]] && enabled_features+=("register")

        read -p "${MSG_CAPTCHA_FORGOT}" enable_forgot
        [[ ! "$enable_forgot" =~ ^[Nn]$ ]] && enabled_features+=("forgot_password")

        read -p "${MSG_CAPTCHA_RESET}" enable_reset
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
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_DOMAIN_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""

    # Use APP_DOMAIN as default for FLAGSHIP_DOMAIN
    prompt_config "FLAGSHIP_DOMAIN" "${CONFIG[APP_DOMAIN]}" "${MSG_FLAGSHIP_DOMAIN}"

    echo ""

    # =============================================================================
    # Admin User Registration
    # =============================================================================
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}${MSG_ADMIN_SECTION}${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo "${MSG_ADMIN_INFO}"
    echo "${MSG_ADMIN_USAGE}"
    echo ""

    prompt_config "ADMIN_NAME" "Administrator" "${MSG_ADMIN_NAME}"
    prompt_config "ADMIN_EMAIL" "admin@example.com" "${MSG_ADMIN_EMAIL}"
    prompt_config "ADMIN_PASSWORD" "" "${MSG_ADMIN_PASSWORD}" "true"

    # Validate password length
    while [[ ${#CONFIG["ADMIN_PASSWORD"]} -lt 8 ]]; do
        echo -e "${RED}${MSG_PASSWORD_TOO_SHORT}${NC}"
        prompt_config "ADMIN_PASSWORD" "" "${MSG_ADMIN_PASSWORD}" "true"
    done

    # Set admin locale based on deployment script language choice
    if [ "$lang_choice" = "2" ]; then
        CONFIG["ADMIN_LOCALE"]="zh_CN"
    else
        CONFIG["ADMIN_LOCALE"]="en"
    fi

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
        echo -e "${BLUE}================================================${NC}"
        echo -e "${BLUE}${MSG_REVIEW}${NC}"
        echo -e "${BLUE}================================================${NC}"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_POSTGRES}${NC}"
        echo "${MSG_REVIEW_USER}     ${CONFIG[POSTGRES_USER]}"
        echo "${MSG_REVIEW_PASSWORD} ${CONFIG[POSTGRES_PASSWORD]:0:8}****"
        echo "${MSG_REVIEW_DATABASE} ${CONFIG[POSTGRES_DB]}"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_VALKEY}${NC}"
        echo "${MSG_REVIEW_PASSWORD} ${CONFIG[VALKEY_PASSWORD]:0:8}****"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_SUBMARINES}${NC}"
        echo "${MSG_REVIEW_JWT} ${CONFIG[JWT_SECRET]:0:8}****"
        echo "${MSG_REVIEW_PORTS}"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_FLAGSHIP}${NC}"
        echo "${MSG_REVIEW_APP_NAME}   ${CONFIG[APP_NAME]}"
        echo "${MSG_REVIEW_APP_ENV}    ${CONFIG[APP_ENV]} ${MSG_REVIEW_APP_ENV_NOTE}"
        echo "${MSG_REVIEW_APP_DEBUG}  ${CONFIG[APP_DEBUG]}"
        echo "${MSG_REVIEW_APP_DOMAIN} ${CONFIG[APP_DOMAIN]}"
        echo "${MSG_REVIEW_APP_URL}    ${CONFIG[APP_URL]}"
        echo "${MSG_REVIEW_APP_KEY}    ${CONFIG[APP_KEY]:0:12}****"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_CAPTCHA}${NC}"
        if [ -n "${CONFIG[CAPTCHA_PROVIDER]}" ]; then
            echo "${MSG_REVIEW_CAPTCHA_PROVIDER}          ${CONFIG[CAPTCHA_PROVIDER]}"
            echo "${MSG_REVIEW_CAPTCHA_FEATURES}  ${CONFIG[CAPTCHA_ENABLED_FEATURES]}"
        else
            echo "${MSG_REVIEW_CAPTCHA_DISABLED}"
        fi
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_DOMAIN}${NC}"
        echo "${MSG_REVIEW_FLAGSHIP_DOMAIN} ${CONFIG[FLAGSHIP_DOMAIN]}"
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_MAIL}${NC}"
        if [ "${CONFIG[MAIL_MAILER]}" = "smtp" ]; then
            echo "${MSG_REVIEW_MAIL_DRIVER}   ${MSG_REVIEW_MAIL_SMTP}"
            echo "${MSG_REVIEW_MAIL_HOST}     ${CONFIG[MAIL_HOST]}:${CONFIG[MAIL_PORT]}"
            echo "${MSG_REVIEW_MAIL_FROM}     ${CONFIG[MAIL_FROM_ADDRESS]}"
        else
            echo "${MSG_REVIEW_MAIL_DRIVER}   ${MSG_REVIEW_MAIL_LOG}"
        fi
        echo ""

        echo -e "${GREEN}${MSG_REVIEW_ADMIN}${NC}"
        echo "${MSG_REVIEW_ADMIN_NAME}    ${CONFIG[ADMIN_NAME]}"
        echo "${MSG_REVIEW_ADMIN_EMAIL}   ${CONFIG[ADMIN_EMAIL]}"
        echo "${MSG_REVIEW_ADMIN_PASSWORD}"
        echo ""

        echo -e "${YELLOW}================================================${NC}"
        read -p "${MSG_REVIEW_CONFIRM}" confirm

        case "$confirm" in
            [Yy]es|[Yy])
                echo ""
                echo -e "${GREEN}${MSG_CONFIG_CONFIRMED}${NC}"
                echo ""
                break
                ;;
            [Nn]o|[Nn])
                echo ""
                echo -e "${YELLOW}${MSG_CONFIG_ABORTED}${NC}"
                echo "${MSG_CONFIG_EXITING}"
                exit 0
                ;;
            [Rr]estart|[Rr])
                echo ""
                echo -e "${YELLOW}${MSG_CONFIG_RESTARTING}${NC}"
                echo ""
                # Clear CONFIG array and restart
                unset CONFIG
                declare -A CONFIG
                exec "$0" "$@"
                ;;
            *)
                echo -e "${RED}${MSG_CONFIG_INVALID}${NC}"
                echo ""
                ;;
        esac
    done

    # =============================================================================
    # Write .env file
    # =============================================================================
    echo -e "${BLUE}================================================${NC}"
    echo "${MSG_WRITING_ENV}"
    echo -e "${BLUE}================================================${NC}"
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

# =============================================================================
# Admin User Registration (Temporary - removed after seeding)
# =============================================================================
# These credentials are used only once during initial deployment
# They will be removed from .env after the admin user is created
ADMIN_NAME=${CONFIG[ADMIN_NAME]}
ADMIN_EMAIL=${CONFIG[ADMIN_EMAIL]}
ADMIN_PASSWORD=${CONFIG[ADMIN_PASSWORD]}
ADMIN_LOCALE=${CONFIG[ADMIN_LOCALE]}

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
    echo -e "${GREEN}${MSG_ENV_CREATED}${NC}"
    echo ""
fi

# =============================================================================
# Verify Master Key Exists
# =============================================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_VERIFYING_KEY}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

SECRETS_DIR="$PROJECT_ROOT/secrets"
MASTER_KEY_FILE="$SECRETS_DIR/master.key"

# Ensure secrets directory exists
mkdir -p "$SECRETS_DIR"

# =============================================================================
# Ensure Ansible Directory Structure Exists
# =============================================================================
echo -e "${BLUE}${MSG_ENSURING_ANSIBLE}${NC}"

ANSIBLE_DIR="$PROJECT_ROOT/ansible"
CATALOG_DIR="$ANSIBLE_DIR/catalog"

# Create ansible/catalog directory if it doesn't exist
if [ ! -d "$CATALOG_DIR" ]; then
    mkdir -p "$CATALOG_DIR"
    echo -e "${GREEN}${MSG_CATALOG_CREATED}${NC}"
else
    echo -e "${GREEN}${MSG_CATALOG_EXISTS}${NC}"
fi

# Set proper permissions for shared access
# The ansible/catalog directory is shared between:
# - flagship container (PHP-FPM/Nginx run as laravel user, typically UID 1000)
# - submarines-deployer container (runs as root, UID 0)
# Use 777 to allow both containers to write without UID/GID mapping issues
chmod -R 777 "$CATALOG_DIR"

echo ""

if [ ! -f "$MASTER_KEY_FILE" ]; then
    echo -e "${RED}${MSG_KEY_NOT_FOUND}${NC}"
    echo "${MSG_KEY_EXPECTED} $MASTER_KEY_FILE"
    echo ""
    echo -e "${YELLOW}${MSG_KEY_SHOULD_EXIST}${NC}"
    echo -e "${YELLOW}${MSG_CREATING_KEY_NOW}${NC}"
    echo ""

    # Generate new key (64 character hex string for AES-256)
    new_master_key=$(openssl rand -hex 32)
    echo "$new_master_key" > "$MASTER_KEY_FILE"
    chmod 600 "$MASTER_KEY_FILE"

    echo -e "${GREEN}${MSG_KEY_GENERATED}${NC}"
    echo "${MSG_MASTER_KEY_LOCATION} $MASTER_KEY_FILE"
    echo "${MSG_KEY_FORMAT}"
    echo ""
    echo -e "${YELLOW}${MSG_KEY_BACKUP_INFO}${NC}"
    echo ""
else
    echo -e "${GREEN}${MSG_KEY_EXISTS_VERIFIED}${NC}"
    echo "${MSG_MASTER_KEY_LOCATION} $MASTER_KEY_FILE"

    # Verify permissions (only fix if actually incorrect)
    # Use ls to check permissions (more portable than stat)
    CURRENT_PERMS=$(ls -l "$MASTER_KEY_FILE" | awk '{print $1}')
    EXPECTED_PERMS="-rw-------"  # Symbolic representation of 600 (owner read/write only)

    if [ "$CURRENT_PERMS" != "$EXPECTED_PERMS" ]; then
        echo -e "${YELLOW}${MSG_FIXING_PERMISSIONS}${NC}"
        echo -e "${YELLOW}${MSG_CURRENT_PERMS} $CURRENT_PERMS, ${MSG_EXPECTED_PERMS} $EXPECTED_PERMS${NC}"
        chmod 600 "$MASTER_KEY_FILE"
        echo -e "${GREEN}${MSG_PERMISSIONS_CORRECTED}${NC}"
    fi

    # Verify file is not empty
    if [ ! -s "$MASTER_KEY_FILE" ]; then
        echo -e "${RED}${MSG_KEY_FILE_EMPTY}${NC}"
        echo "${MSG_KEY_REGENERATE}"
        exit 1
    fi

    echo ""
fi

# =============================================================================
# Pull Docker images
# =============================================================================
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_PULLING_IMAGES}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Pull images (compose.yml already validated at startup)
if ! docker compose pull; then
    echo -e "${YELLOW}${MSG_PULL_WARNING}${NC}"
    echo "${MSG_PULL_INFO}"
    echo "${MSG_PULL_CONTINUING}"
fi

# =============================================================================
# Validate required files
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_VALIDATING_FILES}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check compose.yml
if [ ! -f "$PROJECT_ROOT/compose.yml" ]; then
    echo -e "${RED}${MSG_COMPOSE_NOT_FOUND}${NC}"
    exit 1
fi
echo -e "${GREEN}${MSG_COMPOSE_FOUND}${NC}"

# Check Caddyfile (production)
if [ -f "$PROJECT_ROOT/caddy/Caddyfile.prod" ]; then
    echo -e "${GREEN}${MSG_CADDYFILE_FOUND}${NC}"
else
    echo -e "${RED}${MSG_CADDYFILE_NOT_FOUND}${NC}"
    echo -e "${YELLOW}${MSG_CADDYFILE_REQUIRED}${NC}"
    echo ""
    echo "${MSG_CURRENT_DIR} $PROJECT_ROOT"
    echo "${MSG_LOOKING_FOR} $PROJECT_ROOT/caddy/Caddyfile.prod"
    exit 1
fi

echo ""

# =============================================================================
# Start services
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_STARTING_SERVICES}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

docker compose up -d

# =============================================================================
# Wait for services to be healthy
# =============================================================================
echo ""
echo "${MSG_WAITING_SERVICES}"
sleep 5

# =============================================================================
# Create initial admin user
# =============================================================================
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}${MSG_CREATING_ADMIN}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Run the seeder (idempotent - safe to run multiple times)
echo "${MSG_RUNNING_SEEDER}"
echo ""

# Run the seeder and show output in real-time
# Note: Detect if we're in a TTY environment (local) or non-TTY (CI/CD)
# Disable set -e temporarily to capture exit code
set +e
if [ -t 1 ]; then
    # Local environment - use interactive mode (no -T flag)
    docker compose exec flagship php artisan db:seed --class=AdminUserSeeder --force
    SEEDER_EXIT_CODE=$?
else
    # CI/CD environment - use non-interactive mode (-T flag)
    docker compose exec -T flagship php artisan db:seed --class=AdminUserSeeder --force
    SEEDER_EXIT_CODE=$?
fi
set -e

echo ""

# Now we can rely on exit codes since we fixed AdminUserSeeder to exit(1) on errors
if [ $SEEDER_EXIT_CODE -eq 0 ]; then
    # Success or idempotent skip (both are OK)
    echo -e "${GREEN}${MSG_ADMIN_SETUP_SUCCESS}${NC}"
    echo ""

    # Clean up admin credentials from .env (security best practice)
    # Always try to clean up if credentials exist
    if grep -q "^ADMIN_PASSWORD=" .env 2>/dev/null; then
        echo "${MSG_REMOVING_CREDENTIALS}"
        sed -i.bak '/^ADMIN_NAME=/d; /^ADMIN_EMAIL=/d; /^ADMIN_PASSWORD=/d; /^ADMIN_LOCALE=/d' .env
        rm -f .env.bak  # Remove backup file created by sed
        echo -e "${GREEN}${MSG_CREDENTIALS_REMOVED}${NC}"
    fi
else
    # Actual failure (exit code != 0)
    echo -e "${RED}${MSG_SEEDER_FAILED} $SEEDER_EXIT_CODE)${NC}"
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
echo -e "${GREEN}${MSG_DEPLOYMENT_COMPLETE}${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

echo -e "${GREEN}${MSG_ACCESS_URLS}${NC}"
echo "  ${MSG_FLAGSHIP_DASHBOARD}  https://${CONFIG[FLAGSHIP_DOMAIN]}"
echo "  ${MSG_METRICS_INGESTION}   https://${CONFIG[FLAGSHIP_DOMAIN]}/ingest/metrics/prometheus"
echo "  ${MSG_SSH_WEBSOCKET}       wss://${CONFIG[FLAGSHIP_DOMAIN]}/ssh/"
echo ""
echo -e "${CYAN}${MSG_DNS_NOTE}${NC}"
echo ""

# Only show admin credentials if they were just created (not when using existing .env)
if [ -n "${CONFIG[ADMIN_EMAIL]}" ] && [ -n "${CONFIG[ADMIN_PASSWORD]}" ]; then
    echo -e "${GREEN}${MSG_ADMIN_CREDENTIALS}${NC}"
    echo "  ${MSG_EMAIL}    ${CONFIG[ADMIN_EMAIL]}"
    echo "  ${MSG_PASSWORD} ${CONFIG[ADMIN_PASSWORD]}"
    echo ""
    echo -e "${YELLOW}${MSG_SAVE_CREDENTIALS}${NC}"
    echo ""
else
    echo -e "${GREEN}${MSG_ADMIN_USER}${NC}"
    echo "  ${MSG_EXISTING_ADMIN}"
    echo ""
    echo -e "${CYAN}${MSG_UPDATE_ADMIN_HINT}${NC}"
    echo "  sudo ./update-admin.sh"
    echo ""
fi
echo ""

echo -e "${YELLOW}${MSG_CONFIG_FILES}${NC}"
echo "  ${MSG_ENVIRONMENT} $ENV_FILE"
if [ -n "$(ls -A $ENV_FILE.backup.* 2>/dev/null)" ]; then
    echo "  ${MSG_BACKUPS}     $PROJECT_ROOT/.env.backup.*"
fi
echo ""

echo -e "${YELLOW}${MSG_SECURITY_NOTES}${NC}"
echo "  ${MSG_KEEP_ENV_SECURE}"
echo "  ${MSG_DB_PASSWORD} ${CONFIG[POSTGRES_PASSWORD]:0:4}****"
echo "  ${MSG_FILE_PERMISSIONS}"
echo ""

echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}${MSG_KEY_BACKUP_IMPORTANT}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "${MSG_KEY_LOCATION_INFO}"
echo "  $MASTER_KEY_FILE"
echo ""
echo "${MSG_VIEW_BACKUP_KEY}"
echo "  sudo cat $MASTER_KEY_FILE"
echo ""
echo "${MSG_STORE_SECURELY}"
echo "  ${MSG_PASSWORD_MANAGER}"
echo "  ${MSG_ENCRYPTED_USB}"
echo "  ${MSG_SECURE_CLOUD}"
echo ""
echo "${MSG_KEY_WARNING}"
echo ""

echo ""
echo -e "${YELLOW}${MSG_NEXT_STEPS}${NC}"
echo "  1. ${MSG_STEP_ACCESS_DASHBOARD} https://${CONFIG[FLAGSHIP_DOMAIN]}"
echo "  2. ${MSG_STEP_ENABLE_MTLS}"
echo "  3. ${MSG_STEP_CONFIGURE_AGENTS}"
echo "  4. ${MSG_STEP_UPDATE_DNS}"
echo "  5. ${MSG_STEP_REVIEW_LOGS}"
echo ""
echo -e "${CYAN}${MSG_OPTIONAL_SECURITY}${NC}"
echo "  ${MSG_MTLS_ENABLE_INFO}"
echo "  ${MSG_MTLS_LOGIN}"
echo "  ${MSG_MTLS_CLI}"
echo ""

echo -e "${GREEN}${MSG_THANK_YOU}${NC}"
echo ""
