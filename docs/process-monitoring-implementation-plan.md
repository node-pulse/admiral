# Plan: Add "Top 10 Processes by CPU/Memory" Feature

**Status:** APPROVED - Starting Implementation
**Date:** 2025-10-30
**Timeline:** 6-7 days

## Overview
Add per-process monitoring to NodePulse dashboard, showing the top 10 processes consuming CPU and memory resources on each server.

## Current State
- ✅ Agent scrapes `node_exporter` (provides aggregate process counts only)
- ✅ Database stores `processes_running`, `processes_blocked`, `processes_total`
- ❌ No per-process data (PID, command name, CPU%, memory per process)
- ❌ `process_exporter` not deployed

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Target Server                                  │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐    │
│  │  node_exporter   │  │ process_exporter │    │
│  │  :9100/metrics   │  │  :9256/metrics   │    │
│  └────────┬─────────┘  └────────┬─────────┘    │
│           │                     │                │
│           └──────────┬──────────┘                │
│                      │ Scrape                    │
│                      ▼                           │
│           ┌────────────────────┐                 │
│           │  NodePulse Agent   │                 │
│           │  - Multi-exporter  │                 │
│           │  - Buffer & Push   │                 │
│           └─────────┬──────────┘                 │
└─────────────────────┼──────────────────────────┘
                      │ HTTPS POST
                      ▼
           ┌──────────────────────┐
           │  Submarines Ingest   │
           │  /metrics/prometheus │
           └──────────┬───────────┘
                      │
                      ▼
              Valkey Stream → Digest → PostgreSQL
```

## Implementation Plan

### Phase 1: Deploy process_exporter (Ansible)
**Files**: `ansible/roles/process-exporter/`, `ansible/playbooks/prometheus/deploy-process-exporter.yml`

1. Create Ansible role for process_exporter
2. Download and install binary (latest from GitHub)
3. Configure systemd service (localhost:9256)
4. Configure which processes to track:
   - Top CPU consumers (all processes)
   - Group by: comm (command name)
5. Add to existing node deployment playbook

**Config**: `/etc/process-exporter/config.yml`
```yaml
process_names:
  - name: "{{.Comm}}"
    cmdline: []
```

### Phase 2: Update Agent (Multi-Exporter Support) ✅ COMPLETED

**Status**: ✅ Implementation Complete (2025-10-31)
**Files**:
- `agent/internal/prometheus/process_exporter_parser.go` ✅ Created
- `agent/internal/report/sender.go` ✅ Updated to support multi-exporter payloads

**Implementation Details**:
1. ✅ Created `ProcessExporterMetricSnapshot` struct (flat, no wrapper)
2. ✅ Parser extracts metrics:
   - `namedprocess_namegroup_cpu_seconds_total{groupname="..."}`
   - `namedprocess_namegroup_memory_bytes{groupname="...", memtype="resident"}`
   - `namedprocess_namegroup_num_procs{groupname="..."}`
3. ✅ Agent already supports multi-exporter (via `config.Exporters` array)
4. ✅ Sender builds payload with both exporters:
   ```json
   {
     "node_exporter": [
       { "timestamp": "...", "cpu_idle_seconds": ..., ... }
     ],
     "process_exporter": [
       { "timestamp": "...", "name": "nginx", "num_procs": 4, ... },
       { "timestamp": "...", "name": "postgres", "num_procs": 8, ... }
     ]
   }
   ```
5. ✅ Type-safe implementation using separate slices (not `interface{}`)
6. ✅ **Flat array structure**: Agent sends `[]ProcessExporterMetricSnapshot` directly
7. ✅ **No wrapper in agent**: Each process is a standalone snapshot with timestamp

**Agent Config**: `/etc/nodepulse/nodepulse.yml`
```yaml
exporters:
  - name: "node_exporter"
    enabled: true
    endpoint: "http://127.0.0.1:9100/metrics"
    interval: "15s"

  - name: "process_exporter"  # NEW
    enabled: true
    endpoint: "http://127.0.0.1:9256/metrics"
    interval: "15s"
```

### Phase 3: Database Schema (New Table) ✅ COMPLETED

**Status**: ✅ Implementation Complete (2025-10-31)
**Files**:
- `migrate/migrations/20251030203553001_create_process_snapshots_table.sql` ✅ Created

Created new table: `admiral.process_snapshots`

```sql
CREATE TABLE admiral.process_snapshots (
    id BIGSERIAL PRIMARY KEY,
    server_id TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    process_name TEXT NOT NULL,           -- Command name (e.g., "nginx", "postgres")
    num_procs INTEGER NOT NULL,            -- Number of processes with this name
    cpu_seconds_total DOUBLE PRECISION,    -- Total CPU time (counter)
    memory_bytes BIGINT,                   -- Resident memory (RSS)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_process_snapshots_lookup
    ON admiral.process_snapshots(server_id, timestamp DESC);
CREATE INDEX idx_process_snapshots_server_name
    ON admiral.process_snapshots(server_id, process_name, timestamp DESC);
```

**Design Decision**: Store ALL processes, calculate top 10 in query (flexible)

### Phase 4: Submarines Ingest & Digest ✅ COMPLETED

**Status**: ✅ Implementation Complete (2025-10-31)
**Files**:
- `submarines/internal/handlers/prometheus.go` ✅ Updated
- `submarines/cmd/digest/main.go` ✅ Updated

**Implementation Details**:
1. ✅ Updated `IngestPrometheusMetrics` handler to use `json.RawMessage` for flexible parsing
2. ✅ Detects `process_exporter` in payload and parses as flat array
3. ✅ **Publishes each process individually** to Valkey Stream (same pattern as node_exporter)
4. ✅ Digest processes individual snapshots and inserts into `process_snapshots` table
5. ✅ Cleanup: Deletes process snapshots older than retention period
6. ✅ **Removed unnecessary wrapper** - uses simple flat structure throughout

**Payload Format** (multi-exporter from agent):
```json
{
  "node_exporter": [
    {
      "timestamp": "2025-10-30T12:00:00Z",
      "cpu_idle_seconds": 7184190.53,
      ... (39 fields)
    }
  ],
  "process_exporter": [
    {
      "timestamp": "2025-10-30T12:00:00Z",
      "name": "nginx",
      "num_procs": 4,
      "cpu_seconds_total": 1234.56,
      "memory_bytes": 104857600
    },
    {
      "timestamp": "2025-10-30T12:00:00Z",
      "name": "postgres",
      "num_procs": 8,
      "cpu_seconds_total": 5678.90,
      "memory_bytes": 512000000
    }
  ]
}
```

**Data Flow** (Simplified):
1. **Agent → Submarines**: Sends flat array `[{name: "nginx", ...}, {name: "postgres", ...}]`
2. **Ingest Handler**: Publishes each process individually (N messages to Valkey Stream)
3. **Valkey Stream**: N messages (one per process)
4. **Digest Worker**: Processes each message → Inserts 1 row per process
5. **Database**: N rows in `process_snapshots` table (one per process group)

**Pattern Consistency**:
- Both `node_exporter` and `process_exporter` use the **same simple pattern**
- No special wrappers or batching - each snapshot becomes one Valkey message
- Clean, simple, and easy to understand!

### Phase 5: Backend API (Laravel)
**Files**: `flagship/app/Http/Controllers/ProcessController.php`, `flagship/routes/api.php`

Create new endpoint: `GET /api/servers/{id}/processes/top`

**Query Parameters**:
- `metric`: `cpu` or `memory` (default: cpu)
- `limit`: integer (default: 10)
- `hours`: time range (default: 1)

**Response**:
```json
{
  "server_id": "uuid",
  "metric": "cpu",
  "time_range_hours": 1,
  "processes": [
    {
      "name": "postgres",
      "num_procs": 8,
      "cpu_percent": 45.2,        // Calculated from delta
      "memory_mb": 488.3,
      "avg_cpu_percent": 42.1,    // Average over time range
      "peak_memory_mb": 512.0
    },
    // ... top 10
  ]
}
```

**SQL Query** (Top 10 by CPU):
```sql
WITH deltas AS (
  SELECT
    server_id,
    timestamp,
    process_name,
    memory_bytes,
    cpu_seconds_total,
    LAG(cpu_seconds_total) OVER (
      PARTITION BY server_id, process_name
      ORDER BY timestamp
    ) as prev_cpu,
    LAG(timestamp) OVER (
      PARTITION BY server_id, process_name
      ORDER BY timestamp
    ) as prev_ts
  FROM admiral.process_snapshots
  WHERE server_id = ?
    AND timestamp >= NOW() - INTERVAL '1 hour'
)
SELECT
  process_name,
  AVG(num_procs) as avg_procs,
  AVG((cpu_seconds_total - prev_cpu) /
      EXTRACT(EPOCH FROM (timestamp - prev_ts)) * 100) as avg_cpu_percent,
  MAX(memory_bytes) as peak_memory_bytes
FROM deltas
WHERE prev_cpu IS NOT NULL
GROUP BY process_name
ORDER BY avg_cpu_percent DESC
LIMIT 10;
```

### Phase 6: Frontend Components
**Files**: `flagship/resources/js/components/servers/process-list.tsx`

Create new component: `ProcessList`

**Features**:
- Table view with columns: Process Name, CPU%, Memory, Count
- Toggle between CPU and Memory sorting
- Time range selector (1h, 6h, 24h)
- Auto-refresh every 15s
- Click process name → drill-down to process history chart

**Integration**: Add to server details page

### Phase 7: Testing & Documentation
**Files**: `docs/process-monitoring.md`

1. Test process_exporter deployment via Ansible
2. Test agent scraping both exporters
3. Test top 10 calculation accuracy
4. Document deployment steps
5. Document alert rules (e.g., "PostgreSQL using >80% CPU")

## File Manifest

### New Files
1. `ansible/roles/process-exporter/tasks/main.yml`
2. `ansible/roles/process-exporter/defaults/main.yml`
3. `ansible/roles/process-exporter/templates/process_exporter.service.j2`
4. `ansible/roles/process-exporter/templates/config.yml.j2`
5. `ansible/playbooks/prometheus/deploy-process-exporter.yml`
6. ✅ `agent/internal/prometheus/process_exporter_parser.go` (COMPLETED)
7. `agent/internal/prometheus/process_exporter_parser_test.go` (TODO)
8. `migrate/migrations/YYYYMMDDHHMMSS_create_process_snapshots_table.sql`
9. `submarines/internal/models/process.go`
10. `flagship/app/Http/Controllers/ProcessController.php`
11. `flagship/app/Models/ProcessSnapshot.php`
12. `flagship/resources/js/components/servers/process-list.tsx`
13. `docs/process-monitoring.md`

### Modified Files
1. `agent/internal/config/config.go` (Already supports multi-exporter - no changes needed)
2. ✅ `agent/internal/report/sender.go` (COMPLETED - added process_exporter handling)
3. ✅ `submarines/internal/handlers/prometheus.go` (COMPLETED - publishes individual ProcessSnapshot)
4. ✅ `submarines/cmd/digest/main.go` (COMPLETED - processes individual ProcessSnapshot)
5. `flagship/routes/api.php` (Add process routes)
6. `flagship/resources/js/pages/servers/show.tsx` (Add ProcessList component)
7. ✅ `docs/simplified-metrics-schema.md` (UPDATED - documented flat array structure)
8. ✅ `docs/process-monitoring-implementation-plan.md` (THIS FILE - UPDATED)

## Timeline (Updated 2025-10-31)
- ✅ Phase 1 (Ansible): 1 day - **PENDING**
- ✅ Phase 2 (Agent): 1 day - **COMPLETED**
- ✅ Phase 3 (Database): 0.5 day - **COMPLETED**
- ✅ Phase 4 (Submarines): 1 day - **COMPLETED**
- Phase 5 (Backend API): 1 day - **PENDING**
- Phase 6 (Frontend): 1.5 days - **PENDING**
- Phase 7 (Testing/Docs): 0.5 day - **PENDING**

**Total: ~6-7 days** | **Progress: 3.5/7 days (50%)**

## Rollout Strategy
1. Deploy process_exporter to test server
2. Update agent config to scrape both exporters
3. Verify data flowing to database
4. Deploy backend API
5. Deploy frontend
6. Gradual rollout to production servers

## Future Enhancements
- Process alerting (CPU/memory thresholds)
- Process history charts (trend over time)
- Process kill/restart actions (via SSH)
- Custom process grouping (regex patterns)
- Multi-server process comparison

## Notes
- process_exporter groups processes by command name (not PID)
- CPU is calculated from counter deltas (requires 2+ data points)
- Memory is instantaneous (RSS - Resident Set Size)
- Default retention: 7 days for process snapshots
- Agent already supports multiple exporters (no config changes needed)
