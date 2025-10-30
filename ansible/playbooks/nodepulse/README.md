# Node Pulse Agent Deployment Playbooks

This directory contains Ansible playbooks for deploying the Node Pulse monitoring stack to Linux servers.

## Architecture Overview

**Simplified Metrics Architecture** (Implemented 2025-10-30)

The Node Pulse stack uses a two-component architecture that achieves **98% bandwidth reduction**:

```
┌─────────────────────────────────────────────────────┐
│  Target Server                                       │
│                                                      │
│  ┌──────────────────┐         ┌─────────────────┐  │
│  │ node_exporter    │ scrape  │ Node Pulse      │  │
│  │ :9100 (localhost)│ ◄────── │ Agent           │  │
│  │                  │         │                 │  │
│  │ Exposes 1100+    │         │ Parses locally  │  │
│  │ metrics          │         │ Extracts 39     │  │
│  └──────────────────┘         │ essential       │  │
│                                │ metrics         │  │
│                                └────────┬────────┘  │
│                                         │           │
└─────────────────────────────────────────┼───────────┘
                                          │ HTTPS POST
                       1KB JSON (39 fields, 98% reduction)
                                          │
                                          ▼
                                ┌─────────────────┐
                                │  Submarines     │
                                │  /metrics/      │
                                │  prometheus     │
                                └─────────────────┘
```

**Key Benefits:**
- **98.32% bandwidth reduction** (61KB → 1KB per scrape)
- **99.8% database reduction** (1100+ rows → 1 row per scrape)
- **10-30x faster queries** (direct column access vs JSONB parsing)
- **Distributed parsing** (load distributed across agents, not central server)

## Deployment Order

**For new servers, deploy in this order:**

1. **Deploy node_exporter** (Prometheus metrics collector)
   ```bash
   ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml -i inventory.yml
   ```

2. **Deploy Node Pulse Agent** (scrapes node_exporter, pushes to Submarines)
   ```bash
   # Production (with mTLS)
   ansible-playbook ansible/playbooks/nodepulse/deploy-agent-mtls.yml -i inventory.yml

   # Development (no mTLS)
   ansible-playbook ansible/playbooks/nodepulse/deploy-agent-no-mtls.yml -i inventory.yml
   ```

## Playbooks

### 0. deploy-node-exporter.yml - Deploy Prometheus node_exporter

**Location**: `ansible/playbooks/prometheus/deploy-node-exporter.yml`

**Purpose**: Deploy Prometheus node_exporter to collect system metrics.

**When to use**:
- **ALWAYS deploy this FIRST** before deploying the Node Pulse agent
- Initial server setup
- Any server where you want to collect metrics

**Requirements**:
- SSH access to target servers
- Server must have network access (to download node_exporter binary)

**Usage**:
```bash
ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml \
  -i your-inventory.yml \
  -e "node_exporter_version=1.8.2"
```

**What it does**:
- Downloads and installs node_exporter binary
- Configures to listen ONLY on localhost:9100 (security)
- Creates systemd service
- Enables and starts node_exporter
- Verifies metrics endpoint is responding

**Security Note**: node_exporter is configured by default to listen ONLY on 127.0.0.1:9100, so it's not accessible from the network. Only the Node Pulse Agent on the same server can scrape it.

**Variables**:
| Variable | Default | Description |
|----------|---------|-------------|
| `node_exporter_version` | `1.8.2` | node_exporter version to install |
| `node_exporter_listen_address` | `127.0.0.1` | Bind address (localhost only) |
| `node_exporter_listen_port` | `9100` | Port number |

**Role**: Uses the `node-exporter` role from `ansible/roles/node-exporter/`

---

### 1. deploy-agent-dev.yml - Development Deployment

**Purpose**: Deploy Node Pulse agent to development/testing servers without mTLS.

**When to use**:
- Development environments
- Testing/staging servers
- Local testing setups
- When mTLS is not required

**Requirements**:
- SSH access to target servers
- No mTLS certificates needed

**Usage**:
```bash
ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent-dev.yml \
  -i your-inventory.yml \
  -e "agent_version=v1.0.0"
```

**What it does**:
- Installs/upgrades Node Pulse agent binary
- Configures agent without mTLS
- Does NOT install certificates
- Starts agent service

---

### 2. install-mtls-certs.yml - Certificate Installation Only

**Purpose**: Install or update mTLS certificates on existing agents (certificate rotation).

**When to use**:
- Certificate rotation/renewal
- Updating expired certificates
- Initial certificate deployment to existing agents
- Certificate updates without agent upgrade

**Requirements**:
- Agent already installed on target servers
- mTLS certificates generated in Flagship UI/API
- Certificates passed via Ansible variables (handled by deployer)

**Usage**:
```bash
# This is typically called by the deployment system (submarines-deployer)
# Manual usage:
ansible-playbook flagship/ansible/playbooks/nodepulse/install-mtls-certs.yml \
  -i your-inventory.yml \
  -e "tls_enabled=true" \
  -e "ca_cert='...'" \
  -e "client_cert='...'" \
  -e "client_key='...'"
```

**What it does**:
- Installs CA certificate, client certificate, and client key
- Sets correct file permissions (0700 for dir, 0600 for key)
- Restarts agent if certificates changed
- **Fails if tls_enabled=false** (safety check)

---

### 3. deploy-agent-mtls.yml - Production Deployment

**Purpose**: Deploy Node Pulse agent with mTLS for production environments.

**When to use**:
- **Production deployments ONLY**
- Any environment where mTLS is mandatory
- Initial agent installation in production
- Agent upgrades in production

**Requirements**:
- SSH access to target servers
- mTLS CA must be set up (run `./scripts/setup-mtls.sh`)
- Certificates generated for each server
- `tls_enabled=true` must be set

**Usage**:
```bash
# This is typically called by the deployment system (submarines-deployer)
# The deployer automatically fetches certificates from the database
ansible-playbook flagship/ansible/playbooks/nodepulse/deploy-agent-mtls.yml \
  -i your-inventory.yml \
  -e "agent_version=v1.0.0" \
  -e "tls_enabled=true" \
  -e "ca_cert='...'" \
  -e "client_cert='...'" \
  -e "client_key='...'"
```

**What it does**:
- Installs/upgrades Node Pulse agent binary
- Deploys mTLS certificates (CA, client cert, client key)
- Configures agent with mTLS enabled
- Starts agent service
- **Fails if mTLS certificates are not provided** (safety check)

**Safety checks**:
- Verifies `tls_enabled=true`
- Verifies certificate variables are provided
- Deployment fails fast if requirements not met

---

## Deployment Flow

### Development Workflow

```
1. Run ansible/playbooks/prometheus/deploy-node-exporter.yml
   └─> node_exporter installed and running on localhost:9100

2. Run ansible/playbooks/nodepulse/deploy-agent-no-mtls.yml
   └─> Agent installed, scrapes node_exporter, pushes to Submarines
```

### Production Workflow (Initial Deployment)

```
1. Run ./scripts/setup-mtls.sh
   └─> Creates CA, exports ca.crt, rebuilds submarines

2. Generate certificates in Flagship UI
   └─> Creates client certificates for each server

3. Run ansible/playbooks/prometheus/deploy-node-exporter.yml
   └─> node_exporter installed and running on localhost:9100

4. Run ansible/playbooks/nodepulse/deploy-agent-mtls.yml
   └─> Agent installed with mTLS, scrapes node_exporter, pushes to Submarines
```

### Production Workflow (Certificate Rotation)

```
1. Generate new certificates in Flagship UI
   └─> New certificates stored in database

2. Run install-mtls-certs.yml
   └─> Certificates deployed, agent restarted
```

### Production Workflow (Agent Upgrade)

```
1. Run deploy-agent-mtls.yml with new agent_version
   └─> Agent upgraded, mTLS certificates updated if changed
```

---

## Variables

### Common Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `agent_version` | No | `latest` | GitHub release tag to deploy |
| `agent_interval` | No | `15s` | How often agent scrapes metrics |
| `agent_timeout` | No | `5s` | HTTP timeout for agent requests |
| `ingest_endpoint` | Yes | - | Submarines ingest endpoint URL |

### mTLS Variables (playbooks 2 & 3 only)

| Variable | Required | Description |
|----------|----------|-------------|
| `tls_enabled` | Yes | Must be `true` for mTLS playbooks |
| `ca_cert` | Yes | CA certificate PEM content |
| `client_cert` | Yes | Client certificate PEM content |
| `client_key` | Yes | Client private key PEM content |
| `agent_server_id` | Yes | Server ID for logging/debugging |

---

## Error Handling

### deploy-agent-mtls.yml Errors

**Error**: `mTLS is MANDATORY for production deployments but tls_enabled=false`

**Cause**: Deployer could not find certificates for this server.

**Fix**:
1. Verify CA is set up: `./scripts/setup-mtls.sh`
2. Generate certificate in Flagship UI (System Settings > Servers)
3. Re-run deployment

---

### install-mtls-certs.yml Errors

**Error**: `mTLS certificates are required but not provided`

**Cause**: Playbook called without `tls_enabled=true` or missing certificate variables.

**Fix**: This playbook should only be called by submarines-deployer with proper variables.

---

## Security Notes

- **Certificate permissions**: Private keys are 0600, certificates 0644
- **Certificate owner**: All certificates owned by `nodepulse:nodepulse`
- **Temp files**: Deployer creates temp files, cleaned up after playbook execution
- **No certificate logging**: Certificate content never logged to console

---

## See Also

- [mTLS Setup Guide](../../../../docs/mtls-setup-guide.md)
- [mTLS Implementation Guide](../../../../docs/mtls-guide.md)
- [Deployment Script](../../../../scripts/deploy.sh)
- [Ansible Roles](../../roles/nodepulse-agent/)
