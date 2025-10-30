# Ansible Deployment Architecture

Complete architecture diagrams, data flow, and component interactions for the Ansible agent deployment system.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Flagship (Laravel)                       │
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────────────┐      │
│  │   Web UI         │         │   API Controllers       │      │
│  │   (React/Inertia)│────────▶│   DeploymentController  │      │
│  │                  │         │   AnsibleController     │      │
│  └──────────────────┘         └───────────┬─────────────┘      │
│                                            │                     │
│                                            ▼                     │
│                               ┌─────────────────────────┐       │
│                               │  Artisan Commands       │       │
│                               │  ansible:deploy         │       │
│                               │  ansible:inventory      │       │
│                               │  ansible:verify         │       │
│                               └───────────┬─────────────┘       │
│                                           │                      │
│                                           ▼                      │
│                               ┌─────────────────────────┐       │
│                               │  Laravel Jobs           │       │
│                               │  DeployAgentJob         │       │
│                               │  (Queue: deployments)   │       │
│                               └───────────┬─────────────┘       │
│                                           │                      │
└───────────────────────────────────────────┼──────────────────────┘
                                            │
                                            ▼
                              ┌──────────────────────────┐
                              │   Ansible CLI            │
                              │   ansible-playbook       │
                              └─────────┬────────────────┘
                                        │
                    ┏━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━┓
                    ▼                                         ▼
        ┌────────────────────────┐              ┌────────────────────────┐
        │  Dynamic Inventory     │              │  Ansible Playbooks     │
        │  (PostgreSQL)          │              │  - deploy-agent.yml    │
        │  - Read from admiral   │              │  - update-agent.yml    │
        │  - Filter by tags      │              │  - remove-agent.yml    │
        │  - SSH credentials     │              │  - verify-agent.yml    │
        └────────────────────────┘              └────────────┬───────────┘
                                                              │
                                                              ▼
                                                ┌──────────────────────────┐
                                                │   Target Servers         │
                                                │   (via SSH)              │
                                                │   - Download agent       │
                                                │   - Configure agent      │
                                                │   - Start systemd        │
                                                │   - Verify connection    │
                                                └──────────────────────────┘
```

---

## Data Flow

### Complete Request Flow

1. **User Action** → Select servers in UI, click "Deploy Agent"
2. **API Request** → POST `/api/deployments` with server IDs
3. **Job Dispatch** → Laravel queues `DeployAgentJob`
4. **Inventory Generation** → Dynamic inventory script queries PostgreSQL
5. **Playbook Execution** → Ansible runs `deploy-agent.yml` in parallel
6. **Progress Updates** → Job publishes updates to database
7. **Verification** → Health check ensures agent is reporting metrics
8. **Completion** → Update deployment status in database

### Detailed Step-by-Step

#### Step 1: User Initiates Deployment
- User selects servers from dashboard (checkbox selection)
- Chooses playbook type (deploy, update, rollback)
- Specifies agent version
- Submits form

#### Step 2: API Layer
- `DeploymentsController@store` receives request
- Validates server IDs and permissions
- Creates `Deployment` record in database
- Dispatches `DeployAgentJob` to queue

#### Step 3: Queue Processing
- Job picked up by queue worker (dedicated `deployments` queue)
- `AnsibleService` called to execute playbook
- Process started with Symfony Process component

####Step 4: Ansible Execution
- Dynamic inventory script (`ansible/inventory/dynamic.php`) runs
  - Queries PostgreSQL for server details
  - Decrypts SSH keys from database
  - Creates temporary key files (chmod 0600)
  - Outputs JSON inventory to Ansible
- Ansible playbook executes across servers (parallel up to 100)
- Each task updates deployment status

#### Step 5: Progress Tracking
- `AnsibleService` parses Ansible output in real-time
- Updates `deployment_servers` table with per-server status
- Stores full stdout/stderr in `deployments` table

#### Step 6: Completion
- Final stats aggregated (success/failure counts)
- Deployment marked as completed or failed
- Temporary SSH key files cleaned up
- Frontend polls for updated status

---

## Component Interactions

### Laravel Backend Components

```
┌─────────────────────────────────────────────────────┐
│                  Laravel Backend                     │
│                                                     │
│  Controllers                                        │
│  ├── DeploymentsController                         │
│  │   ├── index() - List deployments                │
│  │   ├── store() - Create deployment               │
│  │   ├── show() - Get deployment details           │
│  │   └── cancel() - Cancel running deployment      │
│  │                                                  │
│  Models                                            │
│  ├── Deployment                                    │
│  │   ├── Attributes: success_rate, duration        │
│  │   └── Relations: servers(), deploymentServers() │
│  ├── DeploymentServer                             │
│  │   └── Relations: deployment(), server()         │
│  │                                                  │
│  Services                                          │
│  ├── AnsibleService                                │
│  │   ├── runPlaybook() - Execute Ansible          │
│  │   ├── parseAnsibleOutput() - Parse stdout      │
│  │   ├── parseFinalStats() - Aggregate results    │
│  │   └── testConnection() - Ping test             │
│  │                                                  │
│  Jobs                                              │
│  └── DeployAgentJob                                │
│      ├── handle() - Main execution                 │
│      └── failed() - Error handling                 │
└─────────────────────────────────────────────────────┘
```

### Ansible Components

```
┌───────────────────────────────────────────────────┐
│              Ansible Structure                    │
│                                                   │
│  Inventory                                        │
│  └── dynamic.php                                  │
│      ├── getServers() - Query PostgreSQL         │
│      ├── getSSHKey() - Decrypt keys              │
│      └── generateInventory() - Build JSON        │
│                                                   │
│  Playbooks                                        │
│  ├── deploy-agent-mtls.yml                       │
│  ├── deploy-agent-no-mtls.yml                    │
│  ├── upgrade-agent.yml                            │
│  └── rollback-agent.yml                           │
│                                                   │
│  Roles                                            │
│  └── nodepulse-agent/                            │
│      ├── tasks/                                   │
│      │   ├── download.yml - Get agent binary     │
│      │   ├── configure.yml - Setup config files  │
│      │   ├── install.yml - systemd setup         │
│      │   └── verify.yml - Health checks          │
│      ├── templates/                               │
│      │   ├── nodepulse.yml.j2                    │
│      │   └── nodepulse.service.j2                │
│      └── handlers/                                │
│          └── main.yml - Restart handlers         │
└───────────────────────────────────────────────────┘
```

---

## Directory Structure

### Complete Project Layout

```
admiral/
├── ansible/
│   ├── ansible.cfg                  # Ansible configuration (100 forks, SSH settings)
│   ├── inventory/
│   │   └── dynamic.php              # Dynamic inventory script (reads PostgreSQL)
│   │
│   ├── playbooks/
│   │   ├── nodepulse/
│   │   │   ├── deploy-agent-mtls.yml      # Production with mTLS
│   │   │   ├── deploy-agent-no-mtls.yml   # Development without mTLS
│   │   │   ├── upgrade-agent.yml          # Update existing
│   │   │   ├── rollback-agent.yml         # Rollback version
│   │   │   ├── uninstall-agent.yml        # Uninstall
│   │   │   └── retry-failed.yml           # Retry failures
│   │   └── prometheus/
│   │       └── deploy-node-exporter.yml   # Deploy node_exporter
│   │
│   ├── roles/
│   │   ├── nodepulse-agent/
│   │   │   ├── tasks/
│   │   │   │   ├── main.yml               # Main task flow
│   │   │   │   ├── download.yml           # Binary download
│   │   │   │   ├── configure.yml          # Config deployment
│   │   │   │   ├── install.yml            # Service setup
│   │   │   │   ├── verify.yml             # Health checks
│   │   │   │   └── deploy-certificates.yml # mTLS certs
│   │   │   │
│   │   │   ├── templates/
│   │   │   │   ├── nodepulse.yml.j2       # Agent config (with Prometheus scraper)
│   │   │   │   └── nodepulse.service.j2   # Systemd service
│   │   │   │
│   │   │   ├── handlers/
│   │   │   │   └── main.yml               # Restart handlers
│   │   │   │
│   │   │   └── defaults/
│   │   │       └── main.yml               # Default variables
│   │   │
│   │   ├── node-exporter/
│   │   │   └── (similar structure)
│   │   │
│   │   └── common/
│   │       └── tasks/
│   │           └── prerequisite.yml       # System checks
│   │
│   └── README.md
│
├── flagship/
│   ├── app/
│   │   ├── Console/Commands/
│   │   │   ├── AnsibleInitCommand.php     # php artisan ansible:init
│   │   │   └── AnsibleInventoryCommand.php # php artisan ansible:inventory
│   │   │
│   │   ├── Http/Controllers/
│   │   │   └── DeploymentsController.php  # Deployment API
│   │   │
│   │   ├── Jobs/
│   │   │   └── DeployAgentJob.php         # Queue job (1hr timeout)
│   │   │
│   │   ├── Models/
│   │   │   ├── Deployment.php             # Deployment record
│   │   │   └── DeploymentServer.php       # Per-server status
│   │   │
│   │   └── Services/
│   │       └── AnsibleService.php         # Ansible execution wrapper
│   │
│   ├── resources/js/pages/deployments/
│   │   ├── index.tsx                      # Deployment list
│   │   ├── create.tsx                     # Create form
│   │   └── show.tsx                       # Details view
│   │
│   └── routes/
│       └── api.php                        # API routes
│
└── migrate/migrations/
    └── 20251025120000001_add_deployments_tables.sql
```

---

## Integration Points

### Laravel ↔ Ansible

**Interface: Symfony Process**
- Laravel executes Ansible CLI via `Symfony\Component\Process\Process`
- Environment variables pass server IDs and configuration
- Stdout/stderr captured in real-time
- Process ID stored in cache for cancellation support

**Data Exchange:**
```php
// Laravel → Ansible
Environment Variables:
  - ANSIBLE_SERVER_IDS (comma-separated UUIDs)
  - ANSIBLE_TAGS (filter by tags)
  - AGENT_DOWNLOAD_BASE_URL (R2 bucket URL)

Extra Vars (JSON):
  - ingest_endpoint (dashboard URL)
  - agent_version (e.g., "latest", "v1.0.0")
  - agent_interval (scrape interval)

// Ansible → Laravel
Stdout:
  - Task execution logs
  - PLAY RECAP statistics

Stderr:
  - Error messages
  - Connection failures
```

### Ansible ↔ PostgreSQL

**Interface: Dynamic Inventory Script**
- PHP script bootstraps Laravel
- Queries `admiral.servers` table
- Decrypts SSH keys using Laravel's Crypt facade
- Outputs JSON inventory format

**Data Exchange:**
```json
{
  "_meta": {
    "hostvars": {
      "hostname": {
        "ansible_host": "1.2.3.4",
        "ansible_port": 22,
        "ansible_user": "root",
        "ansible_ssh_private_key_file": "/tmp/ansible_key_uuid_xxx",
        "server_id": "uuid",
        "server_uuid": "agent-server-id"
      }
    }
  },
  "all": {
    "children": ["ungrouped", "ubuntu", "tag_production"]
  },
  "ungrouped": {
    "hosts": ["hostname"]
  }
}
```

### Frontend ↔ Backend

**Interface: REST API + Polling**
- React components call API endpoints
- Polling every 5 seconds for running deployments
- CSRF tokens for security

**API Endpoints:**
```
GET  /api/deployments        - List deployments (paginated)
POST /api/deployments        - Create deployment
GET  /api/deployments/:id    - Get deployment details
POST /api/deployments/:id/cancel - Cancel running deployment
```

---

## Scalability Considerations

### Parallel Execution
- **Ansible forks:** 100 concurrent servers (configurable in `ansible.cfg`)
- **Queue workers:** 2 workers recommended for deployments queue
- **Database connections:** Connection pooling enabled

### Resource Requirements

**For 1000 servers:**
- **CPU:** 4-8 cores for Ansible execution
- **Memory:** 4-8 GB RAM
- **Network:** Stable connection to all target servers
- **Disk:** Minimal (logs and temporary files)

**Estimated Duration:**
- 10 servers: ~2-3 minutes
- 100 servers: ~5-10 minutes
- 1000 servers: ~15-30 minutes

---

## High Availability

### Failure Handling
- **SSH failures:** Individual server marked as failed, others continue
- **Ansible crash:** Job marked as failed, can be retried
- **Network issues:** Retry playbook available
- **Partial failures:** Per-server status tracking enables targeted retries

### Rollback Strategy
- Backup binary saved before upgrade (`/opt/nodepulse/nodepulse.backup`)
- Dedicated rollback playbook (`rollback-agent.yml`)
- Previous version restored and service restarted
- Can rollback specific servers only

---

## Monitoring & Observability

### Logs
- **Ansible stdout:** Stored in `deployments.output` (full execution log)
- **Ansible stderr:** Stored in `deployments.error_output`
- **Per-server status:** Stored in `deployment_servers.status`
- **Laravel logs:** Standard Laravel logging for job processing

### Metrics
- Total deployments created
- Success/failure rates
- Average deployment duration
- Per-playbook statistics
- Server failure patterns

---

## Reference

- Main README: [../ANSIBLE_README.md](../ANSIBLE_README.md)
- Playbook examples: [playbooks.md](./playbooks.md)
- Laravel integration: [laravel-integration.md](./laravel-integration.md)

---

**Last Updated:** 2025-10-30
