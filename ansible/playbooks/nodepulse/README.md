# Node Pulse Agent Deployment Playbooks

This directory contains three Ansible playbooks for different agent deployment scenarios.

## Playbooks

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
1. Run deploy-agent-dev.yml
   └─> Agent installed without mTLS
```

### Production Workflow (Initial Deployment)

```
1. Run ./scripts/setup-mtls.sh
   └─> Creates CA, exports ca.crt, rebuilds submarines

2. Generate certificates in Flagship UI
   └─> Creates client certificates for each server

3. Run deploy-agent-mtls.yml
   └─> Agent installed with mTLS configured
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
