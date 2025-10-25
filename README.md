# Node Pulse Admiral

A comprehensive agent fleet management dashboard for monitoring Node Pulse agents across your infrastructure.

## Architecture

This project uses Docker Compose to orchestrate multiple services:

- **Submarines (Go-Gin)**: High-performance metrics ingestion pipeline producing 2 binary files (ingest, digest)
- **Flagship (Laravel 12)**: Web dashboard and management UI with Inertia.js + React frontend
- **Cruiser (Next.js)**: Modern React-based dashboard UI (secondary service)
- **PostgreSQL 18**: Main database with separate schemas for each service
- **Valkey**: Redis-compatible in-memory data store for message streams, caching, and sessions
- **Caddy**: Modern reverse proxy and web server with automatic HTTPS

## Prerequisites

- Docker and Docker Compose (Docker Desktop or standalone)
- Git

## Quick Start

1. **Clone the repository** (if not already done):

   ```bash
   git clone <repository-url>
   cd node-pulse-stack/dashboard
   ```

2. **Copy the environment file**:

   ```bash
   cp .env.example .env
   ```

3. **Update the `.env` file** with your configuration:

   - Change `POSTGRES_PASSWORD` to a secure password
   - Change `VALKEY_PASSWORD` to a secure password
   - Update `JWT_SECRET` and `BETTER_AUTH_SECRET` with strong random values

4. **Start all services**:

   ```bash
   docker compose up -d
   ```

5. **Check service status**:

   ```bash
   docker compose ps
   ```

6. **View logs**:
   ```bash
   docker compose logs -f
   ```

## Service URLs

Once all services are running:

- **Flagship (Admin Dashboard)**: http://localhost (via Caddy)
- **Cruiser (Frontend)**: http://localhost:3000
- **Submarines Ingest**: http://localhost:8080
- **Submarines Status**: http://localhost:8082
- **PostgreSQL**: localhost:5432
- **Valkey**: localhost:6379

## Database Schemas

The PostgreSQL database is organized into two schemas:

1. **better_auth**: Authentication tables for Cruiser (Next.js using better-auth)
2. **admiral**: Application tables for agent fleet management (shared by Submarines and Flagship)
   - `servers`: Server/agent registry
   - `metrics`: Time-series metrics data
   - `alerts`: Alert records
   - `alert_rules`: Alert rule configurations
   - `ssh_sessions`: SSH session audit logs

## API Endpoints

### Metrics Ingestion

Agents send metrics to:

```
POST http://your-domain/metrics
```

Example payload (matches Node Pulse agent format):

```json
{
  "timestamp": "2025-10-13T14:30:00Z",
  "server_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "hostname": "server-01",
  "system_info": {
    "hostname": "server-01",
    "kernel": "Linux",
    "kernel_version": "5.15.0-89-generic",
    "distro": "Ubuntu",
    "distro_version": "22.04.3 LTS",
    "architecture": "amd64",
    "cpu_cores": 8
  },
  "cpu": {
    "usage_percent": 45.2
  },
  "memory": {
    "used_mb": 2048,
    "total_mb": 8192,
    "usage_percent": 25.0
  },
  "network": {
    "upload_bytes": 1024000,
    "download_bytes": 2048000
  },
  "uptime": {
    "days": 15.5
  }
}
```

### Dashboard API

- `GET /api/servers` - List all servers
- `GET /api/servers/:id/metrics` - Get metrics for a specific server

## Configuring Node Pulse Agents

Update your Node Pulse agent configuration (`/etc/node-pulse/nodepulse.yml`):

```yaml
server:
  endpoint: "http://your-dashboard-domain/metrics"
  timeout: 3s

agent:
  server_id: "00000000-0000-0000-0000-000000000000" # Auto-generated if not set
  interval: 5s

buffer:
  enabled: true
  path: "/var/lib/node-pulse/buffer"
  retention_hours: 48
```

## Development

### Submarines (Go-Gin Backend)

```bash
cd submarines
go mod download

# Run ingest server (receives agent metrics)
go run cmd/ingest/main.go

# Run digest worker (consumes from Valkey Stream, writes to PostgreSQL)
go run cmd/digest/main.go
```

### Flagship (Laravel Web Dashboard)

```bash
cd flagship
composer install
npm install

# Run development server (all services)
composer dev

# Or run individually
php artisan serve              # Laravel web server
npm run dev                    # Vite dev server
php artisan queue:listen       # Queue worker
php artisan pail               # Log viewer

# Other commands
php artisan migrate            # Run migrations
php artisan test               # Run tests
```

### Cruiser (Next.js Frontend)

```bash
cd cruiser
npm install
npm run dev
```

## Laravel + Inertia.js Stack

Flagship uses **Laravel 12** with **Inertia.js** for a modern SPA experience:

- **Backend**: Laravel for API, authentication, and business logic
- **Frontend**: React 19 with TypeScript
- **Routing**: Server-side routing via Inertia.js (no client-side router needed)
- **UI Components**: Radix UI + Tailwind CSS
- **Authentication**: Laravel Fortify with CAPTCHA support

### Creating New Pages

1. Create a controller in `flagship/app/Http/Controllers/`:

```php
<?php
namespace App\Http\Controllers;

use Inertia\Inertia;

class ExampleController extends Controller
{
    public function index()
    {
        return Inertia::render('example', [
            'data' => [...],
        ]);
    }
}
```

2. Create a React component in `flagship/resources/js/pages/`:

```tsx
// resources/js/pages/example.tsx
export default function Example({ data }) {
  return <div>Your page content</div>;
}
```

3. Add a route in `flagship/routes/web.php`:

```php
Route::get('/example', [ExampleController::class, 'index']);
```

## Accessing pgweb

pgweb provides a web-based interface to browse and query the PostgreSQL database:

1. Open http://localhost:8081
2. Connection is pre-configured via `DATABASE_URL` environment variable
3. Navigate between schemas using the schema selector

## Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (WARNING: This deletes all data)
docker compose down -v
```

## Updating Services

```bash
# Rebuild and restart a specific service
docker compose up -d --build submarines
docker compose up -d --build flagship
docker compose up -d --build cruiser

# Rebuild all services
docker compose up -d --build
```

## Troubleshooting

### Services won't start

Check logs for specific services:

```bash
docker compose logs submarines
docker compose logs flagship
docker compose logs cruiser
docker compose logs postgres
docker compose logs kafka
```

### Database connection issues

1. Ensure PostgreSQL is healthy:

   ```bash
   docker compose ps postgres
   ```

2. Check database logs:

   ```bash
   docker compose logs postgres
   ```

3. Verify connection from backend:
   ```bash
   docker compose exec submarines sh
   # Inside container:
   # Try connecting to postgres
   ```

### Valkey connection issues

```bash
docker compose logs valkey
docker compose exec valkey valkey-cli ping
```

### Flagship (Laravel) issues

1. Check Laravel application logs:

   ```bash
   docker compose logs flagship
   ```

2. Access Laravel container:

   ```bash
   docker compose exec flagship bash
   php artisan about  # Show Laravel environment info
   ```

3. Check frontend build:
   ```bash
   npm run build  # Production build
   npm run dev    # Development with hot reload
   ```

### Frontend won't load

1. Check if Next.js is building correctly:

   ```bash
   docker compose logs cruiser
   ```

2. Ensure Submarines API is accessible:
   ```bash
   curl http://localhost:8080/health
   ```

## Production Deployment

For production:

1. Update all secrets in `.env`
2. Use `production` target in Dockerfiles
3. Set `GIN_MODE=release` for Submarines
4. Set `APP_ENV=production` and `APP_DEBUG=false` for Flagship
5. Run `php artisan optimize` for Laravel optimization
6. Build frontend assets with `npm run build`
7. Configure proper domains in `.env` (ADMIN_DOMAIN, INGEST_DOMAIN, etc.)
8. Use `Caddyfile.prod` for automatic HTTPS via Let's Encrypt
9. Set up proper backup strategy for PostgreSQL
10. Configure monitoring and alerting
11. Scale digest workers based on Valkey Stream lag
12. Configure Laravel authentication and authorization
13. Set up proper session and cache drivers

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
