# Laravel Flagship Dockerfile
# Uses FrankenPHP - a modern, Go-based PHP application server
# Traefik handles reverse proxy, FrankenPHP serves HTTP directly

# Build stage for Node.js assets
FROM node:22-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production=false

# Copy source files
COPY . .

# Build assets
RUN npm run build

# Production stage
FROM dunglas/frankenphp:latest-php8.2-alpine

# Install system dependencies
RUN apk add --no-cache \
    postgresql-dev

# Install PHP extensions
RUN install-php-extensions \
    pdo_pgsql \
    pgsql \
    zip \
    intl \
    opcache \
    redis

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

# Copy built assets from node-builder stage
COPY --from=node-builder /app/public/build /app/public/build

# Install PHP dependencies (production)
RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

# Create storage directories and set permissions
RUN mkdir -p storage/logs storage/framework/{sessions,views,cache} bootstrap/cache && \
    chmod -R 775 storage bootstrap/cache && \
    chown -R www-data:www-data storage bootstrap/cache

# Expose port 3000
EXPOSE 3000

# Start FrankenPHP in worker mode for maximum performance
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]

# Create Caddyfile for FrankenPHP configuration
RUN echo ':3000 {\n\
    root * /app/public\n\
    php_server\n\
}' > /etc/caddy/Caddyfile
