# Node Pulse Flagship Base - PHP 8 FPM Alpine
# Pre-compiled with common Laravel extensions and tools
# Published to ghcr.io/node-pulse/node-pulse-flagship-base:latest

FROM php:8-fpm-alpine

LABEL org.opencontainers.image.source=https://github.com/node-pulse/admiral
LABEL org.opencontainers.image.description="Node Pulse Flagship Base - PHP 8.3 FPM Alpine with Laravel extensions pre-compiled"
LABEL org.opencontainers.image.licenses=MIT

# Install system dependencies and build PHP extensions (ONE TIME COMPILATION)
RUN apk add --no-cache \
    curl \
    git \
    openssh-client \
    icu-dev \
    libzip-dev \
    oniguruma-dev \
    postgresql-dev \
    # Python and Ansible for deployment orchestration
    python3 \
    py3-pip \
    ansible \
    sshpass \
    && docker-php-ext-install -j$(nproc) \
    intl \
    mbstring \
    zip \
    bcmath \
    pcntl \
    pdo_pgsql \
    pgsql \
    opcache \
    && docker-php-ext-enable opcache

# Configure PHP for production
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Configure OPcache for production
RUN echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.revalidate_freq=2" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini

# Metadata
ENV BASE_IMAGE_VERSION=1.0.0
