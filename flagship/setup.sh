#!/bin/bash
set -e

echo "🚀 NodePulse Flagship - Laravel Setup"
echo "======================================"

# Check if root .env exists
if [ ! -f ../.env ]; then
    echo "❌ Error: .env file not found in admiral root directory"
    echo "   Please copy admiral/.env.example to admiral/.env first"
    exit 1
fi

# Check if APP_KEY is set in root .env
if ! grep -q "APP_KEY=base64:" ../.env; then
    echo "🔑 Generating application key..."
    echo ""
    echo "Run this command to generate APP_KEY:"
    echo "  cd /path/to/admiral"
    echo "  docker-compose run --rm flagship php artisan key:generate --show"
    echo ""
    echo "Then add the generated key to admiral/.env:"
    echo "  APP_KEY=base64:..."
    echo ""
else
    echo "✅ Application key already set in admiral/.env"
fi

# Install PHP dependencies
if [ -d "vendor" ]; then
    echo "ℹ️  Vendor directory exists"
else
    echo "📦 Installing PHP dependencies..."
    if command -v composer &> /dev/null; then
        composer install
    else
        echo "⚠️  Composer not found. Run this command manually:"
        echo "   docker-compose run --rm flagship composer install"
    fi
fi

# Install Node dependencies
if [ -d "node_modules" ]; then
    echo "ℹ️  Node modules directory exists"
else
    echo "📦 Installing Node dependencies..."
    if command -v npm &> /dev/null; then
        npm install
    else
        echo "⚠️  NPM not found. Run this command manually:"
        echo "   docker-compose run --rm flagship npm install"
    fi
fi

# Create storage directories if needed
echo "📁 Setting up storage directories..."
mkdir -p storage/framework/{sessions,views,cache}
mkdir -p storage/logs
mkdir -p bootstrap/cache

# Set permissions
echo "🔒 Setting permissions..."
chmod -R 775 storage bootstrap/cache

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Ensure APP_KEY is set in admiral/.env"
echo "2. Run migrations: php artisan migrate"
echo "3. Build assets: npm run build"
echo "4. Start the application: php artisan serve"
echo ""
echo "Or use Docker:"
echo "  cd /path/to/admiral"
echo "  docker-compose up -d flagship"
echo ""
