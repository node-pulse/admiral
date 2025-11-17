#!/bin/bash
# NodePulse Admiral - Update Admin User Credentials
#
# This script allows you to update the admin user's email and/or password
# after deployment. It can also be used to create a new admin user if needed.
#
# Usage:
#   sudo ./update-admin.sh

set -e

# Project root is current working directory
PROJECT_ROOT="$(pwd)"

# Validate project root by checking for compose.yml
if [ ! -f "$PROJECT_ROOT/compose.yml" ]; then
    echo "Error: Cannot find compose.yml in: $PROJECT_ROOT"
    echo ""
    echo "Please cd to the project root directory before running this script:"
    echo "  cd /path/to/admiral"
    echo "  sudo ./change-admin.sh"
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
echo -e "${BLUE}Node Pulse Admiral - Update Admin Credentials${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root or with sudo${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# Check if flagship container is running
if ! docker compose ps flagship | grep -q "Up"; then
    echo -e "${RED}Error: Flagship container is not running${NC}"
    echo ""
    echo "Please start the services first:"
    echo "  docker compose up -d"
    exit 1
fi

echo -e "${CYAN}This script will help you update admin user credentials.${NC}"
echo ""
echo "You can:"
echo "  1. update password for existing admin user"
echo "  2. update email for existing admin user"
echo "  3. update both email and password"
echo "  4. Create a new admin user (if none exists)"
echo ""

# Prompt for current admin email
echo -e "${YELLOW}Step 1: Identify the admin user${NC}"
echo ""
read -p "Enter current admin email (or press Enter to list all users): " CURRENT_EMAIL

if [ -z "$CURRENT_EMAIL" ]; then
    echo ""
    echo -e "${CYAN}Fetching list of users...${NC}"
    echo ""

    # List all users
    docker compose exec -T flagship php artisan tinker --execute="
        \$users = \App\Models\User::all(['id', 'name', 'email', 'created_at']);
        echo str_pad('ID', 5) . str_pad('Email', 40) . str_pad('Name', 30) . 'Created At' . PHP_EOL;
        echo str_repeat('-', 100) . PHP_EOL;
        foreach (\$users as \$user) {
            echo str_pad(\$user->id, 5) .
                 str_pad(\$user->email, 40) .
                 str_pad(\$user->name, 30) .
                 \$user->created_at->format('Y-m-d H:i') . PHP_EOL;
        }
    "

    echo ""
    read -p "Enter the email of the user you want to modify: " CURRENT_EMAIL
fi

# Validate email format
if [[ ! "$CURRENT_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
    echo -e "${RED}Error: Invalid email format${NC}"
    exit 1
fi

# Check if user exists
echo ""
echo -e "${CYAN}Checking if user exists...${NC}"
USER_EXISTS=$(docker compose exec -T flagship php artisan tinker --execute="
    \$user = \App\Models\User::where('email', '$CURRENT_EMAIL')->first();
    echo \$user ? 'yes' : 'no';
")

USER_EXISTS=$(echo "$USER_EXISTS" | tr -d '[:space:]')

if [ "$USER_EXISTS" != "yes" ]; then
    echo -e "${RED}Error: User with email '$CURRENT_EMAIL' not found${NC}"
    echo ""
    read -p "Do you want to create a new admin user instead? (y/N): " CREATE_NEW

    if [[ ! "$CREATE_NEW" =~ ^[Yy]$ ]]; then
        echo "Exiting..."
        exit 1
    fi

    # Create new admin user flow
    echo ""
    echo -e "${YELLOW}Step 2: Create new admin user${NC}"
    echo ""

    read -p "Admin name: " ADMIN_NAME
    while [ -z "$ADMIN_NAME" ]; do
        echo -e "${RED}Name is required${NC}"
        read -p "Admin name: " ADMIN_NAME
    done

    read -p "Admin email: " NEW_EMAIL
    while [[ ! "$NEW_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; do
        echo -e "${RED}Invalid email format${NC}"
        read -p "Admin email: " NEW_EMAIL
    done

    read -s -p "Admin password (min 8 characters): " NEW_PASSWORD
    echo ""

    while [[ ${#NEW_PASSWORD} -lt 8 ]]; do
        echo -e "${RED}Password must be at least 8 characters${NC}"
        read -s -p "Admin password (min 8 characters): " NEW_PASSWORD
        echo ""
    done

    read -s -p "Confirm password: " PASSWORD_CONFIRM
    echo ""

    while [ "$NEW_PASSWORD" != "$PASSWORD_CONFIRM" ]; do
        echo -e "${RED}Passwords do not match${NC}"
        read -s -p "Admin password (min 8 characters): " NEW_PASSWORD
        echo ""
        read -s -p "Confirm password: " PASSWORD_CONFIRM
        echo ""
    done

    # Create the user
    echo ""
    echo -e "${CYAN}Creating admin user...${NC}"

    docker compose exec -T flagship php artisan tinker --execute="
        \$user = new \App\Models\User();
        \$user->name = '$ADMIN_NAME';
        \$user->email = '$NEW_EMAIL';
        \$user->password = Hash::make('$NEW_PASSWORD');
        \$user->email_verified_at = now();
        \$user->save();
        echo 'Admin user created successfully!' . PHP_EOL;
        echo 'ID: ' . \$user->id . PHP_EOL;
        echo 'Name: ' . \$user->name . PHP_EOL;
        echo 'Email: ' . \$user->email . PHP_EOL;
    "

    echo ""
    echo -e "${GREEN}✓ Admin user created successfully!${NC}"
    echo ""
    echo -e "${BLUE}================================================${NC}"
    echo -e "${GREEN}Admin Login Credentials:${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo "  Name:     $ADMIN_NAME"
    echo "  Email:    $NEW_EMAIL"
    echo "  Password: $NEW_PASSWORD"
    echo ""
    echo -e "${YELLOW}⚠️  Save these credentials securely!${NC}"
    echo ""
    exit 0
fi

# User exists - modify credentials
echo -e "${GREEN}✓ User found${NC}"
echo ""

echo -e "${YELLOW}Step 2: What do you want to change?${NC}"
echo ""
echo "  1) Change password only"
echo "  2) Change email only"
echo "  3) Change both email and password"
echo ""

read -p "Select option [1-3]: " CHANGE_OPTION

case "$CHANGE_OPTION" in
    1)
        # Change password only
        echo ""
        read -s -p "New password (min 8 characters): " NEW_PASSWORD
        echo ""

        while [[ ${#NEW_PASSWORD} -lt 8 ]]; do
            echo -e "${RED}Password must be at least 8 characters${NC}"
            read -s -p "New password (min 8 characters): " NEW_PASSWORD
            echo ""
        done

        read -s -p "Confirm password: " PASSWORD_CONFIRM
        echo ""

        while [ "$NEW_PASSWORD" != "$PASSWORD_CONFIRM" ]; do
            echo -e "${RED}Passwords do not match${NC}"
            read -s -p "New password (min 8 characters): " NEW_PASSWORD
            echo ""
            read -s -p "Confirm password: " PASSWORD_CONFIRM
            echo ""
        done

        echo ""
        echo -e "${CYAN}Updating password...${NC}"

        docker compose exec -T flagship php artisan tinker --execute="
            \$user = \App\Models\User::where('email', '$CURRENT_EMAIL')->first();
            \$user->password = Hash::make('$NEW_PASSWORD');
            \$user->save();
            echo 'Password updated successfully!' . PHP_EOL;
        "

        echo ""
        echo -e "${GREEN}✓ Password updated successfully!${NC}"
        echo ""
        echo -e "${BLUE}================================================${NC}"
        echo -e "${GREEN}Admin Login Credentials:${NC}"
        echo -e "${BLUE}================================================${NC}"
        echo ""
        echo "  Email:    $CURRENT_EMAIL"
        echo "  Password: $NEW_PASSWORD"
        echo ""
        ;;

    2)
        # Change email only
        echo ""
        read -p "New email: " NEW_EMAIL

        while [[ ! "$NEW_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; do
            echo -e "${RED}Invalid email format${NC}"
            read -p "New email: " NEW_EMAIL
        done

        echo ""
        echo -e "${CYAN}Updating email...${NC}"

        docker compose exec -T flagship php artisan tinker --execute="
            \$user = \App\Models\User::where('email', '$CURRENT_EMAIL')->first();
            \$user->email = '$NEW_EMAIL';
            \$user->save();
            echo 'Email updated successfully!' . PHP_EOL;
        "

        echo ""
        echo -e "${GREEN}✓ Email updated successfully!${NC}"
        echo ""
        echo -e "${BLUE}================================================${NC}"
        echo -e "${GREEN}Admin Login Credentials:${NC}"
        echo -e "${BLUE}================================================${NC}"
        echo ""
        echo "  Email:    $NEW_EMAIL"
        echo "  Password: (unchanged)"
        echo ""
        ;;

    3)
        # Change both
        echo ""
        read -p "New email: " NEW_EMAIL

        while [[ ! "$NEW_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; do
            echo -e "${RED}Invalid email format${NC}"
            read -p "New email: " NEW_EMAIL
        done

        echo ""
        read -s -p "New password (min 8 characters): " NEW_PASSWORD
        echo ""

        while [[ ${#NEW_PASSWORD} -lt 8 ]]; do
            echo -e "${RED}Password must be at least 8 characters${NC}"
            read -s -p "New password (min 8 characters): " NEW_PASSWORD
            echo ""
        done

        read -s -p "Confirm password: " PASSWORD_CONFIRM
        echo ""

        while [ "$NEW_PASSWORD" != "$PASSWORD_CONFIRM" ]; do
            echo -e "${RED}Passwords do not match${NC}"
            read -s -p "New password (min 8 characters): " NEW_PASSWORD
            echo ""
            read -s -p "Confirm password: " PASSWORD_CONFIRM
            echo ""
        done

        echo ""
        echo -e "${CYAN}Updating credentials...${NC}"

        docker compose exec -T flagship php artisan tinker --execute="
            \$user = \App\Models\User::where('email', '$CURRENT_EMAIL')->first();
            \$user->email = '$NEW_EMAIL';
            \$user->password = Hash::make('$NEW_PASSWORD');
            \$user->save();
            echo 'Credentials updated successfully!' . PHP_EOL;
        "

        echo ""
        echo -e "${GREEN}✓ Credentials updated successfully!${NC}"
        echo ""
        echo -e "${BLUE}================================================${NC}"
        echo -e "${GREEN}Admin Login Credentials:${NC}"
        echo -e "${BLUE}================================================${NC}"
        echo ""
        echo "  Email:    $NEW_EMAIL"
        echo "  Password: $NEW_PASSWORD"
        echo ""
        ;;

    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Done!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
