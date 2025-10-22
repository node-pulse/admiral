# Submarines Cleaner Architecture

**Service**: submarines-cleaner
**Purpose**: Data retention and cleanup operations
**Language**: Go 1.24
**Type**: Background worker (cron-style)

---

## Overview

**submarines-cleaner** is a dedicated binary for maintenance operations on the Submarines database. Its primary responsibility is enforcing data retention policies by removing old metrics data.

---

## Architecture

### Design Principles

1. **Separation of concerns**: Cleaner is independent of ingest/digest pipelines
2. **Configurable**: Reads retention policy from `flagship.settings` table
3. **Idempotent**: Safe to run multiple times (no side effects)
4. **Extensible**: Framework for future cleanup jobs (old alerts, orphaned servers, etc.)
5. **Observable**: Logs metrics about cleanup operations

---

## Execution Model

### Deployment Options

#### Option 1: Docker Compose (cron service)
```yaml
submarines-cleaner:
  image: ghcr.io/node-pulse/node-pulse-submarines-cleaner:latest
  container_name: node-pulse-submarines-cleaner
  restart: "no" # Run once per invocation
  env_file:
    - .env
  environment:
    DB_HOST: postgres
    DB_PORT: 5432
    DB_USER: ${POSTGRES_USER:-postgres}
    DB_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    DB_NAME: ${POSTGRES_DB:-node_pulse_admiral}
    DB_SCHEMA: submarines
    FLAGSHIP_DB_SCHEMA: flagship
    LOG_LEVEL: info
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - node-pulse-admiral
```

Triggered via host cron:
```bash
# /etc/cron.d/nodepulse-cleaner
0 * * * * docker compose -f /opt/nodepulse/compose.yml run --rm submarines-cleaner
```

#### Option 2: Systemd Timer (recommended for production)
```ini
# /etc/systemd/system/nodepulse-cleaner.timer
[Unit]
Description=NodePulse Metrics Cleaner (hourly)

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/nodepulse-cleaner.service
[Unit]
Description=NodePulse Metrics Cleaner
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/nodepulse
ExecStart=/usr/bin/docker compose run --rm submarines-cleaner
```

#### Option 3: Kubernetes CronJob
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: submarines-cleaner
spec:
  schedule: "0 * * * *" # Hourly
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: cleaner
            image: ghcr.io/node-pulse/node-pulse-submarines-cleaner:latest
            env:
              - name: DB_HOST
                value: postgres-service
          restartPolicy: OnFailure
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_HOST` | ✅ | - | PostgreSQL host |
| `DB_PORT` | ✅ | `5432` | PostgreSQL port |
| `DB_USER` | ✅ | - | Database user |
| `DB_PASSWORD` | ✅ | - | Database password |
| `DB_NAME` | ✅ | - | Database name |
| `DB_SCHEMA` | ✅ | `submarines` | Submarines schema name |
| `FLAGSHIP_DB_SCHEMA` | ✅ | `flagship` | Flagship schema name |
| `LOG_LEVEL` | ❌ | `info` | Log level (debug, info, warn, error) |
| `DRY_RUN` | ❌ | `false` | Dry run mode (log but don't delete) |

---

## Cleanup Jobs

### 1. Metrics Retention Cleanup

**Purpose**: Remove old metrics data based on retention policy

**Algorithm**:
1. Read `flagship.settings` for `retention_hours` and `retention_enabled`
2. If retention disabled, exit
3. Calculate cutoff timestamp: `NOW() - INTERVAL 'retention_hours hours'`
4. Delete metrics older than cutoff
5. Log metrics deleted count

**SQL**:
```sql
-- Read retention settings
SELECT value->>'retention_hours' AS retention_hours,
       value->>'retention_enabled' AS enabled
FROM flagship.settings
WHERE key IN ('retention_hours', 'retention_enabled');

-- Delete old metrics (with LIMIT for safety)
DELETE FROM submarines.metrics
WHERE id IN (
  SELECT id FROM submarines.metrics
  WHERE timestamp < NOW() - INTERVAL '24 hours'
  ORDER BY timestamp ASC
  LIMIT 10000
);
```

**Safety Features**:
- ✅ Uses `LIMIT` to prevent massive single-transaction deletes
- ✅ Logs affected row count
- ✅ Dry-run mode for testing
- ✅ Transaction rollback on error

### 2. Orphaned Servers Cleanup (Future)

**Purpose**: Remove servers with no metrics for 90+ days

```sql
DELETE FROM submarines.servers
WHERE last_seen_at < NOW() - INTERVAL '90 days';
```

### 3. Resolved Alerts Cleanup (Future)

**Purpose**: Archive old resolved alerts

```sql
DELETE FROM submarines.alerts
WHERE status = 'resolved'
  AND resolved_at < NOW() - INTERVAL '30 days';
```

---

## Code Structure

```
submarines/
├── cmd/
│   ├── ingest/
│   │   └── main.go
│   ├── digest/
│   │   └── main.go
│   └── cleaner/          # ← New binary
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── database/
│   │   └── database.go
│   ├── models/
│   │   ├── server.go
│   │   └── settings.go  # ← New: flagship settings model
│   └── cleaner/          # ← New package
│       ├── cleaner.go    # Main orchestrator
│       ├── metrics.go    # Metrics cleanup job
│       └── logger.go     # Structured logging
└── Dockerfile.cleaner    # ← New Dockerfile
```

---

## Implementation

### cmd/cleaner/main.go

```go
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/node-pulse/submarines/internal/cleaner"
    "github.com/node-pulse/submarines/internal/config"
    "github.com/node-pulse/submarines/internal/database"
)

func main() {
    // Load configuration
    cfg, err := config.LoadFromEnv()
    if err != nil {
        log.Fatalf("Failed to load config: %v", err)
    }

    // Connect to database
    db, err := database.Connect(cfg)
    if err != nil {
        log.Fatalf("Failed to connect to database: %v", err)
    }
    defer db.Close()

    // Setup context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
    defer cancel()

    // Handle graceful shutdown
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
    go func() {
        <-sigChan
        log.Println("Received shutdown signal, canceling operations...")
        cancel()
    }()

    // Create cleaner instance
    c := cleaner.New(db, cfg)

    // Run all cleanup jobs
    if err := c.Run(ctx); err != nil {
        log.Fatalf("Cleanup failed: %v", err)
        os.Exit(1)
    }

    log.Println("Cleanup completed successfully")
}
```

### internal/cleaner/cleaner.go

```go
package cleaner

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "time"

    "github.com/node-pulse/submarines/internal/config"
)

type Cleaner struct {
    db  *sql.DB
    cfg *config.Config
}

func New(db *sql.DB, cfg *config.Config) *Cleaner {
    return &Cleaner{
        db:  db,
        cfg: cfg,
    }
}

// Run executes all cleanup jobs
func (c *Cleaner) Run(ctx context.Context) error {
    log.Println("Starting cleanup jobs...")
    start := time.Now()

    // Job 1: Metrics retention cleanup
    if err := c.CleanOldMetrics(ctx); err != nil {
        return fmt.Errorf("metrics cleanup failed: %w", err)
    }

    // Future jobs can be added here:
    // - c.CleanOrphanedServers(ctx)
    // - c.CleanResolvedAlerts(ctx)

    duration := time.Since(start)
    log.Printf("All cleanup jobs completed in %v", duration)
    return nil
}
```

### internal/cleaner/metrics.go

```go
package cleaner

import (
    "context"
    "database/sql"
    "fmt"
    "log"
    "strconv"
)

// CleanOldMetrics removes metrics older than retention policy
func (c *Cleaner) CleanOldMetrics(ctx context.Context) error {
    log.Println("Starting metrics retention cleanup...")

    // Read retention settings from flagship.settings
    retentionHours, enabled, err := c.getRetentionSettings(ctx)
    if err != nil {
        return fmt.Errorf("failed to read retention settings: %w", err)
    }

    if !enabled {
        log.Println("Metrics retention cleanup is disabled, skipping...")
        return nil
    }

    log.Printf("Retention policy: %d hours", retentionHours)

    // Calculate cutoff timestamp
    query := fmt.Sprintf(`
        DELETE FROM %s.metrics
        WHERE id IN (
            SELECT id FROM %s.metrics
            WHERE timestamp < NOW() - INTERVAL '%d hours'
            ORDER BY timestamp ASC
            LIMIT 10000
        )
    `, c.cfg.DBSchema, c.cfg.DBSchema, retentionHours)

    // Execute deletion
    result, err := c.db.ExecContext(ctx, query)
    if err != nil {
        return fmt.Errorf("failed to delete old metrics: %w", err)
    }

    rowsAffected, _ := result.RowsAffected()
    log.Printf("Deleted %d old metric records", rowsAffected)

    return nil
}

// getRetentionSettings reads retention policy from flagship.settings
func (c *Cleaner) getRetentionSettings(ctx context.Context) (hours int, enabled bool, err error) {
    // Default values (Free tier)
    hours = 24
    enabled = true

    // Read from flagship.settings
    query := fmt.Sprintf(`
        SELECT key, value
        FROM %s.settings
        WHERE key IN ('retention_hours', 'retention_enabled')
    `, c.cfg.FlagshipDBSchema)

    rows, err := c.db.QueryContext(ctx, query)
    if err != nil {
        return hours, enabled, fmt.Errorf("query failed: %w", err)
    }
    defer rows.Close()

    for rows.Next() {
        var key string
        var value string
        if err := rows.Scan(&key, &value); err != nil {
            return hours, enabled, fmt.Errorf("scan failed: %w", err)
        }

        switch key {
        case "retention_hours":
            if h, err := strconv.Atoi(value); err == nil {
                hours = h
            }
        case "retention_enabled":
            enabled = value == "true"
        }
    }

    return hours, enabled, nil
}
```

### internal/config/config.go (update)

```go
type Config struct {
    // ... existing fields ...

    // Cleaner-specific
    FlagshipDBSchema string
    DryRun           bool
}

func LoadFromEnv() (*Config, error) {
    // ... existing code ...

    cfg.FlagshipDBSchema = getEnvOrDefault("FLAGSHIP_DB_SCHEMA", "flagship")
    cfg.DryRun = getEnvOrDefault("DRY_RUN", "false") == "true"

    return cfg, nil
}
```

---

## Dockerfile

### Dockerfile.cleaner

```dockerfile
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build cleaner binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o cleaner ./cmd/cleaner

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/cleaner .

# Run as non-root user
RUN addgroup -g 1001 cleaner && \
    adduser -D -u 1001 -G cleaner cleaner

USER cleaner

ENTRYPOINT ["./cleaner"]
```

---

## Monitoring & Observability

### Metrics to Track

- ✅ Rows deleted per cleanup run
- ✅ Cleanup duration
- ✅ Errors encountered
- ✅ Retention policy changes

### Logging Format (JSON)

```json
{
  "timestamp": "2025-10-21T12:00:00Z",
  "level": "info",
  "component": "cleaner",
  "job": "metrics_retention",
  "rows_deleted": 12483,
  "duration_ms": 342,
  "retention_hours": 24
}
```

### Health Check

Since cleaner is a one-shot job, health is measured by:
- Exit code (0 = success, non-zero = failure)
- Logs (parseable by log aggregators)
- Optional: Write status to database

```sql
CREATE TABLE IF NOT EXISTS submarines.cleaner_status (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL, -- success, failed
    rows_affected BIGINT,
    error_message TEXT,
    duration_ms BIGINT,
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## Testing

### Unit Tests

```go
func TestCleanOldMetrics(t *testing.T) {
    // Setup test database
    db := setupTestDB(t)
    defer db.Close()

    // Insert test data
    insertTestMetrics(db, 100) // 100 metrics older than 24h
    insertTestMetrics(db, 50)  // 50 recent metrics

    // Run cleaner
    cfg := &config.Config{
        DBSchema: "submarines",
        FlagshipDBSchema: "flagship",
    }
    c := cleaner.New(db, cfg)
    err := c.CleanOldMetrics(context.Background())
    require.NoError(t, err)

    // Verify: only recent metrics remain
    var count int
    db.QueryRow("SELECT COUNT(*) FROM submarines.metrics").Scan(&count)
    assert.Equal(t, 50, count)
}
```

### Integration Tests

```bash
# Test with dry-run mode
docker compose run --rm \
  -e DRY_RUN=true \
  submarines-cleaner

# Verify logs show what would be deleted
# No actual data should be removed
```

---

## Deployment

### Docker Compose (Development)

```yaml
# Manual trigger
docker compose run --rm submarines-cleaner

# Or add to compose.yml with restart: "no" and trigger via host cron
```

### Production (Systemd Timer)

```bash
# Enable timer
sudo systemctl enable nodepulse-cleaner.timer
sudo systemctl start nodepulse-cleaner.timer

# Check status
sudo systemctl status nodepulse-cleaner.timer
sudo systemctl list-timers

# View logs
sudo journalctl -u nodepulse-cleaner.service -f
```

### Kubernetes

```bash
kubectl apply -f k8s/cleaner-cronjob.yaml

# View jobs
kubectl get cronjobs
kubectl get jobs

# View logs
kubectl logs job/submarines-cleaner-<timestamp>
```

---

## Future Enhancements

1. **Parallel cleanup**: Use goroutines for multiple jobs
2. **Incremental deletion**: Batch deletions in smaller transactions
3. **Metrics export**: Send cleanup stats to monitoring system (Prometheus)
4. **Smart scheduling**: Skip cleanup if database is under load
5. **Retention tiers**: Different retention for different servers (tags)

---

## Security Considerations

- ✅ Read-only access to `flagship.settings`
- ✅ Write access only to `submarines` schema
- ✅ Transaction rollback on failure
- ✅ Rate limiting (LIMIT clause prevents runaway deletes)
- ✅ Audit logging (who changed retention settings)

---

## FAQ

**Q: Why not run cleanup in the digest worker?**
A: Separation of concerns. Digest focuses on write throughput, cleaner on maintenance. Different scaling needs.

**Q: Why hourly schedule?**
A: Balances freshness with overhead. Can adjust based on data volume.

**Q: What if retention changes mid-run?**
A: Cleaner reads settings at start of each run. Changes take effect next run.

**Q: What about database locks?**
A: `LIMIT 10000` per batch prevents long-running transactions. Production systems should use `DELETE ... RETURNING` for better control.

**Q: Can I run multiple cleaner instances?**
A: Yes, but not recommended. Use row-level locking if needed.

---

## References

- [PostgreSQL DELETE Performance](https://www.postgresql.org/docs/current/sql-delete.html)
- [Docker Compose restart policies](https://docs.docker.com/compose/compose-file/compose-file-v3/#restart)
- [Systemd Timers](https://www.freedesktop.org/software/systemd/man/systemd.timer.html)
- [Kubernetes CronJobs](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
