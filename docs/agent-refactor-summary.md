# Node Pulse Agent v2.0 - Simplified Prometheus Forwarder

**Date:** 2025-10-27
**Status:** In Progress

---

## 🔑 Key Simplification: TWO Configurable Fields

**During Ansible deployment, ONLY TWO configurations are needed:**

```yaml
ingest_endpoint: "https://your-dashboard.nodepulse.io"
server_id: "550e8400-e29b-41d4-a716-446655440000"  # Assigned by dashboard
```

**All other settings use hardcoded defaults.** No more flags, no more variables.

---

## What Changed

### OLD Agent (v1.x)
- Custom metrics collection (reads `/proc` directly)
- JSON format reports
- TUI watch command for live metrics
- Complex metrics aggregation code
- ~15 MB binary

### NEW Agent (v2.0)
- **Simple Prometheus forwarder**
- Scrapes `node_exporter` on `localhost:9100`
- Forwards Prometheus text format to Submarines
- **NO TUI** (removed completely)
- **NO custom metrics** (removed completely)
- Simpler, smaller, faster

---

## Architecture

```
node_exporter (:9100)  →  Node Pulse Agent  →  Submarines (:8080/metrics/prometheus)
   [100+ metrics]         [Scrape + Forward]      [Parse + Store in PostgreSQL]
                          [Buffer on failure]
```

**Agent is now a simple HTTP forwarder with buffering.**

---

## Security: Block Port 9100

**CRITICAL:** Port 9100 must be blocked from external access!

### Why?
node_exporter exposes sensitive system information:
- CPU usage, memory, disk space
- Network traffic, filesystem paths
- Running processes, system info

### How to block:

```bash
# Using UFW (Ubuntu/Debian)
sudo ufw deny 9100/tcp

# Using iptables
sudo iptables -A INPUT -p tcp --dport 9100 ! -s 127.0.0.1 -j DROP
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

**Ansible role will handle this automatically.**

---

## New Configuration

**File:** `/etc/node-pulse/nodepulse.yml`

```yaml
server:
  endpoint: "{{ ingest_endpoint }}/metrics/prometheus"  # Configurable (from dashboard)
  timeout: 5s                                              # Default (not configurable)

agent:
  server_id: "{{ server_id }}"                             # Configurable (from dashboard)
  interval: 15s                                            # Default (not configurable)

prometheus:
  enabled: true                                            # Default (not configurable)
  endpoint: "http://localhost:9100/metrics"                # Default (not configurable)
  timeout: 3s                                              # Default (not configurable)

buffer:
  path: "/var/lib/node-pulse/buffer"                       # Default (not configurable)
  retention_hours: 48                                      # Default (not configurable)
  batch_size: 5                                            # Default (not configurable)

logging:
  level: "info"                                            # Default (not configurable)
  output: "stdout"                                         # Default (not configurable)
  file:
    path: "/var/log/node-pulse/agent.log"                 # Default (not configurable)
    max_size_mb: 10                                        # Default (not configurable)
    max_backups: 3                                         # Default (not configurable)
    max_age_days: 7                                        # Default (not configurable)
    compress: true                                         # Default (not configurable)
```

### Ansible Deployment Configuration

**TWO fields are configurable during deployment:**

**1. Variable:** `ingest_endpoint`
- **Required:** Yes
- **Example:** `"https://dashboard.nodepulse.io"`
- **Used in:** `server.endpoint` → `{{ ingest_endpoint }}/metrics/prometheus`

**2. Variable:** `server_id`
- **Required:** Yes
- **Example:** `"550e8400-e29b-41d4-a716-446655440000"`
- **Source:** Assigned by dashboard when server is added
- **Used in:** `agent.server_id` → `{{ server_id }}`

**All other settings use hardcoded defaults** - no customization during deployment.

#### Ansible Playbook Variables

**File:** `flagship/ansible/playbooks/nodepulse/deploy-agent.yml`

```yaml
vars:
  # CONFIGURABLE VARIABLES (passed from Laravel job)
  ingest_endpoint: "{{ ingest_endpoint }}"  # Dashboard URL
  server_id: "{{ server_id }}"                    # Server UUID from dashboard

  # REMOVED VARIABLES (use defaults):
  # ❌ agent_interval: "5s"        → Uses default 15s
  # ❌ agent_timeout: "3s"         → Uses default 5s
  # ❌ buffer_enabled: true        → Always enabled
  # ❌ buffer_retention_hours: 48  → Uses default
  # ❌ log_level: "info"           → Uses default
```

#### Ansible Template

**File:** `flagship/ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2`

```yaml
# Node Pulse Agent Configuration (v2.0)
# Deployed by Ansible on {{ ansible_date_time.iso8601 }}

server:
  endpoint: "{{ ingest_endpoint }}/metrics/prometheus"
  timeout: 5s

agent:
  server_id: "{{ server_id }}"
  interval: 15s

prometheus:
  enabled: true
  endpoint: "http://localhost:9100/metrics"
  timeout: 3s

buffer:
  path: "{{ agent_data_dir }}/buffer"
  retention_hours: 48
  batch_size: 5

logging:
  level: "info"
  output: "stdout"
  file:
    path: "{{ agent_log_dir }}/agent.log"
    max_size_mb: 10
    max_backups: 3
    max_age_days: 7
    compress: true
```

**Key changes:**
- ✅ Only `ingest_endpoint` and `server_id` are passed from playbook
- ✅ All other values are hardcoded defaults
- ✅ No more `agent_interval`, `agent_timeout`, `log_level` variables
- ✅ Simpler, less error-prone deployment
- ✅ `server_id` is assigned by dashboard when server is added

---

## Ansible Role Changes Required

### Remove from `defaults/main.yml`

**File:** `flagship/ansible/roles/nodepulse-agent/defaults/main.yml`

```yaml
# KEEP (required configurable fields):
ingest_endpoint: "https://dashboard.example.com"
server_id: "550e8400-e29b-41d4-a716-446655440000"  # From dashboard

# REMOVE (use hardcoded defaults instead):
# ❌ agent_interval: "5s"
# ❌ agent_timeout: "3s"
# ❌ buffer_enabled: true
# ❌ buffer_retention_hours: 48
# ❌ buffer_max_size_mb: 100
# ❌ log_level: "info"
# ❌ log_max_size_mb: 50
# ❌ log_max_backups: 3
# ❌ log_max_age_days: 7
```

### Update `deploy-agent.yml` Playbook

**File:** `flagship/ansible/playbooks/nodepulse/deploy-agent.yml`

```yaml
vars:
  # KEEP - only required variable
  ingest_endpoint: "{{ ingest_endpoint }}"  # Passed from Laravel

  # REMOVE:
  # ❌ agent_interval: "{{ agent_interval | default('5s') }}"
  # ❌ agent_timeout: "{{ agent_timeout | default('3s') }}"
```

### Update Template

**File:** `flagship/ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2`

**REMOVE entire sections:**
```yaml
# ❌ REMOVE - No longer exists in v2.0
metrics:
  cpu: true
  memory: true
  disk: true
  network: true
  processes: true
```

**REPLACE with v2.0 structure** (shown above in "Ansible Template" section)

---

## Commands

### Removed Commands
- ❌ `pulse watch` - TUI removed completely

### Remaining Commands
- ✅ `pulse setup` - Interactive setup wizard
- ✅ `pulse start` - Run agent in foreground
- ✅ `pulse start -d` - Run agent in background (daemon mode)
- ✅ `pulse stop` - Stop daemon agent
- ✅ `pulse status` - Show agent status
- ✅ `pulse service install` - Install systemd service
- ✅ `pulse service start/stop/restart` - Manage systemd service
- ✅ `pulse update` - Self-update agent

---

## What Was Removed

### Removed Files
- `cmd/watch.go` - TUI dashboard
- `cmd/themes/` - TUI themes
- `internal/metrics/cpu.go` - Custom CPU metrics
- `internal/metrics/memory.go` - Custom memory metrics
- `internal/metrics/network.go` - Custom network metrics
- `internal/metrics/disk.go` - Custom disk metrics
- `internal/metrics/uptime.go` - Custom uptime metrics
- `internal/metrics/process.go` - Custom process metrics
- `internal/metrics/system.go` - Custom system info
- `internal/metrics/stats.go` - Hourly statistics (for TUI)
- `internal/metrics/report.go` - JSON report generation

### Removed Dependencies
- `github.com/charmbracelet/bubbletea` - TUI framework
- `github.com/charmbracelet/lipgloss` - TUI styling
- All TUI-related packages

---

## New Files

### Added Files
- `internal/prometheus/scraper.go` - Scrapes Prometheus exporters
- `internal/prometheus/scraper_test.go` - Tests for scraper

### Modified Files
- `internal/config/config.go` - Added `PrometheusConfig`
- `internal/report/buffer.go` - Store Prometheus text format (not JSON)
- `internal/report/sender.go` - Send Prometheus format to Submarines
- `cmd/start.go` - Scrape loop (not collection loop)
- `go.mod` - Removed TUI dependencies

---

## Installation

### Prerequisites

**1. Install node_exporter:**

```bash
# Download
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar -xzf node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/node_exporter

# Create systemd service
sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Prometheus Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/node_exporter --web.listen-address=127.0.0.1:9100
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# Verify
curl http://localhost:9100/metrics
```

**2. Install Node Pulse Agent:**

```bash
# Download agent
wget https://github.com/node-pulse/agent/releases/latest/download/pulse-linux-amd64.tar.gz
tar -xzf pulse-linux-amd64.tar.gz
sudo mv pulse /usr/local/bin/
sudo chmod +x /usr/local/bin/pulse

# Run setup
sudo pulse setup

# Install as service
sudo pulse service install
sudo pulse service start
```

---

## Migration from v1.x

### Breaking Changes

1. **Configuration file changes:**
   - New `prometheus` section required
   - `server.endpoint` changes from `/metrics` to `/metrics/prometheus`
   - Default interval changes from 5s to 15s
   - Allowed intervals: `15s`, `30s`, `1m` (removed 5s, 10s)

2. **Buffered data:**
   - Old JSON buffer files will be ignored (data loss <48 hours)
   - New buffer format stores Prometheus text format

3. **Commands removed:**
   - `pulse watch` no longer exists

### Migration Steps

1. **Stop old agent:**
   ```bash
   sudo pulse service stop
   sudo pulse service uninstall
   ```

2. **Install node_exporter** (see above)

3. **Update agent binary:**
   ```bash
   sudo pulse update
   # Or manually download v2.0
   ```

4. **Update config file:**
   ```bash
   sudo nano /etc/node-pulse/nodepulse.yml
   # Add prometheus section, change interval to 15s
   ```

5. **Clear old buffer** (optional):
   ```bash
   sudo rm -rf /var/lib/node-pulse/buffer/*
   ```

6. **Reinstall service:**
   ```bash
   sudo pulse service install
   sudo pulse service start
   ```

7. **Verify:**
   ```bash
   sudo pulse status
   sudo journalctl -u node-pulse -f
   ```

---

## Testing Checklist

- [ ] Agent scrapes node_exporter successfully
- [ ] Agent handles node_exporter being down
- [ ] Agent forwards Prometheus format to Submarines
- [ ] Submarines receives and parses metrics
- [ ] Metrics stored in PostgreSQL `metric_samples` table
- [ ] Buffering works when Submarines is down
- [ ] Buffered metrics retry and send successfully
- [ ] Firewall blocks external access to port 9100
- [ ] Agent status command shows correct info
- [ ] Systemd service auto-restarts on failure
- [ ] Self-update works correctly

---

## Summary

**Node Pulse Agent v2.0 is a simplified Prometheus forwarder:**

- ✅ Scrapes node_exporter (100+ metrics)
- ✅ Forwards Prometheus text format to Submarines
- ✅ Buffers metrics on failure
- ✅ Simple, fast, reliable
- ❌ No TUI (removed)
- ❌ No custom metrics (removed)
- ⚠️ Port 9100 must be blocked externally (security)

**This is a cleaner, simpler architecture aligned with Prometheus ecosystem.**

---

## Data Retention

**Metrics retention:** **7 days raw data**

- Raw Prometheus metrics stored for 7 days
- After 7 days: automatic deletion (drop old partitions)
- Storage estimate: ~3 TB for 1000 servers
- Industry standard for self-hosted monitoring

**See:** `docs/data-retention-strategy.md` for detailed retention strategy.

---

## 📋 Approval Checklist

**Before implementation, please confirm:**

### Configuration Simplification
- [ ] ✅ ONLY `ingest_endpoint` and `server_id` are configurable during Ansible deployment
- [ ] ✅ `server_id` is assigned by dashboard when server is added
- [ ] ✅ All other settings (interval, timeout, buffer, logging) use hardcoded defaults
- [ ] ✅ Remove `agent_interval`, `agent_timeout`, `log_level` from Ansible variables
- [ ] ✅ Remove `metrics:` section from config (no longer applicable)

### Agent Changes
- [ ] ✅ Remove TUI completely (`pulse watch` command)
- [ ] ✅ Remove all custom metrics collectors (cpu.go, memory.go, network.go, etc.)
- [ ] ✅ Agent becomes simple Prometheus scraper + forwarder
- [ ] ✅ Scrape node_exporter on `localhost:9100`
- [ ] ✅ Forward to `{{ ingest_endpoint }}/metrics/prometheus`

### Security
- [ ] ✅ Block external access to port 9100 (UFW/iptables)
- [ ] ✅ node_exporter only accessible from localhost
- [ ] ✅ Ansible role includes firewall configuration

### Ansible Template
- [ ] ✅ `nodepulse.yml.j2` uses new v2.0 structure
- [ ] ✅ `server.endpoint` = `{{ ingest_endpoint }}/metrics/prometheus`
- [ ] ✅ `agent.server_id` = `{{ server_id }}` (from dashboard)
- [ ] ✅ All other values hardcoded (15s interval, 5s timeout, etc.)
- [ ] ✅ No more `metrics:` section in template

### Systemd Service
- [ ] ✅ Agent installed as systemd service (auto-start, auto-restart)
- [ ] ✅ Service managed via `pulse service install/start/stop/restart`

---

## ❓ Questions for Approval

1. **Confirm:** Only `ingest_endpoint` and `server_id` are configurable? ✅
2. **Confirm:** `server_id` is assigned by dashboard when adding server? ✅
3. **Confirm:** Remove all other Ansible variables (interval, timeout, etc.)? ✅
4. **Confirm:** Remove TUI completely (no `pulse watch`)? ✅
5. **Confirm:** Agent scrapes `localhost:9100` (hardcoded)? ✅
6. **Confirm:** Default scrape interval is 15s (not 5s)? ✅
7. **Confirm:** Agent runs as systemd service (auto-start, auto-restart)? ✅

**Please approve before I continue with implementation.** 🚀
