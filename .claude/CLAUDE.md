# NodePulse Dashboard - Claude Context

## Project Overview

**NodePulse Dashboard** is an agent fleet management system for monitoring Linux servers. It consists of:

1. **NodePulse Agent** (Go) - Lightweight monitoring agent deployed on Linux servers
   - Located in: `../agent/`
   - Collects: CPU, memory, network, uptime metrics
   - Sends metrics via HTTP to the dashboard backend

2. **Dashboard Backend** (Go-Gin) - API server for ingesting and serving metrics
   - Located in: `backend/`
   - Receives metrics from agents
   - Stores data in PostgreSQL
   - Provides REST API for frontend

3. **Dashboard Frontend** (Next.js) - Web UI for fleet visualization
   - Located in: `frontend/`
   - Displays server metrics and status
   - Uses Better Auth for authentication

## Architecture

```
┌─────────────────┐
│  Linux Servers  │
│  (NodePulse     │
│   Agents)       │
└────────┬────────┘
         │ HTTP POST /metrics
         │
         ▼
┌─────────────────────────────────────────┐
│         Docker Compose Stack             │
│                                          │
│  ┌──────────┐  ┌──────────┐            │
│  │  Caddy   │  │ Next.js  │            │
│  │  :80     │  │  :3000   │            │
│  └────┬─────┘  └────┬─────┘            │
│       │             │                   │
│       │    ┌────────▼─────────┐        │
│       │    │   Go-Gin Backend │        │
│       │    │      :8080        │        │
│       │    └────────┬──────────┘        │
│       │             │                   │
│  ┌────▼─────┐  ┌───▼────┐  ┌────────┐ │
│  │Ory Kratos│  │PostgreSQL│ │ Valkey │ │
│  │ :4433/34 │  │  :5432   │ │ :6379  │ │
│  └──────────┘  └──────────┘ └────────┘ │
│                                          │
│  ┌──────────┐                           │
│  │  pgweb   │                           │
│  │  :8081   │                           │
│  └──────────┘                           │
└─────────────────────────────────────────┘
```

## Database Schemas

PostgreSQL has 3 separate schemas:

1. **`better_auth`** - Next.js authentication (Better Auth)
   - `users`, `accounts`, `sessions`, `verification_tokens`

2. **`kratos`** - Ory Kratos identity tables (auto-managed)

3. **`backend`** - Application data
   - `servers` - Agent/server registry
   - `metrics` - Time-series metrics data
   - `alerts` - Alert records
   - `alert_rules` - Alert configurations
   - `buffered_metrics` - Failed agent reports

## Current Protocol

The agent currently sends metrics using a **simple JSON format** (see `../agent/README.md`):

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

**Endpoint**: `POST /metrics`

## Future Protocol: NPI v1

A more advanced **NodePulse Envelope Protocol (NPI)** is being designed:

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

### Backend
- **Language**: Go 1.23
- **Framework**: Gin (HTTP router)
- **Database**: PostgreSQL 18 with separate schemas
- **Cache**: Valkey (Redis-compatible)
- **Auth**: Ory Kratos for identity management

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI**: Tailwind CSS + shadcn/ui components
- **Auth**: Better Auth
- **Language**: TypeScript

### Infrastructure
- **Container**: Docker Compose
- **Proxy**: Caddy 2
- **Admin Tools**: pgweb for database inspection

## Key Files

### Backend
- `backend/main.go` - Application entry point
- `backend/internal/handlers/metrics.go` - Metrics ingestion logic
- `backend/internal/models/server.go` - Data models
- `backend/internal/database/database.go` - PostgreSQL client
- `backend/internal/valkey/valkey.go` - Valkey client
- `backend/internal/config/config.go` - Configuration management

### Frontend
- `frontend/src/app/page.tsx` - Dashboard home page
- `frontend/src/lib/auth.ts` - Better Auth configuration
- `frontend/src/app/api/auth/[...all]/route.ts` - Auth API handler

### Infrastructure
- `compose.yml` - Docker Compose services definition
- `Caddyfile` - Reverse proxy configuration
- `init-db/` - PostgreSQL schema initialization
- `kratos/` - Ory Kratos configuration

## Development Workflow

1. **Start services**: `docker compose up -d`
2. **View logs**: `docker compose logs -f [service]`
3. **Restart service**: `docker compose restart [service]`
4. **Rebuild**: `docker compose up -d --build [service]`

### Local Backend Development

```bash
cd backend
go mod download
go run main.go
```

### Local Frontend Development

```bash
cd frontend
npm install
npm run dev
```

## Agent Integration

Agents send metrics to: `http://dashboard-host/metrics`

Configure agent (`/etc/node-pulse/nodepulse.yml`):

```yaml
server:
  endpoint: "http://your-dashboard/metrics"
  timeout: 3s

agent:
  server_id: "auto-generated-uuid"
  interval: 5s
```

## API Endpoints

### Current (v1)
- `POST /metrics` - Agent metrics ingestion
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

## Future Enhancements

1. **NPI Protocol**: Implement full envelope-based protocol
2. **Active Probing**: HTTP/TCP/ICMP health checks
3. **Security Logging**: SSH failures, port changes, file integrity
4. **Alerting**: Rule-based alerting system (partially implemented)
5. **WebSocket**: Real-time agent communication
6. **Multi-tenancy**: Organization/team isolation
7. **Retention Policies**: Automated old data cleanup
8. **Data Aggregation**: Pre-compute hourly/daily rollups

## Contact & Support

- **Project**: NodePulse Agent Fleet Management
- **Status**: Development / MVP
- **License**: MIT
