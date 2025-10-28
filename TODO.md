# TODO List - Ansible Deployment System

## Progress Summary (2025-10-27)

### ✅ Completed

- [x] **Section 6**: Playbook directory organization

  - Created `nodepulse/` and `custom/` subdirectories
  - Moved all playbooks to organized structure
  - Updated deployer, backend, and frontend to use new paths
  - Added flexible playbook validation (regex-based, no hardcoded list)

- [x] **Playbook Improvements**:
  - Fixed `deploy-agent.yml`: Removed undefined variables, fixed check_mode issue
  - Hardcoded agent download URL: `https://agent.nodepulse.sh`
  - Added architecture detection (amd64, arm64 only - no 32-bit support)
  - Created reusable `prerequisite.yml` task for system requirements validation
  - Updated proxy trust configuration in Laravel (`bootstrap/app.php`)

### 🚧 Known Issues to Fix (Section 3)

- [ ] **uninstall-agent.yml**: References `pulse` binary but should be `nodepulse`
- [ ] **rollback-agent.yml**: Expects backups that `deploy-agent.yml` doesn't create
- [ ] **deploy-agent.yml**: Needs to create version backups for rollback functionality
- [ ] All 4 playbooks need end-to-end testing

---

## 1. Production Configuration

- [ ] Add submarines-deployer service to compose.yml (production config - already in development compose)

## 2. Custom Playbook Upload Feature

### Backend Implementation

- [ ] Create directory structure: `flagship/ansible/playbooks/custom/`
- [ ] Implement playbook upload API endpoint in Flagship (Laravel) - save to directory
- [ ] Add playbook file validation (Ansible YAML syntax check)
- [ ] Update deployer to scan both system and custom playbook directories

### Frontend Implementation

- [ ] Create playbook management UI in Flagship dashboard
- [ ] Add disclaimer/warning UI when users upload playbooks

## Implementation Details

### Directory Structure

```
flagship/ansible/playbooks/
├── system/                    # Built-in playbooks (read-only)
│   ├── install_agent.yml
│   ├── uninstall_agent.yml
│   └── update_agent.yml
└── custom/                    # User-uploaded playbooks (writable)
    ├── my_playbook.yml
    └── another_playbook.yml
```

### User Flow

1. User goes to "Playbooks" section in dashboard
2. Clicks "Upload Playbook"
3. Sees warning: ⚠️ "You are responsible for the safety of custom playbooks. Malicious playbooks can damage your servers."
4. Uploads YAML file
5. System validates Ansible syntax
6. Playbook saved to `flagship/ansible/playbooks/custom/{filename}.yml`
7. When creating deployment, user selects from dropdown (system + custom playbooks)

### Deployer Changes

Current code already works - just searches directories:

```go
// Try system playbooks first, then custom
playbookPath := filepath.Join("/app/flagship/ansible/playbooks/system", playbook)
if _, err := os.Stat(playbookPath); os.IsNotExist(err) {
    playbookPath = filepath.Join("/app/flagship/ansible/playbooks/custom", playbook)
}
```

Or simpler - Laravel sends full path:

```json
{
  "playbook": "custom/my_playbook.yml" // Relative to playbooks/
}
```

### Security Considerations

- ✅ Validation: Ansible YAML syntax check before saving
- ✅ Disclaimer: Clear warning that users are responsible
- ✅ No execution restrictions: Users have full Ansible power (by design)
- ✅ File permissions: `custom/` directory writable by web server
- ⚠️ Filename sanitization: Prevent path traversal (`../../etc/passwd`)

## Notes

- Much simpler than database approach
- Uses shared volume pattern (same as secrets: `./secrets:/secrets:ro`)
- Volume mount in compose.yml:
  - Flagship: `./flagship/ansible:/var/www/html/ansible` (read-write for uploads)
  - Deployer: `./flagship/ansible:/app/flagship/ansible:ro` (read-only, already exists)
- Frontend can list files via API: `scandir('ansible/playbooks/custom')`
- No schema changes needed

## Volume Mount Pattern (Same as Secrets)

```yaml
# compose.development.yml (already exists)
submarines-deployer:
  volumes:
    - ./flagship/ansible:/app/flagship/ansible:ro # ✅ Already mounted!
    - ./secrets:/secrets:ro # Same pattern

flagship:
  volumes:
    - ./flagship:/var/www/html # Includes ansible/
    - ./secrets:/secrets:ro
```

## 3. Playbook Testing & Validation

- [ ] Test all existing playbooks in `flagship/ansible/playbooks/`
  - [ ] deploy-agent.yml
  - [ ] retry-failed.yml
  - [ ] rollback-agent.yml
  - [ ] uninstall-agent.yml
- [ ] Verify playbooks work with current agent architecture
- [ ] Document playbook requirements and dependencies
- [ ] Add error handling and rollback procedures

## 4. Valkey High Availability & Robustness

- [ ] Assess single point of failure risk for Valkey
- [ ] Research Valkey clustering/replication options
- [ ] Implement Valkey sentinel or cluster mode
- [ ] Add Valkey health checks and monitoring
- [ ] Document failover procedures
- [ ] Consider fallback strategy (direct DB writes if Valkey unavailable?)
- [ ] Add connection retry logic in Ingest/Digest services
- [ ] Implement stream lag monitoring and alerting

## 5. osquery Deployment Playbooks

- [ ] Create `install_osquery.yml` playbook
  - [ ] Support multiple Linux distributions (Ubuntu/Debian, RHEL/CentOS, Amazon Linux)
  - [ ] Install osquery from official repositories
  - [ ] Configure osquery daemon
- [ ] Create osquery configuration template
  - [ ] Define query packs for system monitoring
  - [ ] Configure logging to file/syslog
  - [ ] Set up flagfile with appropriate options
- [ ] Create `configure_osquery.yml` playbook
  - [ ] Update query packs
  - [ ] Manage osquery configuration
  - [ ] Restart osquery service
- [ ] Create `uninstall_osquery.yml` playbook
- [ ] Integration with Node Pulse agent
  - [ ] Define how osquery logs will be collected
  - [ ] Consider NPI protocol integration for security logs

## 6. Playbook Directory Organization

- [ ] Evaluate need for subdirectories in `flagship/ansible/playbooks/`
- [ ] Proposed structure:
  ```
  flagship/ansible/playbooks/
  ├── nodepulse/          # Node Pulse agent playbooks
  │   ├── deploy-agent.yml
  │   ├── rollback-agent.yml
  │   └── uninstall-agent.yml
  ├── osquery/            # osquery playbooks
  │   ├── install_osquery.yml
  │   └── uninstall_osquery.yml
  ├── syntra/             # Syntra-specific playbooks
  ├── wazuh/              # Wazuh HIDS playbooks
  └── custom/             # User-uploaded playbooks
  ```
- [ ] Consider pros/cons:
  - ✅ Pro: Better organization as playbook count grows
  - ✅ Pro: Clear separation by tool/component
  - ✅ Pro: Easier to manage permissions per category
  - ⚠️ Con: More complex path handling in deployer
  - ⚠️ Con: Only 4 existing playbooks - minimal migration needed
- [ ] Update deployer to handle subdirectory structure
- [ ] Update Flagship UI to organize playbooks by category
- [ ] Migrate existing playbooks to new structure
- [ ] Update database playbook references if needed

### YAML UI Editor

- https://github.com/eemeli/yaml
- https://github.com/google/yaml-ui-editor
