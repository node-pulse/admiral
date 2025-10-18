# Node Pulse Admiral

A comprehensive agent fleet management dashboard for monitoring NodePulse agents across your infrastructure.

## Architecture

This project uses Docker Compose to orchestrate multiple services:

- **Next.js Frontend**: Modern React-based dashboard UI
- **Go-Gin Backend**: High-performance API server for metrics ingestion and data retrieval
- **PostgreSQL 18**: Main database with separate schemas for each service
- **Valkey**: Redis-compatible in-memory data store for caching and sessions
- **Ory Kratos**: Modern identity and user management
- **pgweb**: Web-based PostgreSQL database browser
- **Caddy**: Modern reverse proxy and web server

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

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Caddy (Reverse Proxy)**: http://localhost:80
- **Ory Kratos Public API**: http://localhost:4433
- **Ory Kratos Admin API**: http://localhost:4434
- **pgweb**: http://localhost:8081
- **PostgreSQL**: localhost:5432
- **Valkey**: localhost:6379

## Database Schemas

The PostgreSQL database is organized into three schemas:

1. **better_auth**: Authentication tables for Next.js (using better-auth)
2. **kratos**: Identity management tables (managed by Ory Kratos)
3. **backend**: Application tables for agent fleet management
   - `servers`: Server/agent registry
   - `metrics`: Time-series metrics data
   - `alerts`: Alert records
   - `alert_rules`: Alert rule configurations
   - `buffered_metrics`: Buffered metrics from agents

## API Endpoints

### Metrics Ingestion

Agents send metrics to:

```
POST http://your-domain/metrics
```

Example payload (matches NodePulse agent format):

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

## Configuring NodePulse Agents

Update your NodePulse agent configuration (`/etc/node-pulse/nodepulse.yml`):

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

### Backend (Go-Gin)

```bash
cd backend
go mod download
go run cmd/main.go
```

### Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
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
docker compose up -d --build backend

# Rebuild all services
docker compose up -d --build
```

## Troubleshooting

### Services won't start

Check logs for specific services:

```bash
docker compose logs backend
docker compose logs postgres
docker compose logs frontend
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
   docker compose exec backend sh
   # Inside container:
   # Try connecting to postgres
   ```

### Valkey connection issues

```bash
docker compose logs valkey
docker compose exec valkey valkey-cli ping
```

### Frontend won't load

1. Check if Next.js is building correctly:

   ```bash
   docker compose logs frontend
   ```

2. Ensure backend is accessible:
   ```bash
   curl http://localhost:8080/health
   ```

## Production Deployment

For production:

1. Update all secrets in `.env`
2. Use `production` target in frontend Dockerfile
3. Set `GIN_MODE=release`
4. Configure proper domain in Caddyfile
5. Enable HTTPS in Caddy
6. Set up proper backup strategy for PostgreSQL
7. Configure monitoring and alerting
8. Review and update Ory Kratos security settings

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
