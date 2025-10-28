# TODO List - Ansible Deployment System

## Progress Summary (2025-10-28)

### ✅ Completed

- [x] **Section 6**: Playbook directory organization

  - Created `nodepulse/`, `prometheus/`, and `custom/` subdirectories
  - Moved all playbooks to organized structure
  - Updated deployer, backend, and frontend to use new paths
  - Added flexible playbook validation (regex-based, no hardcoded list)

- [x] **Playbook Improvements**:

  - Fixed `deploy-agent.yml`: Removed undefined variables, fixed check_mode issue
  - Hardcoded agent download URL: `https://agent.nodepulse.sh`
  - Added architecture detection (amd64, arm64 only - no 32-bit support)
  - Created reusable `prerequisite.yml` task for system requirements validation
  - Updated proxy trust configuration in Laravel (`bootstrap/app.php`)
  - **Created `upgrade-agent.yml`**: Comprehensive agent upgrade playbook with backup/rollback

- [x] **Prometheus Integration (2025-10-27 to 2025-10-28)**:

  - Database schema redesigned with Prometheus-native `metric_samples` table
  - node_exporter Ansible role created and deployed
  - Node Pulse Agent refactored to scrape Prometheus exporters
  - Agent successfully deployed to multiple servers (linux, hostdzire1)
  - Metrics flowing to database (verified 4,344+ samples)
  - Push-based architecture with buffering working correctly
  - Documentation updated (README.md, CLAUDE.md)

- [x] **Deployment System (2025-10-28)**:

  - ✅ **MAJOR FIX**: Fixed `deployment_servers` status parsing issue
  - Implemented JSON extraction from Ansible mixed output (handles profile_tasks/timer callbacks)
  - Root cause: `profile_tasks`/`timer` callbacks were mixing timing output with JSON
  - Solution: Extract JSON between first `{` and last `}` from mixed output
  - Server deployment status now correctly shows success/failed/skipped (NOT stuck on "pending")
  - `changed` field accurately reflects whether Ansible made changes
  - Deployer service running in development environment with Air hot-reload
  - Deployment tracking now fully functional end-to-end
  - ✅ Added deployer service to production `compose.yml`

- [x] **Server Online Status Fix (2025-10-28)**:
  - ✅ **MAJOR FIX**: Fixed servers showing "Offline" despite metrics flowing
  - Root cause: `last_seen_at` field was never updated when metrics arrived
  - Solution: Added `updateServerLastSeen()` in digest worker (submarines/cmd/digest/main.go:249-273)
  - Now updates `servers.last_seen_at` to NOW() when processing metrics
  - Dashboard correctly shows servers as "Online" when metrics are flowing (within 5 minutes)
  - Non-destructive: Won't fail metric insertion if `last_seen_at` update fails

### 🚧 Known Issues to Fix (Section 3)

- [x] **uninstall-agent.yml**: References `pulse` binary but should be `nodepulse` ✅ FIXED
- [x] **upgrade-agent.yml**: Created comprehensive upgrade playbook ✅ DONE
- [ ] **rollback-agent.yml**: Needs testing and verification
- [ ] **deploy-agent.yml**: Needs end-to-end testing
- [ ] All playbooks need comprehensive end-to-end testing

---

## 1. Production Configuration

- [x] Add submarines-deployer service to compose.development.yml ✅ DONE
- [x] Add submarines-deployer service to compose.yml (production config) ✅ DONE

## 2. Custom Playbook Upload Feature

### Backend Implementation

- [x] Create directory structure: `flagship/ansible/playbooks/custom/` ✅ DONE
- [x] Update deployer to scan both system and custom playbook directories ✅ DONE (supports subdirectories)
- [ ] Implement playbook upload API endpoint in Flagship (Laravel) - save to directory
- [ ] Add playbook file validation (Ansible YAML syntax check)

### Frontend Implementation

- [ ] Create playbook management UI in Flagship dashboard
- [ ] Add disclaimer/warning UI when users upload playbooks

## Implementation Details

### Directory Structure (Current Implementation)

```
flagship/ansible/playbooks/
├── nodepulse/                 # Node Pulse agent playbooks ✅ DONE
│   ├── deploy-agent.yml
│   ├── upgrade-agent.yml
│   ├── rollback-agent.yml
│   ├── uninstall-agent.yml
│   └── retry-failed.yml
├── prometheus/                # Prometheus exporter playbooks ✅ DONE
│   └── deploy-node-exporter.yml
└── custom/                    # User-uploaded playbooks (writable) ✅ DONE
    └── (empty - ready for uploads)
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
  - [ ] deploy-agent.yml - needs testing
  - [ ] retry-failed.yml - needs testing
  - [ ] rollback-agent.yml - needs testing
  - [ ] uninstall-agent.yml - partially tested
  - [x] upgrade-agent.yml - ✅ TESTED AND WORKING (deployed successfully to multiple servers)
  - [x] prometheus/deploy-node-exporter.yml - ✅ TESTED AND WORKING
- [x] Verify playbooks work with current agent architecture ✅ DONE (upgrade-agent tested)
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

## 6. Playbook Directory Organization ✅ DONE

- [x] Evaluate need for subdirectories in `flagship/ansible/playbooks/`
- [x] Implemented structure:
  ```
  flagship/ansible/playbooks/
  ├── nodepulse/          # Node Pulse agent playbooks
  │   ├── deploy-agent.yml
  │   ├── rollback-agent.yml
  │   └── uninstall-agent.yml
  └── custom/             # User-uploaded playbooks
  ```
- [x] Update deployer to handle subdirectory structure
- [x] Update Flagship UI to organize playbooks by category
- [x] Migrate existing playbooks to new structure

### YAML UI Editor

- https://github.com/eemeli/yaml
- https://github.com/google/yaml-ui-editor

## 7. Prometheus Integration - Remaining Tasks

Based on `docs/prometheus-integration-plan.md`, the following items are still in progress:

### Phase 2: Submarines Prometheus Parser ✅ DONE

- [x] Verify Prometheus text format parser implementation in `submarines/internal/parsers/prometheus.go` ✅ WORKING
- [x] Verify `/metrics/prometheus` endpoint in `submarines/internal/handlers/prometheus.go` ✅ WORKING
- [x] Verify integration with Valkey Stream ✅ WORKING (metrics flowing to database)
- [ ] Add comprehensive tests for Prometheus parser
- [ ] Benchmark parser performance (target: >10,000 metrics/second)

### Phase 3: Dashboard Integration (NEXT PRIORITY)

- [ ] **Update Flagship dashboard to query from `metric_samples` table**
- [ ] Implement dashboard queries for:
  - [ ] CPU metrics (aggregate multi-core data)
  - [ ] Memory metrics (calculate used from total - available)
  - [ ] Disk metrics (handle multiple filesystems with labels)
  - [ ] Network metrics (handle multiple interfaces with labels)
- [ ] Create charts/visualizations for Prometheus metrics
- [ ] Handle unit conversions (bytes → MB/GB)
- [ ] Filter out unwanted metrics (tmpfs, loopback devices, etc.)

### Phase 4: End-to-End Testing

- [ ] Test full metric flow: node_exporter → agent → submarines → database → dashboard
- [ ] Test offline buffering scenario (disconnect agent, verify WAL persistence)
- [ ] Load testing with 100+ servers
- [ ] Performance benchmarks (latency p50/p95/p99)
- [ ] Error scenario testing (malformed metrics, parser failures)

### Phase 5: Documentation

- [ ] Write `docs/prometheus-integration.md`
- [ ] Write `docs/node-exporter-deployment.md`
- [ ] Write `docs/metrics-mapping.md`
- [ ] Update deployment guides

### Future Exporters (Post-MVP)

- [ ] postgres_exporter role
- [ ] redis_exporter role
- [ ] blackbox_exporter for active probing
- [ ] Custom exporter support documentation

## 8. Security & Production Readiness

### Urgent:

- [ ] **mTLS between agents and Submarines ingest**

  - [ ] Certificate generation and distribution
  - [ ] Agent configuration for mTLS
  - [ ] Submarines TLS termination
  - [ ] Certificate rotation strategy

- [ ] **Agent Authentication**

  - [ ] Implement JWT or API key authentication
  - [ ] Agent registration workflow
  - [ ] Token refresh mechanism

- [ ] **Rate Limiting**
  - [ ] Implement rate limiting in Caddy or Submarines
  - [ ] Per-agent rate limits
  - [ ] Burst handling

## Next Immediate Steps (Priority Order)

### Week of 2025-10-28 Progress ✅

- [x] ✅ **Deployment System Fixed** - Server status tracking now working correctly
- [x] ✅ **upgrade-agent.yml** - Created and tested successfully
- [x] ✅ **Prometheus Pipeline** - End-to-end metrics flow working (node_exporter → agent → submarines → database)
- [x] ✅ **Server Online Status Fixed** - Servers now show "Online" when metrics are flowing
- [x] ✅ **Production Compose** - Added deployer service to production compose.yml

### Upcoming Priorities

1. **🎯 HIGHEST PRIORITY: Dashboard Integration**

   - Update Flagship to display metrics from `metric_samples` table
   - Implement charts/visualizations for CPU, memory, disk, network metrics
   - Users can see their Prometheus metrics in the UI
   - This completes the end-to-end user experience

2. **Playbook Testing & Hardening**

   - Test remaining playbooks (deploy-agent, rollback-agent, retry-failed)
   - Add comprehensive error handling
   - Document playbook requirements

3. **Security Hardening**

   - Implement mTLS for agent-to-dashboard communication
   - Add authentication/authorization
   - Rate limiting

4. **Documentation**
   - Complete Prometheus integration documentation
   - Deployment guides
   - Troubleshooting guides
