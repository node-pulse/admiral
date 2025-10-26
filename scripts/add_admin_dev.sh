#!/bin/bash

# =============================================================================
# Add Admin User - Development Script
# =============================================================================
# Quick script to create an admin user in development environment
# This prompts for credentials and calls the AdminUserSeeder
#
# Usage:
#   ./scripts/add_admin_dev.sh
#
# Requirements:
#   - Docker Compose stack must be running
#   - Flagship container must be healthy
# =============================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Add Admin User - Development${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if Docker Compose is running
if ! docker compose ps | grep -q "flagship.*running"; then
    echo -e "${RED}❌ Error: Flagship container is not running${NC}"
    echo ""
    echo "Please start the stack first:"
    echo "  docker compose up -d"
    echo ""
    exit 1
fi

# Prompt for admin credentials
echo "Enter admin user details:"
echo ""

read -p "Name [Administrator]: " admin_name
admin_name=${admin_name:-Administrator}

read -p "Email [admin@localhost]: " admin_email
admin_email=${admin_email:-admin@localhost}

# Prompt for password (hidden input)
while true; do
    read -sp "Password (min 8 characters): " admin_password
    echo ""

    if [[ ${#admin_password} -lt 8 ]]; then
        echo -e "${RED}Password must be at least 8 characters${NC}"
        continue
    fi

    read -sp "Confirm password: " admin_password_confirm
    echo ""

    if [[ "$admin_password" != "$admin_password_confirm" ]]; then
        echo -e "${RED}Passwords do not match. Please try again.${NC}"
        continue
    fi

    break
done

echo ""
echo -e "${GREEN}Creating admin user...${NC}"
echo ""

# Create temporary .env with admin credentials
# We'll append to the existing .env and then remove
if [[ -f .env ]]; then
    # Backup existing .env
    cp .env .env.tmp.bak

    # Append admin credentials
    cat >> .env << EOF

# Temporary admin credentials (will be removed)
ADMIN_NAME=${admin_name}
ADMIN_EMAIL=${admin_email}
ADMIN_PASSWORD=${admin_password}
EOF
else
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

# Run the seeder
if docker compose exec -T flagship php artisan db:seed --class=AdminUserSeeder; then
    echo ""
    echo -e "${GREEN}✓ Admin user created successfully!${NC}"
    echo ""
    echo -e "${GREEN}Login credentials:${NC}"
    echo "  Email:    ${admin_email}"
    echo "  Password: (the password you entered)"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Failed to create admin user${NC}"
    echo ""
    echo "Check the logs for details:"
    echo "  docker compose logs flagship"
    echo ""

    # Restore backup
    mv .env.tmp.bak .env
    exit 1
fi

# Clean up admin credentials from .env
if [[ -f .env.tmp.bak ]]; then
    mv .env.tmp.bak .env
    echo -e "${GREEN}✓ Cleaned up temporary credentials${NC}"
fi

echo ""
echo -e "${YELLOW}⚠️  Note: Please change your password after first login${NC}"
echo ""
