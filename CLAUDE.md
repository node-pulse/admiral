# Node Pulse Dashboard - Claude Context

## ⚠️ CRITICAL RULES

**DATABASE ACCESS: READ ONLY**
- You have READ ONLY permission to the database
- NEVER run UPDATE, DELETE, INSERT, DROP, ALTER, TRUNCATE, or any other modification commands
- ALWAYS ask the user for explicit permission before suggesting database modifications
- Only SELECT queries are allowed without permission

## Project Overview

**Node Pulse Dashboard** is an agent fleet management system for monitoring Linux servers. It consists of:

1. **Submarines** (Go-Gin) - High-performance metrics ingestion pipeline

   - Located in: `submarines/`
   - **Ingest**: Receives metrics from agents via HTTP, publishes to Valkey Streams
   - **Digest**: Consumes from Valkey Streams, writes to PostgreSQL
   - Handles 1000+ concurrent agent connections
   - **Completely independent from Flagship** (only shares PostgreSQL)

2. **Flagship** (Laravel 12) - Web dashboard and management UI

   - Located in: `flagship/`
   - CRUD operations, charts, authentication
   - Uses Inertia.js with React for frontend
   - Reads from PostgreSQL (written by Submarines workers)
   - Pure web application

## Architecture

```
┌─────────────────┐
│  Linux Servers  │
│  (Agents from   │
│  separate repo) │
└────────┬────────┘
         │ HTTP POST /metrics
         │
         ▼
┌────────────────────────────────────────────────────────┐
│         Docker Compose Stack (Admiral)                 │
│                                                         │
│  ┌────────────────────────────────┐                    │
│  │  Submarines (Go-Gin)           │                    │
│  │  ┌──────────┐   ┌───────────┐ │                    │
│  │  │ Ingest   │   │  Digest   │ │                    │
│  │  │ :8080    │   │ (bg proc) │ │                    │
│  │  └────┬─────┘   └─────▲─────┘ │                    │
│  └───────┼───────────────┼───────┘                    │
│          │ Publish       │ Consume                     │
│          ▼               │                             │
│  ┌────────────────────────┘                            │
│  │  Valkey Streams :6379                               │
│  │  (Message Buffer)                                   │
│  └────────────┬────────────────────────────────┐       │
│               │ Batch Write                    │       │
│               ▼                                │       │
│  ┌──────────────────────┐                     │       │
│  │   PostgreSQL :5432   │                     │       │
│  │   (admiral schema)   │                     │       │
│  └──────────┬───────────┘                     │       │
│             │ Eloquent ORM queries            │       │
│             ▼                                  │       │
│  ┌──────────────────────┐                     │       │
│  │  Flagship (Laravel)  │                     │       │
│  │  :8000 (dev)         │                     │       │
│  │  :9000 (php-fpm)     │                     │       │
│  └──────────┬───────────┘                     │       │
│             │                                  │       │
│             ▼                                  ▼       │
│  ┌────────────────────────────────────────────────┐   │
│  │  Caddy Reverse Proxy :80/:443                  │   │
│  └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
         ▲
         │ HTTPS
   Users' Browsers
```

## Database Schemas

PostgreSQL has 1 main schema:

1. **`admiral`** - Application data (shared by Submarines and Flagship)
   - `servers` - Agent/server registry
   - `metric_samples` - **Prometheus-native time-series metrics** (JSONB labels, unlimited metrics)
   - `alerts` - Alert records
   - `alert_rules` - Alert configurations
   - `users` - User accounts (Laravel Fortify authentication)
   - `sessions` - User sessions
   - `ssh_sessions` - SSH session audit logs
   - `private_keys` - SSH private keys for server access

## Current Protocol: Prometheus Format (Primary)

**The system now uses Prometheus text format as the primary metric format.**

Agents scrape Prometheus exporters (like `node_exporter`) and push metrics to:

**Endpoint**: `POST /metrics/prometheus`

Example Prometheus text format:
```
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 123456.78
node_cpu_seconds_total{cpu="0",mode="system"} 12345.67
node_memory_MemTotal_bytes 8589934592
node_memory_MemAvailable_bytes 4294967296
```

### Database Schema (Prometheus-First)

The `metric_samples` table stores Prometheus metrics natively:

```sql
CREATE TABLE admiral.metric_samples (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,        -- e.g., "node_cpu_seconds_total"
    metric_type TEXT NOT NULL,        -- counter, gauge, histogram, summary
    labels JSONB DEFAULT '{}'::jsonb, -- e.g., {"cpu": "0", "mode": "idle"}
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    help_text TEXT,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- Native JSONB label support for multi-dimensional metrics
- Works with ANY Prometheus exporter (node, postgres, redis, etc.)
- Dashboard queries directly from `metric_samples` table
- No views needed - flexibility at query time

### Legacy JSON Protocol (Deprecated)

The old JSON format is deprecated but may still be supported:

**Endpoint**: `POST /metrics` (legacy)

```json
{
  "timestamp": "2025-10-13T14:30:00Z",
  "server_id": "uuid",
  "hostname": "server-01",
  "system_info": {...},
  "cpu": {"usage_percent": 45.2},
  "memory": {...},
  "network": {...},
  "uptime": {...}
}
```

## Future Protocol: NPI v1

A more advanced **Node Pulse Envelope Protocol (NPI)** is being designed:

- **Specification**: `.claude/docs/node-pulse-ingest-protocol.md`
- **OpenAPI Schema**: `.claude/docs/npi.yml`

### NPI Features

- **Envelope-based**: Batch multiple items in one message
- **Extensible**: Supports multiple item types (heartbeat, metrics, probe_result, sec_log)
- **Secure**: HMAC signatures, JWT auth, replay protection
- **Versioned**: Protocol versioning for backward compatibility
- **Transport-agnostic**: HTTP, WebSocket, or gRPC

### NPI Structure

```json
{
  "protocol": "npi",
  "version": "1.0",
  "agent": {
    "id": "agt_7Yp2",
    "capabilities": ["metrics","probe","sec_log"]
  },
  "seq": 4182,
  "ts": 1739452800123,
  "items": [
    {"type": "heartbeat", ...},
    {"type": "metrics", ...}
  ]
}
```

**Future Endpoint**: `POST /v1/ingest`

## Technology Stack

### Submarines (Backend)

- **Language**: Go 1.24
- **Framework**: Gin (HTTP router)
- **Output**: 2 binary files (ingest, worker)
- **Database**: PostgreSQL 18 (submarines schema)
- **Message Buffer**: Valkey Streams (decouples HTTP ingestion from DB writes)
- **Architecture**:
  - **Ingest**: Fast HTTP endpoint → Publishes to Valkey Stream (~5ms response)
  - **Digest**: Consumes from Valkey Stream → Batch writes to PostgreSQL
- **Purpose**: High-throughput metrics ingestion from agents only

### Flagship (Web Dashboard)

- **Language**: PHP 8.2+
- **Framework**: Laravel 12
- **Frontend**: Inertia.js + React 19 + TypeScript
- **UI Components**: Radix UI + Tailwind CSS
- **Database**: PostgreSQL 18
- **Authentication**: Laravel Fortify
- **Features**:
  - Reads metrics data written by Submarines workers
  - CRUD operations for servers, alerts, configurations
  - SSH key management and session handling
  - Charts and visualizations (using Eloquent ORM queries)
  - CAPTCHA support (reCAPTCHA/Turnstile)
  - Pure web application

### Infrastructure

- **Container**: Docker Compose
- **Proxy**: Caddy 2
- **Message Buffer**: Valkey Streams (Redis-compatible)

## Key Files

### Submarines (Metrics Ingestion)

- `submarines/cmd/ingest/main.go` - HTTP server receiving agent metrics
- `submarines/cmd/digest/main.go` - Background digest consuming from Valkey Stream
- `submarines/internal/handlers/metrics.go` - Metrics ingestion logic
- `submarines/internal/models/server.go` - Data models
- `submarines/internal/database/database.go` - PostgreSQL client
- `submarines/internal/valkey/valkey.go` - Valkey client with Streams support
- `submarines/internal/config/config.go` - Configuration management

### Flagship (Laravel)

- `flagship/app/Http/Controllers/` - API and web controllers
- `flagship/app/Models/` - Eloquent models (Server, Metric, Alert, etc.)
- `flagship/resources/js/` - React/Inertia.js frontend components
- `flagship/routes/` - API and web routes
- `flagship/config/` - Laravel configuration files
- `flagship/composer.json` - PHP dependencies

### Infrastructure

- `compose.yml` - Docker Compose services definition
- `caddy/Caddyfile` - Reverse proxy configuration
- `migrate/` - PostgreSQL schema migrations

## Development Workflow

1. **Start services**: `docker compose up -d`
2. **View logs**: `docker compose logs -f [service]`
3. **Restart service**: `docker compose restart [service]`
4. **Rebuild**: `docker compose up -d --build [service]`

### Local Submarines Development

```bash
cd submarines
go mod download

# Run ingest server (receives agent metrics)
go run cmd/ingest/main.go

# Run digest (consumes from Valkey Stream, writes to PostgreSQL)
go run cmd/digest/main.go
```

### Local Flagship Development

```bash
cd flagship
composer install
npm install

# Run development server (with Vite, Queue, and Logs)
composer dev

# Or start services individually
php artisan serve              # Start Laravel server
npm run dev                    # Start Vite dev server
php artisan queue:listen       # Start queue worker
php artisan pail               # View logs
```

## Agent Integration

### Current: Prometheus Exporters + Agent

The recommended deployment model:

1. **node_exporter** runs on target server (port 9100, localhost only)
2. **Node Pulse Agent** (refactored) scrapes node_exporter and pushes to Submarines
3. Agent buffers metrics locally (WAL) for reliability

Configure agent (`/etc/nodepulse/nodepulse.yml`):

```yaml
# Prometheus scraper configuration
scrapers:
  prometheus:
    enabled: true
    endpoints:
      - url: "http://127.0.0.1:9100/metrics"
        name: "node_exporter"
        interval: 15s

# Server configuration
server:
  endpoint: "https://dashboard.example.com/metrics/prometheus"
  format: "prometheus"  # Options: "prometheus" or "json" (legacy)
  timeout: 10s

# Agent behavior
agent:
  server_id: "auto-generated-uuid"
  interval: 15s  # How often to scrape and push

# Buffering (WAL)
buffer:
  enabled: true
  retention_hours: 48
  max_size_mb: 100
```

### Deployment via Ansible

Use the Ansible roles to deploy both node_exporter and the agent:

```bash
# Deploy node_exporter
ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-node-exporter.yml

# Deploy Node Pulse Agent
ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent.yml
```

## API Endpoints

### Current (Prometheus)

- `POST /metrics/prometheus` - **Primary endpoint** for Prometheus text format metrics
- `POST /metrics` - Legacy JSON format (deprecated)
- `GET /api/servers` - List all servers
- `GET /api/servers/:id/metrics` - Get server metrics
- `GET /health` - Health check

### Future (NPI v1)

- `POST /v1/ingest` - NPI envelope ingestion
- `GET /v1/agents/{id}/tasks` - Fetch pending tasks for agent
- `GET /v1/health` - Health check

## Important Conventions

### Go Code Style

- All application code in `internal/` (not importable externally)
- Models use standard Go naming (PascalCase for exported, camelCase for unexported)
- Database queries use standard `database/sql` (no ORM)
- Error handling with wrapped errors (`fmt.Errorf("...: %w", err)`)

### Database

- Use prepared statements for security
- Separate schemas for logical isolation
- Timestamps use `TIMESTAMP WITH TIME ZONE`
- UUIDs for all entity IDs

### Frontend

- TypeScript strict mode
- Server components by default
- Client components when needed (`'use client'`)
- Tailwind for styling

## Common Tasks

### Add New Metric Type

1. Update `backend/internal/models/server.go` with new fields
2. Update `backend/init-db/03-backend-schema.sql` schema
3. Update `backend/internal/handlers/metrics.go` ingestion logic
4. Rebuild: `docker compose up -d --build backend`

### Add New API Endpoint

1. Add handler in `backend/internal/handlers/`
2. Register route in `backend/main.go`
3. Update frontend to consume endpoint

### Migrate to NPI Protocol

1. Update backend handlers to accept NPI envelope format
2. Add envelope validation and item dispatch
3. Update agent to send NPI format
4. Deploy both simultaneously (protocol version check)

## Security Considerations

- **Authentication**: JWT-based for agents, Better Auth for users
- **Transport**: Always use HTTPS in production
- **Database**: Separate schemas limit blast radius
- **Secrets**: Store in `.env`, never commit
- **Rate Limiting**: Implement in Caddy or backend
- **Input Validation**: All agent inputs validated before storage

## Valkey Streams Integration

### Overview

Submarines uses **Valkey Streams** as a message buffer between HTTP ingestion and database writes. This architecture:

- ✅ Decouples agent connections from database load
- ✅ Handles traffic spikes gracefully
- ✅ Enables horizontal scaling of workers
- ✅ Minimal RAM overhead (~64-128 MB)

### Architecture Flow

```
Agent → HTTP POST → Ingest Binary → Valkey Stream → Digest Binary → PostgreSQL
         :8080      (Fast ACK)      (Buffer)        (Batch Write)
```

### Stream Configuration

- **Stream Key**: `nodepulse:metrics:stream`
- **Consumer Group**: `nodepulse-workers`
- **Batch Size**: 10 messages per read
- **Persistence**: AOF enabled for durability

### Message Format

```json
{
  "payload": "{...metric report JSON...}",
  "timestamp": "2025-10-19T12:34:56Z"
}
```

### Digest Behavior

1. Read from stream using consumer group (multiple digest instances supported)
2. Deserialize metric report
3. Begin PostgreSQL transaction
4. Upsert server record
5. Insert metrics record
6. Commit transaction
7. ACK message in stream

### Scaling Digest Instances

Run multiple digest instances for higher throughput:

```bash
# Digest 1
DIGEST_ID=digest-1 go run cmd/digest/main.go

# Digest 2
DIGEST_ID=digest-2 go run cmd/digest/main.go
```

## Future Enhancements

1. **NPI Protocol**: Implement full envelope-based protocol
2. **Active Probing**: HTTP/TCP/ICMP health checks
3. **Security Logging**: SSH failures, port changes, file integrity
4. **Alerting**: Rule-based alerting system (partially implemented)
5. **WebSocket**: Real-time agent communication
6. **Multi-tenancy**: Organization/team isolation
7. **Retention Policies**: Automated old data cleanup
8. **Data Aggregation**: Pre-compute hourly/daily rollups
9. **Digest Auto-scaling**: Scale digest instances based on stream lag

## Contact & Support

- **Project**: Node Pulse Agent Fleet Management
- **Status**: Development / MVP
- **License**: MIT
