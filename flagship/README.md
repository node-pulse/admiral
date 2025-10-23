# NodePulse Flagship - Laravel Dashboard

Laravel-based web dashboard for the NodePulse agent fleet management system.

## Overview

Flagship is the web UI component of NodePulse Admiral:

- **Dashboard**: Real-time server metrics visualization
- **Server Management**: CRUD operations for monitored servers
- **Alert Management**: Configure and view alerts
- **Pure Web Application**: Reads from PostgreSQL (no message queue)

## Technology Stack

- **Framework**: Laravel 12 with React (Inertia.js)
- **App Server**: FrankenPHP (Go-based, production-ready)
- **Database**: PostgreSQL 18 (`backend` schema - shared with Submarines)
- **Cache/Sessions**: Valkey (Redis-compatible)
- **Build Tool**: Vite
- **Reverse Proxy**: Traefik (configured at admiral level)

## Quick Start

### Production (Docker)

```bash
# Pull pre-built image
docker pull ghcr.io/node-pulse/node-pulse-flagship:latest

# From admiral root directory
docker-compose up -d flagship
```

### Local Development

```bash
cd flagship

# Install dependencies
composer install
npm install

# Build assets
npm run build

# Start Laravel server
php artisan serve --port=3000
```

## Configuration

### Environment Variables

All configuration is in **`admiral/.env`** (single .env file for the entire stack).

Laravel-specific variables:
```env
# Laravel Configuration
APP_ENV=production
APP_DEBUG=false
APP_KEY=base64:...  # Generate: docker-compose run --rm flagship php artisan key:generate --show
```

Other required variables (shared with other services):
```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_DB=node_pulse_admiral

# Valkey/Redis
VALKEY_PASSWORD=your-password
```

### Database Schema

Uses PostgreSQL schema: **`backend`**

Flagship reads metrics data written by Submarines from the shared `backend` schema.

The database has multiple schemas:

- `backend` - Shared: Submarines writes metrics, Flagship reads
- `kratos` - Ory Kratos identity data
- `better_auth` - Next.js (Cruiser) auth data

## Architecture

```
Browser → Traefik → FrankenPHP (Go-based server :3000) → PostgreSQL (backend schema)
                         ↓
                    Valkey (cache/sessions)
```

**Key Components:**

- **FrankenPHP**: Go-based HTTP server (production-ready, high performance)
- **Traefik**: Handles SSL/TLS, routing, load balancing
- **Valkey**: Redis-compatible for sessions/cache
- **Shared Schema**: Reads from `backend` schema where Submarines writes

## Development

### Artisan Commands

```bash
# Run migrations
php artisan migrate

# Create controller
php artisan make:controller ServerController --resource

# Create model
php artisan make:model Server -m

# Run tests
php artisan test
```

### Asset Compilation

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
```

## Docker

### Image

Pre-built images: `ghcr.io/node-pulse/node-pulse-flagship:latest`

Auto-built via GitHub Actions on push to `main`

### Dockerfile

Production-ready build:

- **FrankenPHP** (Go-based PHP application server)
- PHP 8.2 with PostgreSQL + Redis extensions
- Laravel dependencies (optimized)
- Pre-built frontend assets
- Listens on port 3000

### Local Build

```bash
cd flagship
docker build -t ghcr.io/node-pulse/node-pulse-flagship:latest .
```

## Project Structure

```
flagship/
├── app/              # Laravel application code
├── config/           # Configuration files
├── database/         # Migrations and seeders
├── public/           # Public assets
├── resources/        # Views, React components, CSS
├── routes/           # Route definitions
├── storage/          # App storage (logs, cache)
├── tests/            # Tests
├── Dockerfile        # Simple Docker build
└── .env.example      # Environment template
```

## Deployment

See `admiral/compose.yml` for the full stack configuration.

Flagship integrates with:

- PostgreSQL (shared database, separate schema)
- Valkey (sessions/cache)
- Traefik (reverse proxy)
- Kratos (authentication)

## License

MIT
