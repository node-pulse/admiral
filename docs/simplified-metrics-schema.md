# Simplified Metrics Schema - Implementation Plan

## Status Update

**Current Progress**: Phase 1 - Database Schema ✅ (Partially Complete)

**Completed**:
- ✅ Modified `migrate/migrations/20251016211918470_initial_schema.sql`
- ✅ Replaced `metric_samples` table with `metrics` table (30+ dedicated columns)
- ✅ Added optimized indexes for time-series queries

**Next Steps**:
1. Test migration (drop and re-run)
2. Update existing code references to use `metrics`
3. Implement agent-side Prometheus parser
4. Update Submarines ingest endpoint
5. Update Flagship dashboard queries

---

## Executive Summary

**Goal**: Replace the generic Prometheus `metric_samples` table (JSONB-based) with a simplified `metrics` table that stores only essential metrics in dedicated columns.

**Benefits**:
- ✅ 99% reduction in network usage (50KB → 500 bytes per scrape)
- ✅ 95% reduction in database storage (1100 rows → 1 row per scrape)
- ✅ 10x faster queries (direct column access vs JSONB parsing)
- ✅ Simpler application code (no complex JSONB queries)
- ✅ Better PostgreSQL query optimization (column statistics)

## Current Architecture

### Agent Flow (Current)
```
Agent → Scrapes node_exporter (localhost:9100)
      → Gets 50KB+ Prometheus text (1100+ metrics)
      → Sends entire payload to Admiral
      → Admiral parses and stores everything in metric_samples
```

### Database (Current)
```sql
-- Generic JSONB-based storage
CREATE TABLE admiral.metric_samples (
    id BIGSERIAL,
    server_id TEXT,
    metric_name TEXT,
    metric_type TEXT,
    labels JSONB,              -- {"cpu": "0", "mode": "idle"}
    value DOUBLE PRECISION,
    timestamp TIMESTAMP WITH TIME ZONE
    -- 1100+ rows per scrape per server
);
```

### Query Complexity (Current)
```sql
-- Example: Get CPU usage
SELECT
    timestamp,
    (labels->>'value')::numeric as cpu_usage
FROM metric_samples
WHERE server_id = 'abc123'
  AND metric_name = 'node_cpu_seconds_total'
  AND labels->>'mode' = 'idle'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;
```

---

## Proposed Architecture

### Agent Flow (New)
```
Agent → Scrapes node_exporter (localhost:9100)
      → Parses Prometheus text locally
      → Extracts only 15-20 essential metrics
      → Calculates percentages (CPU, Memory, Disk)
      → Sends compact JSON (~500 bytes)
      → Admiral stores in metrics (1 row)
```

### Database Schema (New)

```sql
-- Simplified time-series table with real columns
CREATE TABLE admiral.metrics (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- ===========================================
    -- CPU Metrics (seconds, raw values from counters)
    -- ===========================================
    cpu_idle_seconds DOUBLE PRECISION,       -- Total CPU idle time (all cores combined)
    cpu_iowait_seconds DOUBLE PRECISION,     -- Total CPU I/O wait time
    cpu_system_seconds DOUBLE PRECISION,     -- Total CPU system mode time
    cpu_user_seconds DOUBLE PRECISION,       -- Total CPU user mode time
    cpu_steal_seconds DOUBLE PRECISION,      -- Total CPU steal time (virtualization)
    cpu_cores INTEGER,                       -- Number of CPU cores

    -- ===========================================
    -- Memory Metrics (bytes, raw values)
    -- ===========================================
    memory_total_bytes BIGINT,               -- Total RAM
    memory_available_bytes BIGINT,           -- Available RAM (best metric for "free" memory)
    memory_free_bytes BIGINT,                -- Free RAM (raw, before cache reclaim)
    memory_cached_bytes BIGINT,              -- Page cache
    memory_buffers_bytes BIGINT,             -- Buffers
    memory_active_bytes BIGINT,              -- Active memory
    memory_inactive_bytes BIGINT,            -- Inactive memory

    -- ===========================================
    -- Swap Metrics (bytes, raw values)
    -- ===========================================
    swap_total_bytes BIGINT,                 -- Total swap space
    swap_free_bytes BIGINT,                  -- Free swap space
    swap_cached_bytes BIGINT,                -- Cached swap

    -- ===========================================
    -- Disk Metrics (root filesystem, bytes)
    -- ===========================================
    disk_total_bytes BIGINT,                 -- Total disk space (/)
    disk_free_bytes BIGINT,                  -- Free disk space
    disk_available_bytes BIGINT,             -- Available disk space (for non-root users)

    -- ===========================================
    -- Disk I/O (counters and totals)
    -- ===========================================
    disk_reads_completed_total BIGINT,       -- Total disk reads completed
    disk_writes_completed_total BIGINT,      -- Total disk writes completed
    disk_read_bytes_total BIGINT,            -- Total bytes read
    disk_written_bytes_total BIGINT,         -- Total bytes written
    disk_io_time_seconds_total DOUBLE PRECISION, -- Total time spent doing I/Os

    -- ===========================================
    -- Network Metrics (counters and totals)
    -- ===========================================
    network_receive_bytes_total BIGINT,      -- Total bytes received
    network_transmit_bytes_total BIGINT,     -- Total bytes transmitted
    network_receive_packets_total BIGINT,    -- Total packets received
    network_transmit_packets_total BIGINT,   -- Total packets transmitted
    network_receive_errs_total BIGINT,       -- Total receive errors
    network_transmit_errs_total BIGINT,      -- Total transmit errors
    network_receive_drop_total BIGINT,       -- Total receive drops
    network_transmit_drop_total BIGINT,      -- Total transmit drops

    -- ===========================================
    -- System Load Average
    -- ===========================================
    load_1min DOUBLE PRECISION,              -- 1-minute load average
    load_5min DOUBLE PRECISION,              -- 5-minute load average
    load_15min DOUBLE PRECISION,             -- 15-minute load average

    -- ===========================================
    -- Process Counts
    -- ===========================================
    processes_running INTEGER,               -- Runnable processes
    processes_blocked INTEGER,               -- Blocked processes
    processes_total INTEGER,                 -- Total processes

    -- ===========================================
    -- System Uptime
    -- ===========================================
    uptime_seconds BIGINT,                   -- System uptime in seconds

    -- ===========================================
    -- Metadata
    -- ===========================================
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Efficient time-series index (most common query pattern)
CREATE INDEX idx_metrics_lookup
    ON admiral.metrics(server_id, timestamp DESC);

-- For time-based retention queries
CREATE INDEX idx_metrics_timestamp
    ON admiral.metrics(timestamp DESC);

-- For aggregation queries (optional, if needed)
CREATE INDEX idx_metrics_server_created
    ON admiral.metrics(server_id, created_at DESC);
```

### Query Simplicity (New)

```sql
-- Get latest metrics for a server (with calculated percentages)
SELECT
    timestamp,
    -- Calculate CPU usage % from raw counters
    ROUND(100 - (cpu_idle_seconds / NULLIF(cpu_idle_seconds + cpu_user_seconds + cpu_system_seconds + cpu_iowait_seconds + cpu_steal_seconds, 0) * 100), 2) as cpu_usage_percent,
    -- Calculate memory usage %
    ROUND((memory_total_bytes - memory_available_bytes)::numeric / NULLIF(memory_total_bytes, 0) * 100, 2) as memory_usage_percent,
    -- Calculate disk usage %
    ROUND((disk_total_bytes - disk_available_bytes)::numeric / NULLIF(disk_total_bytes, 0) * 100, 2) as disk_usage_percent,
    -- Raw values also available
    load_1min,
    load_5min,
    load_15min
FROM metrics
WHERE server_id = 'abc123'
ORDER BY timestamp DESC
LIMIT 1;

-- Calculate CPU usage rate over time (better approach using LAG)
SELECT
    timestamp,
    -- Calculate CPU usage delta between samples
    CASE
        WHEN prev_total > 0 THEN
            ROUND(100 - ((cpu_idle_seconds - prev_idle) / NULLIF(total_delta, 0) * 100), 2)
        ELSE NULL
    END as cpu_usage_percent
FROM (
    SELECT
        timestamp,
        cpu_idle_seconds,
        cpu_user_seconds + cpu_system_seconds + cpu_iowait_seconds + cpu_idle_seconds + cpu_steal_seconds as cpu_total,
        LAG(cpu_idle_seconds) OVER (ORDER BY timestamp) as prev_idle,
        LAG(cpu_user_seconds + cpu_system_seconds + cpu_iowait_seconds + cpu_idle_seconds + cpu_steal_seconds) OVER (ORDER BY timestamp) as prev_total,
        (cpu_user_seconds + cpu_system_seconds + cpu_iowait_seconds + cpu_idle_seconds + cpu_steal_seconds) -
        LAG(cpu_user_seconds + cpu_system_seconds + cpu_iowait_seconds + cpu_idle_seconds + cpu_steal_seconds) OVER (ORDER BY timestamp) as total_delta
    FROM metrics
    WHERE server_id = 'abc123'
      AND timestamp > NOW() - INTERVAL '1 hour'
) t
ORDER BY timestamp ASC;

-- Calculate network throughput (bytes/sec) from counters
SELECT
    timestamp,
    -- Calculate rate from counter deltas
    CASE
        WHEN time_delta > 0 THEN
            (network_receive_bytes_total - prev_rx_bytes) / time_delta
        ELSE 0
    END as rx_bytes_per_sec,
    CASE
        WHEN time_delta > 0 THEN
            (network_transmit_bytes_total - prev_tx_bytes) / time_delta
        ELSE 0
    END as tx_bytes_per_sec
FROM (
    SELECT
        timestamp,
        network_receive_bytes_total,
        network_transmit_bytes_total,
        LAG(network_receive_bytes_total) OVER (ORDER BY timestamp) as prev_rx_bytes,
        LAG(network_transmit_bytes_total) OVER (ORDER BY timestamp) as prev_tx_bytes,
        EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp))) as time_delta
    FROM metrics
    WHERE server_id = 'abc123'
      AND timestamp > NOW() - INTERVAL '1 hour'
) t
ORDER BY timestamp ASC;

-- Simple average memory over 24 hours
SELECT
    AVG((memory_total_bytes - memory_available_bytes)::numeric / NULLIF(memory_total_bytes, 0) * 100) as avg_memory_percent,
    MAX(load_1min) as max_load_1min,
    MIN(memory_available_bytes) as min_available_memory
FROM metrics
WHERE server_id = 'abc123'
  AND timestamp > NOW() - INTERVAL '24 hours';
```

---

## Network Usage Comparison

### Before (Raw Prometheus)
```
Scrape size: 50KB (1100+ lines of Prometheus text)
Frequency: 15 seconds (4 per minute)
Per minute: 50KB × 4 = 200KB
Per hour: 200KB × 60 = 12MB
Per day: 12MB × 24 = 288MB
Per month: 288MB × 30 = 8.6GB per server
```

### After (Parsed JSON - Raw Values)
```json
{
  "timestamp": "2025-10-30T12:34:56Z",
  "cpu_idle_seconds": 1795391.65,
  "cpu_iowait_seconds": 72.51,
  "cpu_system_seconds": 780.76,
  "cpu_user_seconds": 1927.71,
  "cpu_steal_seconds": 32.21,
  "cpu_cores": 4,
  "memory_total_bytes": 8326443008,
  "memory_available_bytes": 7920050176,
  "memory_free_bytes": 7333859328,
  "memory_cached_bytes": 705810432,
  "memory_buffers_bytes": 82661376,
  "swap_total_bytes": 9126801408,
  "swap_free_bytes": 9126801408,
  "disk_total_bytes": 63291133952,
  "disk_free_bytes": 52458450944,
  "disk_available_bytes": 49220956160,
  "disk_read_bytes_total": 218590208,
  "disk_written_bytes_total": 17304298496,
  "network_receive_bytes_total": 3838803310,
  "network_transmit_bytes_total": 2084791688,
  "load_1min": 0.15,
  "load_5min": 0.12,
  "load_15min": 0.08,
  "processes_running": 2,
  "processes_blocked": 0,
  "uptime_seconds": 1799456
}

Scrape size: ~700 bytes (JSON with 25+ fields of raw values)
Frequency: 15 seconds
Per minute: 700 bytes × 4 = 2.8KB
Per hour: 2.8KB × 60 = 168KB
Per day: 168KB × 24 = 4MB
Per month: 4MB × 30 = 120MB per server

SAVINGS: 98.6% reduction (8.6GB → 120MB)

**Why raw values instead of percentages?**
- More flexible: Dashboard can calculate percentages, rates, or deltas as needed
- Better for alerting: Can alert on absolute values (e.g., "disk < 10GB") not just percentages
- Enables rate calculations: Counter deltas give accurate throughput metrics
- Future-proof: New calculations possible without changing schema
```

---

## Implementation TODO List

### Phase 1: Database Schema Migration ✅

#### 1.1 Update Existing Migration File
- [x] Modified `migrate/migrations/20251016211918470_initial_schema.sql`
- [x] Replaced `metric_samples` table with `metrics` table
- [x] Added all 30+ dedicated columns for metrics
- [x] Added indexes: `idx_metrics_lookup`, `idx_metrics_timestamp`, `idx_metrics_server_created`
- [x] Updated index documentation comments
- [ ] Test migration: `npm run migrate down` and `npm run migrate up`

#### 1.2 Run Migration
- [ ] Drop existing database schema: `npm run migrate down`
- [ ] Re-run migration: `npm run migrate up`
- [ ] Verify table created: `\d admiral.metrics`
- [ ] Verify indexes created: `\di admiral.idx_metrics_*`
- [ ] Verify old `metric_samples` table is gone

**Note**: Since we modified the initial migration, any existing data in `metric_samples` will be lost when re-running migrations. For production systems with existing data, a separate data migration strategy would be needed.

#### 1.3 Database Design Philosophy

**No Foreign Keys Policy**:
- ✅ All foreign key constraints removed from migrations
- ✅ Relationships managed at application level (ORM/code)
- ✅ Better performance (no FK lookup overhead)
- ✅ More flexibility (can keep metrics after server deletion)
- ✅ Simpler schema changes (no cascade issues)

**Tables Affected**:
- `metrics` - No FK on `server_id`
- `alerts` - No FK on `server_id`
- `server_private_keys` - No FK on `server_id` or `private_key_id`
- `ssh_sessions` - No FK on `server_id` or `user_id`
- `ssh_session_recordings` - No FK on `session_id`
- `deployment_servers` - No FK on `deployment_id` or `server_id`

#### 1.4 Update References to `metric_samples` Table

The following files currently reference `metric_samples` and need to be updated to use `metrics`:

**Flagship (Laravel)**:
- [ ] `flagship/app/Models/MetricSample.php` - Update model to use `metrics` table (no relationships)
- [ ] `flagship/app/Http/Controllers/DashboardController.php` - Update queries (4 references)

**Submarines (Go)**:
- [ ] `submarines/cmd/digest/main.go` - Update INSERT statement
- [ ] `submarines/internal/cleaner/metrics.go` - Update retention cleanup queries (3 references)
- [ ] `submarines/internal/handlers/prometheus.go` - Update documentation comments

---

### Phase 2: Agent - Prometheus Parser 🔧

#### 2.1 Create Metrics Parser Package
**File**: `agent/internal/prometheus/parser.go`

- [ ] Create `MetricSnapshot` struct with all fields
- [ ] Implement `ParsePrometheusMetrics([]byte) (*MetricSnapshot, error)`
- [ ] Parse CPU metrics from `node_cpu_seconds_total`
  - [ ] Extract idle, user, system, iowait per-CPU
  - [ ] Calculate weighted average across all CPUs
  - [ ] Calculate `cpu_usage_percent = 100 - cpu_idle_percent`
- [ ] Parse memory metrics
  - [ ] `node_memory_MemTotal_bytes`
  - [ ] `node_memory_MemAvailable_bytes`
  - [ ] `node_memory_Cached_bytes`
  - [ ] `node_memory_Buffers_bytes`
  - [ ] Calculate `memory_used_bytes = total - available`
  - [ ] Calculate `memory_usage_percent = (used / total) × 100`
- [ ] Parse swap metrics
  - [ ] `node_memory_SwapTotal_bytes`
  - [ ] `node_memory_SwapFree_bytes`
  - [ ] Calculate `swap_used_bytes` and `swap_usage_percent`
- [ ] Parse disk metrics (root filesystem `/`)
  - [ ] `node_filesystem_size_bytes{mountpoint="/"}`
  - [ ] `node_filesystem_avail_bytes{mountpoint="/"}`
  - [ ] Calculate `disk_used_bytes` and `disk_usage_percent`
- [ ] Parse disk I/O metrics
  - [ ] `node_disk_read_bytes_total` (counter - need rate calculation)
  - [ ] `node_disk_written_bytes_total` (counter - need rate calculation)
  - [ ] `node_disk_io_time_seconds_total` (for utilization %)
- [ ] Parse network metrics (primary interface, e.g., eth0)
  - [ ] `node_network_receive_bytes_total{device="eth0"}`
  - [ ] `node_network_transmit_bytes_total{device="eth0"}`
  - [ ] `node_network_receive_errs_total{device="eth0"}`
  - [ ] `node_network_transmit_errs_total{device="eth0"}`
- [ ] Parse load average
  - [ ] `node_load1`, `node_load5`, `node_load15`
- [ ] Parse process counts
  - [ ] `node_procs_running`
  - [ ] `node_procs_blocked`
- [ ] Parse uptime
  - [ ] `node_boot_time_seconds` → calculate uptime
- [ ] Add unit tests for parser

#### 2.2 Create Rate Calculator (for Counters)
**File**: `agent/internal/prometheus/rate.go`

- [ ] Create `RateCalculator` struct to track previous counter values
- [ ] Implement `CalculateRate(metricName string, currentValue float64, timestamp time.Time) float64`
- [ ] Handle counter resets (when current < previous)
- [ ] Store previous values in memory (map[string]struct{value, timestamp})
- [ ] Add tests for rate calculation

#### 2.3 Update Agent Main Loop
**File**: `agent/main.go` or wherever the scraping loop is

- [ ] After scraping Prometheus text, call `ParsePrometheusMetrics()`
- [ ] Convert `MetricSnapshot` to JSON
- [ ] Send JSON to Admiral endpoint `/metrics/json` (new endpoint)
- [ ] Add error handling and logging
- [ ] Add fallback: if parsing fails, optionally send raw Prometheus format

#### 2.4 Add Configuration
**File**: `agent/internal/config/config.go`

- [ ] Add `MetricsFormat string` to config (options: "parsed", "prometheus", "both")
- [ ] Default to "parsed" for new installations
- [ ] Add `NetworkInterface string` config for network metrics (default: "eth0")
- [ ] Add `DiskMountpoint string` config for disk metrics (default: "/")

#### 2.5 Testing
- [ ] Unit tests for `ParsePrometheusMetrics()` with sample Prometheus text
- [ ] Unit tests for rate calculator
- [ ] Integration test: scrape real node_exporter and parse
- [ ] Verify JSON output format matches `MetricSnapshot` struct

---

### Phase 3: Submarines - New Endpoint 🚢

#### 3.1 Create New Handler
**File**: `submarines/internal/handlers/metrics_json.go`

- [ ] Create `HandleMetricsJSON(c *gin.Context)` handler
- [ ] Accept JSON payload matching agent's `MetricSnapshot` struct
- [ ] Validate required fields (server_id, timestamp)
- [ ] Add request logging
- [ ] Return 200 OK on success, appropriate errors on failure

#### 3.2 Database Insert
**File**: `submarines/internal/database/metrics.go`

- [ ] Create `InsertMetrics(serverID string, metrics *MetricSnapshot) error`
- [ ] Map `MetricSnapshot` fields to `metrics` table columns
- [ ] Use prepared statement for performance
- [ ] Handle NULL values gracefully (some metrics may be optional)
- [ ] Add database error handling

#### 3.3 Update Server Last Seen
- [ ] After successful metrics insert, update `servers.last_seen_at`
- [ ] Update `servers.status = 'active'`
- [ ] Use transaction to ensure atomicity

#### 3.4 Register Route
**File**: `submarines/cmd/ingest/main.go`

- [ ] Add route: `router.POST("/metrics/json", handlers.HandleMetricsJSON)`
- [ ] Keep existing `/metrics/prometheus` route for backward compatibility
- [ ] Add middleware for request logging

#### 3.5 Testing
- [ ] Unit tests for JSON parsing and validation
- [ ] Integration test: POST sample JSON to `/metrics/json`
- [ ] Verify data inserted into `metrics` table
- [ ] Test error cases (missing fields, invalid JSON, etc.)

---

### Phase 4: Flagship - Dashboard Updates 🎨

#### 4.1 Update Eloquent Model
**File**: `flagship/app/Models/Metric.php`

- [ ] Create new `Metric` model for `metrics` table
- [ ] Define `$fillable` fields
- [ ] Define `$table = 'metrics'`
- [ ] **No relationships** (query directly by `server_id` column)
- [ ] Add scopes for common queries (e.g., `scopeRecent`, `scopeForServer`)

#### 4.2 Update Server Model
**File**: `flagship/app/Models/Server.php`

- [ ] **No relationship methods** (query metrics directly)
- [ ] Add helper method: `public function getLatestMetrics()` - queries `metrics` table directly
- [ ] Add helper method: `public function getMetricsInRange($start, $end)` - direct query, no ORM relationship

#### 4.3 Update Dashboard Controller
**File**: `flagship/app/Http/Controllers/DashboardController.php`

- [ ] Replace JSONB queries with simple column queries
- [ ] Update server list to fetch latest metrics using `latestMetrics()`
- [ ] Update metrics charts to query `metrics` table
- [ ] Optimize queries using eager loading

#### 4.4 Update API Endpoints
**File**: `flagship/app/Http/Controllers/Api/MetricsController.php`

- [ ] Update `/api/servers/{id}/metrics` to query `metrics` table
- [ ] Add time range filtering (last hour, last day, etc.)
- [ ] Add aggregation endpoints (avg, min, max)
- [ ] Return JSON in format expected by frontend charts

#### 4.5 Update Frontend Components
**File**: `flagship/resources/js/components/servers/metrics-chart.tsx`

- [ ] Update to expect simplified data structure (no JSONB parsing)
- [ ] Update chart data mapping for new column names
- [ ] Add loading states and error handling
- [ ] Test with real data from new API

#### 4.6 Testing
- [ ] Test dashboard displays correct metrics
- [ ] Test charts render correctly with new data structure
- [ ] Test API endpoints return expected format
- [ ] Test performance improvements (measure query times)

---

### Phase 5: Migration Strategy 🔄

#### 5.1 Backward Compatibility
- [ ] Keep `metric_samples` table for existing data (don't drop)
- [ ] Keep `/metrics/prometheus` endpoint active
- [ ] Add feature flag in Flagship to toggle between old/new schema
- [ ] Update agent deployment playbook to support both formats

#### 5.2 Data Migration (Optional)
**File**: `migrate/scripts/migrate_metrics.sql`

- [ ] Create script to convert existing `metric_samples` data to `metrics`
- [ ] Aggregate old data (e.g., average metrics per minute)
- [ ] Run migration during off-peak hours
- [ ] Verify data integrity after migration

#### 5.3 Rollout Plan
1. [ ] **Week 1**: Deploy new schema and endpoints (parallel with old system)
2. [ ] **Week 2**: Deploy updated agent to test servers (10% rollout)
3. [ ] **Week 3**: Monitor performance, fix bugs
4. [ ] **Week 4**: Full agent rollout (100%)
5. [ ] **Week 5**: Deprecate old `/metrics/prometheus` endpoint
6. [ ] **Week 6**: Drop `metric_samples` table (after backup)

---

### Phase 6: Performance Optimization ⚡

#### 6.1 Database Tuning
- [ ] Analyze query performance with `EXPLAIN ANALYZE`
- [ ] Add additional indexes if needed
- [ ] Configure PostgreSQL autovacuum for `metrics` table
- [ ] Set up partitioning by timestamp (if data volume is very high)

#### 6.2 Data Retention Policy
- [ ] Keep raw 15-second data for 7 days
- [ ] Aggregate to 1-minute averages after 7 days
- [ ] Aggregate to 5-minute averages after 30 days
- [ ] Aggregate to 1-hour averages after 90 days
- [ ] Create retention cleanup job (cron or Laravel scheduled task)

#### 6.3 Caching
- [ ] Cache latest metrics in Redis (5-second TTL)
- [ ] Cache dashboard aggregations (1-minute TTL)
- [ ] Implement cache warming for frequently accessed servers

#### 6.4 Monitoring
- [ ] Add metrics for ingest endpoint latency
- [ ] Monitor database insert performance
- [ ] Track network bandwidth savings
- [ ] Set up alerts for failed metrics ingestion

---

### Phase 7: Documentation 📝

#### 7.1 Update Project Docs
- [ ] Update `CLAUDE.md` with new schema information
- [ ] Update API documentation with `/metrics/json` endpoint
- [ ] Document `MetricSnapshot` JSON format
- [ ] Add migration guide for existing deployments

#### 7.2 Agent Documentation
- [ ] Document new configuration options
- [ ] Add examples for `metrics_format` config
- [ ] Document metric parsing logic
- [ ] Add troubleshooting guide

#### 7.3 Developer Docs
- [ ] Add database schema diagram
- [ ] Document query patterns and best practices
- [ ] Add performance benchmarks
- [ ] Create runbook for common issues

---

## Expected Performance Improvements

### Network Bandwidth
| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Per scrape | 50KB | 500B | 99% |
| Per day (1 server) | 288MB | 2.8MB | 99% |
| Per month (100 servers) | 860GB | 8.4GB | 99% |

### Database Storage
| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| Rows per scrape | 1100 | 1 | 99.9% |
| Row size | ~200 bytes | ~300 bytes | -50% |
| **Total per scrape** | 220KB | 300B | 99.8% |

### Query Performance
| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| Latest metrics | 150ms | 5ms | 30x faster |
| Time-series (1 hour) | 800ms | 50ms | 16x faster |
| Aggregations | 2000ms | 100ms | 20x faster |

---

## Risk Assessment

### High Risk ⚠️
- **Breaking changes for existing agents**: Mitigation → Keep both endpoints active during transition
- **Data loss during migration**: Mitigation → Backup before migration, test on staging first

### Medium Risk ⚙️
- **Parser bugs causing metric loss**: Mitigation → Extensive unit tests, fallback to raw format
- **Rate calculation errors**: Mitigation → Test with known datasets, add validation

### Low Risk ✅
- **Performance regression**: Mitigation → Benchmark before/after, monitor in production
- **Dashboard display issues**: Mitigation → A/B testing, gradual rollout

---

## Success Metrics

### Technical Metrics
- [ ] 95%+ reduction in network usage
- [ ] 90%+ reduction in database storage
- [ ] 10x+ improvement in query performance
- [ ] Zero data loss during migration
- [ ] <1% parsing error rate

### Business Metrics
- [ ] Support 10x more servers on same infrastructure
- [ ] Reduce cloud costs (bandwidth, storage)
- [ ] Faster dashboard loading times
- [ ] Better user experience

---

## Rollback Plan

If issues arise during rollout:

1. **Immediate**: Revert agent config to use `/metrics/prometheus` endpoint
2. **Dashboard**: Toggle feature flag back to use `metric_samples` table
3. **Database**: Keep both tables for 30 days before dropping `metric_samples`
4. **Post-mortem**: Analyze failures, fix bugs, re-test before retry

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Database Schema | 1 day | None |
| Phase 2: Agent Parser | 3-4 days | Phase 1 |
| Phase 3: Submarines API | 2 days | Phase 1 |
| Phase 4: Flagship Updates | 2-3 days | Phase 3 |
| Phase 5: Migration Strategy | 1 week | Phase 4 |
| Phase 6: Optimization | Ongoing | Phase 5 |
| Phase 7: Documentation | 2 days | All phases |

**Total Estimated Time**: 2-3 weeks for full implementation and rollout

---

## Open Questions / Decisions Needed

1. **Network Interface Detection**: Should agent auto-detect primary interface or use config?
   - Recommendation: Auto-detect with config override

2. **Disk Metrics**: Track only root `/` or all mountpoints?
   - Recommendation: Start with `/` only, add multi-disk support later

3. **CPU Calculation**: Per-core metrics or overall average?
   - Recommendation: Overall average (simpler), add per-core in separate table if needed

4. **Backward Compatibility Window**: How long to support dual format?
   - Recommendation: 30 days minimum, 90 days for large deployments

5. **Rate Calculation**: Agent-side or server-side?
   - Recommendation: Agent-side (reduces server load)

---

## Next Steps

1. **Review this plan** with team/stakeholders
2. **Approve schema design** and metric selection
3. **Set up development branch** for this work
4. **Start with Phase 1** (database migration)
5. **Iterate and test** each phase before proceeding

---

## References

- Current schema: `migrate/migrations/20251016211918470_initial_schema.sql`
- Prometheus metrics: `metric.txt` (example output from node_exporter)
- Agent codebase: `/Users/yumin/ventures/node-pulse-stack/agent`
- Submarines codebase: `/Users/yumin/ventures/node-pulse-stack/admiral/submarines`
- Flagship codebase: `/Users/yumin/ventures/node-pulse-stack/admiral/flagship`

---

**Document Version**: 1.1
**Created**: 2025-10-30
**Last Updated**: 2025-10-30
**Status**: In Progress - Phase 1 Schema Update Complete
