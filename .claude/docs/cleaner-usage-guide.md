# Submarines Cleaner - Usage Guide

**Version**: 1.0
**Last Updated**: 2025-10-21

---

## Overview

The **submarines-cleaner** is a one-shot maintenance job that enforces data retention policies by removing old metrics from the database. It reads retention settings from the `flagship.settings` table and deletes metrics older than the configured period.

---

## Quick Start

### Manual Execution (Development)

```bash
# Run cleaner once
docker compose run --rm submarines-cleaner

# Run with dry-run mode (shows what would be deleted)
docker compose run --rm \
  -e DRY_RUN=true \
  submarines-cleaner
```

### Automated Execution (Production)

#### Option 1: Host Cron (Recommended)

Create a cron job on the host machine:

```bash
# Edit crontab
crontab -e

# Add hourly cleanup (runs at minute 0 of every hour)
0 * * * * cd /opt/nodepulse && docker compose run --rm submarines-cleaner >> /var/log/nodepulse-cleaner.log 2>&1

# Or run daily at 2 AM
0 2 * * * cd /opt/nodepulse && docker compose run --rm submarines-cleaner >> /var/log/nodepulse-cleaner.log 2>&1
```

#### Option 2: Systemd Timer

Create systemd timer and service files:

**File: `/etc/systemd/system/nodepulse-cleaner.timer`**
```ini
[Unit]
Description=NodePulse Metrics Cleaner (hourly)

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

**File: `/etc/systemd/system/nodepulse-cleaner.service`**
```ini
[Unit]
Description=NodePulse Metrics Cleaner
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/nodepulse
ExecStart=/usr/bin/docker compose run --rm submarines-cleaner
```

Enable and start:
```bash
sudo systemctl enable nodepulse-cleaner.timer
sudo systemctl start nodepulse-cleaner.timer

# Check status
sudo systemctl status nodepulse-cleaner.timer
sudo systemctl list-timers

# View logs
sudo journalctl -u nodepulse-cleaner.service -f
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | - | Database password |
| `DB_NAME` | `node_pulse_admiral` | Database name |
| `DB_SCHEMA` | `submarines` | Submarines schema |
| `FLAGSHIP_DB_SCHEMA` | `flagship` | Flagship schema (for settings) |
| `DRY_RUN` | `false` | Dry run mode (don't delete) |
| `LOG_LEVEL` | `info` | Log level |

### Retention Settings (in Database)

The cleaner reads retention policy from `flagship.settings` table:

```sql
-- View current settings
SELECT key, value, description
FROM flagship.settings
WHERE key IN ('retention_hours', 'retention_enabled');

-- Change retention period (24, 48, or 72 hours for Free tier)
UPDATE flagship.settings
SET value = '48'::jsonb
WHERE key = 'retention_hours';

-- Disable retention cleanup
UPDATE flagship.settings
SET value = 'false'::jsonb
WHERE key = 'retention_enabled';

-- Enable retention cleanup
UPDATE flagship.settings
SET value = 'true'::jsonb
WHERE key = 'retention_enabled';
```

---

## Usage Examples

### 1. Test with Dry Run

```bash
# See what would be deleted without actually deleting
docker compose run --rm \
  -e DRY_RUN=true \
  submarines-cleaner
```

**Expected output**:
```
NodePulse Submarines Cleaner
=============================
Database: postgres:5432/node_pulse_admiral (schema: submarines)
Flagship schema: flagship
Log level: info
DRY RUN MODE: No data will be deleted
Connected to PostgreSQL

[INFO] Starting cleanup jobs...
[INFO] Starting metrics retention cleanup...
[INFO] Retention policy: 24 hours
[INFO] Found 15823 metrics older than 24 hours
[INFO] [DRY RUN] Would delete 15823 old metric records
[INFO] All cleanup jobs completed in 234ms

Cleanup completed successfully
```

### 2. Run Actual Cleanup

```bash
# Delete old metrics (based on retention policy)
docker compose run --rm submarines-cleaner
```

**Expected output**:
```
NodePulse Submarines Cleaner
=============================
Database: postgres:5432/node_pulse_admiral (schema: submarines)
Flagship schema: flagship
Log level: info
Connected to PostgreSQL

[INFO] Starting cleanup jobs...
[INFO] Starting metrics retention cleanup...
[INFO] Retention policy: 24 hours
[INFO] Found 15823 metrics older than 24 hours
[INFO] Deleted batch: 10000 rows (total: 10000/15823)
[INFO] Deleted batch: 5823 rows (total: 15823/15823)
[INFO] Deleted 15823 old metric records
[INFO] All cleanup jobs completed in 2.3s

Cleanup completed successfully
```

### 3. Change Retention and Re-run

```bash
# Change retention to 48 hours
docker compose exec postgres psql -U postgres -d node_pulse_admiral <<SQL
UPDATE flagship.settings
SET value = '48'::jsonb
WHERE key = 'retention_hours';
SQL

# Run cleaner (will now keep 48 hours of data)
docker compose run --rm submarines-cleaner
```

### 4. Scheduled Cleanup with Logging

```bash
# Create log directory
mkdir -p /var/log/nodepulse

# Run with output logging
docker compose run --rm submarines-cleaner \
  >> /var/log/nodepulse/cleaner.log 2>&1

# View logs
tail -f /var/log/nodepulse/cleaner.log
```

---

## Troubleshooting

### Issue: "flagship.settings table not found"

**Cause**: Migration hasn't been run yet.

**Solution**:
```bash
# Run flagship migrations
docker compose run --rm flagship-migrate

# Then run cleaner
docker compose run --rm submarines-cleaner
```

### Issue: Cleaner exits with error code 1

**Cause**: Database connection failed or cleanup error.

**Solution**:
```bash
# Check database is running
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Try with increased timeout
docker compose run --rm \
  -e TIMEOUT=600 \
  submarines-cleaner
```

### Issue: No metrics deleted

**Cause**: Either retention is disabled, or all metrics are within retention window.

**Solution**:
```bash
# Check retention settings
docker compose exec postgres psql -U postgres -d node_pulse_admiral \
  -c "SELECT * FROM flagship.settings WHERE key IN ('retention_hours', 'retention_enabled');"

# Check oldest metric timestamp
docker compose exec postgres psql -U postgres -d node_pulse_admiral \
  -c "SELECT MIN(timestamp), MAX(timestamp) FROM submarines.metrics;"
```

### Issue: Cleanup takes too long

**Cause**: Very large number of metrics to delete.

**Solution**: Cleaner deletes in batches of 10,000. For millions of rows, run multiple times or adjust retention policy.

```bash
# Run cleaner multiple times
for i in {1..5}; do
  echo "Run $i..."
  docker compose run --rm submarines-cleaner
  sleep 10
done
```

---

## Monitoring

### Check Cleaner Status

```bash
# View recent cleaner runs (from logs)
docker compose logs submarines-cleaner --tail=100

# Check last exit code
echo $?
# 0 = success
# 1 = failure
```

### Metrics to Monitor

1. **Rows deleted per run**: Should stabilize after initial cleanup
2. **Cleanup duration**: Should be consistent (1-5 seconds for normal load)
3. **Database size**: Should stabilize after retention policy is enforced

```sql
-- Check database size
SELECT
  pg_size_pretty(pg_database_size('node_pulse_admiral')) AS database_size;

-- Check metrics table size
SELECT
  pg_size_pretty(pg_total_relation_size('submarines.metrics')) AS table_size;

-- Count metrics by age
SELECT
  CASE
    WHEN timestamp > NOW() - INTERVAL '24 hours' THEN '< 24h'
    WHEN timestamp > NOW() - INTERVAL '48 hours' THEN '24-48h'
    WHEN timestamp > NOW() - INTERVAL '72 hours' THEN '48-72h'
    ELSE '> 72h'
  END AS age_bucket,
  COUNT(*) AS count
FROM submarines.metrics
GROUP BY age_bucket
ORDER BY age_bucket;
```

---

## Performance Considerations

### Batch Size

Cleaner deletes 10,000 rows per transaction to avoid long-running locks. For very large databases:

- Multiple runs may be needed for initial cleanup
- Subsequent runs should be fast (only new expired data)

### Optimal Schedule

| Data Volume | Agents | Retention | Recommended Schedule |
|-------------|--------|-----------|---------------------|
| < 1M rows | < 10 | 24h | Daily |
| 1-10M rows | 10-50 | 24-48h | Every 6 hours |
| 10M+ rows | 50+ | 48-72h | Hourly |

### Database Impact

- ✅ **Minimal**: Uses small batches with proper indexes
- ✅ **Safe**: Cancellable via SIGTERM/SIGINT
- ✅ **Non-blocking**: Doesn't interfere with ingest/digest

---

## Integration with Flagship

In the future, Flagship admin UI can provide:

1. **Settings Page**: Change retention hours (24/48/72)
2. **Cleanup Dashboard**: View cleanup history and statistics
3. **Manual Trigger**: Button to run cleaner on-demand
4. **Cleanup Schedule**: Configure cron schedule via UI

---

## Security Notes

- ✅ Cleaner requires **write access** to `submarines.metrics` table
- ✅ Read-only access to `flagship.settings` table
- ✅ No access to user data or authentication tables
- ✅ Runs with same database credentials as other services
- ❌ Do not expose cleaner endpoint publicly (one-shot job only)

---

## FAQs

**Q: Can I run multiple cleaner instances simultaneously?**
A: Not recommended. Cleaner is designed to run one instance at a time. Concurrent runs may cause unnecessary database contention.

**Q: What happens if cleaner is killed mid-run?**
A: Safe. Current transaction will rollback. Re-run cleaner to resume cleanup.

**Q: Can I restore deleted metrics?**
A: No. Cleaner permanently deletes data. Use `DRY_RUN=true` to test before actual deletion.

**Q: Does cleaner affect live agents?**
A: No. Cleaner only deletes old metrics. Live ingestion continues unaffected.

**Q: What about database vacuuming?**
A: PostgreSQL will auto-vacuum deleted space. For immediate space reclaim, run:
```sql
VACUUM FULL submarines.metrics;
```

---

## Next Steps

1. ✅ Set up automated scheduling (cron or systemd timer)
2. ✅ Configure retention policy in `flagship.settings`
3. ✅ Monitor cleaner logs and database size
4. ✅ Adjust schedule based on data volume
5. 🔜 Build Flagship UI for retention management

---

## References

- [Submarines Cleaner Architecture](./submarines-cleaner-architecture.md)
- [NodePulse Tiering Strategy](./tiering-strategy.md)
- [Docker Compose Run Reference](https://docs.docker.com/compose/reference/run/)
- [Systemd Timers](https://www.freedesktop.org/software/systemd/man/systemd.timer.html)
