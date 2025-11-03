#!/bin/bash
#
# setup-mtls.sh - Bootstrap mTLS infrastructure
#
# This script:
# 1. Generates master encryption key (if not exists)
# 2. Creates self-signed Certificate Authority via Submarines API
# 3. Exports CA certificate for Caddy
#
# Usage:
#   ./scripts/setup-mtls.sh
#   ./scripts/setup-mtls.sh --force  (recreate CA even if exists)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_DIR="$PROJECT_ROOT/secrets"
CERTS_DIR="$SECRETS_DIR/certs"
MASTER_KEY_PATH="$SECRETS_DIR/master.key"
CA_CERT_PATH="$CERTS_DIR/ca.crt"

# Submarines ingest API URL (hardcoded - Docker service name)
SUBMARINES_URL="http://submarines-ingest:8080"

# Default CA settings
CA_NAME="${CA_NAME:-Node Pulse Production CA}"
CA_VALIDITY_DAYS="${CA_VALIDITY_DAYS:-3650}"

# Parse arguments
FORCE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE=true
            shift
            ;;
        --name)
            CA_NAME="$2"
            shift 2
            ;;
        --validity)
            CA_VALIDITY_DAYS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --force           Force recreate CA even if one exists"
            echo "  --name <name>     CA name (default: 'Node Pulse Production CA')"
            echo "  --validity <days> CA validity in days (default: 3650)"
            echo "  --help            Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Functions
print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  Node Pulse mTLS Bootstrap${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}[$1/6] $2...${NC}"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

# Step 1: Check prerequisites
check_prerequisites() {
    print_step "1/7" "Checking prerequisites"

    # Check if running inside Docker or can access Submarines
    if ! command -v curl &> /dev/null; then
        print_error "curl not found. Please install curl."
        return 1
    fi

    # Create directories
    mkdir -p "$SECRETS_DIR" "$CERTS_DIR"
    chmod 755 "$SECRETS_DIR" "$CERTS_DIR"
    print_success "Directories created/verified"

    # Test Submarines connectivity
    if ! curl -sf "${SUBMARINES_URL}/health" > /dev/null 2>&1; then
        print_error "Cannot reach Submarines at ${SUBMARINES_URL}"
        print_error "Make sure submarines-ingest service is running:"
        echo ""
        echo "  docker compose ps submarines-ingest"
        echo ""
        return 1
    fi
    print_success "Submarines API reachable"

    echo ""
    return 0
}

# Step 2: Check master key
check_master_key() {
    print_step "2/7" "Checking master encryption key"

    if [[ -f "$MASTER_KEY_PATH" ]]; then
        KEY_LENGTH=$(wc -c < "$MASTER_KEY_PATH" | tr -d ' ')
        if [[ $KEY_LENGTH -ge 32 ]]; then
            print_success "Master key found"
            echo ""
            return 0
        fi
    fi

    print_warning "Master key not found or invalid"
    echo ""

    # Generate new master key (32 bytes)
    echo -n "Generate a new master key? [Y/n] "
    read -r response
    response=${response:-Y}

    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        print_error "Master key is required for certificate encryption. Aborting."
        return 1
    fi

    # Generate random 32-byte key
    openssl rand -base64 32 > "$MASTER_KEY_PATH"
    chmod 600 "$MASTER_KEY_PATH"

    print_success "Generated new master key: $MASTER_KEY_PATH"
    echo ""
    return 0
}

# Step 3: Check if CA exists
check_ca_exists() {
    print_step "3/7" "Checking for existing Certificate Authority"

    # Try to get active CA from Submarines API
    CA_CHECK=$(curl -sf "${SUBMARINES_URL}/internal/ca/active" 2>/dev/null || echo "")

    if [[ -n "$CA_CHECK" ]] && echo "$CA_CHECK" | grep -q '"is_active":true'; then
        print_warning "A Certificate Authority already exists"
        echo ""

        if [[ "$FORCE" == "true" ]]; then
            print_warning "Force flag set - will create new CA anyway"
            echo ""
            return 0
        fi

        echo -n "Do you want to create a new CA? (This will NOT revoke the old one) [y/N] "
        read -r response
        response=${response:-N}

        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}Aborted. Use --force to skip this confirmation.${NC}"
            exit 0
        fi
    else
        print_success "No existing CA found - will create new one"
    fi

    echo ""
    return 0
}

# Step 4: Create CA
create_ca() {
    print_step "4/7" "Creating self-signed Certificate Authority"

    # Call Submarines API to create CA
    RESPONSE=$(curl -sf -X POST "${SUBMARINES_URL}/internal/ca/create" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"${CA_NAME}\",\"validity_days\":${CA_VALIDITY_DAYS}}" \
        2>&1)

    if [[ $? -ne 0 ]] || [[ -z "$RESPONSE" ]]; then
        print_error "Failed to create CA"
        print_error "Response: $RESPONSE"
        return 1
    fi

    # Parse response
    CA_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    CA_NAME_RESP=$(echo "$RESPONSE" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    CA_VALID_UNTIL=$(echo "$RESPONSE" | grep -o '"valid_until":"[^"]*"' | head -1 | cut -d'"' -f4)
    CA_CERT_PEM=$(echo "$RESPONSE" | grep -o '"certificate_pem":"[^"]*"' | sed 's/"certificate_pem":"//; s/"$//' | sed 's/\\n/\n/g')

    if [[ -z "$CA_ID" ]]; then
        print_error "Failed to parse CA response"
        print_error "Response: $RESPONSE"
        return 1
    fi

    print_success "Created CA: ${CA_NAME_RESP}"
    print_success "CA ID: ${CA_ID}"
    print_success "Valid until: ${CA_VALID_UNTIL}"

    # Save CA certificate PEM for next step
    echo "$CA_CERT_PEM" > "$CA_CERT_PATH.tmp"

    echo ""
    return 0
}

# Step 5: Export CA certificate
export_ca_certificate() {
    print_step "5/7" "Exporting CA certificate"

    # Move temporary file to final location
    if [[ -f "$CA_CERT_PATH.tmp" ]]; then
        mv "$CA_CERT_PATH.tmp" "$CA_CERT_PATH"
        chmod 644 "$CA_CERT_PATH"
        print_success "Exported CA certificate to: $CA_CERT_PATH"
    else
        print_error "Failed to export CA certificate"
        return 1
    fi

    echo ""
    return 0
}

# Step 6: Verify setup
verify_setup() {
    print_step "6/7" "Verifying setup"

    # Check if CA certificate exists
    if [[ ! -f "$CA_CERT_PATH" ]]; then
        print_error "CA certificate file not found"
        return 1
    fi
    print_success "CA certificate file exists"

    # Verify CA in database via API
    CA_CHECK=$(curl -sf "${SUBMARINES_URL}/internal/ca/active" 2>/dev/null || echo "")
    if [[ -n "$CA_CHECK" ]] && echo "$CA_CHECK" | grep -q '"is_active":true'; then
        print_success "Active CA verified via API"
    else
        print_warning "Could not verify active CA via API"
    fi

    echo ""
    return 0
}

# Step 7: Rebuild submarines with mTLS
rebuild_submarines() {
    print_step "7/7" "Rebuilding submarines with mTLS enabled"

    # Check if docker compose is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found - cannot complete setup"
        echo ""
        print_error "mTLS setup requires rebuilding submarines-ingest with production Dockerfile."
        print_error "Please install Docker and run this script again."
        return 1
    fi

    # Check if compose.yml exists
    if [[ ! -f "$PROJECT_ROOT/compose.yml" ]]; then
        print_error "compose.yml not found in $PROJECT_ROOT"
        echo ""
        print_error "Cannot rebuild submarines-ingest without compose.yml"
        return 1
    fi

    # Rebuild submarines-ingest (MANDATORY - no skipping)
    echo ""
    echo -e "${CYAN}Building submarines-ingest with mTLS enabled (this may take a few minutes)...${NC}"
    echo ""

    if docker compose -f "$PROJECT_ROOT/compose.yml" build submarines-ingest; then
        print_success "Rebuild complete"
        echo ""

        # Restart services (MANDATORY)
        echo -e "${CYAN}Restarting submarines-ingest service...${NC}"
        if docker compose -f "$PROJECT_ROOT/compose.yml" up -d submarines-ingest; then
            print_success "Service restarted with mTLS enabled"
        else
            print_error "Failed to restart service"
            echo ""
            print_error "Please restart manually:"
            echo "  docker compose up -d submarines-ingest"
            return 1
        fi
    else
        print_error "Rebuild failed"
        echo ""
        print_error "mTLS setup incomplete. Please fix the build errors and try again."
        return 1
    fi

    echo ""
    return 0
}

# Display success summary
display_success_summary() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${GREEN}✓ mTLS Bootstrap Complete!${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}✓${NC} CA Name: ${CA_NAME}"
    echo -e "  ${GREEN}✓${NC} Certificate: ${CA_CERT_PATH}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Deploy agents with certificates:"
    echo -e "     ${CYAN}ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml${NC}"
    echo ""
    echo "  2. Monitor mTLS status in admin UI:"
    echo -e "     ${CYAN}System Settings > Security > mTLS Authentication${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Main execution
main() {
    print_header

    check_prerequisites || exit 1
    check_master_key || exit 1
    check_ca_exists || exit 0
    create_ca || exit 1
    export_ca_certificate || exit 1
    verify_setup || exit 1
    rebuild_submarines || exit 1

    display_success_summary
    exit 0
}

# Run main
main
