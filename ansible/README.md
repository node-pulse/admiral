# Node Pulse Ansible Playbooks

Simplified Ansible automation for deploying and managing the Node Pulse monitoring stack.

## Overview

This directory contains **two simple playbooks** in `nodepulse/` for complete lifecycle management:

1. **`nodepulse/deploy.yml`** - Deploys/updates all monitoring components
2. **`nodepulse/uninstall.yml`** - Removes all monitoring components

## What Gets Deployed

The monitoring stack includes:

- **Node Pulse Agent** - Custom metrics collector with mTLS support
- **Prometheus Node Exporter** - System metrics (CPU, memory, disk, network)
- **Prometheus Process Exporter** - Process-level metrics

## Quick Start

### 1. Create Inventory

Create `inventory.yml`:

```yaml
all:
  hosts:
    server1:
      ansible_host: 192.168.1.100
      ansible_user: ubuntu
      ansible_ssh_private_key_file: ~/.ssh/id_rsa

      # Required: Agent configuration
      agent_server_id: "srv_abc123"  # From Flagship dashboard
      ingest_endpoint: "https://your-dashboard.com/metrics/prometheus"

      # Optional: mTLS certificates (for production)
      tls_enabled: true
      ca_cert: |
        -----BEGIN CERTIFICATE-----
        ...
        -----END CERTIFICATE-----
      client_cert: |
        -----BEGIN CERTIFICATE-----
        ...
        -----END CERTIFICATE-----
      client_key: |
        -----BEGIN PRIVATE KEY-----
        ...
        -----END PRIVATE KEY-----
```

### 2. Deploy Everything

```bash
# Production (with mTLS):
ansible-playbook -i inventory.yml nodepulse/deploy.yml

# Development (without mTLS):
ansible-playbook -i inventory.yml nodepulse/deploy.yml -e "tls_enabled=false"

# Deploy to specific servers:
ansible-playbook -i inventory.yml nodepulse/deploy.yml --limit "server1,server2"

# Deploy specific components only:
ansible-playbook -i inventory.yml nodepulse/deploy.yml --tags "nodepulse"
ansible-playbook -i inventory.yml nodepulse/deploy.yml --tags "node-exporter"
ansible-playbook -i inventory.yml nodepulse/deploy.yml --tags "process-exporter"
```

### 3. Verify Deployment

```bash
# Check service status
ssh server1 'systemctl status nodepulse node_exporter process_exporter'

# View logs
ssh server1 'journalctl -u nodepulse -n 50'

# Test metrics endpoints (on server)
curl http://127.0.0.1:9100/metrics  # Node Exporter
curl http://127.0.0.1:9256/metrics  # Process Exporter
```

### 4. Update/Upgrade

The same `deploy.yml` playbook handles updates:

```bash
# Update to latest version:
ansible-playbook -i inventory.yml nodepulse/deploy.yml

# Update to specific version:
ansible-playbook -i inventory.yml nodepulse/deploy.yml -e "agent_version=1.2.3"
```

### 5. Uninstall

```bash
# Remove everything:
ansible-playbook -i inventory.yml nodepulse/uninstall.yml

# Remove specific components:
ansible-playbook -i inventory.yml nodepulse/uninstall.yml --tags "nodepulse"

# Dry run (check what will be removed):
ansible-playbook -i inventory.yml nodepulse/uninstall.yml --check
```

## Configuration Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `agent_server_id` | Server ID from Flagship | `"srv_abc123"` |
| `ingest_endpoint` | Metrics ingestion URL | `"https://dashboard.com/metrics/prometheus"` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `agent_version` | `latest` | Agent version to install |
| `agent_interval` | `15s` | Metrics collection interval |
| `agent_timeout` | `5s` | HTTP request timeout |
| `tls_enabled` | `false` | Enable mTLS (requires certificates) |
| `node_exporter_version` | `1.8.2` | Node Exporter version |
| `process_exporter_version` | `0.8.3` | Process Exporter version |

### mTLS Configuration

For production deployments with mTLS:

```yaml
tls_enabled: true
ca_cert: |
  -----BEGIN CERTIFICATE-----
  ...
  -----END CERTIFICATE-----
client_cert: |
  -----BEGIN CERTIFICATE-----
  ...
  -----END CERTIFICATE-----
client_key: |
  -----BEGIN PRIVATE KEY-----
  ...
  -----END PRIVATE KEY-----
```

Certificates are typically provided by the Flagship deployment job.

## Directory Structure

```
ansible/
├── nodepulse/                          # Node Pulse deployment playbooks
│   ├── deploy.yml                      # Main deployment playbook
│   ├── uninstall.yml                   # Uninstall playbook
│   └── templates/                      # Jinja2 templates
│       ├── nodepulse.yml.j2           # Agent configuration
│       ├── nodepulse.service.j2       # Agent systemd service
│       ├── node_exporter.service.j2   # Node Exporter service
│       ├── process_exporter.service.j2    # Process Exporter service
│       └── process_exporter_config.yml.j2 # Process Exporter config
├── ansible.cfg                         # Ansible configuration
└── README.md                           # This file
```

## Advanced Usage

### Custom Process Monitoring

Override the process exporter configuration:

```bash
ansible-playbook -i inventory.yml nodepulse/deploy.yml \
  -e '{
    "process_exporter_process_names": [
      {"name": "nginx", "cmdline": ["nginx"]},
      {"name": "postgresql", "cmdline": ["postgres"]}
    ]
  }'
```

### Using from Flagship (Automated Deployments)

Flagship can trigger deployments automatically via the `submarines-deployer` service. The deployer:

1. Receives deployment jobs from Valkey Stream
2. Generates dynamic inventory from server records
3. Decrypts SSH keys using master key
4. Runs `nodepulse/deploy.yml` with appropriate variables
5. Reports status back to Flagship

No manual intervention required!

## Troubleshooting

### Check Ansible Connectivity

```bash
ansible -i inventory.yml all -m ping
```

### Run in Verbose Mode

```bash
ansible-playbook -i inventory.yml nodepulse/deploy.yml -vvv
```

### Check Service Status

```bash
ansible -i inventory.yml all -m shell -a 'systemctl status nodepulse'
```

### View Logs

```bash
ansible -i inventory.yml all -m shell -a 'journalctl -u nodepulse -n 20'
```

## Requirements

- **Control Node** (where you run Ansible):
  - Ansible 2.12+
  - Python 3.8+

- **Target Servers**:
  - Linux (Ubuntu 22.04+, Debian 11+, RHEL 8+, Rocky Linux 8+)
  - SSH access with sudo privileges
  - Systemd
  - Internet connectivity (for downloads)

## Security Notes

- **mTLS is strongly recommended for production** - Use `tls_enabled: true`
- **SSH keys should be encrypted at rest** - Flagship uses master key encryption
- **Private keys are never logged** - Templates set mode `0600` for keys
- **Metrics endpoints bind to localhost** - Use agent to forward to dashboard

## Integration with Flagship

This ansible directory is:

1. **Mounted in Docker containers** - Both `flagship` and `submarines-deployer` services
2. **Included in release tarballs** - Available for manual deployments
3. **Used by automated deployments** - Via submarines-deployer service

## Support

- **Issues**: https://github.com/node-pulse/admiral/issues
- **Documentation**: See `/docs` directory in repository
- **Claude Code Context**: See `/CLAUDE.md` for AI assistant guidelines
