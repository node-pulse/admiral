# TODO - Node Pulse Admiral

**Updated**: November 29, 2025

## Current Status

| Feature | Status |
|---------|--------|
| Metrics Architecture | ✅ Done |
| Process Monitoring | ✅ Done |
| Ansible Deployment | ✅ Done |
| SSH Terminal | ✅ Done |
| Data Retention | ✅ Done |
| 2FA | ✅ Done |
| Custom Playbooks | ✅ Done |
| Community Playbooks | ✅ Done |
| User Management | ✅ Done |
| Server ID Validation | ✅ Done |
| Security Playbooks | ✅ Done |
| Dashboard Metrics | ✅ Done |
| mTLS | ✅ 95% (e2e testing optional) |

---

## Remaining

### Playbook Testing
- [ ] Test deploy.yml on Ubuntu 22.04, 24.04, Debian 12, RHEL/Rocky 8+
- [ ] Test uninstall.yml on all distros
- [ ] Test configure-firewall.yml (UFW + firewalld)

---

## Sprint 3 (Future)

### Scheduled Deployments
- [ ] Cron-based deployment scheduler
  - Use case: recurring tasks users can't do with server's own cron (e.g., run playbook across 50 servers weekly)
  - Store schedules in DB, scheduler service polls every minute
  - Library: `github.com/robfig/cron/v3` for Go
- [ ] Maintenance windows (optional time range when deployments can run)
- [ ] Deployment chains (run playbooks in sequence, stop on failure)

### Server Groups
- [ ] Static groups
- [ ] Dynamic groups (filters by OS, tags, hostname)
- [ ] Server tags and metadata

### Audit Trail
- [ ] Deployment action logging
- [ ] Audit log UI with export
- [ ] Rollback support

---

## Backlog

- Execution environment management (Python venvs, Ansible versions)
- Advanced RBAC with approval workflows
- Credential vault integration
- Notifications (Slack, Discord, email, webhooks)
- Playbook analytics
- Git integration
- Visual workflow builder

---

## Deferred

- Valkey HA (not needed until >1000 servers)
- osquery playbooks (users can upload custom)
- SSH session recording playback (privacy concerns)
