# Node Pulse: Prometheus Exporter Integration Plan

**Status:** IN PROGRESS - Started 2025-10-27

**Timeline:** 2-3 weeks (Production Ready)

**Progress:**
- ✅ Phase 1 Started: node-exporter Ansible role complete
- ⏳ Database schema redesigned (Prometheus-first)
- 🔜 Submarines Prometheus parser (next)

**Strategy:** Add Prometheus exporters as first-class support, refactor Node Pulse Agent as intelligent scraper/pusher

---

## 🎯 Goal

Add first-class support for Prometheus exporters (starting with node_exporter) while keeping the Node Pulse Agent as an intelligent scraper/pusher with buffering capabilities.

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  Target Server                                  │
│                                                  │
│  ┌──────────────────┐                           │
│  │  node_exporter   │  ← Battle-tested metrics  │
│  │  :9100/metrics   │                           │
│  └────────┬─────────┘                           │
│           │ Scrape (localhost)                  │
│           ▼                                      │
│  ┌──────────────────────────────────┐           │
│  │  Node Pulse Agent (Refactored)   │           │
│  │  - Scrapes node_exporter         │           │
│  │  - Scrapes other exporters       │           │
│  │  - Buffers metrics (WAL)         │           │
│  │  - Pushes to Submarines          │           │
│  └────────┬─────────────────────────┘           │
└───────────┼──────────────────────────────────────┘
            │ HTTPS POST (Prometheus format)
            ▼
┌─────────────────────────────────────────────────┐
│  Submarines Ingest (Admiral)                    │
│  :8080                                          │
│                                                  │
│  POST /metrics/prometheus  ← NEW ENDPOINT       │
│  - Accepts Prometheus text format               │
│  - Parses metrics                               │
│  - Publishes to Valkey Stream                   │
│                                                  │
│  POST /metrics  ← EXISTING (Keep for compat)    │
│  - Accepts JSON format                          │
└─────────────────────────────────────────────────┘
            │
            ▼
    Valkey Stream → Digest → PostgreSQL
```

## 📦 Deliverables (2-3 weeks)

### Phase 1: Ansible Role for node_exporter (Week 1)

- Create `flagship/ansible/roles/node-exporter/` role
- Download/install node_exporter binary
- Configure systemd service
- Open firewall port 9100 (localhost only)
- Health check verification
- Documentation

### Phase 2: Submarines Prometheus Format Support (Week 1-2)

- Add Prometheus text format parser (Go library)
- Create new endpoint `POST /metrics/prometheus`
- Map Prometheus metrics → PostgreSQL schema
- Add tests for parsing
- Update API documentation

### Phase 3: Node Pulse Agent Refactor (Week 2)

- Add node_exporter scraper module
- Parse Prometheus text format
- Convert to internal format OR forward raw
- Maintain buffering/WAL capability
- Configuration for exporter endpoints
- Update agent docs

### Phase 4: Integration & Testing (Week 3)

- End-to-end testing (node_exporter → agent → submarines → DB)
- Performance benchmarks
- Error handling scenarios
- Documentation updates
- Migration guide for existing deployments

### Phase 5: Documentation & Deployment (Week 3)

- Update all docs with new architecture
- Create deployment playbook combining both roles
- Write migration guide
- Prepare for future exporters (postgres, redis, etc.)

## 📂 Files to Create/Modify

### New Files (Admiral - Ansible)

1. `flagship/ansible/roles/node-exporter/tasks/main.yml`
2. `flagship/ansible/roles/node-exporter/tasks/download.yml`
3. `flagship/ansible/roles/node-exporter/tasks/install.yml`
4. `flagship/ansible/roles/node-exporter/tasks/configure.yml`
5. `flagship/ansible/roles/node-exporter/tasks/verify.yml`
6. `flagship/ansible/roles/node-exporter/defaults/main.yml`
7. `flagship/ansible/roles/node-exporter/templates/node_exporter.service.j2`
8. `flagship/ansible/roles/node-exporter/handlers/main.yml`
9. `flagship/ansible/roles/node-exporter/meta/main.yml`
10. `flagship/ansible/roles/node-exporter/README.md`

### New Files (Admiral - Submarines)

11. `submarines/internal/parsers/prometheus.go` (Prometheus parser)
12. `submarines/internal/handlers/prometheus.go` (New endpoint handler)
13. `submarines/internal/parsers/prometheus_test.go` (Tests)

### New Files (Documentation)

14. `docs/prometheus-integration.md` (Architecture documentation)
15. `docs/exporter-support.md` (Future exporters guide)
16. `docs/node-exporter-deployment.md` (Deployment guide)
17. `docs/adding-exporters.md` (Guide for adding new exporters)
18. `docs/migration-guide.md` (Migrating to hybrid model)
19. `docs/metrics-mapping.md` (Prometheus → Database mapping)

### Modified Files (Admiral - Submarines)

1. `submarines/cmd/ingest/main.go` (Add new route)
2. `submarines/internal/models/server.go` (Add Prometheus metric mapping if needed)
3. `submarines/go.mod` (Add Prometheus client library)

### Modified Files (Admiral - Ansible)

4. `flagship/ansible/playbooks/nodepulse/deploy-agent.yml` (Add node-exporter role)

### Modified Files (Admiral - Docs)

5. `README.md` (Update with new architecture)
6. `CLAUDE.md` (Update project context)

### Modified Files (Agent - Separate Repo)

7. `agent/internal/scrapers/prometheus.go` (NEW: Scrape node_exporter)
8. `agent/internal/config/config.go` (Add exporter endpoints config)
9. `agent/cmd/agent/main.go` (Integrate prometheus scraper)
10. `agent/README.md` (Update docs)

## 🔧 Technical Details

### node_exporter Role Configuration

```yaml
# flagship/ansible/roles/node-exporter/defaults/main.yml
node_exporter_version: "1.8.2"
node_exporter_port: 9100
node_exporter_listen_address: "127.0.0.1" # localhost only (security)
node_exporter_enabled_collectors:
  - cpu
  - meminfo
  - diskstats
  - netdev
  - filesystem
  - loadavg
  - uname
  - time
node_exporter_download_url: "https://github.com/prometheus/node_exporter/releases/download/v{{ node_exporter_version }}/node_exporter-{{ node_exporter_version }}.linux-amd64.tar.gz"
node_exporter_install_dir: "/opt/node_exporter"
node_exporter_user: "node_exporter"
```

### Submarines New Endpoint Specification

```go
// POST /metrics/prometheus
// Content-Type: text/plain; version=0.0.4
// Authorization: Bearer <agent-token> (optional for MVP)
//
// Request Body (Prometheus text format):
// # HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
// # TYPE node_cpu_seconds_total counter
// node_cpu_seconds_total{cpu="0",mode="idle"} 123456.78
// node_cpu_seconds_total{cpu="0",mode="system"} 12345.67
// node_memory_MemTotal_bytes 8589934592
// node_memory_MemAvailable_bytes 4294967296
//
// Response:
// {
//   "status": "success",
//   "metrics_received": 145
// }
```

### Node Pulse Agent Configuration Extension

```yaml
# /etc/nodepulse/nodepulse.yml

# NEW: Prometheus scraper configuration
scrapers:
  prometheus:
    enabled: true
    endpoints:
      - url: "http://127.0.0.1:9100/metrics"
        name: "node_exporter"
        interval: 15s
      # Future: add more exporters
      # - url: "http://127.0.0.1:9187/metrics"
      #   name: "postgres_exporter"
      #   interval: 30s

# Server configuration (modified)
server:
  endpoint: "https://dashboard.example.com/metrics/prometheus"
  format: "prometheus" # Options: "prometheus" or "json" (legacy)
  timeout: 10s

# Agent behavior (existing)
agent:
  server_id: "auto-generated-uuid"
  interval: 15s # How often to scrape and push

# Buffering (existing - still works with Prometheus format)
buffer:
  enabled: true
  retention_hours: 48
  max_size_mb: 100
```

### Prometheus Metric → Database Mapping

| Prometheus Metric                             | Database Column          | Notes                                 |
| --------------------------------------------- | ------------------------ | ------------------------------------- |
| `node_cpu_seconds_total{mode="idle"}`         | `cpu_usage_percent`      | Calculate usage from idle time        |
| `node_memory_MemTotal_bytes`                  | `memory_total_mb`        | Convert bytes → MB                    |
| `node_memory_MemAvailable_bytes`              | `memory_used_mb`         | Calculate used = total - available    |
| `node_filesystem_size_bytes{mountpoint="/"}`  | `disk_total_gb`          | Convert bytes → GB                    |
| `node_filesystem_avail_bytes{mountpoint="/"}` | `disk_used_gb`           | Calculate used = total - available    |
| `node_network_receive_bytes_total`            | `network_download_bytes` | Counter (calculate delta)             |
| `node_network_transmit_bytes_total`           | `network_upload_bytes`   | Counter (calculate delta)             |
| `node_boot_time_seconds`                      | `uptime_days`            | Calculate uptime from boot time       |
| Other metrics                                 | `raw_data` JSONB         | Store unmapped metrics for future use |

### Database Schema - RADICALLY REDESIGNED FOR PROMETHEUS 🔥

**NEW Prometheus-First Schema Architecture**

We've completely redesigned the database schema to natively support Prometheus metrics format as first-class citizens.

#### Core Table: `admiral.metric_samples`

```sql
CREATE TABLE admiral.metric_samples (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID NOT NULL,

    -- Prometheus metric identification
    metric_name TEXT NOT NULL,        -- e.g., "node_cpu_seconds_total"
    metric_type TEXT NOT NULL,        -- counter, gauge, histogram, summary

    -- Labels as JSONB (Prometheus-native!)
    labels JSONB DEFAULT '{}'::jsonb, -- e.g., {"cpu": "0", "mode": "idle"}

    -- Value and timestamp
    value DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Metadata
    help_text TEXT,                   -- From # HELP comment
    unit TEXT,                        -- bytes, seconds, etc.

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- ✅ **Native label support** - JSONB labels column for Prometheus dimensions
- ✅ **Unlimited metrics** - Any Prometheus metric can be stored
- ✅ **Multi-filesystem** - Labels handle multiple mount points naturally
- ✅ **Multi-CPU** - Labels handle per-core metrics
- ✅ **Multi-network** - Labels handle multiple network interfaces
- ✅ **Extensible** - Works with ANY Prometheus exporter (postgres, redis, etc.)

#### Example Data Storage

**CPU Metrics (multi-core):**
```sql
-- CPU 0 idle time
{metric_name: "node_cpu_seconds_total", labels: {"cpu": "0", "mode": "idle"}, value: 123456.78}

-- CPU 1 system time
{metric_name: "node_cpu_seconds_total", labels: {"cpu": "1", "mode": "system"}, value: 5678.90}
```

**Filesystem Metrics (multi-mount):**
```sql
-- Root filesystem
{metric_name: "node_filesystem_size_bytes", labels: {"device": "/dev/sda1", "mountpoint": "/", "fstype": "ext4"}, value: 107374182400}

-- Home filesystem
{metric_name: "node_filesystem_size_bytes", labels: {"device": "/dev/sda2", "mountpoint": "/home", "fstype": "ext4"}, value: 536870912000}
```

#### No Views - Dashboard Queries Directly!

**There are NO SQL views.** The dashboard (Laravel + React) queries `metric_samples` table directly.

**Why?**
- Simpler schema
- Dashboard determines what to show (not the database)
- More flexible (no migrations for UI changes)
- One source of truth

**Example dashboard query (Laravel):**
```sql
-- Get latest CPU metrics for a server
SELECT
    labels->>'cpu' as cpu_core,
    labels->>'mode' as cpu_mode,
    value,
    timestamp
FROM admiral.metric_samples
WHERE server_id = :server_id
  AND metric_name = 'node_cpu_seconds_total'
  AND timestamp > NOW() - INTERVAL '5 minutes'
ORDER BY timestamp DESC
LIMIT 100;
```

The dashboard handles:
- Unit conversions (bytes → MB/GB)
- Filtering (exclude tmpfs, loopback, etc.)
- Aggregations (calculate CPU usage from counters)
- Chart formatting

#### No Backwards Compatibility - Prometheus Only!

There is **NO legacy metrics table**. This is a clean break - Prometheus format is the **ONLY** supported format.

Old JSON-format agents must be refactored to scrape Prometheus exporters and push Prometheus text format.

#### Query Performance

**Indexes:**
- Composite: `(server_id, metric_name, timestamp DESC)` - Fast time-series lookups
- GIN: `labels` - Fast label filtering (e.g., `WHERE labels->>'mountpoint' = '/'`)
- B-tree: `metric_name` - Fast metric type queries

**Storage Efficiency:**
- Prometheus text format is verbose but compresses well in PostgreSQL
- JSONB labels use binary storage (efficient)
- Indexes enable fast queries without full table scans

#### Deployment Strategy (Fresh Database)

1. **Phase 1 (Week 1):** Deploy new schema with `metric_samples` table, node_exporter role, Submarines parser
2. **Phase 2 (Week 2):** Refactor Node Pulse Agent to scrape node_exporter and push Prometheus format
3. **Phase 3 (Week 2-3):** Update Flagship dashboard to query from Prometheus views, testing, documentation

**This is a PROPER Prometheus-native database design!** 🚀

## ✅ Success Criteria

### 1. Functionality

- ✅ node_exporter deploys via Ansible without errors
- ✅ Submarines ingests Prometheus format successfully
- ✅ Metrics appear in PostgreSQL correctly mapped
- ✅ Node Pulse Agent scrapes and pushes reliably
- ✅ Buffering works when dashboard is offline
- ✅ Both JSON and Prometheus formats work simultaneously

### 2. Performance

- ✅ Submarines handles 1000+ servers pushing Prometheus metrics
- ✅ Agent scraping adds <5% CPU overhead
- ✅ End-to-end latency <10 seconds (scrape → display in dashboard)
- ✅ Prometheus parser throughput >10,000 metrics/second

### 3. Reliability

- ✅ Buffering works if dashboard is offline (WAL persists Prometheus data)
- ✅ Failed scrapes don't crash agent
- ✅ Malformed metrics handled gracefully (logged, not fatal)
- ✅ node_exporter crashes don't bring down Node Pulse Agent

### 4. Documentation

- ✅ Clear migration guide for existing deployments
- ✅ Examples for adding new exporters
- ✅ Troubleshooting guide
- ✅ Architecture diagrams updated

## 🚀 Future Extensions (Post-MVP)

### Additional Exporters

- `postgres_exporter` role for PostgreSQL monitoring
- `redis_exporter` role for Redis/Valkey monitoring
- `blackbox_exporter` for active probing (HTTP/TCP/ICMP checks)
- `process_exporter` for detailed process monitoring
- Custom exporters (user-provided)

### Advanced Features

- Auto-discovery of exporters on target servers
- Prometheus-compatible `/metrics` endpoint on Submarines (for Grafana integration)
- Service discovery (scrape dynamic targets)
- Multi-tenant exporter isolation
- Exporter health monitoring

### Integration Improvements

- Support for Prometheus remote_write protocol
- OpenTelemetry format support
- Direct Prometheus scraping (pull model option)
- Grafana dashboards for exporter metrics

## 📝 Documentation Plan

### Primary Documentation Files

1. **`docs/prometheus-integration.md`**

   - Architecture overview
   - Design decisions
   - Component interaction diagrams
   - Metric flow explanation

2. **`docs/node-exporter-deployment.md`**

   - Step-by-step deployment guide
   - Ansible role usage
   - Configuration options
   - Troubleshooting

3. **`docs/adding-exporters.md`**

   - How to add new Prometheus exporters
   - Creating Ansible roles for exporters
   - Metric mapping guidelines
   - Testing new exporters

4. **`docs/migration-guide.md`**

   - Migrating from custom agent to hybrid model
   - Backwards compatibility notes
   - Rollback procedures
   - Performance comparison

5. **`docs/metrics-mapping.md`**

   - Complete Prometheus → Database mapping reference
   - Unmapped metrics handling
   - Custom metric extensions
   - JSONB raw_data usage

6. **`docs/exporter-support.md`**
   - Supported exporters list
   - Version compatibility matrix
   - Feature comparison
   - Roadmap for future exporters

### Updated Documentation

- `README.md` - Add Prometheus support section
- `CLAUDE.md` - Update architecture context
- `docs/DEPLOYMENT.md` - Include node_exporter deployment
- `docs/ANSIBLE_IMPLEMENTATION.md` - Document new role

## ⚠️ Risks & Mitigations

| Risk                                           | Impact   | Mitigation                                                    |
| ---------------------------------------------- | -------- | ------------------------------------------------------------- |
| **Prometheus format parsing complexity**       | High     | Use established Go library (`prometheus/common/expfmt`)       |
| **Agent refactor breaks existing deployments** | Critical | Keep JSON format support, feature flag, comprehensive testing |
| **Performance degradation from scraping**      | Medium   | Benchmark early, optimize hot paths, tune intervals           |
| **Metric name conflicts/ambiguity**            | Medium   | Establish clear naming conventions, use metric prefixes       |
| **Breaking changes in node_exporter**          | Low      | Pin version in Ansible, test before upgrading                 |
| **Database storage explosion**                 | Medium   | Use `raw_data` selectively, implement retention policies      |
| **Agent memory usage from buffering**          | Medium   | Size limits on WAL, monitoring, alerts                        |
| **Network bandwidth increase**                 | Low      | Prometheus format compresses well, batch pushes               |

## 📊 Timeline Breakdown

### Week 1: Foundation (5 days)

**Days 1-2: Ansible node-exporter Role**

- Create role structure
- Download and install logic
- Systemd service configuration
- Health checks and verification
- Testing on Ubuntu/Debian/RHEL

**Days 3-4: Submarines Prometheus Parser**

- Add Prometheus client library
- Implement text format parser
- Metric name normalization
- Unit tests for parser
- Benchmark parser performance

**Day 5: New Submarines Endpoint**

- Add `/metrics/prometheus` route
- Handler implementation
- Integration with Valkey Stream
- Error handling
- Basic integration tests

### Week 2: Agent Refactor (5 days)

**Days 1-2: Prometheus Scraper Module**

- HTTP client for scraping node_exporter
- Prometheus text format parser (agent-side)
- Scraper configuration
- Error handling and retries

**Days 3: Internal Format Conversion**

- Map Prometheus metrics to internal structs
- Handle metric type differences (counter, gauge, etc.)
- Preserve raw Prometheus data

**Days 4-5: Integration & Buffer Support**

- Integrate scraper into agent main loop
- WAL persistence for Prometheus data
- Push to new Submarines endpoint
- Fallback to JSON format (feature flag)
- Agent-side testing

### Week 3: Polish & Documentation (5 days)

**Days 1-2: End-to-End Testing**

- Deploy node_exporter + agent via Ansible
- Verify metrics flow: exporter → agent → submarines → DB
- Test offline buffering scenario
- Load testing (100+ servers)
- Error scenario testing

**Days 3: Bug Fixes & Optimization**

- Address issues found in testing
- Performance optimization
- Memory leak checks
- Edge case handling

**Days 4: Documentation**

- Write all 6 documentation files
- Update existing docs
- Create architecture diagrams
- Write migration guide

**Day 5: Final Review & Deployment Prep**

- Code review
- Security review
- Final testing
- Prepare demo/presentation
- Tag release candidate

## 🎯 MVP Definition

**Minimum Viable Product includes:**

1. ✅ node-exporter Ansible role (install, configure, verify)
2. ✅ Submarines accepts Prometheus text format via POST
3. ✅ Basic metric mapping (CPU, memory, disk, network)
4. ✅ Node Pulse Agent scrapes localhost:9100 and pushes
5. ✅ Buffering works with Prometheus data
6. ✅ Backwards compatibility with JSON format
7. ✅ Basic documentation and deployment guide

**MVP does NOT include:**

- ❌ Additional exporters (postgres, redis, etc.)
- ❌ Auto-discovery of exporters
- ❌ Prometheus remote_write protocol
- ❌ Pull-based scraping (Submarines scraping servers)
- ❌ Grafana integration
- ❌ Advanced metric aggregations

**Post-MVP features** can be added incrementally without breaking changes.

## 📈 Success Metrics

After MVP deployment, measure:

1. **Adoption Rate**

   - % of servers using node_exporter vs custom agent
   - Time to deploy node_exporter to 100+ servers

2. **Performance**

   - Submarines Prometheus endpoint throughput (requests/sec)
   - Agent CPU/memory overhead comparison
   - End-to-end latency (p50, p95, p99)

3. **Reliability**

   - Buffer success rate (offline scenarios)
   - Metric parsing error rate
   - System uptime with new architecture

4. **Developer Experience**
   - Time to add a new exporter
   - Documentation clarity (user feedback)
   - Bug report rate

---

## 🚦 Next Steps

1. **Immediate:** Create GitHub issues/milestones for each phase
2. **Day 1:** Start node-exporter Ansible role development
3. **Week 1 End:** Review progress, adjust timeline if needed
4. **Week 2 End:** Feature freeze, testing only
5. **Week 3 End:** Release MVP, gather feedback

---

**Plan Status:** ✅ Approved
**Created:** 2025-10-27
**Updated:** 2025-10-27
**Owner:** Node Pulse Team
