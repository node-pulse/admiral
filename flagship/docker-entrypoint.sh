#!/bin/sh
set -e

# Ensure storage directories exist with correct permissions
mkdir -p /var/www/html/storage/logs \
         /var/www/html/storage/framework/cache \
         /var/www/html/storage/framework/sessions \
         /var/www/html/storage/framework/views

# Create log file if it doesn't exist
touch /var/www/html/storage/logs/laravel.log

# Set correct ownership for all storage
chown -R laravel:laravel /var/www/html/storage

# Set correct permissions
chmod -R 775 /var/www/html/storage
chmod 664 /var/www/html/storage/logs/laravel.log

# Add initialization message to verify it's working
echo "[$(date)] Laravel storage initialized by entrypoint script" >> /var/www/html/storage/logs/laravel.log

# Cache Laravel configuration for production performance
# This runs every container start, so env var changes take effect after restart
# NOTE: view:cache is DISABLED because it caches Inertia props (including Turnstile tokens)
#       which causes "timeout-or-duplicate" errors from Cloudflare Turnstile
echo "[$(date)] Caching Laravel configuration..." >> /var/www/html/storage/logs/laravel.log
php artisan config:cache
php artisan route:cache
# php artisan view:cache  # DISABLED: Causes Turnstile token reuse
php artisan event:cache
echo "[$(date)] Laravel caching complete" >> /var/www/html/storage/logs/laravel.log

# Execute the main command (supervisor, which starts nginx + php-fpm)
exec "$@"