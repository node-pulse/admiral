# Ansible Playbooks Reference

Complete Ansible playbook and role code examples for the Node Pulse agent deployment system.

---

## Main Deployment Playbook

### deploy-agent.yml

**Purpose**: Deploy Node Pulse Agent to selected servers

**File**: `ansible/playbooks/nodepulse/deploy-agent-mtls.yml` (production) or `deploy-agent-no-mtls.yml` (development)

```yaml
---
- name: Deploy Node Pulse Agent
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_version: "{{ agent_version | default('latest') }}"
    # Cloudflare R2 base URL - pass via extra vars or environment
    agent_download_base_url: "{{ lookup('env', 'AGENT_DOWNLOAD_BASE_URL') | default('https://pub-xxxxx.r2.dev', true) }}"
    agent_download_url: "{{ agent_download_base_url }}/{{ agent_version }}"
    agent_install_dir: "/opt/nodepulse"
    agent_config_dir: "/etc/nodepulse"
    agent_data_dir: "/var/lib/nodepulse"
    agent_log_dir: "/var/log/nodepulse"
    # Dashboard endpoint - passed from Laravel job via extra vars
    ingest_endpoint: "{{ ingest_endpoint }}"
    agent_interval: "{{ agent_interval | default('15s') }}"
    agent_timeout: "{{ agent_timeout | default('10s') }}"

  pre_tasks:
    - name: Display deployment information
      debug:
        msg: |
          Deploying Node Pulse Agent to {{ inventory_hostname }}
          Server ID: {{ server_uuid }}
          Architecture: {{ architecture }}
          Ingest Endpoint: {{ ingest_endpoint }}

    - name: Ensure server is reachable
      wait_for_connection:
        timeout: 30
      register: connection_test
      ignore_errors: yes

    - name: Fail if server is unreachable
      fail:
        msg: "Server {{ inventory_hostname }} is unreachable"
      when: connection_test is failed

  roles:
    - nodepulse-agent

  post_tasks:
    - name: Verify agent is running
      systemd:
        name: nodepulse
        state: started
        enabled: yes
      check_mode: yes
      register: agent_status

    - name: Wait for agent to report metrics
      wait_for:
        timeout: 30
      delegate_to: localhost
      when: agent_status.changed

    - name: Display deployment summary
      debug:
        msg: |
          ✓ Agent deployed successfully to {{ inventory_hostname }}
          ✓ Service: {{ agent_status.name }}
          ✓ Status: {{ agent_status.status }}
          ✓ Server ID: {{ server_uuid }}
```

---

## Agent Role Structure

### Role: nodepulse-agent

Located in: `ansible/roles/nodepulse-agent/`

```
nodepulse-agent/
├── tasks/
│   ├── main.yml                   # Main task flow
│   ├── download.yml               # Binary download
│   ├── configure.yml              # Config deployment
│   ├── install.yml                # Service setup
│   ├── verify.yml                 # Health checks
│   └── deploy-certificates.yml    # mTLS certs (production)
│
├── templates/
│   ├── nodepulse.yml.j2           # Agent config (with Prometheus scraper)
│   └── nodepulse.service.j2       # Systemd service
│
├── handlers/
│   └── main.yml                   # Restart handlers
│
└── defaults/
    └── main.yml                   # Default variables
```

---

## Role Tasks

### Main Task Flow

**File**: `ansible/roles/nodepulse-agent/tasks/main.yml`

```yaml
---
- name: Include OS-specific variables
  include_vars: "{{ ansible_os_family }}.yml"
  ignore_errors: yes

- name: Create nodepulse user
  user:
    name: nodepulse
    system: yes
    create_home: no
    shell: /usr/sbin/nologin
    comment: "Node Pulse Agent Service User"

- name: Create required directories
  file:
    path: "{{ item }}"
    state: directory
    owner: nodepulse
    group: nodepulse
    mode: "0755"
  loop:
    - "{{ agent_install_dir }}"
    - "{{ agent_config_dir }}"
    - "{{ agent_data_dir }}"
    - "{{ agent_log_dir }}"
    - "{{ agent_data_dir }}/buffer"

- import_tasks: download.yml
- import_tasks: configure.yml
- import_tasks: install.yml
- import_tasks: verify.yml
```

### Download Agent Binary

**File**: `ansible/roles/nodepulse-agent/tasks/download.yml`

```yaml
---
- name: Detect CPU architecture
  set_fact:
    agent_arch: "{{ 'amd64' if ansible_architecture == 'x86_64' else 'arm64' if ansible_architecture == 'aarch64' else 'unknown' }}"

- name: Fail if unsupported architecture
  fail:
    msg: "Unsupported architecture: {{ ansible_architecture }}"
  when: agent_arch == 'unknown'

- name: Determine binary URL
  set_fact:
    binary_url: "{{ agent_download_url }}/nodepulse-linux-{{ agent_arch }}"

- name: Download Node Pulse agent binary
  get_url:
    url: "{{ binary_url }}"
    dest: "{{ agent_install_dir }}/nodepulse"
    mode: "0755"
    owner: nodepulse
    group: nodepulse
    force: yes
    timeout: 120
  register: download_result
  retries: 3
  delay: 5
  until: download_result is succeeded

- name: Verify binary is executable
  command: "{{ agent_install_dir }}/nodepulse --version"
  register: version_check
  changed_when: false
  failed_when: version_check.rc != 0

- name: Display agent version
  debug:
    msg: "Downloaded Node Pulse Agent: {{ version_check.stdout }}"
```

### Configure Agent

**File**: `ansible/roles/nodepulse-agent/tasks/configure.yml`

```yaml
---
- name: Generate server UUID if not exists
  set_fact:
    generated_uuid: "{{ server_uuid | default(99999999 | random | to_uuid) }}"

- name: Deploy agent configuration
  template:
    src: nodepulse.yml.j2
    dest: "{{ agent_config_dir }}/nodepulse.yml"
    owner: nodepulse
    group: nodepulse
    mode: "0640"
  notify: restart nodepulse

- name: Deploy systemd service file
  template:
    src: nodepulse.service.j2
    dest: /etc/systemd/system/nodepulse.service
    owner: root
    group: root
    mode: "0644"
  notify:
    - reload systemd
    - restart nodepulse

- name: Create log rotation configuration
  copy:
    dest: /etc/logrotate.d/nodepulse
    owner: root
    group: root
    mode: "0644"
    content: |
      {{ agent_log_dir }}/*.log {
          daily
          rotate 7
          compress
          delaycompress
          missingok
          notifempty
          create 0640 nodepulse nodepulse
          sharedscripts
          postrotate
              systemctl reload nodepulse > /dev/null 2>&1 || true
          endscript
      }
```

### Install and Start Service

**File**: `ansible/roles/nodepulse-agent/tasks/install.yml`

```yaml
---
- name: Reload systemd daemon
  systemd:
    daemon_reload: yes

- name: Enable nodepulse service
  systemd:
    name: nodepulse
    enabled: yes

- name: Start nodepulse service
  systemd:
    name: nodepulse
    state: started
  register: service_start

- name: Wait for service to be active
  wait_for:
    timeout: 10
  when: service_start.changed

- name: Check service status
  systemd:
    name: nodepulse
  register: service_status

- name: Display service status
  debug:
    msg: |
      Service Status: {{ service_status.status.ActiveState }}
      PID: {{ service_status.status.MainPID | default('N/A') }}
```

### Verify Agent Health

**File**: `ansible/roles/nodepulse-agent/tasks/verify.yml`

```yaml
---
# Verify node_exporter is available (required for simplified metrics)
- name: Check if node_exporter is running
  command: systemctl is-active node_exporter
  register: node_exporter_active
  changed_when: false
  failed_when: false

- name: Test node_exporter metrics endpoint
  uri:
    url: "http://127.0.0.1:9100/metrics"
    return_content: no
    status_code: 200
  register: node_exporter_metrics
  failed_when: false
  changed_when: false

- name: Warning if node_exporter is not available
  debug:
    msg: |
      ⚠️  WARNING: node_exporter is not running or not accessible!
      The agent will not be able to scrape metrics in simplified metrics mode.
      To fix this, run:
      ansible-playbook ansible/playbooks/prometheus/deploy-node-exporter.yml -i inventory.yml --limit {{ inventory_hostname }}
  when: node_exporter_active.rc != 0 or node_exporter_metrics.status != 200

# Verify agent
- name: Check if agent is running
  command: systemctl is-active nodepulse
  register: agent_active
  changed_when: false
  failed_when: false

- name: Verify agent process
  command: pgrep -f nodepulse
  register: agent_process
  changed_when: false
  failed_when: false

- name: Check agent logs for errors
  shell: journalctl -u nodepulse --since "1 minute ago" --no-pager | grep -i error || true
  register: agent_errors
  changed_when: false

- name: Check agent logs for scraping activity
  shell: journalctl -u nodepulse --since "1 minute ago" --no-pager | grep -i "scraped\|prometheus" || true
  register: agent_scraping
  changed_when: false

- name: Display verification results
  debug:
    msg: |
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      Verification Results for {{ inventory_hostname }}
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      node_exporter:
        Status: {{ node_exporter_active.stdout | default('not running') }}
        Metrics: {{ 'accessible' if node_exporter_metrics.status == 200 else 'not accessible' }}

      Agent:
        Status: {{ agent_active.stdout }}
        Process ID: {{ agent_process.stdout | default('Not Running') }}
        Recent Errors: {{ agent_errors.stdout_lines | length }} errors found

      Recent Activity:
      {{ agent_scraping.stdout_lines[:5] | join('\n  ') | default('No recent scraping activity') }}

      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- name: Fail if agent is not running
  fail:
    msg: "Agent is not running on {{ inventory_hostname }}"
  when: agent_active.rc != 0
```

---

## Templates

### Agent Configuration Template

**File**: `ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2`

```yaml
# Node Pulse Agent Configuration
# Deployed by Ansible on {{ ansible_date_time.iso8601 }}
#
# Architecture: Simplified Metrics (98% bandwidth reduction)
# The agent scrapes node_exporter locally and parses metrics before sending

# Prometheus scraper configuration
scrapers:
  prometheus:
    enabled: true
    endpoints:
      - url: "http://127.0.0.1:9100/metrics"
        name: "node_exporter"
        interval: {{ agent_interval }}

# Server configuration
server:
  endpoint: "{{ ingest_endpoint }}"
  format: "prometheus"  # Options: "prometheus" or "json" (legacy)
  timeout: {{ agent_timeout }}
  # Use custom CA cert if needed
  # ca_cert: "/etc/ssl/certs/ca-certificates.crt"

# Agent identification
agent:
  server_id: "{{ generated_uuid }}"
  interval: {{ agent_interval }}
  hostname: "{{ inventory_hostname }}"

  # Tags for server categorization
  tags:
{% for tag in tags | default([]) %}
    - "{{ tag }}"
{% endfor %}

# Buffer configuration (Write-Ahead Log for offline resilience)
buffer:
  enabled: {{ buffer_enabled }}
  path: "{{ agent_data_dir }}/buffer"
  retention_hours: {{ buffer_retention_hours }}
  max_size_mb: {{ buffer_max_size_mb }}

# Logging configuration
logging:
  level: "{{ log_level }}"  # debug, info, warn, error
  file: "{{ agent_log_dir }}/nodepulse.log"
  max_size_mb: {{ log_max_size_mb }}
  max_backups: {{ log_max_backups }}
  max_age_days: {{ log_max_age_days }}
```

### Systemd Service Template

**File**: `ansible/roles/nodepulse-agent/templates/nodepulse.service.j2`

```ini
[Unit]
Description=Node Pulse Monitoring Agent
Documentation=https://github.com/your-org/node-pulse-agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=nodepulse
Group=nodepulse
ExecStart={{ agent_install_dir }}/nodepulse --config {{ agent_config_dir }}/nodepulse.yml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nodepulse

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths={{ agent_data_dir }} {{ agent_log_dir }}

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

---

## Handlers

**File**: `ansible/roles/nodepulse-agent/handlers/main.yml`

```yaml
---
- name: reload systemd
  systemd:
    daemon_reload: yes

- name: restart nodepulse
  systemd:
    name: nodepulse
    state: restarted

- name: stop nodepulse
  systemd:
    name: nodepulse
    state: stopped
```

---

## Default Variables

**File**: `ansible/roles/nodepulse-agent/defaults/main.yml`

```yaml
---
# Node Pulse Agent Role Defaults

# Agent version
agent_version: "latest"

# Download configuration (Cloudflare R2)
# Set AGENT_DOWNLOAD_BASE_URL environment variable or pass via extra vars
agent_download_base_url: "https://pub-xxxxx.r2.dev"
agent_download_url: "{{ agent_download_base_url }}/{{ agent_version }}"

# Installation paths
agent_install_dir: "/opt/nodepulse"
agent_config_dir: "/etc/nodepulse"
agent_data_dir: "/var/lib/nodepulse"
agent_log_dir: "/var/log/nodepulse"

# Dashboard configuration
ingest_endpoint: "https://dashboard.example.com/metrics/prometheus"

# Agent behavior
agent_interval: "15s"
agent_timeout: "10s"

# Buffer configuration (Write-Ahead Log)
buffer_enabled: true
buffer_retention_hours: 48
buffer_max_size_mb: 100

# Logging
log_level: "info"
log_max_size_mb: 50
log_max_backups: 3
log_max_age_days: 7
```

---

## Additional Playbooks

### Upgrade Agent Playbook

**File**: `ansible/playbooks/nodepulse/upgrade-agent.yml`

```yaml
---
- name: Upgrade Node Pulse Agent
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_version: "{{ agent_version | default('latest') }}"
    agent_download_base_url: "{{ lookup('env', 'AGENT_DOWNLOAD_BASE_URL') }}"
    agent_install_dir: "/opt/nodepulse"
    backup_dir: "/opt/nodepulse/backups"

  tasks:
    - name: Create backup directory
      file:
        path: "{{ backup_dir }}"
        state: directory
        owner: nodepulse
        group: nodepulse
        mode: "0755"

    - name: Backup current binary
      copy:
        src: "{{ agent_install_dir }}/nodepulse"
        dest: "{{ backup_dir }}/nodepulse.{{ ansible_date_time.epoch }}"
        remote_src: yes
        owner: nodepulse
        group: nodepulse
        mode: "0755"

    - name: Stop agent service
      systemd:
        name: nodepulse
        state: stopped

    - name: Download new version
      get_url:
        url: "{{ agent_download_base_url }}/{{ agent_version }}/nodepulse-linux-{{ agent_arch }}"
        dest: "{{ agent_install_dir }}/nodepulse"
        mode: "0755"
        owner: nodepulse
        group: nodepulse
        force: yes

    - name: Start agent service
      systemd:
        name: nodepulse
        state: started

    - name: Verify agent is running
      command: systemctl is-active nodepulse
      register: agent_status
      changed_when: false

    - name: Display upgrade result
      debug:
        msg: "Successfully upgraded to version {{ agent_version }}"
```

### Rollback Agent Playbook

**File**: `ansible/playbooks/nodepulse/rollback-agent.yml`

```yaml
---
- name: Rollback Node Pulse Agent to Previous Version
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_install_dir: "/opt/nodepulse"
    backup_dir: "/opt/nodepulse/backups"
    previous_version: "{{ rollback_version | default('previous') }}"

  tasks:
    - name: Find latest backup
      find:
        paths: "{{ backup_dir }}"
        patterns: "nodepulse.*"
      register: backup_files
      when: previous_version == 'previous'

    - name: Set backup file path
      set_fact:
        backup_file: "{{ (backup_files.files | sort(attribute='mtime', reverse=true) | first).path }}"
      when: previous_version == 'previous'

    - name: Use specified backup
      set_fact:
        backup_file: "{{ backup_dir }}/nodepulse.{{ previous_version }}"
      when: previous_version != 'previous'

    - name: Check if backup exists
      stat:
        path: "{{ backup_file }}"
      register: backup_stat

    - name: Fail if backup not found
      fail:
        msg: "Backup file not found: {{ backup_file }}"
      when: not backup_stat.stat.exists

    - name: Stop current agent
      systemd:
        name: nodepulse
        state: stopped

    - name: Backup failed binary
      copy:
        src: "{{ agent_install_dir }}/nodepulse"
        dest: "{{ agent_install_dir }}/nodepulse.failed"
        remote_src: yes
        owner: nodepulse
        group: nodepulse
        mode: "0755"

    - name: Restore previous version
      copy:
        src: "{{ backup_file }}"
        dest: "{{ agent_install_dir }}/nodepulse"
        remote_src: yes
        owner: nodepulse
        group: nodepulse
        mode: "0755"

    - name: Start agent with previous version
      systemd:
        name: nodepulse
        state: started

    - name: Verify agent is running
      command: systemctl is-active nodepulse
      register: agent_status
      changed_when: false

    - name: Display rollback result
      debug:
        msg: "Successfully rolled back to previous version"
```

### Uninstall Agent Playbook

**File**: `ansible/playbooks/nodepulse/uninstall-agent.yml`

```yaml
---
- name: Uninstall Node Pulse Agent
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_install_dir: "/opt/nodepulse"
    agent_config_dir: "/etc/nodepulse"
    agent_data_dir: "/var/lib/nodepulse"
    agent_log_dir: "/var/log/nodepulse"

  tasks:
    - name: Stop nodepulse service
      systemd:
        name: nodepulse
        state: stopped
      ignore_errors: yes

    - name: Disable nodepulse service
      systemd:
        name: nodepulse
        enabled: no
      ignore_errors: yes

    - name: Remove systemd service file
      file:
        path: /etc/systemd/system/nodepulse.service
        state: absent

    - name: Reload systemd daemon
      systemd:
        daemon_reload: yes

    - name: Remove installation directories
      file:
        path: "{{ item }}"
        state: absent
      loop:
        - "{{ agent_install_dir }}"
        - "{{ agent_config_dir }}"
        - "{{ agent_data_dir }}"
        - "{{ agent_log_dir }}"

    - name: Remove logrotate configuration
      file:
        path: /etc/logrotate.d/nodepulse
        state: absent

    - name: Remove nodepulse user
      user:
        name: nodepulse
        state: absent
        remove: yes

    - name: Display uninstall result
      debug:
        msg: "Node Pulse Agent successfully uninstalled from {{ inventory_hostname }}"
```

### Retry Failed Servers Playbook

**File**: `ansible/playbooks/nodepulse/retry-failed.yml`

```yaml
---
- name: Retry Deployment on Failed Servers
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_version: "{{ agent_version | default('latest') }}"
    agent_download_base_url: "{{ lookup('env', 'AGENT_DOWNLOAD_BASE_URL') }}"
    agent_download_url: "{{ agent_download_base_url }}/{{ agent_version }}"
    agent_install_dir: "/opt/nodepulse"
    agent_config_dir: "/etc/nodepulse"
    agent_data_dir: "/var/lib/nodepulse"
    agent_log_dir: "/var/log/nodepulse"
    ingest_endpoint: "{{ ingest_endpoint }}"
    agent_interval: "{{ agent_interval | default('15s') }}"
    agent_timeout: "{{ agent_timeout | default('10s') }}"
    # Increase retries for failed servers
    max_retries: 5
    retry_delay: 10

  pre_tasks:
    - name: Display retry information
      debug:
        msg: |
          Retrying deployment on {{ inventory_hostname }}
          Max Retries: {{ max_retries }}

  roles:
    - nodepulse-agent

  tasks:
    - name: Verify final status
      command: systemctl is-active nodepulse
      register: final_status
      changed_when: false
      failed_when: false

    - name: Mark as successful
      debug:
        msg: "Retry successful on {{ inventory_hostname }}"
      when: final_status.rc == 0

    - name: Mark as still failed
      fail:
        msg: "Retry failed on {{ inventory_hostname }}"
      when: final_status.rc != 0
```

---

## Reference

- Main README: [../ANSIBLE_README.md](../ANSIBLE_README.md)
- Architecture details: [architecture.md](./architecture.md)
- Laravel integration: [laravel-integration.md](./laravel-integration.md)

---

**Last Updated:** 2025-10-30
