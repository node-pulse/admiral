# Node Exporter Ansible Role

This role installs and configures [Prometheus Node Exporter](https://github.com/prometheus/node_exporter) for collecting system-level metrics.

## Overview

Node Exporter is the industry-standard exporter for hardware and OS metrics exposed by Unix kernels. It provides comprehensive metrics for:

- CPU usage and frequency
- Memory utilization
- Disk I/O statistics
- Network interface statistics
- Filesystem usage
- System load average
- Hardware monitoring (temperatures, voltages)
- And 40+ other collectors

## Requirements

- **OS**: Ubuntu 20.04+, Debian 11+, RHEL/Rocky/Alma 8+
- **Python**: 2.7+ or 3.5+
- **systemd**: Required for service management
- **Internet access**: To download node_exporter binary from GitHub releases

## Role Variables

### Basic Configuration

```yaml
# Version to install
node_exporter_version: "1.8.2"

# Network configuration
node_exporter_listen_address: "127.0.0.1"  # localhost only (security)
node_exporter_listen_port: 9100

# Installation paths
node_exporter_install_dir: "/opt/node_exporter"
node_exporter_bin_path: "/usr/local/bin/node_exporter"

# Service user/group
node_exporter_user: "node_exporter"
node_exporter_group: "node_exporter"
```

### Collectors Configuration

```yaml
# Enabled collectors (default - no need to specify)
node_exporter_enabled_collectors:
  - cpu
  - meminfo
  - diskstats
  - filesystem
  - network
  # ... and more

# Disabled collectors to enable
node_exporter_disabled_collectors: []
# Example: Enable process stats
# - processes
```

### Advanced Configuration

```yaml
# Filesystem filtering
node_exporter_collector_filesystem_ignored_fs_types: "tmpfs,devtmpfs,devfs,iso9660,overlay,aufs,squashfs"
node_exporter_collector_filesystem_ignored_mount_points: "^/(dev|proc|sys|var/lib/docker/.+)($|/)"

# Custom metrics directory
node_exporter_textfile_dir: "/var/lib/node_exporter/textfile_collector"

# Extra command-line flags
node_exporter_extra_flags:
  - "--collector.systemd"
  - "--collector.processes"
```

## Dependencies

- `common` role - For system prerequisite checks

## Usage

### Basic Installation

```yaml
- hosts: servers
  roles:
    - node-exporter
```

### With Custom Configuration

```yaml
- hosts: servers
  vars:
    node_exporter_version: "1.8.2"
    node_exporter_listen_address: "0.0.0.0"  # Listen on all interfaces
    node_exporter_extra_flags:
      - "--collector.systemd"
      - "--collector.processes"
  roles:
    - node-exporter
```

### In a Playbook

```yaml
---
- name: Deploy Node Exporter to monitoring targets
  hosts: all
  become: yes

  vars:
    node_exporter_version: "1.8.2"

  roles:
    - role: node-exporter
```

## What This Role Does

1. **Prerequisites**
   - Verifies system requirements (Python, systemd)
   - Creates `node_exporter` system user/group

2. **Installation**
   - Downloads node_exporter binary from GitHub releases
   - Extracts to `/opt/node_exporter`
   - Creates symlink at `/usr/local/bin/node_exporter`

3. **Configuration**
   - Creates systemd service file
   - Configures collectors and filters
   - Sets up textfile collector directory

4. **Security**
   - Runs as unprivileged `node_exporter` user
   - Listens on localhost only (127.0.0.1) by default
   - Systemd security hardening enabled

5. **Verification**
   - Waits for service to start
   - Checks metrics endpoint (http://127.0.0.1:9100/metrics)
   - Verifies Prometheus metrics are being exposed

## Accessing Metrics

Once installed, metrics are available at:

```bash
curl http://127.0.0.1:9100/metrics
```

Example output:
```
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 123456.78
node_cpu_seconds_total{cpu="0",mode="system"} 5678.90
...
# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes 8589934592
...
```

## Integration with Node Pulse

This role is designed to work with Node Pulse Agent:

1. **node-exporter** runs on each target server (localhost:9100)
2. **Node Pulse Agent** scrapes node-exporter locally
3. **Agent** pushes Prometheus metrics to Submarines Ingest
4. **Submarines** stores metrics in PostgreSQL
5. **Flagship Dashboard** displays metrics

```
┌─────────────────┐
│  Target Server  │
│                 │
│  node_exporter  │  ← This role installs this
│   :9100         │
│       ↓         │
│  Node Pulse     │  ← Scrapes localhost:9100
│     Agent       │  ← Pushes to dashboard
└─────────────────┘
```

## Troubleshooting

### Check Service Status

```bash
systemctl status node_exporter
journalctl -u node_exporter -f
```

### Test Metrics Endpoint

```bash
curl -v http://127.0.0.1:9100/metrics
```

### Verify Installation

```bash
/usr/local/bin/node_exporter --version
```

### Common Issues

**Issue**: Service won't start
```bash
# Check logs
journalctl -u node_exporter -n 50

# Check permissions
ls -la /opt/node_exporter
ls -la /usr/local/bin/node_exporter
```

**Issue**: Metrics endpoint not responding
```bash
# Check if service is listening
ss -tlnp | grep 9100

# Check firewall (if listening on 0.0.0.0)
sudo ufw status
```

**Issue**: Missing metrics
```bash
# Check enabled collectors
curl http://127.0.0.1:9100/metrics | grep "# TYPE"

# Enable additional collectors via extra_flags
```

## Examples

### Enable Process Metrics

```yaml
- hosts: servers
  vars:
    node_exporter_extra_flags:
      - "--collector.processes"
  roles:
    - node-exporter
```

### Monitor Systemd Units

```yaml
- hosts: servers
  vars:
    node_exporter_extra_flags:
      - "--collector.systemd"
      - "--collector.systemd.unit-include=docker.service|nginx.service"
  roles:
    - node-exporter
```

### Custom Textfile Metrics

```yaml
- hosts: servers
  tasks:
    - name: Create custom metric
      copy:
        content: |
          # HELP my_custom_metric A custom metric
          # TYPE my_custom_metric gauge
          my_custom_metric{label="value"} 42
        dest: /var/lib/node_exporter/textfile_collector/custom.prom
        owner: node_exporter
        group: node_exporter
```

## License

MIT

## Author

Node Pulse Team
