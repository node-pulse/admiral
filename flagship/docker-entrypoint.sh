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

# Execute the main command
exec "$@"