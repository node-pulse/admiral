#!/bin/bash
set -e

# Development entrypoint for Flagship
# Runs both Laravel dev server and Vite HMR server

echo "🚀 Starting Flagship Development Server..."

# Start Vite dev server in background
echo "📦 Starting Vite dev server on port 5173..."
npm run dev &
VITE_PID=$!

# Wait a moment for Vite to start
sleep 3

# Start Laravel development server
echo "🐘 Starting Laravel dev server on port 9000..."
php artisan serve --host=0.0.0.0 --port=9000 &
LARAVEL_PID=$!

# Function to handle shutdown
shutdown() {
    echo ""
    echo "🛑 Shutting down development servers..."
    kill $VITE_PID 2>/dev/null || true
    kill $LARAVEL_PID 2>/dev/null || true
    exit 0
}

# Trap SIGTERM and SIGINT
trap shutdown SIGTERM SIGINT

# Wait for both processes
wait
