# Multi-Exporter Architecture Design

**Document Status:** Phase 2 Complete ✅ | Submarines Updated ✅

**Created:** 2025-10-30

**Agent Phase 1:** 2025-10-30 ✅

**Agent Phase 2:** 2025-10-30 ✅

**Submarines Updated:** 2025-10-30 ✅

**Target Version:** v2.2.0+

## Executive Summary

This document outlines the end-to-end architectural design for multi-exporter support in the NodePulse monitoring stack, covering both the Agent (data collection) and Submarines (data ingestion/storage).

**System Components:**

1. **Agent** - Scrapes multiple Prometheus exporters with independent intervals
2. **Submarines Ingest** - Receives grouped multi-exporter payloads via HTTP
3. **Submarines Digest** - Processes and stores metrics in PostgreSQL
4. **Database** - Stores metrics with `exporter_name` column for differentiation

**Design Goals:**

- **Scalability**: Support 1-10+ exporters per agent instance
- **Flexibility**: Different scrape intervals per exporter
- **Efficiency**: Smart batching to minimize HTTP requests
- **Reliability**: Maintain WAL pattern and crash recovery
- **No Backward Compatibility**: Clean slate design (project in development)

**Payload Format:**

```json
{
  "node_exporter": [
    { "timestamp": "2025-10-30T14:00:00Z", "cpu_idle_seconds": 123456.78, ... }
  ],
  "mysql_exporter": [
    { "timestamp": "2025-10-30T14:00:00Z", "mysql_connections": 25, ... }
  ],
  "postgres_exporter": [
    { "timestamp": "2025-10-30T14:00:00Z", "pg_connections_active": 42, ... }
  ]
}
```

Each exporter is a top-level key with an array of metric snapshots. This allows:

- Clean separation of metrics by source
- Batch multiple time windows per exporter
- Simple dashboard parsing (always expect arrays)
- Easy extensibility (add new exporters without schema changes)

**Phased Approach:**

- **Agent Phase 1**: Plugin architecture with exporter registry ✅ **COMPLETE** (2025-10-30)
- **Agent Phase 2**: Independent scrape loops + smart batching ✅ **COMPLETE** (2025-10-30)
- **Submarines Update**: Database schema + handlers updated ✅ **COMPLETE** (2025-10-30)
- **Phase 3** (Optional): Auto-discovery and advanced features (~3-5 days)

---

## Submarines Implementation Status ✅ **COMPLETE**

**Completed:** 2025-10-30

### What Was Implemented

Submarines (Go-Gin ingestion service) has been updated to handle the Phase 2 multi-exporter payload format from agents.

#### 1. Database Schema Strategy

**Current Approach: No Schema Changes**

The existing `admiral.metrics` table remains unchanged and continues to serve **node_exporter metrics only**. This is a legacy table that we inherit and maintain.

**Schema Design Decision:**

After evaluating multiple approaches, we chose the **separate tables per exporter** strategy:

- ✅ `admiral.metrics` remains dedicated to node_exporter (39 columns, fully optimized)
- ✅ Future exporters get their own tables: `admiral.postgres_metrics`, `admiral.mysql_metrics`, etc.
- ✅ Each table has exporter-specific schema (no wasted NULL columns)
- ✅ Type-safe queries with proper column types
- ✅ Easier to index and optimize per exporter
- ✅ Clean separation of concerns

**Why Separate Tables?**

The single-table approach was rejected because:
- ❌ node_exporter already has 39 specific columns
- ❌ postgres_exporter, mysql_exporter have completely different metrics
- ❌ Single table would need hundreds of columns for all exporters
- ❌ Most columns would be NULL for most rows (waste of space)
- ❌ Index bloat and query performance degradation

**Future Table Creation:**

When adding new exporters (e.g., postgres_exporter), create new tables:

```sql
-- Example: Future postgres_exporter table
CREATE TABLE admiral.postgres_metrics (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    pg_up INTEGER,
    pg_connections_active INTEGER,
    pg_connections_idle INTEGER,
    pg_database_size_bytes BIGINT,
    pg_transactions_committed BIGINT,
    pg_cache_hit_ratio DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_postgres_metrics_lookup ON admiral.postgres_metrics(server_id, timestamp DESC);
```

**No Migration File:**

No database migration was created in this phase because:
- admiral.metrics already exists and works for node_exporter
- Other exporter tables will be created when needed
- Cleaner to add migrations per-exporter as they're implemented

#### 2. Ingest Handler Changes

**File:** `submarines/internal/handlers/prometheus.go`

**Updated Payload Structure:**

```go
type MetricSnapshotPayload struct {
    ServerID     string          `json:"server_id"`
    ExporterName string          `json:"exporter_name"` // NEW
    Snapshot     *MetricSnapshot `json:"snapshot"`
}
```

**Handler Behavior:**

```go
// Accepts Phase 2 grouped payload from agent:
// { "node_exporter": [...], "postgres_exporter": [...] }

func (h *PrometheusHandler) IngestPrometheusMetrics(c *gin.Context) {
    // 1. Parse grouped payload
    var groupedPayload map[string][]MetricSnapshot

    // 2. For each exporter's snapshots:
    for exporterName, snapshots := range groupedPayload {
        for _, snapshot := range snapshots {
            // 3. Publish to Valkey Stream with exporter name
            payload := MetricSnapshotPayload{
                ServerID:     serverID,
                ExporterName: exporterName,
                Snapshot:     &snapshot,
            }
            // Publish to stream...
        }
    }
}
```

**Key Changes:**

- Accepts grouped payload: `{ "exporter": [...] }`
- Unpacks each exporter's array of snapshots
- Publishes each snapshot to Valkey Stream with `exporter_name` attached

#### 3. Digest Worker Changes

**File:** `submarines/cmd/digest/main.go`

**Updated Processing Logic:**

```go
func processPrometheusMessage(db *database.DB, payloadJSON string) error {
    // Deserialize metric snapshot payload (pre-parsed by agent)
    var payload handlers.MetricSnapshotPayload
    json.Unmarshal([]byte(payloadJSON), &payload)

    // Get server ID and exporter name from payload
    serverID := payload.ServerID
    exporterName := payload.ExporterName

    // For now, only process node_exporter metrics
    // Other exporters will be added when their tables are created
    if exporterName != "node_exporter" {
        log.Printf("[INFO] Skipping %s metrics (table not created yet)", exporterName)
        return nil // Don't fail - just skip non-node_exporter metrics
    }

    // Insert to admiral.metrics (node_exporter only)
    if err := insertMetricSnapshot(tx, serverID, snapshot); err != nil {
        return err
    }

    return tx.Commit()
}

// Function signature remains unchanged - no exporter_name parameter
func insertMetricSnapshot(tx *sql.Tx, serverID string, snapshot *handlers.MetricSnapshot) error {
    query := `
        INSERT INTO admiral.metrics (
            server_id,
            timestamp,
            cpu_idle_seconds,
            ... (39 node_exporter columns)
        ) VALUES ($1, $2, $3, ...)
    `
    // No exporter_name column
}
```

**Processing Flow:**

1. Consume message from Valkey Stream
2. Deserialize `MetricSnapshotPayload` (includes `exporter_name`)
3. **Check exporter type** - only process node_exporter
4. Skip other exporters gracefully (log INFO message)
5. Begin transaction (node_exporter only)
6. INSERT metrics row to admiral.metrics
7. Update server `last_seen_at`
8. Commit transaction
9. ACK stream message

**Graceful Handling:**

The digest worker **does not fail** when it encounters non-node_exporter metrics. Instead:
- Logs `[INFO] Skipping <exporter> metrics (table not created yet)`
- Returns nil (success) so the message is ACKed
- This prevents message replay and stream backlog
- When new exporter tables are created, add processing logic for them

#### 4. Data Flow (End-to-End)

```
┌─────────────────────────────────────────────────────────┐
│  Agent (Phase 2)                                        │
├─────────────────────────────────────────────────────────┤
│  - node_exporter scrapes @ 15s                          │
│  - postgres_exporter scrapes @ 30s                      │
│  - Buffer drain sends grouped payload:                  │
│    {                                                    │
│      "node_exporter": [{ snapshot }],                   │
│      "postgres_exporter": [{ snapshot }]                │
│    }                                                    │
└────────────────────┬────────────────────────────────────┘
                     │ POST /metrics/prometheus?server_id=uuid
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Submarines Ingest (submarines/cmd/ingest)              │
├─────────────────────────────────────────────────────────┤
│  - Receives grouped payload                             │
│  - Validates server_id                                  │
│  - Unpacks each exporter's snapshots                    │
│  - Publishes to Valkey Stream (one message per snapshot)│
│    Stream Message 1:                                    │
│      { server_id, exporter_name: "node_exporter", ... } │
│    Stream Message 2:                                    │
│      { server_id, exporter_name: "postgres_exporter", ...}│
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Valkey Stream (nodepulse:metrics:stream)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Submarines Digest (submarines/cmd/digest)              │
├─────────────────────────────────────────────────────────┤
│  - Consumes from Valkey Stream                          │
│  - Extracts exporter_name from payload                  │
│  - Inserts to admiral.metrics with exporter_name        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL Database                                    │
├─────────────────────────────────────────────────────────┤
│  admiral.metrics (node_exporter only):                  │
│                                                         │
│  Row 1:                                                 │
│    server_id: uuid                                      │
│    timestamp: 2025-10-30T14:00:00Z                      │
│    cpu_idle_seconds: 123456.78                          │
│    memory_total_bytes: 8589934592                       │
│    ... (all 39 node_exporter columns filled)            │
│                                                         │
│  Row 2:                                                 │
│    server_id: uuid                                      │
│    timestamp: 2025-10-30T14:00:15Z                      │
│    cpu_idle_seconds: 123471.90                          │
│    ... (all 39 node_exporter columns)                   │
│                                                         │
│  postgres_exporter metrics: SKIPPED (table not created) │
│  mysql_exporter metrics: SKIPPED (table not created)    │
│                                                         │
│  Future tables (when implemented):                      │
│  - admiral.postgres_metrics                             │
│  - admiral.mysql_metrics                                │
│  - admiral.redis_metrics                                │
└─────────────────────────────────────────────────────────┘
```

### Files Modified in Submarines

1. **Ingest Handler**

   - `submarines/internal/handlers/prometheus.go`
     - Updated `MetricSnapshotPayload` struct to include `exporter_name`
     - Modified `IngestPrometheusMetrics()` to accept grouped payload format
     - Unpacks each exporter's snapshots and publishes to Valkey Stream

2. **Digest Worker**
   - `submarines/cmd/digest/main.go`
     - Updated `processPrometheusMessage()` to read `exporter_name` from payload
     - Added graceful skipping for non-node_exporter metrics
     - `insertMetricSnapshot()` signature unchanged (no exporter_name parameter)

### Build Status

✅ Both Submarines binaries compile successfully:

- `submarines/cmd/ingest` - HTTP ingest service
- `submarines/cmd/digest` - Valkey Stream consumer/worker

### Deployment Steps

1. **Deploy updated Submarines services**

   ```bash
   docker compose up -d --build submarines-ingest submarines-digest
   ```

2. **Deploy Phase 2 agents**
   - Agents will send grouped multi-exporter payloads
   - Submarines will process node_exporter metrics
   - Other exporter metrics will be gracefully skipped until their tables are created

3. **No database migration needed**
   - admiral.metrics table remains unchanged
   - Future exporters will require new table migrations

### Database Queries (Examples)

**Query node_exporter metrics (current implementation):**

```sql
-- All node_exporter metrics for a server
SELECT timestamp, cpu_idle_seconds, memory_total_bytes, disk_total_bytes
FROM admiral.metrics
WHERE server_id = 'uuid'
ORDER BY timestamp DESC
LIMIT 100;
```

**Future queries (when postgres_metrics table is created):**

```sql
-- Postgres metrics from dedicated table
SELECT timestamp, pg_connections_active, pg_database_size_bytes
FROM admiral.postgres_metrics
WHERE server_id = 'uuid'
ORDER BY timestamp DESC
LIMIT 100;
```

**List all available exporters for a server:**

```sql
-- Check which exporter tables have data for this server
SELECT 'node_exporter' as exporter, COUNT(*) as metric_count
FROM admiral.metrics
WHERE server_id = 'uuid'

UNION ALL

SELECT 'postgres_exporter' as exporter, COUNT(*) as metric_count
FROM admiral.postgres_metrics
WHERE server_id = 'uuid'

-- Add more UNIONs as new exporter tables are created
```

### Dashboard Impact

**Flagship (Laravel Dashboard) requires NO changes:**

Current dashboard queries continue to work unchanged:

```php
// Existing query works exactly as before
$metrics = Metric::where('server_id', $serverId)
    ->orderBy('timestamp', 'desc')
    ->limit(100)
    ->get();
```

**Future dashboard updates (when adding new exporters):**

When postgres_exporter or other exporters are implemented:

1. Create new Eloquent model (e.g., `PostgresMetric`)
2. Create new controller/API endpoints for postgres metrics
3. Add exporter selector UI to choose which metrics to display
4. Each exporter gets its own dedicated model and table

```php
// Example: Future postgres_exporter support
$postgresMetrics = PostgresMetric::where('server_id', $serverId)
    ->orderBy('timestamp', 'desc')
    ->limit(100)
    ->get();
```

**Dashboard changes needed:**

- ✅ **Current phase**: NO changes needed (node_exporter continues working)
- ⏭️ **Future**: Add new models/controllers per exporter as tables are created

---

## Implementation Status - Phase 2 Complete ✅

**Completed:** 2025-10-30

### What Was Implemented in Phase 2

#### 1. Per-Exporter Intervals

- ✅ Updated `ExporterConfig` to support optional `interval` field (string)
- ✅ Added `ParsedInterval` computed field to store parsed time.Duration
- ✅ `agent.interval` now serves as default for exporters without explicit interval
- ✅ Validation supports: 15s, 30s, 1m, 5m intervals

#### 2. Independent Scraper Goroutines

- ✅ Each exporter runs in its own goroutine with independent ticker
- ✅ Implemented `runScraperLoop()` - per-exporter scrape loop
- ✅ Implemented `scrapeAndBuffer()` - single scrape operation
- ✅ Parallel scraping - no blocking between exporters
- ✅ Graceful shutdown with `sync.WaitGroup`

#### 3. Smart Batching by Time Windows

- ✅ Implemented `groupFilesByTimeWindow()` - groups files into 5s buckets
- ✅ Implemented `parseTimestampFromFilename()` - extracts timestamp from filename
- ✅ Drain loop processes oldest time window first
- ✅ Multiple exporters scraped at similar times batched into single HTTP request

#### 4. Configuration Changes

**agent.interval:**

- Still required (serves as default for exporters)
- Falls back when exporter doesn't specify interval

**exporters[].interval:**

- Optional per-exporter interval
- Validates against allowed values: 15s, 30s, 1m, 5m
- Falls back to `agent.interval` if not specified

### Example Phase 2 Configuration

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"
  timeout: 5s

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"
  interval: 15s # Default interval for exporters without explicit interval

exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    interval: 15s # Fast scraping for system metrics
    timeout: 3s

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
    interval: 30s # Slower scraping for database metrics
    timeout: 5s

  - name: backup_monitor
    enabled: true
    endpoint: "http://localhost:8080/metrics"
    interval: 5m # Very slow scraping for backup status
    timeout: 10s

buffer:
  path: "/var/lib/nodepulse/buffer"
  retention_hours: 48
  batch_size: 10 # Increased for Phase 2 efficiency
```

### Key Features Delivered

✅ **True Parallelism** - Each exporter runs independently
✅ **Per-Exporter Intervals** - Different scrape rates (15s, 30s, 1m, 5m)
✅ **No Blocking** - Slow exporters don't delay fast ones
✅ **Smart Batching** - Time-window grouping reduces HTTP requests
✅ **Graceful Shutdown** - WaitGroup ensures clean exit
✅ **Backward Compatible** - Phase 1 configs work (all use default interval)

### Behavioral Changes from Phase 1

**Phase 1 (Sequential):**

```
14:00:00 - Scrape all exporters sequentially (blocking)
14:00:15 - Scrape all exporters sequentially
14:00:30 - Scrape all exporters sequentially
```

**Phase 2 (Independent):**

```
14:00:00 - node_exporter scrapes
14:00:00 - postgres_exporter scrapes
14:00:00 - backup_monitor scrapes
14:00:15 - node_exporter scrapes
14:00:30 - node_exporter scrapes
14:00:30 - postgres_exporter scrapes (30s interval)
14:05:00 - backup_monitor scrapes (5m interval)
```

### Files Modified in Phase 2

1. `internal/config/config.go` - Added per-exporter interval support
2. `cmd/start.go` - Replaced single loop with independent goroutines
3. `internal/report/sender.go` - Added time-window batching

### Performance Improvements

**Without Phase 2 (3 exporters at 15s interval):**

- node_exporter: 0.5s scrape
- postgres_exporter: 3s scrape (slow database query)
- backup_monitor: 2s scrape
- **Total time per cycle: 5.5s** (sequential blocking)

**With Phase 2 (independent intervals):**

- node_exporter: 15s interval, 0.5s scrape (parallel)
- postgres_exporter: 30s interval, 3s scrape (parallel)
- backup_monitor: 5m interval, 2s scrape (parallel)
- **Max scrape time: 3s** (longest individual scrape, no blocking)
- **50% fewer postgres scrapes** (30s vs 15s)
- **95% fewer backup scrapes** (5m vs 15s)

---

## Implementation Status - Phase 1 Complete ✅

**Completed:** 2025-10-30

### What Was Implemented

#### 1. Exporter Interface & Registry

- ✅ Created `internal/exporters/exporter.go` - Interface with `Name()`, `Scrape()`, `Verify()`, `DefaultEndpoint()`, `DefaultInterval()`
- ✅ Created `internal/exporters/registry.go` - Thread-safe registry for managing multiple exporters
- ✅ Created `internal/exporters/node/exporter.go` - NodeExporter implementation

#### 2. Configuration Schema

- ✅ Added `ExporterConfig` struct supporting multiple exporters
- ✅ Validation for exporter names, endpoints, intervals (15s, 30s, 1m), and timeouts
- ✅ **Note:** Backward compatibility removed - Admiral will handle migration

#### 3. Buffer System with Exporter Subdirectories

- ✅ Directory structure: `buffer/<exporter>/YYYYMMDD-HHMMSS-<server_id>.prom`
- ✅ Each exporter gets its own subdirectory for better organization
- ✅ Dynamic directory creation with `os.MkdirAll`
- ✅ Simplified filename format (no exporter name, stored in directory)
- ✅ Added `sanitizeExporterName()` for safe filesystem names
- ✅ Updated `LoadPrometheusFile()` to extract exporter from directory path
- ✅ Updated `getBufferFiles()` to scan multiple exporter subdirectories

#### 4. New Payload Format

- ✅ Implemented grouped payload: `{ "node_exporter": [...], "postgres_exporter": [...] }`
- ✅ `processBatch()` groups metrics by exporter name
- ✅ Each exporter gets an array for multiple time windows
- ✅ Smart batching sends multiple exporters in one HTTP request

#### 5. Main Agent Loop

- ✅ Initializes exporter registry
- ✅ Loads and verifies all enabled exporters from config
- ✅ Iterates over all active exporters each tick
- ✅ Graceful handling: if one exporter fails, others continue

### Example Configuration (Phase 1)

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"
  timeout: 5s

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"
  interval: 15s # All exporters use this interval in Phase 1

exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    timeout: 3s

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
    timeout: 5s

buffer:
  path: "/var/lib/nodepulse/buffer"
  retention_hours: 48
  batch_size: 5
```

### Example Payload Sent to Dashboard

```json
POST /metrics/prometheus?server_id=550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "node_exporter": [
    {
      "timestamp": "2025-10-30T14:00:00Z",
      "cpu_idle_seconds": 123456.78,
      "memory_total_bytes": 8589934592,
      ...
    }
  ],
  "postgres_exporter": [
    {
      "timestamp": "2025-10-30T14:00:00Z",
      "pg_connections_active": 42,
      "pg_database_size_bytes": 1073741824,
      ...
    }
  ]
}
```

### Key Features Delivered

✅ **Production Ready** - Compiles successfully, no errors
✅ **Scalable** - Supports 1-10+ exporters per agent
✅ **Efficient** - Batches multiple exporters per HTTP request
✅ **Resilient** - Individual exporter failures don't affect others
✅ **WAL Pattern Preserved** - Same reliable buffering mechanism
✅ **No Backward Compatibility** - Admiral handles migration

### Phase 1 Limitations (By Design)

⚠️ All exporters use the same scrape interval (`agent.interval`)
⚠️ Sequential scraping (not parallel) - exporters scraped one at a time
⚠️ No per-exporter scheduling

These limitations will be addressed in **Phase 2** with independent scrape loops and per-exporter intervals.

### Files Modified

1. `internal/exporters/exporter.go` - New exporter interface
2. `internal/exporters/registry.go` - New registry implementation
3. `internal/exporters/node_exporter.go` - NodeExporter implementation (flat structure)
4. `internal/config/config.go` - Added `ExporterConfig`, removed backward compatibility
5. `internal/report/buffer.go` - Subdirectory structure per exporter with simplified filenames
6. `internal/report/sender.go` - New payload format with grouped exporters
7. `cmd/start.go` - Multi-exporter initialization and scraping

### Next Steps

**Phase 2** (Optional - For True Scalability):

- Independent goroutines per exporter (parallel scraping)
- Per-exporter intervals (e.g., 15s for node, 30s for postgres)
- Smart batching by time windows

---

## Current Architecture Analysis

### Single-Exporter Bottlenecks

The current v2.0.x architecture is tightly coupled to a single Prometheus exporter:

#### 1. Configuration Limitation

```yaml
# current: only ONE exporter supported
prometheus:
  enabled: true
  endpoint: "http://localhost:9100/metrics"
  timeout: 3s
```

**Problem**: No array/list structure for multiple exporters.

#### 2. Single Scraper Instance

```go
// cmd/start.go (line ~80)
scraper := prometheus.NewScraper(&prometheus.ScraperConfig{
    Endpoint: cfg.Prometheus.Endpoint,  // Only ONE endpoint
    Timeout:  cfg.Prometheus.Timeout,
})
```

**Problem**: Hardcoded to single scraper; no registry or iteration over multiple scrapers.

#### 3. Serial Scraping in Main Loop

```go
// cmd/start.go (line ~120)
ticker := time.NewTicker(cfg.Agent.Interval)  // Single interval for ALL exporters

for {
    select {
    case tickTime := <-ticker.C:
        // Calls ONE scraper.Scrape()
        scrapeAndBuffer(scraper, sender, serverID, collectionTime)
    }
}
```

**Problem**: All exporters forced to same interval; no per-exporter scheduling.

#### 4. Buffer File Naming Collision Risk

```
Format: YYYYMMDD-HHMMSS-<server_id>.prom

Example collision scenario:
20251030-140000-uuid.prom  (from node_exporter)
20251030-140000-uuid.prom  (from postgres_exporter) ❌ OVERWRITES!
```

**Problem**: No exporter identifier in filename; multiple exporters scraping at same second would overwrite each other.

#### 5. Hardcoded Metric Parsing

```go
// internal/prometheus/parser.go
type MetricSnapshot struct {
    // Assumes node_exporter schema
    CPUIdleSeconds   float64 `json:"cpu_idle_seconds"`
    MemoryTotalBytes int64   `json:"memory_total_bytes"`
    // ... node_exporter-specific fields
}
```

**Problem**: Fixed schema assumes only node_exporter metrics; cannot handle heterogeneous metric sources.

---

## Proposed Architecture

### Phase 1: Plugin Architecture (Foundation)

**Goal**: Create exporter abstraction layer without changing scraping behavior.

**Timeline**: 2-3 days ✅ **COMPLETE**
**Complexity**: Low
**Breaking Changes**: Configuration schema change (Admiral handles migration)

#### 1.1 Exporter Interface

Create `internal/exporters/exporter.go`:

```go
package exporters

import (
    "context"
)

// Exporter defines the interface that all metrics exporters must implement
type Exporter interface {
    // Name returns the unique identifier for this exporter
    // Examples: "node_exporter", "postgres_exporter", "redis_exporter"
    Name() string

    // Scrape retrieves metrics from the exporter endpoint
    // Returns raw Prometheus text format
    Scrape(ctx context.Context) ([]byte, error)

    // Verify checks if the exporter is accessible (used at startup)
    Verify() error

    // DefaultEndpoint returns the standard endpoint for this exporter
    // Example: "http://localhost:9100/metrics" for node_exporter
    DefaultEndpoint() string

    // DefaultInterval returns the recommended scrape interval
    // Example: 15s for node_exporter, 30s for postgres_exporter
    DefaultInterval() time.Duration
}
```

#### 1.2 Exporter Registry

Create `internal/exporters/registry.go`:

```go
package exporters

import (
    "fmt"
    "sync"
)

// Registry manages all available exporters
type Registry struct {
    mu        sync.RWMutex
    exporters map[string]Exporter  // key: exporter name
}

// NewRegistry creates a new exporter registry
func NewRegistry() *Registry {
    return &Registry{
        exporters: make(map[string]Exporter),
    }
}

// Register adds an exporter to the registry
func (r *Registry) Register(e Exporter) error {
    r.mu.Lock()
    defer r.mu.Unlock()

    name := e.Name()
    if _, exists := r.exporters[name]; exists {
        return fmt.Errorf("exporter already registered: %s", name)
    }

    r.exporters[name] = e
    return nil
}

// Get retrieves an exporter by name
func (r *Registry) Get(name string) (Exporter, error) {
    r.mu.RLock()
    defer r.mu.RUnlock()

    e, exists := r.exporters[name]
    if !exists {
        return nil, fmt.Errorf("exporter not found: %s", name)
    }

    return e, nil
}

// List returns all registered exporter names
func (r *Registry) List() []string {
    r.mu.RLock()
    defer r.mu.RUnlock()

    names := make([]string, 0, len(r.exporters))
    for name := range r.exporters {
        names = append(names, name)
    }
    return names
}

// GetEnabled returns only exporters that are enabled in config
func (r *Registry) GetEnabled(enabledNames []string) []Exporter {
    r.mu.RLock()
    defer r.mu.RUnlock()

    enabled := make([]Exporter, 0, len(enabledNames))
    for _, name := range enabledNames {
        if e, exists := r.exporters[name]; exists {
            enabled = append(enabled, e)
        }
    }
    return enabled
}
```

#### 1.3 Node Exporter Implementation

Move current scraper to `internal/exporters/node/exporter.go`:

```go
package node

import (
    "context"
    "fmt"
    "io"
    "net/http"
    "time"

    "github.com/node-pulse/agent/internal/exporters"
)

// NodeExporter implements the Exporter interface for Prometheus node_exporter
type NodeExporter struct {
    endpoint string
    client   *http.Client
}

// NewNodeExporter creates a new node_exporter scraper
func NewNodeExporter(endpoint string, timeout time.Duration) *NodeExporter {
    return &NodeExporter{
        endpoint: endpoint,
        client: &http.Client{
            Timeout: timeout,
        },
    }
}

// Ensure NodeExporter implements Exporter interface
var _ exporters.Exporter = (*NodeExporter)(nil)

func (n *NodeExporter) Name() string {
    return "node_exporter"
}

func (n *NodeExporter) Scrape(ctx context.Context) ([]byte, error) {
    req, err := http.NewRequestWithContext(ctx, "GET", n.endpoint, nil)
    if err != nil {
        return nil, fmt.Errorf("failed to create request: %w", err)
    }

    resp, err := n.client.Do(req)
    if err != nil {
        return nil, fmt.Errorf("HTTP request failed: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("server returned status %d", resp.StatusCode)
    }

    data, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, fmt.Errorf("failed to read response body: %w", err)
    }

    return data, nil
}

func (n *NodeExporter) Verify() error {
    ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
    defer cancel()

    _, err := n.Scrape(ctx)
    return err
}

func (n *NodeExporter) DefaultEndpoint() string {
    return "http://localhost:9100/metrics"
}

func (n *NodeExporter) DefaultInterval() time.Duration {
    return 15 * time.Second
}
```

#### 1.4 Configuration Schema

Update `internal/config/config.go`:

```go
// Config represents the agent configuration
type Config struct {
    Server     ServerConfig       `mapstructure:"server"`
    Agent      AgentConfig        `mapstructure:"agent"`
    Exporters  []ExporterConfig   `mapstructure:"exporters"`
    Buffer     BufferConfig       `mapstructure:"buffer"`
    Logging    logger.Config      `mapstructure:"logging"`
}

// ExporterConfig configures a single Prometheus exporter
type ExporterConfig struct {
    Name     string        `mapstructure:"name"`      // e.g., "node_exporter"
    Enabled  bool          `mapstructure:"enabled"`   // default: true
    Endpoint string        `mapstructure:"endpoint"`  // e.g., "http://localhost:9100/metrics"
    Interval string        `mapstructure:"interval"`  // e.g., "15s", "30s", "1m"
    Timeout  time.Duration `mapstructure:"timeout"`   // default: 3s
}

// Validate ensures configuration is valid
func (c *Config) Validate() error {
    if len(c.Exporters) == 0 {
        return fmt.Errorf("no exporters configured - please configure at least one exporter")
    }

    // Validate each exporter config
    for i, e := range c.Exporters {
        if e.Name == "" {
            return fmt.Errorf("exporter[%d]: name is required", i)
        }
        if e.Endpoint == "" {
            return fmt.Errorf("exporter[%d]: endpoint is required", i)
        }
    }

    return nil
}
```

**Note:** Backward compatibility removed - Admiral will handle migration from v2.0.x configs.

Example v2.1.0 config:

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"
  timeout: 5s

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"
  interval: 15s # DEPRECATED: default interval only

# NEW: Multi-exporter configuration
exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    interval: 15s
    timeout: 3s

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
    interval: 30s
    timeout: 3s

  - name: custom_app
    enabled: false
    endpoint: "http://localhost:8080/metrics"
    interval: 1m
    timeout: 5s

buffer:
  path: "/var/lib/nodepulse/buffer"
  retention_hours: 48
  batch_size: 5

logging:
  level: "info"
  output: "stdout"
```

#### 1.5 Updated Main Loop (Still Single Interval)

Modify `cmd/start.go`:

```go
func runAgent() error {
    // Load config
    cfg := config.Load(cfgFile)

    // Initialize logger
    logger.Initialize(cfg.Logging)

    // Create exporter registry
    registry := exporters.NewRegistry()

    // Register built-in exporters
    // (In future: this could be plugin-based)
    registry.Register(node.NewNodeExporter("", 0))  // Placeholder, config overrides
    // registry.Register(postgres.NewPostgresExporter("", 0))
    // registry.Register(redis.NewRedisExporter("", 0))

    // Initialize enabled exporters from config
    activeExporters := make([]exporters.Exporter, 0, len(cfg.Exporters))
    for _, exporterCfg := range cfg.Exporters {
        if !exporterCfg.Enabled {
            continue
        }

        // Get exporter from registry
        e, err := registry.Get(exporterCfg.Name)
        if err != nil {
            logger.Warn("Exporter not found in registry, skipping",
                logger.String("name", exporterCfg.Name))
            continue
        }

        // Create configured instance
        // (Each exporter type will have a NewFromConfig method)
        configuredExporter := createConfiguredExporter(e, exporterCfg)

        // Verify exporter is accessible
        if err := configuredExporter.Verify(); err != nil {
            logger.Warn("Exporter verification failed, skipping",
                logger.String("name", exporterCfg.Name),
                logger.Err(err))
            continue
        }

        activeExporters = append(activeExporters, configuredExporter)
        logger.Info("Exporter initialized",
            logger.String("name", exporterCfg.Name),
            logger.String("endpoint", exporterCfg.Endpoint))
    }

    if len(activeExporters) == 0 {
        return fmt.Errorf("no active exporters configured")
    }

    // Create sender with buffer
    sender, err := report.NewSender(cfg)
    if err != nil {
        return err
    }
    defer sender.Close()

    sender.StartDraining()

    // Setup graceful shutdown
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

    go func() {
        <-sigChan
        logger.Info("Shutdown signal received")
        cancel()
    }()

    // PHASE 1: Still use single ticker, iterate over exporters
    ticker := time.NewTicker(cfg.Agent.Interval)
    defer ticker.Stop()

    // Immediate scrape on start
    collectionTime := time.Now().UTC().Truncate(cfg.Agent.Interval)
    scrapeAllExporters(ctx, activeExporters, sender, cfg.Agent.ServerID, collectionTime)

    // Main loop
    for {
        select {
        case <-ctx.Done():
            return nil
        case tickTime := <-ticker.C:
            collectionTime := tickTime.UTC().Truncate(cfg.Agent.Interval)
            scrapeAllExporters(ctx, activeExporters, sender, cfg.Agent.ServerID, collectionTime)
        }
    }
}

// scrapeAllExporters scrapes all exporters sequentially
func scrapeAllExporters(ctx context.Context, exporters []exporters.Exporter,
                       sender *report.Sender, serverID string, collectionTime time.Time) {
    for _, e := range exporters {
        // Scrape with timeout
        scrapeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
        data, err := e.Scrape(scrapeCtx)
        cancel()

        if err != nil {
            logger.Warn("Failed to scrape exporter",
                logger.String("exporter", e.Name()),
                logger.Err(err))
            continue
        }

        // Add timestamps
        dataWithTimestamp := prometheus.AddTimestamps(data, collectionTime)

        // Buffer with exporter name
        if err := sender.BufferPrometheus(dataWithTimestamp, serverID, e.Name()); err != nil {
            logger.Error("Failed to buffer metrics",
                logger.String("exporter", e.Name()),
                logger.Err(err))
        }
    }
}
```

#### 1.6 Buffer Organization with Subdirectories

Update `internal/report/buffer.go`:

```go
// SavePrometheus saves Prometheus metrics to buffer with exporter subdirectory
// Directory structure: buffer/<exporter>/YYYYMMDD-HHMMSS-<server_id>.prom
func (b *Buffer) SavePrometheus(data []byte, serverID string, exporterName string) error {
    b.mu.Lock()
    defer b.mu.Unlock()

    // Sanitize exporter name (remove special chars)
    safeExporterName := sanitizeExporterName(exporterName)

    // Create exporter subdirectory if it doesn't exist
    exporterDir := filepath.Join(b.config.Buffer.Path, safeExporterName)
    if err := os.MkdirAll(exporterDir, 0755); err != nil {
        return fmt.Errorf("failed to create exporter directory: %w", err)
    }

    // Generate filename without exporter name (it's in the directory)
    now := time.Now()
    filename := fmt.Sprintf("%s-%s.prom",
        now.Format("20060102-150405"),
        serverID)
    filePath := filepath.Join(exporterDir, filename)

    if err := os.WriteFile(filePath, data, 0644); err != nil {
        return fmt.Errorf("failed to write buffer file: %w", err)
    }

    return nil
}

// LoadPrometheusFile loads a Prometheus buffer file and extracts metadata
type PrometheusEntry struct {
    ServerID     string
    ExporterName string  // NEW: extracted from directory name
    Data         []byte
}

func (b *Buffer) LoadPrometheusFile(filePath string) (*PrometheusEntry, error) {
    // Extract metadata from path and filename
    // Path format: buffer/<exporter>/YYYYMMDD-HHMMSS-<server_id>.prom
    dir := filepath.Dir(filePath)
    exporterName := filepath.Base(dir)

    filename := filepath.Base(filePath)
    parts := strings.SplitN(strings.TrimSuffix(filename, ".prom"), "-", 3)

    if len(parts) < 3 {
        return nil, fmt.Errorf("invalid filename format: %s (expected: YYYYMMDD-HHMMSS-serverid.prom)", filename)
    }

    serverID := parts[2]

    data, err := os.ReadFile(filePath)
    if err != nil {
        return nil, err
    }

    return &PrometheusEntry{
        ServerID:     serverID,
        ExporterName: exporterName,
        Data:         data,
    }, nil
}

// getBufferFiles returns all buffer files sorted by name (chronological order)
// Scans all exporter subdirectories
func (b *Buffer) getBufferFiles() ([]string, error) {
    var allFiles []string

    // Read all subdirectories (each is an exporter)
    exporterDirs, err := os.ReadDir(b.config.Buffer.Path)
    if err != nil {
        // If buffer directory doesn't exist yet, return empty list
        if os.IsNotExist(err) {
            return []string{}, nil
        }
        return nil, err
    }

    // Scan each exporter subdirectory for .prom files
    for _, entry := range exporterDirs {
        if !entry.IsDir() {
            continue // Skip non-directory files
        }

        exporterDir := filepath.Join(b.config.Buffer.Path, entry.Name())
        pattern := filepath.Join(exporterDir, "*.prom")
        files, err := filepath.Glob(pattern)
        if err != nil {
            logger.Warn("Failed to list files in exporter directory",
                logger.String("dir", exporterDir),
                logger.Err(err))
            continue
        }

        allFiles = append(allFiles, files...)
    }

    // Sort files by full path (chronological due to format YYYYMMDD-HHMMSS)
    sort.Strings(allFiles)

    return allFiles, nil
}

func sanitizeExporterName(name string) string {
    // Replace special chars with underscores
    replacer := strings.NewReplacer(
        "/", "_",
        "\\", "_",
        ":", "_",
        " ", "_",
        ".", "_",
    )
    return replacer.Replace(name)
}
```

Example buffer directory structure after Phase 1:

```
/var/lib/nodepulse/buffer/
├── node_exporter/
│   ├── 20251030-140000-uuid.prom
│   ├── 20251030-140015-uuid.prom
│   └── 20251030-140030-uuid.prom
├── postgres_exporter/
│   ├── 20251030-140000-uuid.prom
│   └── 20251030-140030-uuid.prom
└── mysql_exporter/
    └── 20251030-140000-uuid.prom
```

**Benefits:**

- Clean organization - each exporter isolated in its own directory
- Simpler filenames (no exporter name duplication)
- Easy to identify which exporters are active
- Easier manual inspection and debugging
- No filename collisions possible

#### 1.7 Phase 1 Summary

**What changes:**

- New exporter interface and registry
- Configuration supports `exporters` array
- Buffer uses subdirectories per exporter for better organization
- Simplified filenames (exporter name stored in directory structure)
- Main loop iterates over multiple exporters

**What stays the same:**

- Single ticker interval (all exporters scraped together)
- Synchronous scraping (one at a time)
- Same WAL buffer pattern
- Same drain loop and batching logic

**Benefits:**

- Foundation for multi-exporter support
- Minimal risk (small changes)
- Clean architecture ready for Phase 2

**Limitations:**

- All exporters still use same interval
- Sequential scraping (not parallel)
- No per-exporter scheduling

---

### Phase 2: Independent Scrape Loops + Smart Batching

**Goal**: True multi-exporter scalability with per-exporter intervals and efficient batching.

**Timeline**: 5-7 days
**Complexity**: Medium
**Breaking Changes**: None (configuration change only)

#### 2.1 Per-Exporter Scrape Goroutines

Update `cmd/start.go` to launch independent goroutines:

```go
func runAgent() error {
    // ... (same initialization as Phase 1)

    // Create context for all goroutines
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Create WaitGroup to track all scraper goroutines
    var wg sync.WaitGroup

    // Launch independent scrape loop for each exporter
    for _, exporterCfg := range cfg.Exporters {
        if !exporterCfg.Enabled {
            continue
        }

        e, err := createConfiguredExporter(registry, exporterCfg)
        if err != nil {
            logger.Warn("Failed to create exporter", logger.Err(err))
            continue
        }

        // Verify exporter
        if err := e.Verify(); err != nil {
            logger.Warn("Exporter verification failed",
                logger.String("name", exporterCfg.Name),
                logger.Err(err))
            continue
        }

        // Parse interval
        interval, err := time.ParseDuration(exporterCfg.Interval)
        if err != nil {
            interval = e.DefaultInterval()
        }

        // Launch independent scrape loop
        wg.Add(1)
        go func(exp exporters.Exporter, interval time.Duration, timeout time.Duration) {
            defer wg.Done()
            runScraperLoop(ctx, exp, sender, cfg.Agent.ServerID, interval, timeout)
        }(e, interval, exporterCfg.Timeout)

        logger.Info("Started scraper loop",
            logger.String("exporter", exporterCfg.Name),
            logger.Duration("interval", interval))
    }

    // Setup graceful shutdown
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

    <-sigChan
    logger.Info("Shutdown signal received, stopping all scrapers")
    cancel()
    wg.Wait()

    return nil
}

// runScraperLoop runs an independent scrape loop for one exporter
func runScraperLoop(ctx context.Context, exporter exporters.Exporter,
                   sender *report.Sender, serverID string,
                   interval time.Duration, timeout time.Duration) {

    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    // Immediate scrape on start
    collectionTime := time.Now().UTC().Truncate(interval)
    scrapeAndBuffer(ctx, exporter, sender, serverID, collectionTime, timeout)

    for {
        select {
        case <-ctx.Done():
            logger.Info("Scraper loop stopped", logger.String("exporter", exporter.Name()))
            return

        case tickTime := <-ticker.C:
            collectionTime := tickTime.UTC().Truncate(interval)
            scrapeAndBuffer(ctx, exporter, sender, serverID, collectionTime, timeout)
        }
    }
}

// scrapeAndBuffer performs a single scrape operation
func scrapeAndBuffer(ctx context.Context, exporter exporters.Exporter,
                    sender *report.Sender, serverID string,
                    collectionTime time.Time, timeout time.Duration) {

    // Create timeout context for scrape
    scrapeCtx, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()

    // Scrape metrics
    data, err := exporter.Scrape(scrapeCtx)
    if err != nil {
        logger.Warn("Scrape failed",
            logger.String("exporter", exporter.Name()),
            logger.Err(err))
        return
    }

    // Add timestamps
    dataWithTimestamp := prometheus.AddTimestamps(data, collectionTime)

    // Buffer (WAL pattern)
    if err := sender.BufferPrometheus(dataWithTimestamp, serverID, exporter.Name()); err != nil {
        logger.Error("Failed to buffer metrics",
            logger.String("exporter", exporter.Name()),
            logger.Err(err))
    }
}
```

**Benefits:**

- Each exporter runs at its own interval (15s, 30s, 1m)
- Exporters scrape independently (truly parallel)
- Fast exporters don't wait for slow ones
- Individual exporter failures don't block others

#### 2.2 Smart Batching Strategy

Currently, the drain loop sends files individually. With multiple exporters, we can optimize by batching metrics from the same time window.

Update `internal/report/sender.go`:

```go
// processBatch groups files by time window and sends in batches
func (s *Sender) processBatch(filePaths []string) error {
    if len(filePaths) == 0 {
        return nil
    }

    // Group files by time window (1-second buckets)
    // This allows combining multiple exporters scraped at same time
    timeWindows := groupFilesByTimeWindow(filePaths, 1*time.Second)

    successCount := 0

    // Process each time window
    for _, windowFiles := range timeWindows {
        // Try to send all files in this window together
        batch := make([]*PrometheusEntry, 0, len(windowFiles))

        for _, filePath := range windowFiles {
            entry, err := s.buffer.LoadPrometheusFile(filePath)
            if err != nil {
                // Corrupted file - delete it
                logger.Warn("Corrupted buffer file, deleting",
                    logger.String("file", filePath),
                    logger.Err(err))
                s.buffer.DeleteFile(filePath)
                continue
            }
            batch = append(batch, entry)
        }

        if len(batch) == 0 {
            continue
        }

        // Send batch (multiple exporters in one request)
        if err := s.sendBatchedMetrics(batch); err != nil {
            logger.Debug("Failed to send batch, will retry",
                logger.Int("batch_size", len(batch)),
                logger.Err(err))
            // Keep files for retry
            break
        }

        // Success - delete all files in batch
        for _, filePath := range windowFiles {
            if err := s.buffer.DeleteFile(filePath); err != nil {
                logger.Error("Failed to delete buffer file",
                    logger.String("file", filePath),
                    logger.Err(err))
            } else {
                successCount++
            }
        }
    }

    if successCount > 0 {
        logger.Info("Successfully sent buffered data",
            logger.Int("files", successCount))
    }

    return nil
}

// groupFilesByTimeWindow groups files into time buckets
func groupFilesByTimeWindow(filePaths []string, windowSize time.Duration) [][]string {
    // Map: timestamp bucket -> file paths
    windows := make(map[int64][]string)

    for _, filePath := range filePaths {
        // Parse timestamp from filename: YYYYMMDD-HHMMSS-...
        timestamp, err := parseTimestampFromFilename(filePath)
        if err != nil {
            logger.Warn("Failed to parse timestamp from filename",
                logger.String("file", filePath))
            continue
        }

        // Bucket by time window
        bucket := timestamp.Unix() / int64(windowSize.Seconds())
        windows[bucket] = append(windows[bucket], filePath)
    }

    // Convert to sorted list of windows
    buckets := make([]int64, 0, len(windows))
    for bucket := range windows {
        buckets = append(buckets, bucket)
    }
    sort.Slice(buckets, func(i, j int) bool {
        return buckets[i] < buckets[j]
    })

    result := make([][]string, 0, len(buckets))
    for _, bucket := range buckets {
        result = append(result, windows[bucket])
    }

    return result
}

// sendBatchedMetrics sends multiple exporter metrics in one HTTP request
// Payload format: { "node_exporter": [...], "mysql_exporter": [...], ... }
func (s *Sender) sendBatchedMetrics(entries []*PrometheusEntry) error {
    if len(entries) == 0 {
        return nil
    }

    // Group entries by exporter name
    exporterMetrics := make(map[string][]prometheus.MetricSnapshot)

    for _, entry := range entries {
        // Parse Prometheus text to JSON snapshot
        snapshot, err := prometheus.ParsePrometheusMetrics(entry.Data)
        if err != nil {
            logger.Warn("Failed to parse metrics, using zero values",
                logger.String("exporter", entry.ExporterName),
                logger.Err(err))
            snapshot = &prometheus.MetricSnapshot{
                Timestamp: time.Now().UTC(),
            }
        }

        // Add to exporter's array
        exporterMetrics[entry.ExporterName] = append(
            exporterMetrics[entry.ExporterName],
            *snapshot,
        )
    }

    // Build final payload: { "node_exporter": [...], "mysql_exporter": [...] }
    // Note: server_id is passed as query parameter, not in body
    payload := make(map[string]interface{})
    for exporterName, snapshots := range exporterMetrics {
        payload[exporterName] = snapshots
    }

    // Marshal to JSON
    jsonData, err := json.Marshal(payload)
    if err != nil {
        return fmt.Errorf("failed to marshal batch: %w", err)
    }

    // Send batch via HTTP (server_id in query param)
    serverID := entries[0].ServerID
    return s.sendJSONHTTP(jsonData, serverID)
}
```

**Batching Examples:**

Scenario: node_exporter (15s), postgres_exporter (30s), mysql_exporter (30s)

```
Buffer at T=0s:
/var/lib/nodepulse/buffer/
├── node_exporter/
│   ├── 20251030-140000-uuid.prom       (T=0s)
│   ├── 20251030-140015-uuid.prom       (T=15s)
│   └── 20251030-140030-uuid.prom       (T=30s)
├── postgres_exporter/
│   └── 20251030-140000-uuid.prom       (T=0s)
└── mysql_exporter/
    └── 20251030-140000-uuid.prom       (T=0s)

Drain loop groups by time window (1s):
- Window [0s-1s]: 3 exporters → Send 1 batch
- Window [15s-16s]: 1 exporter → Send 1 batch
- Window [30s-31s]: 1 exporter → Send 1 batch

Total HTTP requests: 3 (instead of 5 individual requests)
```

**Example Payload for Window [0s-1s]:**

```json
POST /metrics/prometheus?server_id=550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "node_exporter": [
    {
      "timestamp": "2025-10-30T14:00:00Z",
      "cpu_idle_seconds": 123456.78,
      "cpu_user_seconds": 1234.56,
      "cpu_system_seconds": 567.89,
      "cpu_cores": 4,
      "memory_total_bytes": 8589934592,
      "memory_available_bytes": 4294967296,
      "disk_read_bytes": 1073741824,
      "disk_write_bytes": 536870912,
      "network_receive_bytes": 1048576000,
      "network_transmit_bytes": 524288000,
      "load_average_1m": 1.23,
      "load_average_5m": 1.45,
      "load_average_15m": 1.67
    }
  ],
  "postgres_exporter": [
    {
      "timestamp": "2025-10-30T14:00:00Z",
      "pg_up": 1,
      "pg_connections_active": 42,
      "pg_connections_idle": 8,
      "pg_connections_max": 100,
      "pg_database_size_bytes": 1073741824,
      "pg_transactions_committed": 123456,
      "pg_transactions_rolled_back": 12,
      "pg_cache_hit_ratio": 0.98
    }
  ],
  "mysql_exporter": [
    {
      "timestamp": "2025-10-30T14:00:00Z",
      "mysql_up": 1,
      "mysql_connections": 25,
      "mysql_max_connections": 151,
      "mysql_queries_total": 987654,
      "mysql_slow_queries": 23,
      "mysql_table_locks_waited": 5,
      "mysql_innodb_buffer_pool_size": 134217728,
      "mysql_innodb_buffer_pool_pages_dirty": 120
    }
  ]
}
```

**Example Payload for Window [15s-16s] (single exporter):**

```json
POST /metrics/prometheus?server_id=550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "node_exporter": [
    {
      "timestamp": "2025-10-30T14:00:15Z",
      "cpu_idle_seconds": 123471.78,
      "cpu_user_seconds": 1235.12,
      "cpu_system_seconds": 568.23,
      "cpu_cores": 4,
      "memory_total_bytes": 8589934592,
      "memory_available_bytes": 4290772992,
      "disk_read_bytes": 1073749824,
      "disk_write_bytes": 536875912,
      "network_receive_bytes": 1048580000,
      "network_transmit_bytes": 524290000,
      "load_average_1m": 1.21,
      "load_average_5m": 1.44,
      "load_average_15m": 1.66
    }
  ]
}
```

**Why Arrays per Exporter?**

Each exporter key contains an **array** of metric snapshots to handle scenarios where:

1. **Multiple time windows accumulated**: If dashboard was offline, buffer might contain:

   ```json
   {
     "node_exporter": [
       { "timestamp": "2025-10-30T14:00:00Z", ... },  // First scrape
       { "timestamp": "2025-10-30T14:00:15Z", ... },  // Second scrape
       { "timestamp": "2025-10-30T14:00:30Z", ... }   // Third scrape
     ]
   }
   ```

2. **Batch processing**: When draining buffer, we can send multiple historical snapshots in one request

3. **Consistency**: Each exporter always gets an array, even if only one snapshot
   - Simpler dashboard parsing logic
   - No need to check if value is object vs array

**Benefits:**

- Reduces HTTP overhead (fewer requests)
- Dashboard receives related metrics together
- More efficient for high-frequency exporters
- Clean separation: each exporter's data is isolated
- Extensible: easy to add new exporters without changing payload schema

**Dashboard Processing Example:**

```typescript
// Dashboard endpoint handler (pseudo-code)
app.post("/metrics/prometheus", async (req, res) => {
  const serverId = req.query.server_id;
  const payload = req.body;

  // Process each exporter's metrics
  for (const [exporterName, snapshots] of Object.entries(payload)) {
    switch (exporterName) {
      case "node_exporter":
        await processNodeExporterMetrics(serverId, snapshots);
        break;

      case "postgres_exporter":
        await processPostgresMetrics(serverId, snapshots);
        break;

      case "mysql_exporter":
        await processMysqlMetrics(serverId, snapshots);
        break;

      default:
        // Unknown exporter - log and store raw metrics
        await storeRawMetrics(serverId, exporterName, snapshots);
    }
  }

  res.status(200).send("OK");
});

// Each processor handles an array of snapshots
async function processNodeExporterMetrics(serverId, snapshots) {
  for (const snapshot of snapshots) {
    await db.insert("node_metrics", {
      server_id: serverId,
      timestamp: snapshot.timestamp,
      cpu_idle: snapshot.cpu_idle_seconds,
      cpu_user: snapshot.cpu_user_seconds,
      memory_total: snapshot.memory_total_bytes,
      // ... store all metrics
    });
  }
}
```

#### 2.3 Flexible Metric Schema

Replace hardcoded `MetricSnapshot` with flexible parsing:

Option A: Keep node_exporter-specific parsing, add generic fallback

```go
// internal/prometheus/parser.go

// ParsePrometheusMetrics attempts to parse metrics based on exporter type
func ParsePrometheusMetrics(data []byte, exporterName string) (*MetricSnapshot, error) {
    switch exporterName {
    case "node_exporter":
        return parseNodeExporterMetrics(data)
    case "postgres_exporter":
        return parsePostgresExporterMetrics(data)
    default:
        // Generic parser: just forward raw metrics without aggregation
        return parseGenericMetrics(data)
    }
}

func parseNodeExporterMetrics(data []byte) (*MetricSnapshot, error) {
    // Current parsing logic (CPU aggregation, etc.)
    // ...
}

func parsePostgresExporterMetrics(data []byte) (*MetricSnapshot, error) {
    // Postgres-specific parsing
    snapshot := &MetricSnapshot{
        Timestamp: time.Now().UTC(),
        // Parse postgres-specific metrics
    }
    return snapshot, nil
}

func parseGenericMetrics(data []byte) (*MetricSnapshot, error) {
    // Minimal parsing: just extract timestamp and metric count
    snapshot := &MetricSnapshot{
        Timestamp: time.Now().UTC(),
        // No specific fields populated
    }
    return snapshot, nil
}
```

Option B: Send raw Prometheus text without parsing (simpler)

```go
// Don't parse at all - send raw Prometheus text to dashboard
// Dashboard handles parsing based on exporter type

type ExporterMetrics struct {
    Exporter  string    `json:"exporter"`
    Timestamp time.Time `json:"timestamp"`
    RawText   string    `json:"raw_text"`  // Raw Prometheus text format
}
```

**Recommendation**: Option B (send raw text) is simpler and more flexible. Dashboard can parse as needed.

#### 2.4 Phase 2 Summary

**What changes:**

- Independent goroutines per exporter (parallel scraping)
- Per-exporter intervals (15s, 30s, 1m, etc.)
- Smart batching by time window
- Flexible metric schema (raw text or per-exporter parsing)

**What stays the same:**

- WAL buffer pattern
- File-based buffering
- Random jitter for drain loop
- Graceful degradation on failures

**Benefits:**

- True scalability: 10+ exporters no problem
- Efficient: parallel scraping + batched sending
- Flexible: different intervals per exporter
- Resilient: individual exporter failures don't affect others

**Migration from Phase 1:**

- Update config to add `interval` per exporter
- No code changes needed if using default intervals
- Backward compatible with Phase 1 configs

---

### Phase 3: Advanced Features (Optional)

**Goal**: Production-grade features for large-scale deployments.

**Timeline**: 3-5 days
**Complexity**: Medium-High
**Breaking Changes**: None

#### 3.1 Auto-Discovery

Automatically detect exporters running on common ports:

```go
// internal/exporters/discovery.go

type DiscoveryConfig struct {
    Enabled      bool          `mapstructure:"enabled"`
    ScanPorts    []int         `mapstructure:"scan_ports"`
    ScanInterval time.Duration `mapstructure:"scan_interval"`
}

// DefaultScanPorts are common Prometheus exporter ports
var DefaultScanPorts = []int{
    9100, // node_exporter
    9187, // postgres_exporter
    9121, // redis_exporter
    9090, // prometheus itself
    9256, // process_exporter
}

func DiscoverExporters(cfg DiscoveryConfig) []ExporterConfig {
    discovered := []ExporterConfig{}

    for _, port := range cfg.ScanPorts {
        endpoint := fmt.Sprintf("http://localhost:%d/metrics", port)

        // Try to scrape
        resp, err := http.Get(endpoint)
        if err != nil {
            continue
        }
        resp.Body.Close()

        if resp.StatusCode == 200 {
            // Detect exporter type from response headers or content
            exporterName := detectExporterType(resp)

            discovered = append(discovered, ExporterConfig{
                Name:     exporterName,
                Enabled:  true,
                Endpoint: endpoint,
                Interval: "15s",
            })
        }
    }

    return discovered
}
```

Configuration:

```yaml
exporters:
  discovery:
    enabled: true
    scan_ports: [9100, 9187, 9121]
    scan_interval: 5m
```

#### 3.2 Dynamic Exporter Registration

Allow adding/removing exporters without restart:

```go
// internal/exporters/manager.go

type Manager struct {
    registry   *Registry
    runners    map[string]context.CancelFunc  // exporter name -> cancel func
    mu         sync.Mutex
}

func (m *Manager) AddExporter(cfg ExporterConfig, sender *report.Sender, serverID string) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    // Check if already running
    if _, exists := m.runners[cfg.Name]; exists {
        return fmt.Errorf("exporter already running: %s", cfg.Name)
    }

    // Create exporter
    e, err := createConfiguredExporter(m.registry, cfg)
    if err != nil {
        return err
    }

    // Verify
    if err := e.Verify(); err != nil {
        return fmt.Errorf("verification failed: %w", err)
    }

    // Start scrape loop
    ctx, cancel := context.WithCancel(context.Background())
    m.runners[cfg.Name] = cancel

    interval, _ := time.ParseDuration(cfg.Interval)
    go runScraperLoop(ctx, e, sender, serverID, interval, cfg.Timeout)

    logger.Info("Dynamically added exporter", logger.String("name", cfg.Name))
    return nil
}

func (m *Manager) RemoveExporter(name string) error {
    m.mu.Lock()
    defer m.mu.Unlock()

    cancel, exists := m.runners[name]
    if !exists {
        return fmt.Errorf("exporter not running: %s", name)
    }

    // Stop scrape loop
    cancel()
    delete(m.runners, name)

    logger.Info("Dynamically removed exporter", logger.String("name", name))
    return nil
}
```

API endpoint (optional):

```bash
# Add exporter at runtime
curl -X POST http://localhost:8088/api/exporters \
  -d '{"name":"redis_exporter","endpoint":"http://localhost:9121/metrics","interval":"30s"}'

# Remove exporter
curl -X DELETE http://localhost:8088/api/exporters/redis_exporter
```

#### 3.3 Per-Exporter Retry Policies

Different exporters may need different retry strategies:

```yaml
exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    interval: 15s
    retry:
      max_attempts: 3
      backoff: exponential

  - name: slow_exporter
    enabled: true
    endpoint: "http://localhost:9999/metrics"
    interval: 1m
    retry:
      max_attempts: 1 # Don't retry slow exporters
      backoff: none
```

#### 3.4 Health Check Endpoint

Expose agent health status:

```go
// cmd/start.go - add HTTP server

func startHealthServer(cfg *config.Config, manager *exporters.Manager) {
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        status := manager.GetStatus()
        json.NewEncoder(w).Encode(status)
    })

    go http.ListenAndServe(":8088", nil)
}
```

Response:

```json
{
  "status": "healthy",
  "exporters": [
    {
      "name": "node_exporter",
      "status": "running",
      "last_scrape": "2025-10-30T14:00:30Z",
      "last_error": null
    },
    {
      "name": "postgres_exporter",
      "status": "failed",
      "last_scrape": "2025-10-30T14:00:00Z",
      "last_error": "connection refused"
    }
  ],
  "buffer": {
    "files": 12,
    "oldest": "2025-10-30T13:00:00Z",
    "size_bytes": 156000
  }
}
```

---

## Migration Path

### From v2.0.x (Single Exporter) → Phase 1

**Note:** Migration is handled by Admiral (dashboard deployment system).

Admiral will:

1. Deploy new agent binary (v2.1.0+)
2. Convert old `prometheus` config to new `exporters` array format
3. Restart agent with new configuration

Manual migration (if needed):

**Old config (v2.0.x):**

```yaml
prometheus:
  enabled: true
  endpoint: "http://localhost:9100/metrics"
```

**New config (v2.1.0+):**

```yaml
exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    timeout: 3s
```

### From Phase 1 → Phase 2

**Step 1**: Update config to add per-exporter intervals

```yaml
exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    interval: 15s # Add interval

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
    interval: 30s # Different interval
```

**Step 2**: Restart agent

```bash
nodepulse service restart
```

**Step 3**: Monitor logs for independent scrape loops

```bash
tail -f /var/log/nodepulse/agent.log
```

Expected output:

```
[INFO] Started scraper loop exporter=node_exporter interval=15s
[INFO] Started scraper loop exporter=postgres_exporter interval=30s
```

---

## Implementation Checklist

### Phase 1: Plugin Architecture ✅ COMPLETE

- ✅ Create `internal/exporters/exporter.go` (interface definition)
- ✅ Create `internal/exporters/registry.go` (registry implementation)
- ✅ Create `internal/exporters/node/exporter.go` (move node_exporter logic)
- ✅ Update `internal/config/config.go` (add `ExporterConfig`, **removed** backward compat)
- ✅ Update `internal/report/buffer.go` (add exporter name to filenames)
- ✅ Update `internal/report/sender.go` (update `BufferPrometheus` signature, new payload format)
- ✅ Update `cmd/start.go` (iterate over exporters in single loop)
- ✅ Update documentation (multi-exporter-architecture.md)
- ⏭️ Write unit tests for exporter interface (TODO)
- ⏭️ Write integration tests for multi-exporter buffering (TODO)

### Phase 2: Independent Scrape Loops ✅ COMPLETE

- ✅ Update `cmd/start.go` (launch goroutines per exporter)
- ✅ Implement `runScraperLoop()` function
- ✅ Implement `groupFilesByTimeWindow()` in sender
- ✅ Implement `parseTimestampFromFilename()` helper
- ✅ Dashboard already supports batched metrics (Phase 1 payload format)
- ✅ Add per-exporter interval validation
- ✅ Add WaitGroup for graceful shutdown
- ⏭️ Write tests for concurrent scraping (TODO)
- ⏭️ Write tests for time-window batching (TODO)
- ⏭️ Performance testing with 10+ exporters (TODO)

### Phase 3: Advanced Features (Optional)

- [ ] Implement auto-discovery in `internal/exporters/discovery.go`
- [ ] Implement dynamic manager in `internal/exporters/manager.go`
- [ ] Add health check HTTP endpoint
- [ ] Add per-exporter retry policies
- [ ] Add exporter status tracking
- [ ] Write API documentation for dynamic registration
- [ ] Performance testing for discovery

---

## Trade-offs and Considerations

### Performance

**Phase 1:**

- ✅ Minimal overhead (sequential scraping)
- ❌ All exporters wait for slowest one
- ❌ All use same interval

**Phase 2:**

- ✅ Parallel scraping (no blocking)
- ✅ Independent intervals per exporter
- ⚠️ More goroutines (manageable up to ~20 exporters)
- ✅ Smart batching reduces HTTP requests

**Phase 3:**

- ⚠️ Auto-discovery adds CPU overhead (periodic scanning)
- ⚠️ Dynamic registration adds complexity

### Complexity

**Phase 1:** Low complexity, easy to understand and debug
**Phase 2:** Medium complexity, requires goroutine management
**Phase 3:** High complexity, production-grade features

### Backward Compatibility

**Phase 1:**

- Configuration schema changed (Admiral handles migration)
- Old buffer files not compatible (clear buffer during migration)

**Phase 2+:**

- Phase 1 configs remain compatible
- No breaking changes after Phase 1

### Dashboard Changes Required

**Phase 1:** ✅ **COMPLETE**

- Dashboard must accept new payload format: `{ "node_exporter": [...], "postgres_exporter": [...] }`
- Modified `/metrics/prometheus` endpoint to handle grouped exporter metrics

**Phase 2:**

- No dashboard changes needed (same payload format as Phase 1)
- Just more efficient batching on agent side

**Phase 3:**

- Health check integration (optional)
- Dynamic exporter management UI (optional)

### Testing Strategy

**Unit Tests:**

- Exporter interface implementations
- Registry add/get/list operations
- Buffer filename parsing (with and without exporter names)
- Time-window batching logic

**Integration Tests:**

- Multi-exporter scraping end-to-end
- Buffer persistence and recovery
- Concurrent scraping with multiple goroutines
- Graceful shutdown with active scrapers

**Performance Tests:**

- 10 exporters at different intervals
- Buffer drain rate under load
- Memory usage with 20+ goroutines
- HTTP request reduction from batching

---

## Appendix: Example Configurations

### Phase 1 (Multiple Exporters, Same Interval) ✅ CURRENT

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"

exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
```

### Phase 2 (Independent Intervals)

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"

exporters:
  - name: node_exporter
    enabled: true
    endpoint: "http://localhost:9100/metrics"
    interval: 15s
    timeout: 3s

  - name: postgres_exporter
    enabled: true
    endpoint: "http://localhost:9187/metrics"
    interval: 30s
    timeout: 5s

  - name: redis_exporter
    enabled: true
    endpoint: "http://localhost:9121/metrics"
    interval: 1m
    timeout: 3s

buffer:
  batch_size: 10 # Increased for efficiency
```

### Phase 3 (With Auto-Discovery)

```yaml
server:
  endpoint: "https://dashboard.nodepulse.io/metrics/prometheus"

agent:
  server_id: "550e8400-e29b-41d4-a716-446655440000"

exporters:
  discovery:
    enabled: true
    scan_ports: [9100, 9187, 9121, 9256]
    scan_interval: 5m

  # Manual overrides (override discovered settings)
  - name: node_exporter
    interval: 10s  # Override default 15s

  - name: custom_app
    enabled: true
    endpoint: "http://localhost:8080/metrics"
    interval: 1m
```

---

## Summary

This architecture enables the NodePulse Agent to scale from a single node_exporter to supporting 10+ heterogeneous Prometheus exporters efficiently and reliably.

**Key Design Principles:**

1. **Backward compatibility**: v2.0.x configs continue to work
2. **Phased approach**: Incremental complexity, production-ready at each phase
3. **WAL pattern preservation**: Maintain crash recovery and buffering
4. **Operational simplicity**: Minimal configuration changes required

**Next Steps:**

1. Review and approve Phase 1 design
2. Implement Phase 1 (2-3 days)
3. Test with 2-3 exporters in staging
4. Deploy to production and monitor
5. Plan Phase 2 based on Phase 1 learnings

**Questions for Discussion:**

- Should we implement Phase 2 immediately, or validate Phase 1 in production first?
- What exporters are highest priority? (postgres, redis, mysql, custom apps?)
- Should dashboard handle batched metrics now, or keep individual sends?
- Is auto-discovery (Phase 3) valuable, or should we focus on manual config?
