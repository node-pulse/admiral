# Node Pulse Admiral

A comprehensive agent fleet management dashboard for monitoring NodePulse agents across your infrastructure.

## Architecture

This project uses Docker Compose to orchestrate multiple services:

- **Submarines (Go-Gin)**: High-performance API server producing 3 binary files (api, worker, migrator)
- **Flagship (Rails 8)**: Event-driven message queue consumer using Karafka 2.5+
- **Cruiser (Next.js)**: Modern React-based dashboard UI (secondary service)
- **PostgreSQL 18**: Main database with separate schemas for each service
- **Apache Kafka**: Message broker for event streaming
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

- **Cruiser (Frontend)**: http://localhost:3000
- **Submarines (Backend API)**: http://localhost:8080
- **Kafka**: localhost:9092
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

### Submarines (Go-Gin Backend)

```bash
cd submarines
go mod download

# Run API server
go run cmd/api/main.go

# Run background worker
go run cmd/worker/main.go

# Run database migrator
go run cmd/migrator/main.go
```

### Flagship (Rails/Karafka Consumer)

```bash
cd flagship
bundle install

# Start Rails server (optional, for web UI)
bundle exec rails server

# Start Karafka consumer (main process)
bundle exec karafka server

# Karafka commands
bundle exec karafka info       # Show configuration
bundle exec karafka console    # Interactive console
```

### Cruiser (Next.js Frontend)

```bash
cd cruiser
npm install
npm run dev
```

## Karafka Integration

Flagship uses **Karafka 2.5+** for consuming Kafka messages. Key features:

- **Multi-threaded processing**: Concurrent message handling
- **Rails integration**: Code reload in development
- **Dead letter queue**: Built-in error handling
- **Instrumentation**: Logging and monitoring

### Creating Kafka Consumers

1. Create a consumer class in `flagship/app/consumers/`:

```ruby
# app/consumers/metrics_consumer.rb
class MetricsConsumer < ApplicationConsumer
  def consume
    messages.each do |message|
      payload = JSON.parse(message.payload)
      # Process your data
    end
  end
end
```

2. Add route in `flagship/karafka.rb`:

```ruby
routes.draw do
  topic :metrics do
    consumer MetricsConsumer
  end
end
```

3. Start the consumer:

```bash
bundle exec karafka server
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

### Kafka connection issues

```bash
# Check Kafka logs
docker compose logs kafka

# Check if Kafka is accessible
docker compose exec kafka kafka-topics --list --bootstrap-server localhost:9092
```

### Valkey connection issues

```bash
docker compose logs valkey
docker compose exec valkey valkey-cli ping
```

### Flagship (Karafka) issues

1. Check Karafka consumer logs:

   ```bash
   docker compose logs flagship
   ```

2. Verify Kafka connectivity from Flagship:
   ```bash
   docker compose exec flagship bundle exec karafka info
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
2. Configure Kafka bootstrap servers for production
3. Set Karafka group_id to unique application name in `flagship/karafka.rb`
4. Use `production` target in Dockerfiles
5. Set `GIN_MODE=release` for Submarines
6. Set `RAILS_ENV=production` for Flagship
7. Configure proper domain in Caddyfile
8. Enable HTTPS in Caddy
9. Set up proper backup strategy for PostgreSQL
10. Configure monitoring and alerting
11. Review and update Ory Kratos security settings
12. Scale Kafka consumers based on topic partitions

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
