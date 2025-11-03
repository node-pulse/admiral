# TODO List - Node Pulse Admiral

**Last Updated**: November 3, 2025
**Current Phase**: Post-MVP (Phase 2)
**Sprint System**: Active

---

## 📊 Project Status Overview

| Component | Status | Completion |
|-----------|--------|------------|
| **Simplified Metrics Architecture** | ✅ Production Ready | 100% |
| **Process Monitoring** | ✅ Production Ready | 100% |
| **Ansible Deployment System** | ✅ Production Ready | 100% |
| **SSH WebSocket Terminal** | ✅ Production Ready | 100% |
| **Public Status Pages** | ✅ Production Ready | 100% |
| **Data Retention** | ✅ Production Ready | 100% |
| **mTLS Implementation** | ✅ Core Complete | 85% |
| **Dashboard Metrics Visualization** | ⏳ Pending | 30% |
| **Custom Playbook Upload** | ⏳ Spec Complete | 0% |
| **Server ID Validation** | ⏳ Spec Complete | 0% |

**Overall MVP Status**: ✅ **97% Complete**

---

## 🚀 SPRINT 1 (Current - 2 weeks)
**Goal**: Complete core user-facing features and testing
**Timeline**: November 3-17, 2025

### 1.1 Dashboard Metrics Visualization (HIGHEST PRIORITY)
**Why**: Backend metrics pipeline is complete, but users can't see their data yet.

- [ ] **CPU Metrics Chart**
  - [ ] Create `flagship/resources/js/components/charts/cpu-chart.tsx`
  - [ ] Query `admiral.metrics` table with LAG() for percentage calculations
  - [ ] Multi-core aggregation
  - [ ] Time range selector (1h, 6h, 24h, 7d)
  - [ ] Aggregate by core or show total

- [ ] **Memory Metrics Chart**
  - [ ] Create `flagship/resources/js/components/charts/memory-chart.tsx`
  - [ ] Calculate used from `total - available`
  - [ ] Show total, available, cached, buffers
  - [ ] Unit conversion (bytes → GB)

- [ ] **Disk Metrics Chart**
  - [ ] Create `flagship/resources/js/components/charts/disk-chart.tsx`
  - [ ] Handle single root filesystem
  - [ ] Show total, free, available
  - [ ] Usage percentage

- [ ] **Network Metrics Chart**
  - [ ] Create `flagship/resources/js/components/charts/network-chart.tsx`
  - [ ] Primary interface only
  - [ ] RX/TX bytes with rate calculation
  - [ ] Packet counts and errors

- [ ] **System Overview Dashboard**
  - [ ] Create `flagship/resources/js/pages/servers/[id]/metrics.tsx`
  - [ ] Grid layout with all charts
  - [ ] Live updates (optional - polling every 30s)
  - [ ] Export metrics as CSV

**Reference Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/metrics-architecture.md`
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/prometheus-schema-design.md`
- Database table: `admiral.metrics` (39 columns)

**Acceptance Criteria:**
- ✅ User can view CPU, memory, disk, network charts for any server
- ✅ Charts update when time range changes
- ✅ Accurate percentages calculated using LAG() window functions
- ✅ Responsive design, works on mobile

---

### 1.2 Playbook Testing & Hardening
**Why**: Ensure deployment system reliability before production use.

- [ ] **Test `deploy-agent.yml`**
  - [ ] Fresh Ubuntu 22.04 server test
  - [ ] Fresh Ubuntu 24.04 server test
  - [ ] Debian 12 server test
  - [ ] Verify agent starts and sends metrics
  - [ ] Verify WAL buffer persistence
  - [ ] Document any issues

- [ ] **Test `rollback-agent.yml`**
  - [ ] Test rollback after upgrade
  - [ ] Verify backup restoration
  - [ ] Test when backup doesn't exist (should fail gracefully)
  - [ ] Document rollback procedure

- [ ] **Test `retry-failed.yml`**
  - [ ] Test retry after failed deployment
  - [ ] Verify idempotency
  - [ ] Test with different failure scenarios

- [ ] **Test `uninstall-agent.yml`**
  - [ ] Verify complete removal
  - [ ] Check no orphaned processes
  - [ ] Test on servers with different install methods

- [ ] **Documentation**
  - [ ] Create `docs/playbook-testing-results.md`
  - [ ] Document known issues and workarounds
  - [ ] Add troubleshooting guide

**Reference Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/playbooks/nodepulse/`
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ansible-reference/ansible-implementation-status.md`

**Acceptance Criteria:**
- ✅ All 5 core playbooks tested on at least 2 Linux distributions
- ✅ Success rate documented
- ✅ Known issues documented with workarounds

---

### 1.3 Server ID Validation Layer
**Why**: Independent security layer that works with or without mTLS.

- [ ] **Implementation**
  - [ ] Create `submarines/internal/validation/server_id.go`
  - [ ] Implement `ValidateServerID(ctx, serverID, valkeyClient)` function
  - [ ] Cache strategy:
    - Valid: `server:valid:{id}` → `"true"` (TTL: 3600s)
    - Invalid: `server:valid:{id}` → `"false"` (TTL: 3600s)
  - [ ] Fallback: Query PostgreSQL if cache miss
  - [ ] Integrate into `submarines/internal/handlers/prometheus.go`
  - [ ] Integrate into `submarines/internal/handlers/metrics.go` (legacy)

- [ ] **Configuration**
  - [ ] Add to `submarines/internal/config/config.go`:
    ```go
    ServerIDCacheTTL int // Default: 3600
    ```
  - [ ] Add to `.env.example`:
    ```bash
    SERVER_ID_CACHE_TTL=3600
    ```

- [ ] **Testing**
  - [ ] Unit test: `validation/server_id_test.go`
  - [ ] Integration test with Valkey
  - [ ] Test negative caching (invalid server ID)
  - [ ] Test fallback when Valkey unavailable
  - [ ] Load test: 1000 requests/sec

**Reference Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-guide.md` (Section: Server ID Validation)

**Acceptance Criteria:**
- ✅ 99% reduction in database queries via caching
- ✅ Invalid server IDs rejected (403 Forbidden)
- ✅ DoS protection via negative caching
- ✅ Works independently of mTLS state

---

## 🎯 SPRINT 2 (3 weeks)
**Goal**: Custom playbook upload and security hardening
**Timeline**: November 18 - December 8, 2025

### 2.1 Custom Playbook Upload (Phase 2.1 - Tier 2)
**Why**: Enable users to deploy custom software/configurations beyond built-in playbooks.

**Specification**: `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ansible-reference/custom-playbooks.md` (1145 lines)

#### Week 1: Backend Implementation
- [ ] **Database Schema**
  - [ ] Create migration: `admiral.playbooks` table
  - [ ] Fields: `id`, `user_id`, `name`, `description`, `type` (simple/package), `version`, `content`, `created_at`, `updated_at`
  - [ ] Create migration: `admiral.playbook_versions` table (version history)

- [ ] **File Storage**
  - [ ] Create directory: `/var/lib/nodepulse/playbooks/user_{id}/`
  - [ ] Implement filesystem storage service
  - [ ] Path traversal protection (sanitize filenames)

- [ ] **Validation Service**
  - [ ] Create `flagship/app/Services/PlaybookValidationService.php`
  - [ ] YAML syntax validation
  - [ ] Basic security scanning:
    - [ ] Detect dangerous commands (`rm -rf /`, `dd`, etc.)
    - [ ] Detect sensitive file access (`/etc/shadow`, `/etc/passwd`)
    - [ ] Detect network exfiltration patterns
    - [ ] Warn (not block) - users are responsible

- [ ] **API Endpoints (Laravel)**
  - [ ] `POST /api/playbooks` - Upload playbook
  - [ ] `GET /api/playbooks` - List user's playbooks
  - [ ] `GET /api/playbooks/{id}` - Get playbook details
  - [ ] `PUT /api/playbooks/{id}` - Update playbook
  - [ ] `DELETE /api/playbooks/{id}` - Delete playbook
  - [ ] `GET /api/playbooks/{id}/versions` - Version history
  - [ ] `POST /api/playbooks/{id}/rollback/{version}` - Rollback to version

#### Week 2: Frontend Implementation
- [ ] **Playbook Management UI**
  - [ ] Create `flagship/resources/js/pages/playbooks/index.tsx`
  - [ ] Playbook list with search/filter
  - [ ] Upload dialog with drag-and-drop
  - [ ] YAML editor with syntax highlighting (Monaco or CodeMirror)
  - [ ] Validation feedback (errors/warnings)

- [ ] **Upload Flow**
  - [ ] File upload (single .yml or .zip package)
  - [ ] Disclaimer/warning modal:
    ```
    ⚠️ Warning: Custom Playbooks

    You are responsible for reviewing and testing custom playbooks.
    Malicious or poorly-written playbooks can damage your servers.

    We recommend:
    - Testing on non-production servers first
    - Reviewing all tasks and commands
    - Using version control
    ```
  - [ ] Validation results display
  - [ ] Save confirmation

- [ ] **Playbook Details Page**
  - [ ] Create `flagship/resources/js/pages/playbooks/[id].tsx`
  - [ ] View playbook content with syntax highlighting
  - [ ] Edit inline (save as new version)
  - [ ] Version history table
  - [ ] Download playbook
  - [ ] Delete with confirmation

#### Week 3: Integration & Testing
- [ ] **Deployment Integration**
  - [ ] Update `flagship/resources/js/pages/deployments/create.tsx`
  - [ ] Playbook dropdown: system playbooks + custom playbooks
  - [ ] Group by category (Built-in / Custom)
  - [ ] Show playbook description

- [ ] **Deployer Integration**
  - [ ] Update `submarines/cmd/deployer/main.go`
  - [ ] Support playbook paths: `custom/{user_id}/{playbook_name}.yml`
  - [ ] No changes needed (already supports arbitrary playbook paths)

- [ ] **Testing**
  - [ ] Upload simple playbook test
  - [ ] Upload package (ZIP with templates) test
  - [ ] Validation error handling test
  - [ ] Execute custom playbook via deployment
  - [ ] Version rollback test
  - [ ] Permission test (users can't access others' playbooks)

**Acceptance Criteria:**
- ✅ Users can upload simple playbooks (.yml) and packages (.zip)
- ✅ Validation warns about dangerous commands
- ✅ Playbooks are versioned with rollback capability
- ✅ Custom playbooks execute successfully via deployment system
- ✅ Disclaimer is shown and acknowledged

---

### 2.2 mTLS Completion (Final Steps)
**Why**: Production-grade security for agent authentication.

**Current Status**: 85% complete (18/21 tasks)
**Reference**: `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-guide.md`

**✅ Already Complete (Phases 1-5):**
- ✅ Database schema migration
- ✅ Crypto utilities (AES-256-GCM)
- ✅ CA manager (self-signed CA generation)
- ✅ Certificate generator (client certificates)
- ✅ mTLS validation (Caddy headers)
- ✅ Configuration (build-time decision)
- ✅ Bootstrap script (`scripts/setup-mtls.sh`)
- ✅ Ansible playbooks:
  - `deploy-agent-mtls.yml` - Production deployment with mTLS
  - `deploy-agent-no-mtls.yml` - Development deployment
  - `install-mtls-certs.yml` - Certificate installation only
- ✅ Laravel CertificateController (356 lines)
- ✅ Laravel models (ServerCertificate, CertificateAuthority)
- ✅ API routes for certificate management

**⏳ Remaining Tasks (3/21):**

#### Phase 6: Frontend UI (Optional - Low Priority)
- [ ] **Certificate Management Page**
  - [ ] Create `flagship/resources/js/pages/certificates/index.tsx`
  - [ ] Certificate list with status badges (active, expiring, revoked)
  - [ ] Search/filter by server, status, expiry date
  - [ ] Issue certificate dialog (currently via API only)
  - [ ] Revoke confirmation dialog
  - [ ] Stats cards (active, expiring soon, revoked)

- [ ] **System Settings - mTLS Section**
  - [ ] Create `flagship/resources/js/pages/settings/mtls.tsx`
  - [ ] Display CA information (subject, validity, fingerprint)
  - [ ] Download CA certificate (for manual distribution)
  - [ ] Certificate statistics

**Note:** mTLS is build-time decision (no runtime toggle needed)

#### Phase 7: End-to-End Testing
- [ ] Test certificate issuance via `deploy-agent-mtls.yml` playbook
- [ ] Test production build with mTLS enabled
- [ ] Test certificate revocation (agent should be rejected)
- [ ] Verify Caddy header extraction works correctly

**Acceptance Criteria:**
- ✅ Certificates can be issued via API
- ✅ Certificates are distributed automatically via Ansible
- ✅ Production build enforces mTLS (build-time decision)
- ✅ Revoked certificates are rejected
- ✅ CA certificate is encrypted at rest
- ⏳ Frontend UI for certificate management (optional)
- ⏳ End-to-end production testing

---

### 2.3 Built-in Security Playbooks (Phase 2.1 - Tier 1)
**Why**: Provide hardening options out-of-the-box.

- [ ] **SSH Hardening Playbook**
  - [ ] Create `ansible/playbooks/security/harden-ssh.yml`
  - [ ] Disable password authentication
  - [ ] Disable root login
  - [ ] Change SSH port (configurable)
  - [ ] Enable key-only authentication
  - [ ] Install fail2ban for SSH
  - [ ] Restart sshd service

- [ ] **Firewall Configuration Playbook**
  - [ ] Create `ansible/playbooks/security/configure-firewall.yml`
  - [ ] Install UFW (Ubuntu/Debian) or firewalld (RHEL)
  - [ ] Allow SSH (configurable port)
  - [ ] Allow HTTP/HTTPS (optional)
  - [ ] Allow custom ports (user input)
  - [ ] Enable firewall
  - [ ] Log denied connections

- [ ] **Automatic Security Updates**
  - [ ] Create `ansible/playbooks/security/enable-auto-updates.yml`
  - [ ] Install `unattended-upgrades` (Debian/Ubuntu)
  - [ ] Install `dnf-automatic` (RHEL)
  - [ ] Configure automatic security updates only
  - [ ] Email notifications on updates (optional)

- [ ] **fail2ban Deployment**
  - [ ] Create `ansible/playbooks/security/install-fail2ban.yml`
  - [ ] Install fail2ban
  - [ ] Configure SSH jail
  - [ ] Configure custom jails (optional)
  - [ ] Email notifications on bans (optional)

**Acceptance Criteria:**
- ✅ All 4 security playbooks tested on Ubuntu 22.04 and RHEL 9
- ✅ Playbooks are idempotent
- ✅ Documentation includes recommended deployment order

---

## 🔮 SPRINT 3 (4 weeks)
**Goal**: Scheduled deployments and advanced features
**Timeline**: December 9, 2025 - January 5, 2026

### 3.1 Scheduled Deployments
**Why**: Enable recurring maintenance tasks (backups, updates, monitoring).

#### Week 1: Backend Implementation
- [ ] **Database Schema**
  - [ ] Create migration: `admiral.scheduled_deployments` table
  - [ ] Fields: `id`, `name`, `playbook_id`, `server_group_id`, `cron_expression`, `timezone`, `enabled`, `last_run_at`, `next_run_at`, `created_at`, `updated_at`

- [ ] **Scheduler Service**
  - [ ] Create `submarines/cmd/scheduler/main.go`
  - [ ] Poll database every 1 minute for due schedules
  - [ ] Create deployment via Valkey Stream
  - [ ] Update `last_run_at` and `next_run_at`
  - [ ] Handle failures (retry logic)

- [ ] **Cron Parser**
  - [ ] Use library: `github.com/robfig/cron/v3`
  - [ ] Validate cron expressions
  - [ ] Calculate next run time

- [ ] **API Endpoints (Laravel)**
  - [ ] `POST /api/scheduled-deployments` - Create schedule
  - [ ] `GET /api/scheduled-deployments` - List schedules
  - [ ] `GET /api/scheduled-deployments/{id}` - Get schedule details
  - [ ] `PUT /api/scheduled-deployments/{id}` - Update schedule
  - [ ] `DELETE /api/scheduled-deployments/{id}` - Delete schedule
  - [ ] `POST /api/scheduled-deployments/{id}/enable` - Enable schedule
  - [ ] `POST /api/scheduled-deployments/{id}/disable` - Disable schedule

#### Week 2: Frontend Implementation
- [ ] **Scheduled Deployments Page**
  - [ ] Create `flagship/resources/js/pages/scheduled-deployments/index.tsx`
  - [ ] Schedule list with status badges (enabled/disabled)
  - [ ] Next run time display
  - [ ] Create schedule dialog:
    - [ ] Playbook selector
    - [ ] Server group selector
    - [ ] Cron expression builder (with presets: hourly, daily, weekly, monthly)
    - [ ] Timezone selector
  - [ ] Edit/delete schedule

- [ ] **Cron Expression Builder UI**
  - [ ] Visual builder (dropdowns for minute, hour, day, month, weekday)
  - [ ] Presets: "Every hour", "Daily at midnight", "Weekly on Sunday", "Monthly on 1st"
  - [ ] Custom expression input (advanced mode)
  - [ ] Next run preview (show next 5 run times)

#### Week 3: Maintenance Windows
- [ ] **Database Schema**
  - [ ] Add to `admiral.scheduled_deployments`:
    - [ ] `maintenance_window_start` (time, e.g., "02:00")
    - [ ] `maintenance_window_end` (time, e.g., "04:00")
  - [ ] Scheduler checks if current time is within window

- [ ] **UI Updates**
  - [ ] Add maintenance window fields to create/edit schedule
  - [ ] Show maintenance window in schedule list
  - [ ] Warn if next run is outside maintenance window

#### Week 4: Deployment Chains
- [ ] **Database Schema**
  - [ ] Create migration: `admiral.deployment_chains` table
  - [ ] Fields: `id`, `name`, `steps` (JSON array of playbook IDs), `on_failure` (stop/continue), `enabled`, `created_at`, `updated_at`

- [ ] **Chain Execution Service**
  - [ ] Create `submarines/internal/chain/executor.go`
  - [ ] Execute steps sequentially
  - [ ] Wait for step completion before starting next
  - [ ] Handle failures (stop or continue based on config)
  - [ ] Update chain execution status

- [ ] **UI**
  - [ ] Create `flagship/resources/js/pages/deployment-chains/index.tsx`
  - [ ] Visual chain builder (drag-and-drop playbooks)
  - [ ] Execute chain manually
  - [ ] View chain execution history

**Acceptance Criteria:**
- ✅ Scheduled deployments run on time (±1 minute accuracy)
- ✅ Users can create schedules with cron expressions
- ✅ Maintenance windows are respected
- ✅ Deployment chains execute sequentially
- ✅ Chain failures are handled correctly (stop/continue)

---

### 3.2 Advanced Inventory Management
**Why**: Enable better server organization and targeting.

- [ ] **Server Grouping**
  - [ ] Database migration: `admiral.server_groups` table
  - [ ] Fields: `id`, `name`, `description`, `type` (static/dynamic), `filter_rules` (JSON), `created_at`, `updated_at`
  - [ ] Create `admiral.server_group_members` join table

- [ ] **Static Groups**
  - [ ] UI to create group and add servers manually
  - [ ] Drag-and-drop servers between groups
  - [ ] Multi-select servers for bulk group assignment

- [ ] **Dynamic Groups (Smart Groups)**
  - [ ] Filter rules:
    - [ ] Operating system (Ubuntu, Debian, RHEL, etc.)
    - [ ] Tags (production, staging, database, web, etc.)
    - [ ] Hostname pattern (regex)
    - [ ] IP range (CIDR)
    - [ ] Custom metadata
  - [ ] Auto-update membership when servers change
  - [ ] Preview members before saving

- [ ] **Server Tags**
  - [ ] Database migration: `admiral.server_tags` table
  - [ ] Many-to-many relationship
  - [ ] UI to add/remove tags
  - [ ] Tag suggestions (auto-complete)

- [ ] **Server Metadata**
  - [ ] Database migration: Add `metadata` (JSONB) to `admiral.servers`
  - [ ] UI to add custom key-value pairs
  - [ ] Use in dynamic group filters

- [ ] **Deployment Targeting**
  - [ ] Update deployment creation to target groups instead of individual servers
  - [ ] Show group member count
  - [ ] Preview servers that will be affected

**Acceptance Criteria:**
- ✅ Users can create static groups and assign servers
- ✅ Users can create dynamic groups with filter rules
- ✅ Dynamic groups update membership automatically
- ✅ Deployments can target groups
- ✅ Tags and metadata are searchable

---

### 3.3 Deployment History & Audit Trail
**Why**: Compliance, troubleshooting, and accountability.

- [ ] **Database Schema**
  - [ ] Create migration: `admiral.deployment_audit_logs` table
  - [ ] Fields: `id`, `deployment_id`, `user_id`, `action` (create/cancel/retry), `ip_address`, `user_agent`, `created_at`

- [ ] **Audit Logging Service**
  - [ ] Create `flagship/app/Services/AuditLogService.php`
  - [ ] Log all deployment actions:
    - [ ] Deployment created
    - [ ] Deployment cancelled
    - [ ] Deployment retried
  - [ ] Capture: User, IP, timestamp, action details

- [ ] **Deployment Diff**
  - [ ] Store playbook content snapshot at deployment time
  - [ ] Compare with current playbook version
  - [ ] Show diff in deployment details

- [ ] **Audit Trail UI**
  - [ ] Create `flagship/resources/js/pages/audit-logs/index.tsx`
  - [ ] Filter by user, action, date range, server
  - [ ] Export audit logs as CSV
  - [ ] Compliance report (deployments per month, users, playbooks)

- [ ] **Rollback to Previous Configuration**
  - [ ] Store playbook version used in deployment
  - [ ] "Rollback" button creates new deployment with old playbook version
  - [ ] Confirmation dialog with diff

**Acceptance Criteria:**
- ✅ All deployment actions are logged
- ✅ Audit logs include user, IP, timestamp, action
- ✅ Users can export audit logs for compliance
- ✅ Rollback creates deployment with previous playbook version

---

## 📦 BACKLOG (Future Sprints)

### Phase 3: Growth Features (Q2-Q3 2026)

#### Execution Environment Management
- [ ] Python virtual environments for Ansible
- [ ] Pin Ansible versions per playbook
- [ ] Custom module library
- [ ] Dependency management
- [ ] Isolated execution environments

#### Advanced RBAC
- [ ] Granular permissions (view/create/execute/delete deployments)
- [ ] Role templates (Admin, Operator, Viewer, Auditor)
- [ ] Approval workflows (require approval for production deployments)
- [ ] Organization/team isolation
- [ ] API tokens with scoped permissions

---

### Phase 4: Advanced Features (Q4 2026 - Q2 2027)

#### Credential Vault
- [ ] Centralized credential storage (encrypted)
- [ ] Integration with HashiCorp Vault, AWS Secrets Manager, 1Password
- [ ] Credential injection into playbooks
- [ ] Automatic rotation
- [ ] Audit trail

#### Notification System
- [ ] Deployment status notifications (Slack, Discord, email, webhooks)
- [ ] Alert on failures
- [ ] Success/failure digest reports (daily/weekly)
- [ ] Custom notification rules
- [ ] PagerDuty/Opsgenie integration

#### Playbook Analytics
- [ ] Success/failure rates per playbook
- [ ] Average execution time and trends
- [ ] Server-specific failure patterns
- [ ] Resource usage during deployments
- [ ] Optimization recommendations

#### Survey/Form Variables
- [ ] Web forms for deployment parameters (instead of editing YAML)
- [ ] Type validation (string, int, bool, select)
- [ ] Conditional fields
- [ ] Default values and descriptions
- [ ] Form templates

#### Fact Caching & Smart Inventory
- [ ] Cache Ansible facts (OS, IP, packages, etc.)
- [ ] Use cached facts for smart groups
- [ ] Refresh on-demand or scheduled
- [ ] Historical fact tracking
- [ ] Compliance dashboards (e.g., "Show all servers with OpenSSH < 8.0")

---

### Phase 5: Scale & Growth (Q3 2027+)

#### Multi-Client Management
- [ ] Client isolation (separate databases or schemas)
- [ ] Per-client branding and access controls
- [ ] Shared playbook library
- [ ] Client-level reporting
- [ ] Separate notification channels

#### Git Integration
- [ ] Store playbooks in Git repositories
- [ ] Sync from GitHub/GitLab/Bitbucket
- [ ] Automatic deployment on git push (GitOps)
- [ ] Version control (track playbook changes)
- [ ] Pull request workflow

#### Advanced Workflow Engine
- [ ] Visual workflow builder (drag-and-drop)
- [ ] Parallel execution branches (run multiple playbooks simultaneously)
- [ ] Error handling and retry logic
- [ ] External system integration (webhooks, APIs)
- [ ] Workflow versioning

#### Performance Optimization
- [ ] Job result streaming (WebSocket for live output)
- [ ] Background fact caching (don't wait for facts before showing UI)
- [ ] Callback plugins (custom Ansible callbacks)
- [ ] Resource usage monitoring (CPU/memory during deployments)
- [ ] Parallel execution optimization (200+ servers)

---

## ❌ DEFERRED / NOT PLANNED

### Valkey High Availability
**Status**: Deferred until production scale demands it
**Reason**: Single Valkey instance is sufficient for current scale (< 1000 servers)

- [ ] Assess single point of failure risk
- [ ] Research Valkey clustering/replication
- [ ] Implement Valkey sentinel or cluster mode
- [ ] Add Valkey health checks and monitoring
- [ ] Document failover procedures
- [ ] Consider fallback strategy (direct DB writes if Valkey unavailable)
- [ ] Add connection retry logic
- [ ] Implement stream lag monitoring and alerting

**Recommendation**: Revisit when:
- Handling >1000 servers
- Valkey downtime causes user-facing issues
- Stream lag exceeds 10,000 messages regularly

---

### osquery Deployment Playbooks
**Status**: Low priority - users can create custom playbooks for osquery
**Reason**: Not needed for MVP, can be added as community playbook

- [ ] Create `install_osquery.yml` playbook
- [ ] Create osquery configuration template
- [ ] Create `configure_osquery.yml` playbook
- [ ] Create `uninstall_osquery.yml` playbook
- [ ] Integration with Node Pulse agent (security logs)

**Recommendation**: Document osquery deployment in community playbook repository instead of built-in feature.

---

### SSH Terminal Advanced Features
**Status**: Deliberately deferred for privacy/complexity reasons

- ❌ **Session recording playback** - Infrastructure ready but disabled by default for privacy
- ❌ **Auto-reconnect** - SSH sessions cannot be resumed (protocol limitation)
- ❌ **Load testing** - Not needed at current scale
- ❌ **Session sharing** - Complex, low demand
- ❌ **Command history extraction** - Too complex for reliable parsing
- ❌ **Playback speed control** - Requires session recording

**Recommendation**: Keep SSH terminal simple and reliable. Advanced features can be added if users request them.

---

## 📊 COMPLETED MILESTONES (Archive)

### ✅ mTLS Implementation (85% Complete - October 2025)

**Status**: Core implementation complete, production-ready
**Total Code**: ~2,373 lines (Go: 1,390 | Laravel: 698 | DB/Config: 285)

**Completed Components:**
- ✅ Database schema with certificate management (234 lines)
- ✅ Crypto utilities - AES-256-GCM encryption (132 lines)
- ✅ CA manager - Self-signed CA generation (313 lines)
- ✅ Certificate generator - Client certificates (454 lines)
- ✅ mTLS validation via Caddy headers (193 lines)
- ✅ Build-time decision architecture (no runtime toggles)
- ✅ Bootstrap script (`scripts/setup-mtls.sh`)
- ✅ Ansible playbooks (3 playbooks):
  - `deploy-agent-mtls.yml` - Production with mTLS
  - `deploy-agent-no-mtls.yml` - Development without mTLS
  - `install-mtls-certs.yml` - Certificate installation only
- ✅ Laravel CertificateController (356 lines)
- ✅ Laravel models: ServerCertificate, CertificateAuthority
- ✅ Certificate management API routes

**Remaining (Optional):**
- ⏳ Frontend certificate management UI (can use API for now)
- ⏳ End-to-end production testing

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-guide.md` (1,427 lines)
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-setup-guide.md` (256 lines)
- `submarines/internal/certificates/` (crypto, CA, certs)
- `submarines/internal/tls/mtls.go` (validation)
- `scripts/setup-mtls.sh` (bootstrap)
- `ansible/playbooks/nodepulse/deploy-agent-mtls.yml`

---

### ✅ Phase 1: MVP (Completed October 2025)

#### 1. Simplified Metrics Architecture
**Completion Date**: October 2025
**Status**: Production Ready

- [x] Agent-side parsing of Prometheus metrics (node_exporter)
- [x] 39 essential metrics stored in dedicated columns
- [x] Database schema: `admiral.metrics` table
- [x] LAG() window functions for accurate CPU percentages
- [x] 98.32% bandwidth reduction (61KB → 1KB)
- [x] 99.8% database reduction (1100+ rows → 1 row)
- [x] 10-30x faster queries

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/metrics-architecture.md`
- `submarines/internal/handlers/prometheus.go`
- `submarines/cmd/digest/main.go`
- Migration: `20251016211918470_initial_schema.sql`

---

#### 2. Process Monitoring
**Completion Date**: October 31, 2025
**Status**: Production Ready

- [x] `process_exporter` integration
- [x] Top 10 processes by CPU/Memory
- [x] Database table: `admiral.process_snapshots`
- [x] Frontend UI with CPU/Memory toggle tabs
- [x] Time range selector (1h, 6h, 24h, 7d)
- [x] Ansible playbook: `deploy-process-exporter.yml` ✅ Tested and working

**Files:**
- Migration: `20251030203553001_create_process_snapshots_table.sql`
- `flagship/resources/js/components/servers/process-list.tsx`
- `flagship/app/Http/Controllers/ProcessController.php`

---

#### 3. Ansible Agent Deployment System (Phases 1-5)
**Completion Date**: October 25, 2025
**Status**: Production Ready

- [x] Dynamic inventory from PostgreSQL with SSH key decryption
- [x] 100 parallel server deployments (Ansible forks)
- [x] Queue-based background processing (Laravel jobs)
- [x] Real-time deployment tracking via Valkey Streams
- [x] Web UI for creating/monitoring deployments
- [x] Playbook directory organization (`nodepulse/`, `prometheus/`, `custom/`)
- [x] Per-server deployment status tracking
- [x] Cancel running deployments (SIGTERM/SIGKILL)
- [x] Full Ansible output logs display
- [x] Success/failure stats with color-coded visualization

**Playbooks Tested:**
- [x] `upgrade-agent.yml` - ✅ Tested and working
- [x] `deploy-node-exporter.yml` - ✅ Tested and working
- [x] `deploy-process-exporter.yml` - ✅ Tested and working
- [ ] `deploy-agent.yml` - Needs testing
- [ ] `rollback-agent.yml` - Needs testing
- [ ] `retry-failed.yml` - Needs testing
- [ ] `uninstall-agent.yml` - Partially tested

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ansible-reference/ansible-implementation-status.md`
- `ansible/inventory/dynamic.php`
- `flagship/app/Services/AnsibleService.php`
- `flagship/resources/js/pages/deployments/`

---

#### 4. SSH WebSocket Terminal
**Completion Date**: October 2025
**Status**: Production Ready

- [x] Interactive SSH terminal access via WebSocket
- [x] Password + key-based authentication
- [x] Trust On First Use (TOFU) host key verification
- [x] Session logging (metadata only)
- [x] Connection status indicator with smart error detection
- [x] Session management UI (list/terminate sessions)
- [x] Encrypted private keys (AES-256-GCM)
- [x] Session audit trail in `admiral.ssh_sessions` table

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ssh-websocket.md`
- `submarines/internal/sshws/handler.go`
- `submarines/internal/sshws/session.go`
- `flagship/resources/js/components/servers/ssh-terminal.tsx`
- `flagship/resources/js/pages/ssh-sessions.tsx`

---

#### 5. Public Status Pages and Badges
**Completion Date**: October 2025
**Status**: Production Ready

- [x] `submarines-status` service (port 8081)
- [x] Read-only public status pages
- [x] Server uptime badges
- [x] No authentication required

**Files:**
- `submarines/cmd/status/main.go`
- Dockerfile: `Dockerfile.status.dev`

---

#### 6. Data Retention Strategy
**Completion Date**: October 2025
**Status**: Production Ready

- [x] 7 days retention for raw metrics (MVP)
- [x] 7 days retention for process snapshots
- [x] PostgreSQL partitioning for efficient cleanup
- [x] Cleanup worker implemented

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/data-retention-strategy.md`
- `submarines/internal/cleaner/metrics.go`

---

### ✅ Critical Bug Fixes

#### Valkey Stream Backlog Bug
**Fix Date**: November 1, 2025
**Status**: Resolved

- [x] **Issue**: Stream backlog growing to 10,000+ messages (503 errors)
- [x] **Fix**: Simplified batch processing (no transactions per message)
- [x] **Result**: Stream stable at <150 messages
- [x] Batch reads up to 100 messages per loop
- [x] Smart retry logic (ACK bad data, retry DB errors)

**Files:**
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/bugfix/valkey-stream-backlog-bug.md`
- `submarines/cmd/digest/main.go`

---

#### Server Online Status Fix
**Fix Date**: October 28, 2025
**Status**: Resolved

- [x] **Issue**: Servers showing "Offline" despite metrics flowing
- [x] **Fix**: Added `updateServerLastSeen()` in digest worker
- [x] Updates `servers.last_seen_at` to NOW() when processing metrics
- [x] Dashboard correctly shows servers as "Online" (within 5 minutes)

**Files:**
- `submarines/cmd/digest/main.go:249-273`

---

#### Deployment Status Tracking Fix
**Fix Date**: October 28, 2025
**Status**: Resolved

- [x] **Issue**: `deployment_servers` stuck on "pending" status
- [x] **Root Cause**: Ansible callbacks mixing timing output with JSON
- [x] **Fix**: JSON extraction from mixed output
- [x] Server deployment status now correctly shows success/failed/skipped

**Files:**
- `submarines/cmd/deployer/main.go`

---

## 📈 Sprint Velocity Estimate

Based on recent progress:

| Sprint | Duration | Story Points | Major Features |
|--------|----------|--------------|----------------|
| **Sprint 1** | 2 weeks | 21 | Dashboard Metrics, Playbook Testing, Server ID Validation |
| **Sprint 2** | 3 weeks | 34 | Custom Playbook Upload, mTLS Completion, Security Playbooks |
| **Sprint 3** | 4 weeks | 55 | Scheduled Deployments, Advanced Inventory, Audit Trail |

**Total MVP to Production**: ~9 weeks (November 3 - January 5, 2026)

---

## 🎯 Success Metrics

### Sprint 1 Success Criteria
- ✅ Users can view CPU, memory, disk, network metrics for any server
- ✅ All 5 core playbooks tested on at least 2 Linux distributions
- ✅ 99% reduction in database queries via Server ID validation
- ✅ Invalid server IDs are rejected (403 Forbidden)

### Sprint 2 Success Criteria
- ✅ Users can upload and execute custom playbooks
- ✅ mTLS is fully operational (certificate issuance, distribution, validation)
- ✅ 4 security playbooks tested and documented

### Sprint 3 Success Criteria
- ✅ Scheduled deployments run on time (±1 minute accuracy)
- ✅ Users can create static and dynamic server groups
- ✅ All deployment actions are logged and auditable

---

## 📚 Reference Documentation

### Key Documents
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/roadmap.md` - High-level roadmap
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/metrics-architecture.md` - Metrics design
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-guide.md` - mTLS implementation
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ansible-reference/custom-playbooks.md` - Custom playbook spec
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/ssh-websocket.md` - SSH terminal design

### Architecture Diagrams
- `/Users/yumin/ventures/node-pulse-stack/admiral/CLAUDE.md` - System architecture
- `/Users/yumin/ventures/node-pulse-stack/admiral/README.md` - Quick start guide

---

**Last Updated**: November 3, 2025
**Next Review**: November 17, 2025 (End of Sprint 1)
