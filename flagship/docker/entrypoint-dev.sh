#!/bin/sh
set -e

echo "Starting Laravel development environment..."

# Ensure storage directories exist and have correct permissions
mkdir -p storage/logs \
    storage/framework/sessions \
    storage/framework/views \
    storage/framework/cache \
    storage/framework/testing \
    storage/app/public \
    bootstrap/cache

chown -R www:www storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# Clear all caches for development
echo "Clearing caches for development..."
php artisan config:clear
php artisan route:clear
php artisan view:clear
php artisan cache:clear

# Run migrations if AUTO_MIGRATE is set
if [ "$AUTO_MIGRATE" = "true" ]; then
    echo "Running migrations..."
    php artisan migrate --force
fi

# Create storage symlink if it doesn't exist
if [ ! -L public/storage ]; then
    echo "Creating storage symlink..."
    php artisan storage:link
fi

# Start Vite dev server in background
echo "Starting Vite dev server..."
npm run dev &

# Start Laravel development server
echo "Starting Laravel development server..."
exec php artisan serve --host=0.0.0.0 --port=8000