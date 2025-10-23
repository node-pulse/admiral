# NodePulse Tiering Strategy

**Version**: 1.0
**Last Updated**: 2025-10-21
**Status**: Design Document

---

## Overview

NodePulse uses a **tiered feature model** to provide value at different price points while maintaining a fully functional free tier for small teams and hobby projects.

---

## Tier Comparison

| Feature                    | Free                          | Pro                        |
| -------------------------- | ----------------------------- | -------------------------- |
| **Real-time Monitoring**   | ✅                            | ✅                         |
| **Agent Connections**      | Unlimited                     | Unlimited                  |
| **Data Retention**         | 24h / 48h / 72h (user choice) | 7d / 30d / 90d / Custom    |
| **Storage Backend**        | PostgreSQL                    | TimescaleDB                |
| **Historical Queries**     | Up to 72 hours                | Full history               |
| **S3 Compliance Archival** | ❌                            | ✅                         |
| **Data Compression**       | ❌                            | ✅ (90% reduction)         |
| **Continuous Aggregates**  | ❌                            | ✅ (pre-computed rollups)  |
| **Advanced Alerting**      | Basic rules                   | Multi-condition + Webhooks |
| **Data Export**            | ❌                            | ✅ (CSV/JSON)              |
| **Support**                | Community                     | Priority                   |

---

## Free Tier

### Target Audience

- Small teams (1-10 servers)
- Hobby projects
- Development/staging environments
- Non-critical monitoring

### Features

- ✅ Real-time metrics ingestion (5s intervals)
- ✅ Basic PostgreSQL storage
- ✅ **Configurable retention**: 24h / 48h / 72h (default: 24h)
- ✅ Automatic cleanup via `submarines-cleaner`
- ✅ Basic alerting (CPU, memory, disk, network)
- ✅ Dashboard & charts (limited to retention window)
- ✅ Unlimited agents

### Technical Implementation

- **Storage**: Plain PostgreSQL 18
- **Retention**: Configured in `admiral.settings` table
- **Cleanup**: `submarines-cleaner` binary (runs hourly via cron)
- **Default**: 24 hours retention

### Why Free Tier Matters

- Lowers barrier to entry
- Builds community and adoption
- Sufficient for most development workflows
- Clear upgrade path when needs grow

---

## Pro Tier

### Target Audience

- Production environments
- Teams with compliance requirements (SOC2, ISO27001, HIPAA)
- Enterprises managing 50+ servers
- Organizations needing long-term trend analysis

### Premium Features

#### 1. **TimescaleDB Storage**

- 10x faster time-range queries
- 90% storage reduction via compression
- Automatic partitioning (hypertables)
- Optimized for time-series workloads

#### 2. **Extended Retention**

- 7 days / 30 days / 90 days / Custom
- Historical trend analysis
- Capacity planning with long-term data
- Incident investigation beyond 72 hours

#### 3. **S3 Compliance Archival**

- Automatic dual-write to S3
- Long-term storage (1+ years)
- Compliance audit trails
- Cost-effective cold storage
- Queryable via Athena (optional)

#### 4. **Continuous Aggregates**

- Pre-computed hourly/daily/weekly rollups
- Instant dashboard loading
- Reduced query load on database
- Historical charts at any time range

#### 5. **Advanced Alerting**

- Multi-condition rules (CPU + Memory combined)
- Webhook notifications (PagerDuty, Slack, etc.)
- Alert correlation
- Custom threshold schedules (business hours)

#### 6. **Data Export**

- CSV/JSON export for compliance
- Automated report generation
- Integration with external tools
- Audit log retention

#### 7. **Priority Support**

- Direct support channel
- SLA guarantees
- Architecture review
- Custom feature requests

### Technical Implementation

- **Storage**: TimescaleDB (PostgreSQL extension)
- **Archival**: S3-compatible storage (AWS S3, MinIO, etc.)
- **Retention**: Configurable via Flagship admin UI
- **License**: License key validation system

---

## Upgrade Path

### Free → Pro Migration

1. Admin enables Pro tier in Flagship settings
2. Enters license key (validates with licensing server)
3. System detects TimescaleDB extension availability
4. Runs migration to convert `admiral.metrics` to hypertable
5. Enables S3 archival (if credentials configured)
6. UI unlocks Pro features

### Backward Compatibility

- Pro tier can fall back to Free features if:
  - TimescaleDB extension unavailable
  - S3 credentials not configured
  - License key expired (grace period)

---

## Implementation Phases

### Phase 1: Free Tier (Current)

- ✅ Core monitoring functionality
- ✅ PostgreSQL storage
- ✅ Basic retention (24h/48h/72h configurable)
- ✅ `submarines-cleaner` for automatic cleanup
- ✅ Flagship settings table

### Phase 2: Feature Flags

- Add `tier` column to `admiral.settings`
- Add Pro feature detection (TimescaleDB, S3)
- UI shows "Upgrade to Pro" badges
- Backend checks tier before enabling features

### Phase 3: Pro Features

- TimescaleDB hypertable conversion
- S3 dual-write in `submarines-ingest`
- Continuous aggregates
- Advanced alerting engine
- Export functionality

### Phase 4: Monetization

- License key system
- Self-hosted Pro (annual license)
- SaaS pricing (monthly per server)
- Billing integration (Stripe)

---

## Business Model

### Self-Hosted Licensing

- **Free**: $0 (unlimited servers, 24-72h retention)
- **Pro**: $99/month or $999/year (per instance, unlimited servers)

### SaaS Pricing (Future)

- **Free**: $0 (up to 5 servers, 24h retention)
- **Pro**: $10/server/month (billed annually)

### Enterprise

- Custom pricing
- Dedicated support
- On-premise deployment assistance
- Custom integrations

---

## Technical Architecture

### Storage Decision Matrix

| Tier | Storage     | Retention Cleanup           | Why                         |
| ---- | ----------- | --------------------------- | --------------------------- |
| Free | PostgreSQL  | `submarines-cleaner`        | Simpler, fewer dependencies |
| Pro  | TimescaleDB | Built-in retention policies | Performance, compression    |

### Services by Tier

#### Free Tier Services

```
submarines-ingest  (HTTP → Valkey Stream)
submarines-digest  (Valkey Stream → PostgreSQL)
submarines-cleaner (Cleanup old metrics)
submarines-status  (Public status pages)
flagship           (Admin dashboard)
cruiser            (Public site)
```

#### Pro Tier Additional

```
submarines-archiver (PostgreSQL → S3)
submarines-aggregator (Continuous aggregates computation)
```

---

## Configuration

### Flagship Settings Table (`admiral.settings`)

```sql
CREATE TABLE admiral.settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  tier VARCHAR(20) DEFAULT 'free', -- free, pro
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Example settings
INSERT INTO admiral.settings (key, value, description, tier) VALUES
  ('retention_hours', '24', 'Metrics retention period (hours)', 'free'),
  ('tier', '"free"', 'Current tier (free or pro)', 'free'),
  ('license_key', 'null', 'Pro license key', 'pro'),
  ('s3_archival_enabled', 'false', 'Enable S3 compliance archival', 'pro'),
  ('timescaledb_enabled', 'false', 'Use TimescaleDB features', 'pro');
```

### Cleaner Configuration (Environment Variables)

```bash
# Database connection
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=node_pulse_admiral

# Logging
LOG_LEVEL=info
```

---

## Upgrade Messaging

### In-App Prompts (Free → Pro)

**Dashboard Historical View**:

> 📊 Want to see metrics beyond 72 hours? Upgrade to **NodePulse Pro** for extended retention and historical analysis.

**Settings Page**:

> ⚙️ Configure retention up to 90 days with **NodePulse Pro**. Includes TimescaleDB performance and S3 archival.

**Alerting Rules**:

> 🔔 Need multi-condition alerts or webhooks? **NodePulse Pro** unlocks advanced alerting features.

**Export Button** (disabled):

> 📥 Export metrics to CSV/JSON with **NodePulse Pro** for compliance reporting.

---

## Success Metrics

### Free Tier Goals

- 1,000+ active installations (first 6 months)
- 80% user retention (return after 30 days)
- 5% conversion rate (Free → Pro)

### Pro Tier Goals

- $10k MRR (first 12 months)
- 50+ Pro customers
- <5% churn rate

---

## Competitive Analysis

| Competitor    | Free Tier       | Pro Pricing    | Our Advantage            |
| ------------- | --------------- | -------------- | ------------------------ |
| Netdata       | ❌ (Cloud only) | $10/node/month | ✅ Self-hosted Free tier |
| Grafana Cloud | 10k metrics     | $8/100 metrics | ✅ Unlimited agents      |
| Datadog       | 5 hosts         | $15/host/month | ✅ Cheaper Pro tier      |
| UptimeRobot   | 50 monitors     | $7/50 monitors | ✅ Unlimited monitors    |

---

## Future Enhancements

### Pro Tier Additions (v2.0)

- 📊 Anomaly detection (ML-based)
- 🔍 Log aggregation (ELK-style)
- 🔐 Active security scanning
- 📱 Mobile app (iOS/Android)
- 🔗 Bi-directional agent control (remote commands)

### Enterprise Tier (v3.0)

- 🏢 Multi-tenancy (organizations, teams)
- 🔑 SSO/SAML authentication
- 📈 Custom dashboards per team
- 🔒 Role-based access control (RBAC)
- 📞 Dedicated account manager

---

## Conclusion

The tiered approach balances:

- **Accessibility**: Free tier removes barriers to entry
- **Value**: Pro tier delivers tangible business benefits (compliance, performance)
- **Sustainability**: Monetization funds development and support

By building a **solid Free tier first**, we establish trust and adoption. Pro features are **natural extensions** that solve real pain points (compliance, scale), not artificial limitations.

---

## References

- [Pricing Strategy Research](https://www.priceintelligently.com/blog/saas-pricing-models)
- [Open Core Model](https://en.wikipedia.org/wiki/Open-core_model)
- [TimescaleDB Pricing](https://www.timescale.com/pricing) (competitor analysis)
