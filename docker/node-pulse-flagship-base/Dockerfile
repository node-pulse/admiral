# Node Pulse Flagship Base - PHP 8 FPM + Nginx on Debian
# Pre-compiled with common Laravel extensions and Nginx for serving static assets
# Published to ghcr.io/node-pulse/node-pulse-flagship-base:latest

FROM php:8.3-fpm-bookworm

LABEL org.opencontainers.image.source=https://github.com/node-pulse/admiral
LABEL org.opencontainers.image.description="Node Pulse Flagship Base - PHP 8.3 FPM + Nginx on Debian with Laravel extensions"
LABEL org.opencontainers.image.licenses=MIT

# Install system dependencies, Nginx, and build PHP extensions
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    curl \
    git \
    openssh-client \
    libicu-dev \
    libzip-dev \
    libonig-dev \
    libpq-dev \
    # Python and Ansible for deployment orchestration \
    python3 \
    python3-pip \
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
    && docker-php-ext-enable opcache \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Configure PHP for production
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Configure OPcache for production
RUN echo "opcache.memory_consumption=128" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.interned_strings_buffer=8" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.max_accelerated_files=4000" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.revalidate_freq=2" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/docker-php-ext-opcache.ini

# Configure Nginx - remove default site
RUN rm /etc/nginx/sites-enabled/default 2>/dev/null || true

# Create Laravel-optimized Nginx configuration
RUN echo 'server {\n\
    listen 8090;\n\
    listen [::]:8090;\n\
    server_name _;\n\
    root /var/www/html/public;\n\
    index index.php;\n\
\n\
    # Serve static files directly\n\
    location ~* \.(jpg|jpeg|gif|png|css|js|ico|xml|webmanifest|woff|woff2|ttf|svg|eot)$ {\n\
        access_log off;\n\
        log_not_found off;\n\
        expires 30d;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # Vite build assets\n\
    location /build/ {\n\
        access_log off;\n\
        expires 365d;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
\n\
    # Laravel routing\n\
    location / {\n\
        try_files $uri $uri/ /index.php?$query_string;\n\
    }\n\
\n\
    # PHP processing\n\
    location ~ \.php$ {\n\
        fastcgi_pass unix:/run/php/php-fpm.sock;\n\
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n\
        include fastcgi_params;\n\
        fastcgi_hide_header X-Powered-By;\n\
    }\n\
\n\
    # Deny access to hidden files\n\
    location ~ /\. {\n\
        deny all;\n\
    }\n\
}' > /etc/nginx/sites-available/laravel

# Enable the site
RUN ln -s /etc/nginx/sites-available/laravel /etc/nginx/sites-enabled/ \
    && mkdir -p /run/php

# Configure PHP-FPM to use socket instead of TCP
RUN sed -i 's/listen = 127.0.0.1:9000/listen = \/run\/php\/php-fpm.sock/' /usr/local/etc/php-fpm.d/www.conf \
    && echo "listen.owner = www-data" >> /usr/local/etc/php-fpm.d/www.conf \
    && echo "listen.group = www-data" >> /usr/local/etc/php-fpm.d/www.conf

# Create supervisor config to run both Nginx and PHP-FPM
RUN echo '[supervisord]\n\
nodaemon=true\n\
user=root\n\
logfile=/var/log/supervisor/supervisord.log\n\
pidfile=/var/run/supervisord.pid\n\
\n\
[program:php-fpm]\n\
command=/usr/local/sbin/php-fpm -F\n\
autostart=true\n\
autorestart=true\n\
priority=5\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0\n\
\n\
[program:nginx]\n\
command=/usr/sbin/nginx -g "daemon off;"\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/dev/stdout\n\
stdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\n\
stderr_logfile_maxbytes=0' > /etc/supervisor/conf.d/supervisord.conf

# Create directories for logs
RUN mkdir -p /var/log/supervisor

# Expose Nginx port
EXPOSE 8090

# Default command - run supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

# Metadata
ENV BASE_IMAGE_VERSION=2.0.0