# Node Pulse Data Retention Strategy

**Date:** 2025-10-27
**Status:** Approved

---

## Overview

Node Pulse uses a **tiered retention strategy** aligned with Prometheus ecosystem standards:
- **7 days raw data** (MVP)
- **Future: 30 days aggregated** (5-minute averages)
- **Future: 90 days aggregated** (1-hour averages)

---

## Phase 1: Simple Retention (MVP)

### Configuration

**Raw metrics retention:** **7 days**

```
0-7 days:    Raw Prometheus metrics (15s interval)
> 7 days:    DELETE
```

### Why 7 Days?

1. **Covers 99% of troubleshooting scenarios**
   - Most issues are detected within hours
   - 7 days provides ample historical context

2. **Manageable storage costs**
   - For 1000 servers: ~3 TB for 7 days
   - Predictable, linear growth

3. **Simple to implement**
   - Single `DELETE` query daily
   - No complex aggregation logic needed for MVP

4. **Industry standard for self-hosted monitoring**
   - Prometheus default: 15 days
   - Most self-hosted solutions: 7-30 days

---

## Storage Estimates

### For 1000 Servers

**Assumptions:**
- node_exporter produces ~150 metrics per scrape
- Scrape interval: 15 seconds
- Row size: ~500 bytes (including indexes, JSONB labels)

**Daily metrics:**
- Scrapes/day per server: 5,760
- Metrics/day per server: 5,760 × 150 = 864,000 rows
- **Total rows/day: 864 million rows**
- **Storage/day: ~432 GB**

**7-day retention:**
- Total rows: 864M × 7 = **6 billion rows**
- **Total storage: ~3 TB**

**30-day retention (NOT recommended for raw data):**
- Total rows: 864M × 30 = **26 billion rows**
- **Total storage: ~13 TB** (too expensive!)

### Scaling Formula

```
Storage (GB) = Servers × 150 metrics × (86400 / interval_seconds) × retention_days × 500 bytes / 1GB

For 100 servers with 7-day retention:
100 × 150 × (86400 / 15) × 7 × 500 / 1e9 = ~300 GB

For 1000 servers with 7-day retention:
1000 × 150 × (86400 / 15) × 7 × 500 / 1e9 = ~3 TB

For 10000 servers with 7-day retention:
10000 × 150 × (86400 / 15) × 7 × 500 / 1e9 = ~30 TB
```

---

## Implementation

### Database Schema

**Use PostgreSQL partitioning for efficient deletion:**

```sql
-- Create partitioned table
CREATE TABLE admiral.metric_samples (
    id BIGSERIAL NOT NULL,
    server_id UUID NOT NULL,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    labels JSONB DEFAULT '{}'::jsonb,
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    sample_count BIGINT,
    sample_sum DOUBLE PRECISION,
    exemplar JSONB,
    exemplar_value DOUBLE PRECISION,
    exemplar_timestamp TIMESTAMP WITH TIME ZONE,
    help_text TEXT,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (timestamp);

-- Create daily partitions (automated via cron or Laravel command)
CREATE TABLE admiral.metric_samples_2025_10_27
    PARTITION OF admiral.metric_samples
    FOR VALUES FROM ('2025-10-27 00:00:00+00') TO ('2025-10-28 00:00:00+00');

-- Indexes on each partition
CREATE INDEX idx_metric_samples_2025_10_27_server_timestamp
    ON admiral.metric_samples_2025_10_27 (server_id, timestamp DESC);
CREATE INDEX idx_metric_samples_2025_10_27_metric_labels
    ON admiral.metric_samples_2025_10_27 USING GIN (labels);
```

### Cleanup Job (Laravel Scheduler)

**File:** `flagship/app/Console/Commands/CleanupOldMetrics.php`

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CleanupOldMetrics extends Command
{
    protected $signature = 'metrics:cleanup {--dry-run}';
    protected $description = 'Delete metrics older than retention period';

    public function handle()
    {
        $retentionDays = 7;
        $cutoffDate = now()->subDays($retentionDays);

        $this->info("Cleaning up metrics older than {$cutoffDate}...");

        // Get all partitions older than retention period
        $oldPartitions = DB::select("
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'admiral'
            AND tablename LIKE 'metric_samples_%'
            AND tablename < 'metric_samples_' || to_char(?, 'YYYY_MM_DD')
        ", [$cutoffDate]);

        if (empty($oldPartitions)) {
            $this->info('No old partitions to clean up.');
            return 0;
        }

        foreach ($oldPartitions as $partition) {
            $tableName = $partition->tablename;

            if ($this->option('dry-run')) {
                $this->line("Would drop table: admiral.{$tableName}");
            } else {
                DB::statement("DROP TABLE IF EXISTS admiral.{$tableName}");
                $this->info("Dropped partition: admiral.{$tableName}");
            }
        }

        $this->info('Cleanup completed successfully.');
        return 0;
    }
}
```

**Schedule in:** `flagship/app/Console/Kernel.php`

```php
protected function schedule(Schedule $schedule)
{
    // Run daily at 2 AM UTC
    $schedule->command('metrics:cleanup')
        ->dailyAt('02:00')
        ->onOneServer()
        ->withoutOverlapping();
}
```

### Partition Creation Job

**File:** `flagship/app/Console/Commands/CreateMetricPartitions.php`

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CreateMetricPartitions extends Command
{
    protected $signature = 'metrics:create-partitions {--days=7}';
    protected $description = 'Create metric_samples partitions for upcoming days';

    public function handle()
    {
        $daysAhead = (int) $this->option('days');

        for ($i = 0; $i < $daysAhead; $i++) {
            $date = now()->addDays($i);
            $partitionName = 'metric_samples_' . $date->format('Y_m_d');
            $dateFrom = $date->format('Y-m-d 00:00:00+00');
            $dateTo = $date->addDay()->format('Y-m-d 00:00:00+00');

            // Check if partition exists
            $exists = DB::selectOne("
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'admiral'
                AND tablename = ?
            ", [$partitionName]);

            if ($exists) {
                $this->line("Partition {$partitionName} already exists, skipping.");
                continue;
            }

            // Create partition
            DB::statement("
                CREATE TABLE admiral.{$partitionName}
                PARTITION OF admiral.metric_samples
                FOR VALUES FROM ('{$dateFrom}') TO ('{$dateTo}')
            ");

            // Create indexes
            DB::statement("
                CREATE INDEX idx_{$partitionName}_server_timestamp
                ON admiral.{$partitionName} (server_id, timestamp DESC)
            ");

            DB::statement("
                CREATE INDEX idx_{$partitionName}_metric_labels
                ON admiral.{$partitionName} USING GIN (labels)
            ");

            $this->info("Created partition: {$partitionName}");
        }

        $this->info('Partition creation completed.');
        return 0;
    }
}
```

**Schedule in:** `flagship/app/Console/Kernel.php`

```php
protected function schedule(Schedule $schedule)
{
    // Create partitions for next 7 days, run daily at 1 AM UTC
    $schedule->command('metrics:create-partitions --days=7')
        ->dailyAt('01:00')
        ->onOneServer();
}
```

---

## Phase 2: Tiered Retention (Future)

### Configuration

```
0-7 days:    Raw data (15s interval)           - ~6B rows
7-30 days:   5-minute averages                 - ~240M rows
30-90 days:  1-hour averages                   - ~40M rows
> 90 days:   DELETE
```

### Storage Estimates (1000 servers)

**7 days raw:** ~3 TB
**30 days aggregated (5-min):** ~120 GB
**90 days aggregated (1-hour):** ~20 GB

**Total: ~3.14 TB** (vs. 13 TB for 30 days raw)

### Aggregation Tables

```sql
-- 5-minute aggregates
CREATE TABLE admiral.metric_samples_5min (
    server_id UUID NOT NULL,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    labels JSONB DEFAULT '{}'::jsonb,
    value_avg DOUBLE PRECISION,
    value_min DOUBLE PRECISION,
    value_max DOUBLE PRECISION,
    value_count INT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (server_id, metric_name, labels, timestamp)
) PARTITION BY RANGE (timestamp);

-- 1-hour aggregates
CREATE TABLE admiral.metric_samples_1hour (
    server_id UUID NOT NULL,
    metric_name TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    labels JSONB DEFAULT '{}'::jsonb,
    value_avg DOUBLE PRECISION,
    value_min DOUBLE PRECISION,
    value_max DOUBLE PRECISION,
    value_count INT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (server_id, metric_name, labels, timestamp)
) PARTITION BY RANGE (timestamp);
```

### Aggregation Job

**Run before deleting old raw data:**

```sql
-- Aggregate 7-day-old data into 5-minute buckets
INSERT INTO admiral.metric_samples_5min
SELECT
    server_id,
    metric_name,
    metric_type,
    labels,
    AVG(value) as value_avg,
    MIN(value) as value_min,
    MAX(value) as value_max,
    COUNT(*) as value_count,
    date_trunc('hour', timestamp) + INTERVAL '5 minutes' * FLOOR(EXTRACT(minute FROM timestamp) / 5) as timestamp
FROM admiral.metric_samples
WHERE timestamp >= now() - INTERVAL '8 days'
  AND timestamp < now() - INTERVAL '7 days'
GROUP BY server_id, metric_name, metric_type, labels,
    date_trunc('hour', timestamp) + INTERVAL '5 minutes' * FLOOR(EXTRACT(minute FROM timestamp) / 5)
ON CONFLICT DO NOTHING;
```

---

## Industry Comparison

| Service | Raw Retention | Aggregated | Total Storage (1000 servers) |
|---------|--------------|------------|------------------------------|
| **Node Pulse (MVP)** | 7 days | None | ~3 TB |
| **Node Pulse (Phase 2)** | 7 days | 90 days | ~3.14 TB |
| **Prometheus** | 15 days | None | ~6 TB |
| **Victoria Metrics** | Unlimited | Optional | Highly compressed (~500 GB) |
| **Datadog** | 15 months | Built-in | N/A (SaaS) |
| **Grafana Cloud** | 13 months | Built-in | N/A (SaaS) |

---

## Monitoring Retention Health

### Metrics to Track

1. **Storage usage:**
   - `metric_samples` table size
   - Total database size
   - Growth rate per day

2. **Row counts:**
   - Rows per partition
   - Total rows across all partitions

3. **Query performance:**
   - Average query time
   - Slow query logs

### Queries

```sql
-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'admiral'
AND tablename LIKE 'metric_samples%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Count rows per partition
SELECT
    tablename,
    (xpath('/row/cnt/text()',
        query_to_xml(format('select count(*) as cnt from admiral.%I', tablename), false, true, ''))
    )[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'admiral'
AND tablename LIKE 'metric_samples_%'
ORDER BY tablename DESC;

-- Check oldest and newest data
SELECT
    MIN(timestamp) as oldest_metric,
    MAX(timestamp) as newest_metric,
    MAX(timestamp) - MIN(timestamp) as retention_period
FROM admiral.metric_samples;
```

---

## Summary

**Node Pulse Data Retention:**

### Phase 1 (MVP) - Approved ✅
- **7 days raw data** at 15-second intervals
- **~3 TB storage** for 1000 servers
- **PostgreSQL partitioning** for efficient cleanup
- **Daily cleanup job** (drop old partitions)

### Phase 2 (Future)
- **30 days aggregated** (5-minute averages)
- **90 days aggregated** (1-hour averages)
- **~3.14 TB total storage** for 1000 servers

### Implementation Priority
1. ✅ Week 1: Create partitioned table schema
2. ✅ Week 1: Implement daily partition creation
3. ✅ Week 1: Implement daily cleanup job
4. ⏳ Week 2-3: Add aggregation tables (optional)
5. ⏳ Week 2-3: Implement aggregation jobs (optional)

**This retention strategy balances cost, performance, and usefulness for troubleshooting.** 🚀
