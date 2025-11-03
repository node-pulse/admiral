# Prometheus-First Database Schema Design

**Date:** 2025-10-27
**Status:** Implemented (Ready for fresh database deployment)

---

## Philosophy: Prometheus is First-Class

This schema is designed **FROM THE GROUND UP** for Prometheus metrics format. We don't bolt Prometheus support onto an existing schema - we build FOR Prometheus and provide backwards compatibility as a secondary concern.

## Core Design Principles

### 1. Labels are Native Citizens

Prometheus metrics use **labels** (dimensions) extensively:
```
node_filesystem_size_bytes{device="/dev/sda1", mountpoint="/", fstype="ext4"} 107374182400
```

Our schema stores labels in a **JSONB column**, enabling:
- ✅ Unlimited label combinations
- ✅ Fast filtering with GIN indexes
- ✅ Natural fit for Prometheus data model

### 2. One Table for All Metrics

Instead of separate tables for CPU, memory, disk, etc., we have **ONE table** (`metric_samples`) that stores ALL metrics with their labels.

**Why?**
- Prometheus exporters can add new metrics without schema changes
- Easy to add new exporters (postgres, redis, custom)
- Simpler code (one insert path instead of multiple)
- True to Prometheus design philosophy

### 3. Views for SQL Convenience

While the core table is label-based, we provide **SQL views** for common queries:
- `v_cpu_metrics` - CPU stats
- `v_memory_metrics` - Memory stats
- `v_filesystem_metrics` - All filesystems
- `v_network_metrics` - All network interfaces

This gives us **best of both worlds**: Prometheus flexibility + SQL ease-of-use.

---

## Schema Structure

### Primary Table: `metric_samples`

```sql
CREATE TABLE admiral.metric_samples (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL,

    -- Basic fields
    metric_name TEXT NOT NULL,        -- "node_cpu_seconds_total"
    metric_type TEXT NOT NULL,        -- "counter", "gauge", "histogram", "summary"
    labels JSONB DEFAULT '{}'::jsonb, -- {"cpu": "0", "mode": "idle"}
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Histogram/Summary support (NULL for counter/gauge)
    sample_count BIGINT,              -- For _count metrics
    sample_sum DOUBLE PRECISION,      -- For _sum metrics

    -- Exemplar support (tracing integration)
    exemplar JSONB,                   -- {"trace_id": "abc123"}
    exemplar_value DOUBLE PRECISION,
    exemplar_timestamp TIMESTAMP WITH TIME ZONE,

    -- Metadata
    help_text TEXT,
    unit TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Supports ALL 4 Prometheus metric types:**
1. **Counter** - Monotonically increasing value
2. **Gauge** - Value that can go up or down
3. **Histogram** - Bucketed observations with count/sum
4. **Summary** - Quantiles with count/sum

### No Views - Keep It Simple!

**There are NO SQL views or materialized views.**

The dashboard (Laravel + React) queries `metric_samples` directly and decides what to show.

**Why?**
- Views are over-engineering
- Dashboard is smarter - it knows what users need
- Simpler schema = easier maintenance
- More flexible (dashboard can change without migrations)
- True to the spirit: one table, query what you need

### No Backwards Compatibility - Prometheus Only! 🔥

There is **NO legacy metrics table**. This is a **Prometheus-first** implementation.

Old JSON-format agents will need to be refactored to:
1. Scrape node_exporter (or other Prometheus exporters)
2. Push Prometheus text format to Submarines

**Why no backwards compatibility?**
- Clean break for fresh deployments
- Simpler codebase (one data path)
- Forces migration to battle-tested node_exporter
- No dual-write overhead

---

## Data Storage Examples

### Example 1: Counter (CPU Metrics)

**node_exporter output:**
```
node_cpu_seconds_total{cpu="0",mode="idle"} 123456.78
node_cpu_seconds_total{cpu="0",mode="system"} 5678.90
node_cpu_seconds_total{cpu="1",mode="idle"} 234567.89
node_cpu_seconds_total{cpu="1",mode="system"} 6789.01
```

**Database rows:**
```sql
INSERT INTO metric_samples (server_id, metric_name, metric_type, labels, value, timestamp) VALUES
('uuid-1', 'node_cpu_seconds_total', 'counter', '{"cpu":"0","mode":"idle"}', 123456.78, NOW()),
('uuid-1', 'node_cpu_seconds_total', 'counter', '{"cpu":"0","mode":"system"}', 5678.90, NOW()),
('uuid-1', 'node_cpu_seconds_total', 'counter', '{"cpu":"1","mode":"idle"}', 234567.89, NOW()),
('uuid-1', 'node_cpu_seconds_total', 'counter', '{"cpu":"1","mode":"system"}', 6789.01, NOW());
```

### Example 2: Gauge (Filesystem Metrics)

**node_exporter output:**
```
node_filesystem_size_bytes{device="/dev/sda1",mountpoint="/",fstype="ext4"} 107374182400
node_filesystem_size_bytes{device="/dev/sda2",mountpoint="/home",fstype="ext4"} 536870912000
node_filesystem_avail_bytes{device="/dev/sda1",mountpoint="/",fstype="ext4"} 53687091200
node_filesystem_avail_bytes{device="/dev/sda2",mountpoint="/home",fstype="ext4"} 268435456000
```

**Database rows:**
```sql
INSERT INTO metric_samples (server_id, metric_name, labels, value, ...) VALUES
('uuid-1', 'node_filesystem_size_bytes', '{"device":"/dev/sda1","mountpoint":"/","fstype":"ext4"}', 107374182400, ...),
('uuid-1', 'node_filesystem_size_bytes', '{"device":"/dev/sda2","mountpoint":"/home","fstype":"ext4"}', 536870912000, ...),
('uuid-1', 'node_filesystem_avail_bytes', '{"device":"/dev/sda1","mountpoint":"/","fstype":"ext4"}', 53687091200, ...),
('uuid-1', 'node_filesystem_avail_bytes', '{"device":"/dev/sda2","mountpoint":"/home","fstype":"ext4"}', 268435456000, ...);
```

### Example 3: Histogram (HTTP Request Duration)

**Prometheus exporter output:**
```
# HELP http_request_duration_seconds HTTP request latency
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} 24054
http_request_duration_seconds_bucket{le="0.5"} 24300
http_request_duration_seconds_bucket{le="1.0"} 24532
http_request_duration_seconds_bucket{le="+Inf"} 24588
http_request_duration_seconds_sum 53423.7
http_request_duration_seconds_count 24588
```

**Database rows:**
```sql
-- Each bucket is a separate row with le (less than or equal) label
INSERT INTO metric_samples (server_id, metric_name, metric_type, labels, value, sample_count, sample_sum, timestamp) VALUES
('uuid-1', 'http_request_duration_seconds', 'histogram', '{"le":"0.1"}', 24054, NULL, NULL, NOW()),
('uuid-1', 'http_request_duration_seconds', 'histogram', '{"le":"0.5"}', 24300, NULL, NULL, NOW()),
('uuid-1', 'http_request_duration_seconds', 'histogram', '{"le":"1.0"}', 24532, NULL, NULL, NOW()),
('uuid-1', 'http_request_duration_seconds', 'histogram', '{"le":"+Inf"}', 24588, NULL, NULL, NOW()),
-- The _sum and _count are stored separately with sample_count and sample_sum populated
('uuid-1', 'http_request_duration_seconds', 'histogram', '{}', 0, 24588, 53423.7, NOW());
```

**Note:** The last row stores the aggregate count/sum, while bucket rows store cumulative counts per bucket.

### Example 4: Summary (RPC Duration Quantiles)

**Prometheus exporter output:**
```
# HELP rpc_duration_seconds RPC latency quantiles
# TYPE rpc_duration_seconds summary
rpc_duration_seconds{quantile="0.5"} 0.232
rpc_duration_seconds{quantile="0.9"} 1.234
rpc_duration_seconds{quantile="0.99"} 4.123
rpc_duration_seconds_sum 53423.7
rpc_duration_seconds_count 24588
```

**Database rows:**
```sql
-- Each quantile is a separate row
INSERT INTO metric_samples (server_id, metric_name, metric_type, labels, value, sample_count, sample_sum, timestamp) VALUES
('uuid-1', 'rpc_duration_seconds', 'summary', '{"quantile":"0.5"}', 0.232, NULL, NULL, NOW()),
('uuid-1', 'rpc_duration_seconds', 'summary', '{"quantile":"0.9"}', 1.234, NULL, NULL, NOW()),
('uuid-1', 'rpc_duration_seconds', 'summary', '{"quantile":"0.99"}', 4.123, NULL, NULL, NOW()),
-- Aggregate count/sum
('uuid-1', 'rpc_duration_seconds', 'summary', '{}', 0, 24588, 53423.7, NOW());
```

### Example 5: Exemplar (Histogram with Tracing)

**Prometheus exporter output with exemplar:**
```
http_request_duration_seconds_bucket{le="0.1"} 24054 # {trace_id="abc123",span_id="def456"} 0.089 1625097600
```

**Database row:**
```sql
INSERT INTO metric_samples (
    server_id, metric_name, metric_type, labels, value,
    exemplar, exemplar_value, exemplar_timestamp, timestamp
) VALUES (
    'uuid-1',
    'http_request_duration_seconds',
    'histogram',
    '{"le":"0.1"}',
    24054,
    '{"trace_id":"abc123","span_id":"def456"}',
    0.089,
    to_timestamp(1625097600),
    NOW()
);
```

**Use case:** Trace ID links this metric to distributed tracing systems (Jaeger, Zipkin, Tempo) for detailed request investigation.

---

## Query Patterns

### Get Latest CPU Usage Per Core

```sql
SELECT
    labels->>'cpu' as cpu_core,
    labels->>'mode' as cpu_mode,
    value,
    timestamp
FROM admiral.metric_samples
WHERE server_id = 'uuid-here'
  AND metric_name = 'node_cpu_seconds_total'
  AND timestamp > NOW() - INTERVAL '5 minutes'
ORDER BY timestamp DESC, (labels->>'cpu')::int, labels->>'mode'
LIMIT 100;
```

### Get All Filesystems for a Server (Latest)

```sql
SELECT DISTINCT ON (labels->>'mountpoint')
    labels->>'device' as device,
    labels->>'mountpoint' as mountpoint,
    labels->>'fstype' as fstype,
    value / 1024 / 1024 / 1024 as value_gb, -- bytes to GB
    metric_name,
    timestamp
FROM admiral.metric_samples
WHERE server_id = 'uuid-here'
  AND metric_name IN ('node_filesystem_size_bytes', 'node_filesystem_avail_bytes')
  AND timestamp > NOW() - INTERVAL '5 minutes'
  AND labels->>'fstype' NOT IN ('tmpfs', 'devtmpfs', 'overlay')
ORDER BY labels->>'mountpoint', timestamp DESC;
```

### Get Memory Usage Over Time (Last Hour)

```sql
SELECT
    timestamp,
    value / 1024 / 1024 as value_mb, -- bytes to MB
    metric_name
FROM admiral.metric_samples
WHERE server_id = 'uuid-here'
  AND timestamp > NOW() - INTERVAL '1 hour'
  AND metric_name IN ('node_memory_MemTotal_bytes', 'node_memory_MemAvailable_bytes')
ORDER BY timestamp;
```

### Filter by Label (e.g., Only Root Filesystem)

```sql
SELECT
    metric_name,
    value,
    timestamp
FROM admiral.metric_samples
WHERE server_id = 'uuid-here'
  AND metric_name LIKE 'node_filesystem_%'
  AND labels->>'mountpoint' = '/'
  AND timestamp > NOW() - INTERVAL '5 minutes';
```

---

## Index Strategy

### 1. Composite Index for Time-Series Queries

```sql
CREATE INDEX idx_metric_samples_lookup
    ON metric_samples(server_id, metric_name, timestamp DESC);
```

**Optimizes:** Dashboard queries fetching recent metrics for specific metric types.

### 2. GIN Index for Label Filtering

```sql
CREATE INDEX idx_metric_samples_labels
    ON metric_samples USING GIN(labels);
```

**Optimizes:** Queries filtering by label values (e.g., `WHERE labels->>'mountpoint' = '/'`).

### 3. B-Tree Index for Metric Name

```sql
CREATE INDEX idx_metric_samples_metric_name
    ON metric_samples(metric_name);
```

**Optimizes:** Queries filtering by metric name across all servers.

---

## Storage Considerations

### Compression

PostgreSQL's TOAST mechanism automatically compresses large JSONB values. Labels are typically small (< 1KB), so compression overhead is minimal.

### Row Size Estimate

Average row size: **~200-300 bytes**
- `id`: 8 bytes
- `server_id`: 16 bytes
- `metric_name`: ~30 bytes
- `metric_type`: ~10 bytes
- `labels`: ~50-100 bytes (JSONB)
- `value`: 8 bytes
- `timestamp`: 8 bytes
- `created_at`: 8 bytes
- Overhead: ~50 bytes

**Example:** 1000 servers × 150 metrics/server × 1 sample/15s = **~10M rows/day**
- Storage: ~2-3 GB/day (uncompressed)
- With compression + retention: ~500 MB/day

### Retention Strategy

**Recommended retention policies:**
1. **Raw samples:** 7 days (full granularity)
2. **5-minute rollups:** 30 days
3. **1-hour rollups:** 1 year
4. **1-day rollups:** Forever (or 3 years)

Implement with a background job:
```sql
DELETE FROM admiral.metric_samples
WHERE timestamp < NOW() - INTERVAL '7 days';
```

---

## Advantages Over Column-Based Schema

### ❌ Old Schema (Column-Based)

```sql
CREATE TABLE metrics (
    cpu_usage_percent NUMERIC(5,2),
    disk_used_gb DOUBLE PRECISION,  -- Only ONE disk!
    disk_mount_point TEXT,          -- Only ONE!
    ...
);
```

**Problems:**
- Can't handle multiple filesystems without denormalization
- Can't handle per-core CPU metrics
- Adding new metrics requires schema changes
- Can't add new exporters without migrations

### ✅ New Schema (Prometheus-Native)

```sql
CREATE TABLE metric_samples (
    metric_name TEXT,
    labels JSONB,
    value DOUBLE PRECISION,
    ...
);
```

**Benefits:**
- ✅ Handles unlimited filesystems, CPUs, network interfaces
- ✅ Adding new metrics = just INSERT (no schema change)
- ✅ New exporters work immediately (postgres, redis, etc.)
- ✅ True to Prometheus philosophy
- ✅ Future-proof

---

## Deployment Path (Fresh Database)

### Phase 1: Deploy Schema & Infrastructure (Week 1)
1. Run migration: Creates `metric_samples`, views, indexes
2. Deploy node_exporter via Ansible to target servers
3. Update Submarines to parse Prometheus format and write to `metric_samples`

### Phase 2: Agent Refactor (Week 2)
1. Refactor Node Pulse Agent to scrape node_exporter
2. Agent pushes Prometheus text format to Submarines
3. End-to-end testing

### Phase 3: Dashboard Integration (Week 2-3)
1. Update Flagship (Laravel) to query from views (`v_cpu_metrics`, etc.)
2. Build charts using Prometheus metrics
3. Test all dashboard features with real data

---

## Adding New Exporters (Future)

### postgres_exporter Example

**Prometheus metrics:**
```
pg_stat_database_numbackends{datname="mydb"} 42
pg_stat_database_xact_commit{datname="mydb"} 123456
```

**No schema changes needed!** Just:
1. Deploy postgres_exporter via Ansible role
2. Node Pulse Agent scrapes it
3. Submarines ingests it
4. Data appears in `metric_samples` table
5. Create a view for convenience:
   ```sql
   CREATE VIEW v_postgres_metrics AS
   SELECT server_id, timestamp, labels->>'datname' as database, value
   FROM metric_samples
   WHERE metric_name LIKE 'pg_stat_%';
   ```

### Custom Metrics (Your App)

Expose custom metrics in Prometheus format:
```
myapp_requests_total{method="GET",status="200"} 45678
myapp_error_rate{service="api"} 0.02
```

**Zero schema changes!** The `metric_samples` table handles it automatically.

---

## Performance Benchmarks (Expected)

### Write Performance
- **Target:** 10,000+ samples/second
- **Bottleneck:** Digest worker batch inserts
- **Optimization:** Batch inserts of 100-1000 rows

### Read Performance (Dashboard)
- **Materialized view:** < 50ms for latest metrics
- **Time-series query (1 hour):** < 200ms
- **Label filtering:** < 100ms with GIN index

### Storage Growth
- **1000 servers:** ~2-3 GB/day raw
- **With retention (7 days):** ~15-20 GB
- **With rollups:** Additional ~5 GB/year

---

## Conclusion

This Prometheus-first schema design provides:

1. ✅ **Native Prometheus support** - Labels, unlimited metrics, true to design
2. ✅ **Extensibility** - Any exporter works without schema changes
3. ✅ **Performance** - Materialized views + smart indexes
4. ✅ **SQL convenience** - Views for common queries
5. ✅ **Backwards compatibility** - Legacy table for old agents

**Result:** A production-ready, scalable, future-proof metrics storage system! 🚀

---

**Next Steps:**
1. Deploy fresh database with new schema
2. Update Submarines Digest to write to `metric_samples`
3. Update Flagship dashboard to query from views
4. Test with real node_exporter data
