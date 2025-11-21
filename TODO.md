# TODO List - Node Pulse Admiral

**Last Updated**: November 14, 2025
**Current Phase**: Post-MVP (Phase 2)
**Sprint System**: Active

---

## 📊 Project Status Overview

| Component                           | Status              | Completion |
| ----------------------------------- | ------------------- | ---------- |
| **Simplified Metrics Architecture** | ✅ Production Ready | 100%       |
| **Process Monitoring**              | ✅ Production Ready | 100%       |
| **Ansible Deployment System**       | ✅ Production Ready | 100%       |
| **SSH WebSocket Terminal**          | ✅ Production Ready | 100%       |
| **Data Retention**                  | ✅ Production Ready | 100%       |
| **Two-Factor Authentication (2FA)** | ✅ Production Ready | 100%       |
| **Custom Playbook Upload**          | ✅ Production Ready | 100%       |
| **Community Playbooks**             | ✅ Production Ready | 100%       |
| **User Management**                 | ✅ Production Ready | 100%       |
| **Server ID Validation**            | ✅ Production Ready | 100%       |
| **Security Playbooks (Built-in)**   | ✅ Production Ready | 100%       |
| **Dashboard Metrics Visualization** | ✅ Production Ready | 100%       |
| **mTLS Implementation**             | ✅ Production Ready | 95%        |
| **Playbook Testing & Hardening**    | ⏳ Pending          | 20%        |

**Overall Sprint 1 Status**: ⏳ **90% Complete** (Only playbook testing remaining)

---

## 🚀 SPRINT 1 (Current - Extended)

**Goal**: Complete core user-facing features and testing
**Timeline**: November 3-17, 2025 (Extended to November 20, 2025)
**Status**: 90% Complete - Only playbook testing remaining

### 1.1 Dashboard Metrics Visualization ✅ COMPLETE

**Status**: ✅ Production Ready (100%)

This feature is complete and production-ready. All core functionality has been implemented and deployed.

**Optional Future Enhancements** (Deferred to future sprints):

- Specialized chart components (per-core CPU, memory breakdown, disk I/O, network packets)
- Grid layout with all charts visible simultaneously
- Live updates (polling every 30s)
- Export metrics as CSV

**See**: Completed Milestones (Archive) section for detailed implementation history

---

### 1.2 Playbook Testing & Hardening

**Why**: Ensure deployment system reliability before production use.

- [ ] **Test `ansible/nodepulse/deploy.yml` (Unified deployment)**

  - [ ] Fresh Ubuntu 22.04 server test
  - [ ] Fresh Ubuntu 24.04 server test
  - [ ] Debian 12 server test
  - [ ] RHEL/Rocky Linux 8+ test
  - [ ] Verify all services start (nodepulse, node_exporter, process_exporter)
  - [ ] Verify metrics flowing to dashboard
  - [ ] Verify WAL buffer persistence
  - [ ] Test with mTLS enabled (`tls_enabled=true`)
  - [ ] Test without mTLS (`tls_enabled=false`)
  - [ ] Test upgrade scenario (deploy.yml is idempotent)
  - [ ] Test tagged deployment (`--tags nodepulse`, `--tags node-exporter`, etc.)
  - [ ] Document any issues

- [ ] **Test `ansible/nodepulse/uninstall.yml`**

  - [ ] Verify complete removal of all components
  - [ ] Check no orphaned processes (nodepulse, node_exporter, process_exporter)
  - [ ] Verify systemd services removed
  - [ ] Verify directories cleaned up
  - [ ] Test on servers with partial installations
  - [ ] Document uninstall procedure

- [x] **Test `ansible/security/harden-ssh.yml`** ✅

- [ ] **Test `ansible/security/configure-firewall.yml`**

  - [ ] Test on Ubuntu/Debian (UFW)
  - [ ] Test on RHEL/Rocky (firewalld)
  - [ ] Test on systems without firewall installed
  - [ ] Verify SSH port remains open
  - [ ] Test custom port configuration
  - [ ] Test with `firewall_enabled=false` (should disable gracefully)
  - [ ] Verify firewall status after deployment
  - [ ] Document any distribution-specific issues

**Reference Files:**

- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/nodepulse/deploy.yml` - Unified deployment playbook (26KB)
- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/nodepulse/uninstall.yml` - Uninstall playbook (9KB)
- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/security/harden-ssh.yml` - SSH hardening (16KB)
- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/security/configure-firewall.yml` - Firewall config (13KB)
- `/Users/yumin/ventures/node-pulse-stack/admiral/ansible/security/README.md` - Security playbooks documentation

**Acceptance Criteria:**

- ✅ Core deployment playbook (`deploy.yml`) tested on at least 3 Linux distributions (Ubuntu, Debian, RHEL/Rocky)
- ✅ Both mTLS and non-mTLS modes tested successfully
- ✅ Security playbooks tested on major distros (Debian/Ubuntu with UFW, RHEL/Rocky with firewalld)
- ✅ Uninstall playbook verified to completely remove all components

---

### 1.3 Server ID Validation Layer ✅ COMPLETE

**Status**: ✅ Production Ready (100%) - Implemented October 28, 2025

Independent security layer with 99% cache hit rate, DoS protection via negative caching, and working independently of mTLS state.

**See**: Completed Milestones (Archive) section for detailed implementation history

---

## 🎯 SPRINT 2 (3 weeks)

**Goal**: Custom playbook upload and security hardening
**Timeline**: November 18 - December 8, 2025
**Status**: ✅ 98% Complete - Custom playbooks, community playbooks, security playbooks, and mTLS UI all production ready. Only optional end-to-end testing remains.

### 2.1 Custom Playbook Upload ✅ COMPLETE

**Status**: ✅ Production Ready (100%) - Implemented November 8-11, 2025

Users can upload custom playbooks (.yml or .zip packages) with YAML validation, security scanning, and path traversal protection. Fully integrated with deployment system.

**See**: Completed Milestones (Archive) section for detailed implementation history

---

### 2.1b Community Playbooks ✅ COMPLETE

**Status**: ✅ Production Ready (100%) - Implemented November 6-13, 2025

Curated library of pre-built playbooks (fail2ban, Docker, Nginx, PostgreSQL, MySQL, Redis, etc.) with catalog system, i18n support, and one-click deployment.

**See**: Completed Milestones (Archive) section for detailed implementation history

---

### 2.2 mTLS Completion ✅ COMPLETE (with UI Enhancements)

**Why**: Production-grade security for agent authentication.

**Current Status**: ✅ 95% complete (20/21 tasks) - Production ready with UI management
**Reference**:

- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/mtls-guide.md`
- `/Users/yumin/ventures/node-pulse-stack/admiral/docs/security/mtls-refactoring-plan.md`

**✅ Complete (Phases 1-6):**

- ✅ Database schema migration
- ✅ Crypto utilities (AES-256-GCM)
- ✅ CA manager (self-signed CA generation)
- ✅ Certificate generator (client certificates)
- ✅ mTLS validation (Caddy headers)
- ✅ Configuration (build-time decision)
- ✅ Bootstrap script (`scripts/setup-mtls.sh`) - Kept for emergency/CLI use
- ✅ Ansible integration:
  - `ansible/nodepulse/deploy.yml` with `tls_enabled=true` - Production deployment with mTLS
  - `ansible/nodepulse/deploy.yml` with `tls_enabled=false` - Development without mTLS
  - Certificates deployed automatically when `tls_enabled=true` (ca_cert, client_cert, client_key variables)
- ✅ Laravel CertificateController (356 lines)
- ✅ Laravel models (ServerCertificate, CertificateAuthority)
- ✅ API routes for certificate management
- ✅ **NEW: Deploy.sh Refactoring** (January 19, 2025)
  - Removed mTLS prompts from deploy.sh for one-click automation
  - Updated deployment summary to guide users to UI
  - Updated scripts/README.md documentation
- ✅ **NEW: UI-Based mTLS Setup** (January 19, 2025)
  - One-click "Enable mTLS" button in System Settings
  - SystemSettingsController with enableMtls() endpoint
  - Automatic CA creation, file updates, and Caddy restart
  - Fixed mTLS status detection (now checks CA existence)
  - Updated volume mounts for file operations
  - Three-tier approach: UI (primary), API (automation), CLI (emergency)

**⏳ Remaining Tasks (1/21):**

#### Phase 7: End-to-End Testing (Optional)

- [ ] Test certificate issuance via `ansible/nodepulse/deploy.yml` with `tls_enabled=true`
- [ ] Verify certificates deployed correctly (ca.crt, client.crt, client.key in /etc/nodepulse/certs/)
- [ ] Test production build with mTLS enabled
- [ ] Test certificate revocation (agent should be rejected)
- [ ] Verify Caddy header extraction works correctly
- [ ] Test agent connection with valid and invalid certificates

**Acceptance Criteria:**

- ✅ Certificates can be issued via API
- ✅ Certificates are distributed automatically via Ansible
- ✅ Production build enforces mTLS (build-time decision)
- ✅ Revoked certificates are rejected
- ✅ CA certificate is encrypted at rest
- ✅ One-click deployment without mTLS prompts (deploy.sh refactored)
- ✅ One-click mTLS setup from Flagship UI
- ✅ mTLS status shows "Enabled" or "Disabled" (not build type)
- ⏳ End-to-end production testing (optional)

**Note:** Frontend certificate management page (viewing/revoking individual certs) is deferred as low priority since API endpoints exist.

---

### 2.3 Built-in Security Playbooks ✅ COMPLETE

**Status**: ✅ Production Ready (100%) - Implemented November 14, 2025

Two core security playbooks (SSH hardening and firewall configuration) supporting 8 Linux distributions, with comprehensive safety features to prevent lockout. Peer reviewed with 9 critical bugs fixed before production.

**Playbooks:**

- `ansible/security/harden-ssh.yml` - SSH hardening with lockout prevention
- `ansible/security/configure-firewall.yml` - UFW/firewalld configuration
- fail2ban available as community playbook

**Future Enhancement:** Automatic security updates playbook (deferred to future sprint)

**See**: Completed Milestones (Archive) section for detailed implementation history

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

### ✅ mTLS UI-Based Setup & Deploy.sh Refactoring - November 2025

**Status**: ✅ **Production Ready** - Implemented November 19, 2025
**Documentation**: `docs/security/mtls-refactoring-plan.md`

**Features Implemented:**

- ✅ **Deploy.sh Refactoring** - Removed mTLS prompts for true one-click automation

  - Removed ~70 lines of interactive mTLS setup code
  - Updated deployment summary to guide users to UI
  - Updated scripts/README.md documentation
  - Positioned setup-mtls.sh as emergency/CLI option

- ✅ **UI-Based mTLS Setup** - One-click enable from System Settings

  - Created SystemSettingsController::enableMtls() endpoint
  - Automatic CA creation via Submarines API
  - Automatic file updates (compose.yml, Caddyfile.prod)
  - Automatic Caddy container restart
  - Added "Enable mTLS" button to system-settings.tsx
  - Three-tier approach: UI (primary), API (automation), CLI (emergency)

- ✅ **mTLS Status Fixes** - Accurate status detection

  - Fixed getMtlsStatus() to check CA existence (not build type)
  - Status now shows "Enabled" or "Disabled" (not "Production Build")
  - Checks both filesystem (ca.crt) and database (active CA)

- ✅ **Docker Integration** - Laravel can manage containers
  - Updated volume mounts: secrets, compose.yml, caddy directory
  - Added Docker socket access for container restart
  - Used Laravel Process facade for Docker Compose commands

**Reference:**

- `docs/security/mtls-refactoring-plan.md` - Complete implementation plan
- `flagship/app/Http/Controllers/SystemSettingsController.php` - enableMtls() method
- `flagship/resources/js/Pages/system-settings.tsx` - UI implementation
- `scripts/deploy.sh` - Refactored deployment script
- `scripts/README.md` - Updated documentation

---

### ✅ Two-Factor Authentication (2FA) - November 2025

**Status**: ✅ **Production Ready** - Implemented November 13, 2025
**Documentation**: `docs/flagship/2fa-complete-guide.md`

**Features Implemented:**

- ✅ TOTP Standard (RFC 6238) - Works with any authenticator app
- ✅ QR Code Setup - Easy scanning with phone camera
- ✅ Recovery Codes - 10 backup codes for emergency access
- ✅ Password Confirmation - Required before enabling/disabling
- ✅ Rate Limiting - Protection against brute force (5 attempts/min)
- ✅ Beautiful UI - Modern React components with Radix UI
- ✅ Supported apps: Google Authenticator, Authy, Microsoft Authenticator, 1Password

**Reference:**

- `docs/flagship/2fa-complete-guide.md` - Complete implementation guide

---

### ✅ User Management System - November 2025

**Status**: ✅ **Production Ready** - Implemented November 11, 2025

**Features Implemented:**

- ✅ User CRUD operations (Create, Read, Update, Delete)
- ✅ User status control (Active/Inactive)
- ✅ Role management integration
- ✅ Admin user seeder for deployment
- ✅ User management page: `flagship/resources/js/pages/users.tsx` (28,255 bytes)
- ✅ Enhanced error handling in deployment scripts

**Reference:**

- `flagship/resources/js/pages/users.tsx`
- `flagship/app/Http/Controllers/UserController.php`

---

### ✅ Process Snapshots Retention Cleanup - November 2025

**Status**: ✅ **Production Ready** - Implemented November 11, 2025

**Features Implemented:**

- ✅ Automatic cleanup of old process snapshots
- ✅ Configurable retention period (default: 7 days)
- ✅ Efficient partition-based cleanup
- ✅ Integrated into digest worker
- ✅ Prevents database bloat from historical process data

**Reference:**

- `submarines/cmd/digest/main.go` - Cleanup logic

---

### ✅ Custom Playbook Upload System - November 2025

**Status**: ✅ **Production Ready** - Implemented November 8-11, 2025

See Sprint 2.1 section above for complete details.

---

### ✅ Community Playbook Repository - November 2025

**Status**: ✅ **Production Ready** - Implemented November 6-13, 2025

See Sprint 2.1b section above for complete details.

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
- ✅ Ansible integration (unified playbook):
  - `ansible/nodepulse/deploy.yml` - Handles both mTLS and non-mTLS modes
  - Uses `tls_enabled` variable to control mTLS behavior
  - Auto-deploys certificates when mTLS enabled (ca_cert, client_cert, client_key)
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
- ~~`submarines/internal/tls/mtls.go` (validation)~~ - **REMOVED:** mTLS now enforced at Caddy layer
- `scripts/setup-mtls.sh` (bootstrap)
- `ansible/nodepulse/deploy.yml` (unified deployment with mTLS support)

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
- [x] Ansible deployment: Now part of unified `ansible/nodepulse/deploy.yml` ✅ Production ready

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
- [x] Playbook directory organization (`nodepulse/`, `security/`, `catalog/`, `custom/`)
- [x] Per-server deployment status tracking
- [x] Cancel running deployments (SIGTERM/SIGKILL)
- [x] Full Ansible output logs display
- [x] Success/failure stats with color-coded visualization

**Current Playbook Structure (Simplified - November 2025):**

The old separate playbooks have been consolidated into a unified architecture:

- [x] `ansible/nodepulse/deploy.yml` - ✅ Unified deployment (handles agent, node_exporter, process_exporter, mTLS/non-mTLS)
- [x] `ansible/nodepulse/uninstall.yml` - ✅ Complete removal of all components
- [x] `ansible/security/harden-ssh.yml` - ✅ SSH hardening playbook (November 2025)
- [x] `ansible/security/configure-firewall.yml` - ✅ Firewall configuration playbook (November 2025)

**Note:** Comprehensive testing on multiple distributions is tracked in Sprint 1, Section 1.2 (lines 91-165)

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

Based on actual progress (November 3-14, 2025):

| Sprint       | Duration       | Planned | Actual | Major Features Completed                                                            |
| ------------ | -------------- | ------- | ------ | ----------------------------------------------------------------------------------- |
| **Sprint 1** | 2 weeks (ext.) | 21      | 18     | ✅ Dashboard Metrics (Core), ✅ Server ID Validation, ⏳ Playbook Testing (partial) |
| **Sprint 2** | 3 weeks        | 34      | 24     | ✅ Custom Playbooks, ✅ Community Playbooks, ✅ 2FA, ✅ User Management             |
| **Sprint 3** | 4 weeks        | 55      | 0      | ⏳ Scheduled Deployments, Advanced Inventory, Audit Trail                           |

**Unexpected Features Completed (Not in Original Plan):**

- ✅ Two-Factor Authentication (2FA)
- ✅ User Management System
- ✅ Community Playbook Repository
- ✅ Process Snapshots Retention Cleanup

**Sprint 1 Status**: 85% Complete (Extended to November 20, 2025)

- Core features done, optional enhancements and testing remaining

**Sprint 2 Status**: 70% Complete (Ahead of schedule!)

- Custom playbooks and community playbooks completed early
- mTLS and security playbooks remain

**Total Progress**: Ahead of schedule despite adding unplanned features

---

## 🎯 Success Metrics

### Sprint 1 Success Criteria (85% Complete)

- ✅ Users can view CPU, memory, disk, network metrics for any server (DONE)
- ⏳ All 5 core playbooks tested on at least 2 Linux distributions (IN PROGRESS)
- ✅ 99% reduction in database queries via Server ID validation (DONE)
- ✅ Invalid server IDs are rejected (403 Forbidden) (DONE)

### Sprint 2 Success Criteria (98% Complete - Well Ahead of Schedule!)

- ✅ Users can upload and execute custom playbooks (DONE)
- ✅ mTLS is fully operational (95% complete - core + UI working, only optional testing remains)
- ✅ Security playbooks implemented and documented (2 built-in: SSH hardening, firewall config)

**Bonus Features Completed:**

- ✅ Community Playbook Repository with catalog system
- ✅ Two-Factor Authentication (2FA) system
- ✅ User Management system
- ✅ Process snapshots retention cleanup
- ✅ mTLS UI-based setup (one-click enable from System Settings)
- ✅ Deploy.sh refactoring (removed mTLS prompts for one-click automation)

### Sprint 3 Success Criteria (0% Complete)

- ⏳ Scheduled deployments run on time (±1 minute accuracy)
- ⏳ Users can create static and dynamic server groups
- ⏳ All deployment actions are logged and auditable

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

**Last Updated**: November 19, 2025
**Next Review**: November 20, 2025 (End of Sprint 1 Extended)

---

## 📝 Open Questions & Future Improvements

### TODO Items for Discussion

1. **Community Playbook Upload Workflow**

   - How should users upload downloaded community playbooks from external sources?
   - Should they go through custom playbook upload flow?
   - Or should there be a dedicated "Import Community Playbook" feature?

2. **fail2ban Jail Configuration**

   - How to add more jails to fail2ban community playbooks?
   - Should we support jail configuration via web UI?
   - Or provide documentation for manual jail file uploads?

3. **OS Distribution Support Standardization**

   - Built-in playbooks should support OS distros like community playbooks
   - Standardize OS compatibility metadata across all playbook types
   - Add OS compatibility checks before deployment

4. **Registration Feature**
   - Currently commented out in FortifyServiceProvider
   - Decide whether to enable public registration or keep invite-only
   - Consider email verification if enabled

### Sprint 1 Remaining Work

1. **Playbook Testing & Hardening** (Section 1.2)

   - Test all core playbooks on multiple Linux distributions
   - Document success rates and known issues
   - Create troubleshooting guide

2. **Optional Dashboard Enhancements** (Section 1.1)
   - Specialized chart components (nice-to-have)
   - Live updates and CSV export
   - Grid layout improvements
