# Node Pulse Data Retention - Quick Reference

## TL;DR

Node Pulse now has **configurable data retention** for metrics:

- **Free tier**: 24h / 48h / 72h (user choice)
- **Pro tier**: 7d / 30d / 90d + TimescaleDB + S3 archival

A new **submarines-cleaner** service automatically deletes old metrics.

---

## Quick Commands

```bash
# Run cleaner manually (deletes metrics older than retention policy)
docker compose run --rm submarines-cleaner

# Dry run (see what would be deleted)
docker compose run --rm -e DRY_RUN=true submarines-cleaner

# Change retention to 48 hours
docker compose exec postgres psql -U postgres -d node_pulse_admiral \
  -c "UPDATE admiral.settings SET value = '48'::jsonb WHERE key = 'retention_hours';"

# View current retention settings
docker compose exec postgres psql -U postgres -d node_pulse_admiral \
  -c "SELECT * FROM admiral.settings WHERE key IN ('retention_hours', 'retention_enabled');"

# Check metrics age distribution
docker compose exec postgres psql -U postgres -d node_pulse_admiral \
  -c "SELECT
        CASE
          WHEN timestamp > NOW() - INTERVAL '24 hours' THEN '< 24h'
          WHEN timestamp > NOW() - INTERVAL '48 hours' THEN '24-48h'
          WHEN timestamp > NOW() - INTERVAL '72 hours' THEN '48-72h'
          ELSE '> 72h'
        END AS age,
        COUNT(*)
      FROM admiral.metrics
      GROUP BY age;"
```

---

## Setup Automated Cleanup

### Option 1: Cron (Simple)

```bash
# Add to crontab
crontab -e

# Run every hour
0 * * * * cd /opt/nodepulse && docker compose run --rm submarines-cleaner >> /var/log/nodepulse-cleaner.log 2>&1
```

### Option 2: Systemd Timer (Recommended)

```bash
# Create files (see cleaner-usage-guide.md for content)
sudo nano /etc/systemd/system/nodepulse-cleaner.timer
sudo nano /etc/systemd/system/nodepulse-cleaner.service

# Enable and start
sudo systemctl enable nodepulse-cleaner.timer
sudo systemctl start nodepulse-cleaner.timer

# Check status
sudo systemctl list-timers
```

---

## Configuration Reference

| Setting                 | Free Tier | Pro Tier |
| ----------------------- | --------- | -------- |
| **retention_hours**     | 24/48/72  | 168+     |
| **retention_enabled**   | true      | true     |
| **tier**                | "free"    | "pro"    |
| **timescaledb_enabled** | false     | true     |
| **s3_archival_enabled** | false     | true     |

---

## File Locations

| File                                                          | Description                |
| ------------------------------------------------------------- | -------------------------- |
| `submarines/cmd/cleaner/main.go`                              | Cleaner entry point        |
| `submarines/internal/cleaner/`                                | Cleaner logic              |
| `migrate/migrations/20251021000002_add_flagship_settings.sql` | Settings table migration   |
| `compose.yml`                                                 | Cleaner service definition |

---

## Docs

- **Architecture**: `.claude/docs/submarines-cleaner-architecture.md`
- **Usage Guide**: `.claude/docs/cleaner-usage-guide.md`
- **Tiering Strategy**: `.claude/docs/tiering-strategy.md`
- **Summary**: `.claude/docs/data-retention-implementation-summary.md`

---

## Troubleshooting

**No metrics deleted?**
→ Check if metrics are actually older than retention policy

**Cleaner fails to start?**
→ Ensure `flagship-migrate` has run: `docker compose run --rm flagship-migrate`

**Want to keep data longer?**
→ Change retention hours: `UPDATE admiral.settings SET value = '72'::jsonb WHERE key = 'retention_hours';`

**Need Pro features?**
→ See `.claude/docs/tiering-strategy.md` for upgrade path

---

## Next Steps

1. ✅ Run migration: `docker compose run --rm flagship-migrate`
2. ✅ Test cleaner: `docker compose run --rm -e DRY_RUN=true submarines-cleaner`
3. ✅ Set up automation: Add cron job or systemd timer
4. 🔜 Build Flagship UI for retention management
5. 🔜 Plan Pro tier features (TimescaleDB, S3)
