# Node Pulse Admiral - Product Roadmap

## Vision

Node Pulse Admiral is the VPS fleet manager for everyone managing **5-1000 heterogeneous Linux servers**. We're the tool for hobbyists who've "collected" too many VPS boxes, freelancers managing client sites, and small teams running their infrastructure on bare metal or VPS providers instead of cloud-native platforms.

Our goal is to make advanced automation, security hardening, and monitoring accessible to the 99% of infrastructure operators who don't need (or can't afford) enterprise complexity.

## What We're NOT Building

To stay focused on our mission, we explicitly choose NOT to:

1. **Replace Kubernetes** - If you need container orchestration at scale, use K8s
2. **Build enterprise-only features** - We're simpler, more opinionated, and focused on VPS/bare metal
3. **Support 1000+ server single deployments** - At that scale, you need Kubernetes or custom tooling
4. **Require enterprise licensing to use** - We're open-source first; core features are open-source; premium support are optional
5. **HA control plane clustering** - Single-node control plane is sufficient for our scale

## Our Design Philosophy

1. **Simplicity First**: Unlike enterprise tools, we prioritize ease of use over feature exhaustion
2. **VPS-Optimized**: Built specifically for heterogeneous VPS fleets, not cloud-native Kubernetes clusters
3. **Modern UI**: React-based dashboard with real-time updates, not legacy enterprise UIs
4. **Community First**: Open-source core with optional premium features, built for individuals and small teams
5. **Integrated Monitoring**: Combines server monitoring with automation in one tool
6. **Security Focused**: Built-in security hardening playbooks for common VPS vulnerabilities

## Roadmap Phases

### Phase 1: MVP (Completed ✅)

**Core Ansible Integration**

- ✅ Dynamic inventory from PostgreSQL
- ✅ Agent deployment automation (deploy, upgrade, rollback, uninstall)
- ✅ SSH key management with encryption (master key encryption)
- ✅ Real-time deployment tracking via Valkey Streams
- ✅ Web UI for deployments (React + Inertia.js)
- ✅ Multi-server parallel execution (100 concurrent connections)
- ✅ Simplified metrics architecture (agent-side parsing, 98% bandwidth reduction)
- ✅ SSH WebSocket terminal access
- ✅ Public status pages and badges

**Why**: Provides the foundation for automated agent management across VPS fleets without manual SSH access.

**Completed**: October 2025

### Phase 2: Post-MVP (Current - November 2025 onwards)

#### 2.1 Playbook Library & Templates

**User-Writable Playbooks (3-Tier Approach)**

**Tier 1: Built-in Playbooks** (Partially Complete)

- ✅ Node Pulse agent deployment (deploy-agent-mtls.yml, deploy-agent-no-mtls.yml)
- ✅ Agent lifecycle management (upgrade, rollback, uninstall)
- ✅ Monitoring setup (node_exporter deployment)
- 🔄 Security hardening (fail2ban, SSH key-only, firewall rules, automatic updates) - Planned
- 🔄 Server maintenance (cleanup, log rotation, package updates) - Planned
- 🔄 Docker installation and configuration - Planned
- 🔄 Web server setup (Nginx, Caddy) - Planned

**Why**: Most users need common tasks automated. Pre-built playbooks reduce complexity and provide immediate value.

**Tier 2: Custom Playbook Upload** (Short-term - In Planning)

- Upload custom playbooks via web UI
- Support for simple playbooks (single .yml file) and packages (ZIP with templates/files)
- YAML validation and basic security scanning
- Version control for playbook history
- Backup/export functionality
- **Status**: [Spec complete](./ansible-reference/custom-playbooks.md), ready for implementation

**Future - Playbook Marketplace**:
- Community-contributed playbooks
- One-click deployment from templates
- Fork and customize templates
- Star/favorite system

**Why**: Users need to run custom automation beyond built-in playbooks. Upload via web UI provides immediate value without Git complexity.

**Tier 3: Custom Playbook Editor** (Long-term)

- Web-based Ansible playbook editor with syntax highlighting
- YAML validation and linting
- Dry-run testing before deployment
- Role library browser
- Variable management with secrets

**Why**: Advanced users need flexibility. Sandboxed editor ensures security while enabling customization.

#### 2.2 Scheduled Deployments

**Status**: Planned (Q1 2026)

**Features:**

- Cron-like scheduling for recurring playbooks
- Maintenance windows (run only during specific time ranges)
- Deployment chains (run playbook B after playbook A succeeds)
- Calendar view of scheduled tasks

**Why**: Infrastructure maintenance should be automated. Users shouldn't need to remember to run security updates or backups.

**Dependencies**: Custom playbook upload (Tier 2) must be complete first

#### 2.3 Deployment Workflows

**Status**: Planned (Q2 2026)

**Features:**

- Multi-step workflows (e.g., backup → update → verify → rollback if failed)
- Conditional execution based on server tags or groups
- Approval gates for production deployments
- Workflow templates for common patterns

**Why**: Complex operations require orchestration. Workflows prevent manual errors and ensure consistency.

**Dependencies**: Scheduled deployments (2.2) should be complete first

### Phase 3: Growth Features (Q2-Q3 2026)

**Timeline**: 3-6 months after Phase 2 completion

#### 3.1 Advanced Inventory Management

**Status**: Planned

**Features:**

- Server grouping and hierarchies
- Custom tags and metadata
- Smart groups with dynamic filters (e.g., "all Ubuntu servers with high CPU usage")
- Inventory import/export (Terraform, cloud providers)
- Server relationship mapping (web servers → databases)

**Why**: As fleets grow beyond 20-30 servers, manual organization becomes impractical. Smart grouping enables targeted automation.

#### 3.2 Deployment History & Audit Trail

**Features:**

- Complete deployment history with diffs
- Audit trail showing who ran what, when, and on which servers
- Rollback to previous configurations
- Compliance reporting (e.g., "all servers patched in last 30 days")
- Export audit logs for compliance

**Why**: Operations teams need accountability. Compliance requirements demand detailed records. Rollback capability reduces risk.

#### 3.3 Execution Environment Management

**Features:**

- Python virtual environments for Ansible execution
- Pin Ansible versions per playbook
- Custom module library (upload custom Ansible modules)
- Dependency management (Python packages, Ansible collections)
- Isolated execution environments to prevent conflicts

**Why**: Different playbooks may require different Ansible versions or dependencies. Isolation prevents "works on my machine" issues.

#### 3.4 Advanced RBAC (Role-Based Access Control)

**Features:**

- Granular permissions (who can deploy what to which servers)
- Role templates (Admin, Operator, Viewer, Auditor)
- Approval workflows (require approval for production deployments)
- Organization/team isolation for multi-tenancy
- API tokens with scoped permissions

**Why**: Teams need delegation without full admin access. Approval workflows prevent unauthorized changes.

### Phase 4: Advanced Features (Q4 2026 - Q2 2027)

**Timeline**: 6-12 months from now

#### 4.1 Credential Vault

**Features:**

- Centralized credential storage (API keys, passwords, certificates)
- Integration with HashiCorp Vault, AWS Secrets Manager, 1Password
- Credential injection into playbooks without exposure
- Automatic rotation for SSH keys and API tokens
- Audit trail for credential access

**Why**: Hardcoding secrets in playbooks is insecure. Centralized management enables rotation and auditing.

#### 4.2 Notification System

**Features:**

- Deployment status notifications (Slack, Discord, email, webhooks)
- Alert on deployment failures
- Success/failure digest reports
- Custom notification rules (notify only on production failures)
- Integration with PagerDuty, Opsgenie for incident management

**Why**: Teams need to know when deployments fail without constantly checking the dashboard. Proactive notifications reduce downtime.

#### 4.3 Playbook Analytics

**Features:**

- Success/failure rates per playbook
- Average execution time and trends
- Server-specific failure patterns (e.g., "this playbook always fails on Ubuntu 20.04")
- Resource usage during deployments
- Recommendations for optimization

**Why**: Data-driven optimization. Identifying problematic playbooks or servers improves reliability.

#### 4.4 Survey/Form Variables

**Features:**

- Web forms to collect deployment parameters (instead of JSON editing)
- Type validation (integers, dropdowns, file uploads)
- Conditional fields (show field B only if field A = "production")
- Default values and descriptions
- Form templates for common playbooks

**Why**: Non-technical users shouldn't edit JSON. Forms make deployments accessible to junior team members.

#### 4.5 Fact Caching & Smart Inventory

**Features:**

- Cache Ansible facts (OS version, installed packages, disk usage)
- Use cached facts for smart groups without SSH connections
- Refresh facts on-demand or scheduled
- Historical fact tracking (track when servers were upgraded)
- Compliance dashboards (e.g., "3 servers still on Ubuntu 18.04 EOL")

**Why**: Gathering facts from 100+ servers is slow. Cached facts enable instant filtering and compliance reporting.

### Phase 5: Scale & Growth Features (Q3 2027+)

**Timeline**: 12+ months from now

_For users who've succeeded and grown their infrastructure_

#### 5.1 Multi-Client Management

_For freelancers and small agencies managing client infrastructure_

**Features:**

- Client isolation (each client sees only their servers)
- Per-client branding and access controls
- Shared playbook library across clients
- Client-level reporting and billing support
- Separate notification channels per client

**Why**: A freelancer managing 10 clients × 20 servers each needs organization, not a single 200-server view. This enables the "one-person MSP" and small agency use case.

**Not for:** Large enterprises. This is for solo consultants and boutique agencies serving SMB clients.

#### 5.2 Git Integration

**Features:**

- Store playbooks in Git repositories
- Sync playbooks from GitHub/GitLab/Bitbucket
- Automatic deployment on git push (GitOps)
- Version control for all playbook changes
- Pull request workflow for playbook reviews

**Why**: Professional teams use Git for everything. GitOps enables infrastructure-as-code workflows.

#### 5.3 Advanced Workflow Engine

**Features:**

- Visual workflow builder (drag-and-drop)
- Parallel execution branches
- Error handling and retry logic
- Integration with external systems (webhooks, APIs)
- Workflow versioning and testing

**Why**: Complex automation requires visual orchestration. GUI reduces learning curve for non-Ansible experts.

#### 5.4 Performance Optimization

**Features:**

- Job result streaming (see output line-by-line as it happens)
- Background fact caching to speed up playbooks
- Callback plugins for richer output parsing
- Resource usage monitoring during deployments
- Parallel execution optimization for 200+ server deployments

**Why**: Managing 200-500 servers requires optimization. Real-time streaming improves debugging experience and parallel execution reduces deployment time.

## Target Audience Alignment

### Hobbyist VPS Users (Primary)

- **Pain Point**: Bought 5-10 cheap VPS servers but manually SSH-ing into each one is tedious
- **Our Solution**: One-click security hardening, automated updates, monitoring deployment
- **Key Features**: Built-in playbooks, simple UI, affordable pricing

### Small Development Teams (Secondary)

- **Pain Point**: Need to deploy applications to staging/production but don't have DevOps expertise
- **Our Solution**: Deployment workflows, approval gates, rollback capability
- **Key Features**: Git integration, RBAC, notification system

### Freelancers & Small Agencies (Growth)

- **Pain Point**: Managing 5-20 clients with 10-50 servers each - need client isolation without enterprise complexity
- **Our Solution**: Multi-client management, per-client views, shared playbook library
- **Key Features**: Client isolation, white-label reporting, automation templates

## Implementation Principles

1. **Incremental Delivery**: Ship features in small, usable increments
2. **Community-Driven**: Listen to user feedback for prioritization
3. **Documentation First**: Every feature ships with docs and examples
4. **Backward Compatibility**: Never break existing playbooks without migration path
5. **Security by Default**: Secure configurations out of the box
6. **Performance Matters**: Optimize for 50-500 server deployments from day one
7. **Avoid Enterprise Bloat**: If a feature only makes sense at 1000+ servers, we don't build it

---

## Current Focus (November 2025)

### Immediate Priorities

**1. Custom Playbook Upload (Tier 2) - Phase 2.1**
- **Status**: Specification complete
- **Timeline**: 4-5 weeks implementation
- **Spec**: [docs/ansible-reference/custom-playbooks.md](./ansible-reference/custom-playbooks.md)
- **Next Steps**:
  1. Database migration for `admiral.playbooks` table
  2. Laravel backend (Models, Services, Controllers)
  3. React upload UI components
  4. Integration with existing deployment system
  5. Testing and documentation

**2. Built-in Security Playbooks (Tier 1) - Phase 2.1**
- **Status**: Planned
- **Timeline**: 2-3 weeks after custom playbook upload
- **Features**:
  - SSH hardening playbook
  - Firewall configuration (UFW)
  - fail2ban deployment
  - Automatic security updates

**3. Documentation & Examples**
- **Status**: Ongoing
- **Focus**:
  - User guide for custom playbook creation
  - Example playbooks repository
  - Video tutorials for common workflows

### Recently Completed (October 2025)

- ✅ Simplified metrics architecture (98% bandwidth reduction)
- ✅ SSH WebSocket terminal access
- ✅ Public status pages and badges
- ✅ Agent deployment automation via Ansible
- ✅ Real-time deployment tracking via Valkey Streams

### On Hold / Deprioritized

- **Playbook Marketplace**: Deferred until custom upload is stable and user feedback collected
- **Full Role Support**: Not needed for MVP; packages (ZIP uploads) cover most use cases
- **Git Integration**: Phase 5 feature; too complex for current user base

---

## Revision History

- **2025-11-01**: Updated Phase 1 completion status, detailed Phase 2 progress, added custom playbook upload spec
- **2025-10-30**: Initial roadmap created

---

_This roadmap is a living document. Priorities may shift based on user feedback, market conditions, and technical discoveries._
