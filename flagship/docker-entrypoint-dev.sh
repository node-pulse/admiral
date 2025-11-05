#!/bin/bash
set -e

# Development entrypoint for Flagship
# Runs Nginx + PHP-FPM (via supervisor) and Vite HMR server

echo "🚀 Starting Flagship Development Server..."

# Install npm dependencies if node_modules doesn't exist
# Uses npm ci for Alpine Linux (amd64) compatibility
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm ci
fi

# Create PHP-FPM socket directory with proper permissions
echo "📁 Creating PHP-FPM socket directory..."
mkdir -p /run/php
chown laravel:laravel /run/php
chmod 755 /run/php

# Start Vite dev server in background
echo "📦 Starting Vite dev server on port 5173..."
npm run dev &
VITE_PID=$!

# Wait a moment for Vite to start
sleep 3

# Start Nginx + PHP-FPM via supervisor
echo "🐘 Starting Nginx (port 8090) and PHP-FPM via supervisor..."
/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf &
SUPERVISOR_PID=$!

# Function to handle shutdown
shutdown() {
    echo ""
    echo "🛑 Shutting down development servers..."
    kill $VITE_PID 2>/dev/null || true
    kill $SUPERVISOR_PID 2>/dev/null || true
    exit 0
}

# Trap SIGTERM and SIGINT
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait
