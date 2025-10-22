# Valkey Streams Monitoring Plan

## Overview

This document outlines the plan to implement comprehensive monitoring for the Valkey Streams pipeline in NodePulse Admiral. The goal is to verify correctness of the data flow: **HTTP ingestion → Valkey Streams → PostgreSQL writes**.

## Problem Statement

The current system lacks visibility into:
- Whether messages are being lost in the stream
- If the Valkey container goes down
- If PostgreSQL inserts are failing
- Stream lag and backlog buildup
- Digest worker health status

Manual verification via Redis desktop clients is impractical due to high data volume.

## Solution: Three-Layered Monitoring

### A) Health Streams Endpoint
**Purpose**: Real-time stream health for dashboards and external monitoring

**Implementation**: Add `GET /health/streams` endpoint in Ingest service

**Response Format**:
```json
{
  "stream_length": 1234,
  "pending_count": 5,
  "consumers": [
    {
      "name": "digest-1",
      "pending": 2,
      "last_delivery": "2025-10-21T10:30:00Z"
    }
  ],
  "last_ack": "2025-10-21T10:30:05Z",
  "healthy": true
}
```

**Health Criteria**:
- `healthy = true` if:
  - Stream length < 1000
  - Pending count < 100
  - Last ACK within 60 seconds

**Files to Modify**:
- `submarines/internal/handlers/health.go` (new handler)
- `submarines/cmd/ingest/main.go` (register route)
- `submarines/internal/valkey/valkey.go` (add stream info queries)

---

### B) Self-Monitoring in Digest Worker
**Purpose**: Historical metrics for trend analysis and debugging

**Database Schema**:
```sql
-- Add to migrate/03-backend-schema.sql
CREATE TABLE stream_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  digest_id TEXT NOT NULL,
  stream_length BIGINT NOT NULL,
  pending_count BIGINT NOT NULL,
  messages_processed_last_minute INT NOT NULL,
  messages_failed_last_minute INT NOT NULL,
  last_error TEXT,
  lag_seconds INT,
  INDEX idx_stream_health_timestamp (timestamp DESC)
);

-- Retention policy (optional)
CREATE INDEX idx_stream_health_old ON stream_health(timestamp)
  WHERE timestamp < NOW() - INTERVAL '7 days';
```

**Digest Worker Logic**:
```go
// In submarines/cmd/digest/main.go
type HealthTracker struct {
    processedCount int
    failedCount    int
    lastError      string
    ticker         *time.Ticker
}

// Every 60 seconds:
func (h *HealthTracker) RecordHealthMetrics(ctx context.Context) {
    streamLen := valkeyClient.XLen(ctx, streamKey)
    pendingInfo := valkeyClient.XPending(ctx, streamKey, consumerGroup)

    // Calculate lag
    lag := calculateLag(streamLen, h.processedCount)

    // Insert into stream_health table
    db.Exec(`
        INSERT INTO stream_health
        (digest_id, stream_length, pending_count, messages_processed_last_minute,
         messages_failed_last_minute, last_error, lag_seconds)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, digestID, streamLen, pendingInfo.Count, h.processedCount, h.failedCount, h.lastError, lag)

    // Reset counters
    h.processedCount = 0
    h.failedCount = 0
}
```

**Metrics Collected**:
- Stream length (total messages in stream)
- Pending count (unacknowledged messages)
- Messages processed in last minute
- Messages failed in last minute
- Last error message
- Lag in seconds (estimated delay)

**Files to Modify**:
- `submarines/cmd/digest/main.go` (add health tracking)
- `submarines/internal/database/database.go` (add health insert query)
- `migrate/03-backend-schema.sql` (add table)

---

### C) End-to-End Test Probe
**Purpose**: Synthetic monitoring to verify entire pipeline works

**Architecture**:
```
Test Probe Script (cron/systemd timer)
  ↓
  1. Send test metric with unique ID (e.g., test-metric-<timestamp>)
  ↓
  2. Wait 10 seconds
  ↓
  3. Query PostgreSQL for that metric
  ↓
  4. Alert if missing/delayed
```

**Probe Script** (`submarines/scripts/e2e-probe.sh`):
```bash
#!/bin/bash
set -euo pipefail

ENDPOINT="${ENDPOINT:-http://localhost:8080/metrics}"
PG_CONN="${PG_CONN:-postgresql://admiral:password@localhost:5432/flagship}"
ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"

# 1. Generate unique test metric
TEST_ID="probe-$(date +%s)-$(uuidgen | head -c 8)"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PAYLOAD=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "server_id": "$TEST_ID",
  "hostname": "e2e-probe",
  "system_info": {"os": "test", "arch": "test"},
  "cpu": {"usage_percent": 1.0},
  "memory": {"total_bytes": 1000, "used_bytes": 100}
}
EOF
)

# 2. Send to ingest endpoint
echo "[$(date)] Sending test metric: $TEST_ID"
curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 5

# 3. Wait for processing
echo "[$(date)] Waiting 10 seconds for processing..."
sleep 10

# 4. Verify in PostgreSQL
echo "[$(date)] Verifying metric in database..."
RESULT=$(psql "$PG_CONN" -t -c "SELECT COUNT(*) FROM backend.metrics WHERE server_id = '$TEST_ID'")

if [ "$RESULT" -eq 0 ]; then
  echo "[$(date)] ❌ ALERT: Metric $TEST_ID NOT FOUND in database!"

  # Send alert (optional webhook)
  if [ -n "$ALERT_WEBHOOK" ]; then
    curl -X POST "$ALERT_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"E2E Probe Failed: Metric $TEST_ID not found\",\"severity\":\"critical\"}"
  fi

  exit 1
else
  echo "[$(date)] ✅ SUCCESS: Metric $TEST_ID found in database"
  exit 0
fi
```

**Deployment Options**:

1. **Cron Job** (simple):
```cron
# Run every 5 minutes
*/5 * * * * /opt/nodepulse/scripts/e2e-probe.sh >> /var/log/nodepulse-probe.log 2>&1
```

2. **Systemd Timer** (recommended):
```ini
# /etc/systemd/system/nodepulse-probe.timer
[Unit]
Description=NodePulse E2E Probe Timer

[Timer]
OnCalendar=*:0/5
Persistent=true

[Install]
WantedBy=timers.target
```

3. **Docker Service** (for Admiral stack):
```yaml
# Add to compose.yml
  probe:
    build:
      context: ./submarines
      dockerfile: Dockerfile.probe
    environment:
      - ENDPOINT=http://ingest:8080/metrics
      - PG_CONN=postgresql://admiral:${DB_PASSWORD}@postgres:5432/flagship
      - ALERT_WEBHOOK=${SLACK_WEBHOOK:-}
    depends_on:
      - ingest
      - postgres
    restart: unless-stopped
```

**Files to Create**:
- `submarines/scripts/e2e-probe.sh` (bash script)
- `submarines/Dockerfile.probe` (optional, for containerized version)
- Documentation in systemd timer setup

---

## Implementation Phases

### Phase 1: Health Endpoint (1-2 hours)
- [ ] Create `submarines/internal/handlers/health.go`
- [ ] Add Valkey XINFO STREAM and XPENDING queries
- [ ] Register `/health/streams` route in Ingest
- [ ] Test endpoint manually
- [ ] Add to Docker healthcheck

### Phase 2: Self-Monitoring (2-3 hours)
- [ ] Create `stream_health` table migration
- [ ] Implement `HealthTracker` struct in digest worker
- [ ] Add 60-second ticker for metrics collection
- [ ] Test with multiple digest instances
- [ ] Verify metrics in PostgreSQL

### Phase 3: E2E Probe (1-2 hours)
- [ ] Write `e2e-probe.sh` script
- [ ] Test locally against Admiral stack
- [ ] Create systemd timer unit (optional)
- [ ] Add Docker service to compose.yml (optional)
- [ ] Configure alerting webhook (Slack/PagerDuty)

### Phase 4: Dashboard Integration (Future)
- [ ] Create Flagship admin page to view `stream_health` metrics
- [ ] Add charts for stream lag over time
- [ ] Display E2E probe success rate
- [ ] Alert when probe fails

---

## Success Criteria

After implementation, you can verify stream correctness by:

1. **Real-time**: Check `GET /health/streams` endpoint
   - Stream length should be low (< 1000)
   - Pending count should be minimal (< 100)
   - Last ACK should be recent (< 60s ago)

2. **Historical**: Query `stream_health` table
   ```sql
   SELECT
     timestamp,
     digest_id,
     stream_length,
     messages_processed_last_minute,
     lag_seconds
   FROM stream_health
   WHERE timestamp > NOW() - INTERVAL '1 hour'
   ORDER BY timestamp DESC;
   ```

3. **End-to-End**: Check probe logs
   ```bash
   tail -f /var/log/nodepulse-probe.log
   # Should show "✅ SUCCESS" every 5 minutes
   ```

---

## Alerting Rules (Future)

Based on collected metrics, set up alerts for:

- **Stream Lag > 5 minutes**: Digest workers are falling behind
- **Pending Count > 500**: Messages stuck in processing
- **E2E Probe Fails 3 times consecutively**: Pipeline is broken
- **Digest Worker Silent for > 2 minutes**: Worker crashed or stuck
- **Stream Length > 10,000**: Incoming traffic overwhelming workers

---

## Files Summary

### New Files
- `submarines/internal/handlers/health.go`
- `submarines/scripts/e2e-probe.sh`
- `submarines/Dockerfile.probe` (optional)
- `migrate/XX-add-stream-health-table.sql`

### Modified Files
- `submarines/cmd/ingest/main.go` (add health route)
- `submarines/cmd/digest/main.go` (add health tracking)
- `submarines/internal/valkey/valkey.go` (add stream info methods)
- `submarines/internal/database/database.go` (add health insert)
- `compose.yml` (add probe service, optional)
- `CLAUDE.md` (document monitoring architecture)

---

## Notes

- Keep retention policy for `stream_health` (e.g., 7 days) to avoid bloat
- E2E probe can be extended to test different metric types
- Consider Prometheus/Grafana integration in the future for advanced dashboards
- Health endpoint should NOT have authentication (for uptime monitoring services)

---

**Status**: Planning Phase
**Priority**: High (critical for production reliability)
**Estimated Effort**: 6-8 hours total
