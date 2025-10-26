# Ansible Agent Deployment

This directory contains Ansible playbooks and roles for deploying the Node Pulse monitoring agent to servers.

## Directory Structure

```
ansible/
├── ansible.cfg                  # Ansible configuration
├── inventory/
│   └── dynamic.php             # Dynamic inventory script (reads from PostgreSQL)
├── playbooks/
│   ├── deploy-agent.yml        # Main deployment playbook
│   ├── update-agent.yml        # Update existing agent
│   ├── remove-agent.yml        # Uninstall agent
│   ├── verify-agent.yml        # Verify agent health
│   ├── rollback-agent.yml      # Rollback to previous version
│   └── retry-failed.yml        # Retry deployment on failed servers
├── roles/
│   └── nodepulse-agent/        # Agent installation role
│       ├── tasks/              # Task definitions
│       ├── templates/          # Configuration templates
│       ├── handlers/           # Service handlers
│       ├── vars/               # Variables
│       └── defaults/           # Default variables
└── group_vars/                  # Group-specific variables
```

## Usage

### Deploy Agent to Servers

```bash
# From Laravel application
php artisan ansible:deploy --server-ids=uuid1,uuid2,uuid3

# Or use the web dashboard
```

### Test Inventory

```bash
# List all servers
php artisan ansible:inventory

# Filter by server IDs
php artisan ansible:inventory --server-ids=uuid1,uuid2

# Filter by tags
php artisan ansible:inventory --tags=production,web
```

### Manual Playbook Execution

```bash
cd /path/to/admiral/ansible

# Deploy to all servers
ansible-playbook playbooks/deploy-agent.yml

# Deploy to specific servers (set environment variable)
ANSIBLE_SERVER_IDS=uuid1,uuid2 ansible-playbook playbooks/deploy-agent.yml

# Test connectivity
ansible all -m ping
```

## Configuration

### Environment Variables

Set these in your `.env` file:

```bash
# Agent binary download URL (Cloudflare R2)
AGENT_DOWNLOAD_BASE_URL=https://pub-xxxxx.r2.dev

# Dashboard endpoint for agents to report to
DASHBOARD_ENDPOINT=https://your-dashboard.com/metrics
```

### Agent Version

The playbooks will deploy the latest version by default. To deploy a specific version:

```bash
ansible-playbook playbooks/deploy-agent.yml --extra-vars="agent_version=v1.2.3"
```

## Security

- SSH private keys are automatically decrypted from the database
- Temporary key files are created with `chmod 0600` permissions
- Keys are automatically cleaned up after playbook execution
- All SSH connections use the keys configured in the dashboard

## Troubleshooting

### View Ansible Logs

```bash
tail -f /var/log/ansible/ansible.log
```

### Check Agent Status on Server

```bash
ssh user@server "systemctl status nodepulse"
```

### View Agent Logs

```bash
ssh user@server "journalctl -u nodepulse -f"
```

## Development

To add a new playbook:

1. Create the playbook in `playbooks/`
2. Add any required roles or tasks
3. Update the Laravel `AnsibleService` to support the new playbook
4. Add UI controls in the dashboard

For more details, see `/docs/ansible-agent-deployment.md`
