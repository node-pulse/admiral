# Node Pulse Agent - Quick Start Guide

Fast reference for deploying the Node Pulse monitoring stack.

## Prerequisites

- Ansible installed on your control machine
- SSH access to target servers
- Inventory file with target servers

## Development Deployment (No mTLS)

### 1. Deploy node_exporter

```bash
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
  -i inventory.yml
```

### 2. Deploy Node Pulse Agent

```bash
ansible-playbook ansible/playbooks/nodepulse/deploy-agent-no-mtls.yml \
  -i inventory.yml \
  -e "ingest_endpoint=https://your-dashboard.com/metrics/prometheus"
```

**Done!** Your servers are now reporting metrics.

---

## Production Deployment (With mTLS)

### 1. Setup mTLS CA (One-time)

```bash
cd /path/to/admiral
./scripts/setup-mtls.sh
```

### 2. Generate Certificates (Per Server)

In Flagship dashboard:
- Go to System Settings → Servers
- Select server → Generate Certificate
- Certificates are stored in database (deployer fetches automatically)

### 3. Deploy node_exporter

```bash
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
  -i inventory.yml
```

### 4. Deploy Node Pulse Agent with mTLS

```bash
ansible-playbook ansible/playbooks/nodepulse/deploy-agent-mtls.yml \
  -i inventory.yml \
  -e "ingest_endpoint=https://your-dashboard.com/metrics/prometheus"
```

**Note**: The deployer (Flagship) automatically fetches certificates from the database and passes them to Ansible.

---

## Verification

### Check Services

```bash
# On target server
systemctl status node_exporter
systemctl status nodepulse
```

### Check node_exporter Metrics

```bash
# On target server
curl http://127.0.0.1:9100/metrics
```

### Check Agent Logs

```bash
# On target server
journalctl -u nodepulse -f
```

### Check Dashboard

- Log into Flagship dashboard
- Go to Servers → Select your server
- Verify metrics are appearing in charts

---

## Upgrading Agents

```bash
ansible-playbook ansible/playbooks/nodepulse/upgrade-agent.yml \
  -i inventory.yml \
  -e "agent_version=v1.2.3"
```

---

## Certificate Rotation

```bash
ansible-playbook ansible/playbooks/nodepulse/install-mtls-certs.yml \
  -i inventory.yml \
  -e "tls_enabled=true"
```

**Note**: Deployer automatically fetches new certificates from database.

---

## Rollback

```bash
ansible-playbook ansible/playbooks/nodepulse/rollback-agent.yml \
  -i inventory.yml
```

---

## Uninstall

```bash
# Uninstall agent (keep config/logs)
ansible-playbook ansible/playbooks/nodepulse/uninstall-agent.yml \
  -i inventory.yml

# Uninstall agent (remove everything)
ansible-playbook ansible/playbooks/nodepulse/uninstall-agent.yml \
  -i inventory.yml \
  -e "keep_config=false" \
  -e "keep_logs=false"
```

---

## Troubleshooting

### Agent not collecting metrics?

**Check if node_exporter is running:**
```bash
systemctl status node_exporter
curl http://127.0.0.1:9100/metrics
```

**If not running, deploy it:**
```bash
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
  -i inventory.yml \
  --limit problematic-server
```

### Agent not sending to Submarines?

**Check agent logs:**
```bash
journalctl -u nodepulse -n 50
```

**Common issues:**
- Wrong endpoint URL
- mTLS certificate issues (check cert files in `/etc/nodepulse/certs/`)
- Network connectivity to Submarines

**Test connectivity:**
```bash
# From target server
curl -v https://your-dashboard.com/metrics/prometheus
```

### Metrics not appearing in dashboard?

**Check Submarines logs:**
```bash
docker compose logs -f submarines-ingest
docker compose logs -f submarines-digest
```

**Check PostgreSQL:**
```sql
-- Check if metrics are being written
SELECT server_id, timestamp, cpu_cores, memory_total_bytes
FROM admiral.metrics
ORDER BY timestamp DESC
LIMIT 10;
```

---

## Variables Reference

### Common Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ingest_endpoint` | Yes | - | Submarines endpoint URL |
| `agent_version` | No | `latest` | Agent version to deploy |
| `agent_interval` | No | `15s` | Scrape interval |
| `agent_timeout` | No | `5s` | HTTP timeout |
| `node_exporter_version` | No | `1.8.2` | node_exporter version |

### mTLS Variables (Auto-populated by deployer)

| Variable | Required | Description |
|----------|----------|-------------|
| `tls_enabled` | Yes | Enable mTLS |
| `ca_cert` | Yes | CA certificate PEM |
| `client_cert` | Yes | Client certificate PEM |
| `client_key` | Yes | Client private key PEM |
| `agent_server_id` | Yes | Server ID |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Target Server                                       │
│                                                      │
│  ┌──────────────────┐         ┌─────────────────┐  │
│  │ node_exporter    │ scrape  │ Node Pulse      │  │
│  │ :9100 (localhost)│ ◄────── │ Agent           │  │
│  │                  │         │                 │  │
│  │ 1100+ metrics    │         │ Parses → 39     │  │
│  │ 61KB text        │         │ metrics, 1KB    │  │
│  └──────────────────┘         └────────┬────────┘  │
│                                         │           │
└─────────────────────────────────────────┼───────────┘
                                          │ HTTPS
                                1KB JSON (98% reduction)
                                          │
                                          ▼
                                ┌─────────────────┐
                                │  Submarines     │
                                │  /metrics/      │
                                │  prometheus     │
                                └────────┬────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  PostgreSQL     │
                                │  1 row/scrape   │
                                └────────┬────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  Flagship       │
                                │  Dashboard      │
                                └─────────────────┘
```

**Key Benefits:**
- 98% bandwidth reduction
- 99% database reduction
- 10-30x faster queries
- Distributed parsing load

---

## Best Practices

1. **Always deploy node_exporter first** before deploying the agent
2. **Use mTLS in production** for security
3. **Monitor agent logs** after deployment for errors
4. **Verify metrics flow** end-to-end before marking deployment complete
5. **Test on staging** before production rollout
6. **Keep certificates rotated** (90-day expiry recommended)
7. **Monitor bandwidth usage** to confirm 98% reduction

---

## Support

For detailed documentation, see:
- [README.md](./README.md) - Full playbook documentation
- [Simplified Metrics Schema](../../../docs/simplified-metrics-schema.md) - Architecture details
- [Ansible Update Summary](../../../docs/ansible-playbooks-update-summary.md) - Recent changes
