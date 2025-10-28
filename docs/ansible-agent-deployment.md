# Ansible Agent Deployment Integration Plan

**Date:** 2025-10-25

**Goal:** Enable users to deploy the Node Pulse agent to 1000+ servers simultaneously through the Flagship dashboard using Ansible automation.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Phase 1: Ansible Foundation](#phase-1-ansible-foundation)
5. [Phase 2: Dynamic Inventory](#phase-2-dynamic-inventory)
6. [Phase 3: Agent Deployment Playbook](#phase-3-agent-deployment-playbook)
7. [Phase 4: Laravel Integration](#phase-4-laravel-integration)
8. [Phase 5: Web UI](#phase-5-web-ui)
9. [Phase 6: Monitoring & Logging](#phase-6-monitoring--logging)
10. [Security Considerations](#security-considerations)
11. [Performance Optimization](#performance-optimization)
12. [Testing Strategy](#testing-strategy)
13. [Rollout Plan](#rollout-plan)

---

## Overview

### Problem Statement

Users need to deploy the Node Pulse monitoring agent to hundreds or thousands of servers. Doing this manually is:

- Time-consuming and error-prone
- Difficult to track progress
- Hard to manage configurations across different environments
- Lacks rollback capabilities

### Solution

Integrate Ansible into the Flagship dashboard to provide:

- **One-click deployment** to selected servers
- **Parallel execution** (up to 100 servers concurrently)
- **Progress tracking** in real-time
- **Configuration management** (environment-specific settings)
- **Automatic registration** with the dashboard
- **Rollback capabilities** for failed deployments
- **SSH key management** integration

### Key Features

1. **Server Selection UI** - Select servers from dashboard (individual, bulk, or by tags)
2. **Configuration Templates** - Pre-configured settings for different environments
3. **Deployment Progress** - Real-time status updates via WebSocket
4. **Job History** - Track all deployment jobs with logs
5. **Agent Verification** - Automatic health check after deployment
6. **Rollback Support** - Uninstall or revert to previous version

---

## Architecture

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

### Data Flow

1. **User Action** → Select servers in UI, click "Deploy Agent"
2. **API Request** → POST `/api/ansible/deployments` with server IDs
3. **Job Dispatch** → Laravel queues `DeployAgentJob`
4. **Inventory Generation** → Dynamic inventory script queries PostgreSQL
5. **Playbook Execution** → Ansible runs `deploy-agent.yml` in parallel
6. **Progress Updates** → Job publishes events via Laravel Echo/Reverb
7. **Verification** → Health check ensures agent is reporting metrics
8. **Completion** → Update deployment status in database

---

## Directory Structure

```
admiral/
├── ansible/
│   ├── ansible.cfg                  # Ansible configuration
│   ├── inventory/
│   │   ├── hosts.yml               # Static inventory (optional)
│   │   └── dynamic.php             # Dynamic inventory script (reads PostgreSQL)
│   │
│   ├── playbooks/
│   │   ├── deploy-agent.yml        # Main deployment playbook
│   │   ├── update-agent.yml        # Update existing agent
│   │   ├── remove-agent.yml        # Uninstall agent
│   │   ├── verify-agent.yml        # Verify agent health
│   │   ├── configure-agent.yml     # Update configuration only
│   │   ├── rollback-agent.yml      # Rollback to previous version
│   │   └── retry-failed.yml        # Retry deployment on failed servers
│   │
│   ├── roles/
│   │   └── nodepulse-agent/
│   │       ├── tasks/
│   │       │   ├── main.yml
│   │       │   ├── download.yml
│   │       │   ├── configure.yml
│   │       │   ├── install.yml
│   │       │   ├── verify.yml
│   │       │   └── cleanup.yml
│   │       │
│   │       ├── templates/
│   │       │   ├── nodepulse.yml.j2          # Agent config template
│   │       │   └── nodepulse.service.j2      # Systemd service template
│   │       │
│   │       ├── files/
│   │       │   └── nodepulse-latest          # Optional: pre-downloaded binary
│   │       │
│   │       ├── handlers/
│   │       │   └── main.yml                  # Restart agent handler
│   │       │
│   │       ├── vars/
│   │       │   ├── main.yml                  # Default variables
│   │       │   ├── production.yml            # Production overrides
│   │       │   └── staging.yml               # Staging overrides
│   │       │
│   │       └── defaults/
│   │           └── main.yml                  # Default role variables
│   │
│   ├── group_vars/
│   │   ├── all.yml                 # Variables for all hosts
│   │   ├── production.yml          # Production-specific vars
│   │   └── staging.yml             # Staging-specific vars
│   │
│   ├── host_vars/                  # Host-specific variables (optional)
│   │
│   └── README.md                   # Ansible documentation
│
├── flagship/
│   ├── app/
│   │   ├── Console/
│   │   │   └── Commands/
│   │   │       ├── AnsibleDeployCommand.php      # php artisan ansible:deploy
│   │   │       ├── AnsibleInventoryCommand.php   # php artisan ansible:inventory
│   │   │       └── AnsibleVerifyCommand.php      # php artisan ansible:verify
│   │   │
│   │   ├── Http/
│   │   │   └── Controllers/
│   │   │       ├── AnsibleController.php         # Ansible API endpoints
│   │   │       └── DeploymentsController.php     # Deployment job management
│   │   │
│   │   ├── Jobs/
│   │   │   ├── DeployAgentJob.php               # Queue job for deployment
│   │   │   ├── UpdateAgentJob.php               # Queue job for updates
│   │   │   └── RemoveAgentJob.php               # Queue job for removal
│   │   │
│   │   ├── Models/
│   │   │   ├── Deployment.php                   # Deployment job record
│   │   │   └── DeploymentServer.php             # Pivot: deployment ↔ server
│   │   │
│   │   └── Services/
│   │       ├── AnsibleService.php               # Ansible execution wrapper
│   │       └── InventoryService.php             # Dynamic inventory generator
│   │
│   ├── resources/
│   │   └── js/
│   │       └── pages/
│   │           └── deployments/
│   │               ├── index.tsx                # Deployment history
│   │               ├── create.tsx               # New deployment wizard
│   │               └── show.tsx                 # Deployment details + logs
│   │
│   └── routes/
│       └── api.php                              # API routes for deployments
│
└── migrate/
    └── migrations/
        └── 20251025_add_deployments.sql         # Database schema for deployments
```

---

## Phase 1: Ansible Foundation

### 1.1 Install Ansible in Container

**Dockerfile Update** (`flagship/Dockerfile.prod`):

```dockerfile
# Add Ansible to the production image
RUN apt-get update && apt-get install -y \
    ansible \
    sshpass \
    && rm -rf /var/lib/apt/lists/*
```

**Development Setup** (local):

```bash
# Install Ansible on host machine
brew install ansible  # macOS
# or
apt-get install ansible  # Linux
```

### 1.2 Ansible Configuration

**File:** `ansible/ansible.cfg`

```ini
[defaults]
# Inventory
inventory = ./inventory/dynamic.php
inventory_cache = True
inventory_cache_timeout = 300

# Performance
forks = 100                    # Parallel execution (max 100 servers at once)
host_key_checking = False      # Disable strict host key checking
timeout = 30                   # SSH connection timeout
gathering = smart              # Smart fact gathering
fact_caching = jsonfile        # Cache facts to JSON files
fact_caching_connection = /tmp/ansible_fact_cache
fact_caching_timeout = 86400

# SSH Configuration
private_key_file = ~/.ssh/ansible_deploy_key
remote_user = root             # Default SSH user (can be overridden per host)
transport = ssh

# Callbacks
stdout_callback = yaml         # Better output formatting
callbacks_enabled = profile_tasks, timer

# Logging
log_path = /var/log/ansible/ansible.log
bin_ansible_callbacks = True

# Retry Files
retry_files_enabled = True
retry_files_save_path = /tmp/ansible-retry

# Privilege Escalation
become = True
become_method = sudo
become_user = root
become_ask_pass = False

# Error Handling
any_errors_fatal = False       # Continue on errors
max_fail_percentage = 10       # Fail if more than 10% of hosts fail

[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
pipelining = True              # Faster execution
control_path = /tmp/ansible-ssh-%%h-%%p-%%r
```

### 1.3 Cloudflare R2 Setup for Agent Binaries

**Option A: Public Bucket (Recommended for MVP)**

1. Create R2 bucket: `nodepulse-releases`
2. Enable public access in R2 settings
3. Upload agent binaries with version structure:
   ```
   /latest/nodepulse-linux-amd64
   /latest/nodepulse-linux-arm64
   /v1.0.0/nodepulse-linux-amd64
   /v1.0.0/nodepulse-linux-arm64
   ```
4. Set environment variable in `.env`:
   ```bash
   AGENT_DOWNLOAD_BASE_URL=https://pub-xxxxx.r2.dev
   ```

**Option B: Custom Domain (Production)**

1. Add custom domain in R2 bucket settings (e.g., `releases.nodepulse.io`)
2. Point CNAME to R2 bucket
3. Update `.env`:
   ```bash
   AGENT_DOWNLOAD_BASE_URL=https://releases.nodepulse.io
   ```

**Option C: Signed URLs (Most Secure)**

Use AWS S3 SDK in AnsibleService to generate time-limited signed URLs.

### 1.4 Directory Setup

**Artisan Command:** `php artisan ansible:init`

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class AnsibleInitCommand extends Command
{
    protected $signature = 'ansible:init';
    protected $description = 'Initialize Ansible directory structure';

    public function handle()
    {
        $basePath = base_path('ansible');

        $directories = [
            'inventory',
            'playbooks',
            'roles/nodepulse-agent/tasks',
            'roles/nodepulse-agent/templates',
            'roles/nodepulse-agent/files',
            'roles/nodepulse-agent/handlers',
            'roles/nodepulse-agent/vars',
            'roles/nodepulse-agent/defaults',
            'group_vars',
            'host_vars',
        ];

        foreach ($directories as $dir) {
            $path = "$basePath/$dir";
            if (!File::exists($path)) {
                File::makeDirectory($path, 0755, true);
                $this->info("Created: $path");
            }
        }

        // Create ansible.cfg if it doesn't exist
        $configPath = "$basePath/ansible.cfg";
        if (!File::exists($configPath)) {
            File::put($configPath, $this->getAnsibleConfig());
            $this->info("Created: $configPath");
        }

        $this->info('Ansible directory structure initialized successfully!');
    }

    private function getAnsibleConfig(): string
    {
        return <<<CFG
[defaults]
inventory = ./inventory/dynamic.php
forks = 100
host_key_checking = False
timeout = 30
gathering = smart
stdout_callback = yaml
CFG;
    }
}
```

---

## Phase 2: Dynamic Inventory

### 2.1 Dynamic Inventory Script

**File:** `ansible/inventory/dynamic.php`

This script reads servers from PostgreSQL and outputs Ansible inventory JSON.

```php
#!/usr/bin/env php
<?php

/**
 * Ansible Dynamic Inventory for Node Pulse Admiral
 *
 * Reads server list from PostgreSQL admiral.servers table
 * Outputs Ansible inventory in JSON format
 *
 * Usage:
 *   ./dynamic.php --list
 *   ./dynamic.php --host <hostname>
 */

// Bootstrap Laravel to access database
// Detect base path dynamically for portability
$basePath = dirname(dirname(__DIR__));
require $basePath . '/flagship/vendor/autoload.php';
$app = require_once $basePath . '/flagship/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;

/**
 * Get all servers from database
 */
function getServers(array $filters = []): array
{
    $query = DB::table('admiral.servers')
        ->whereNotNull('ssh_host')
        ->whereNotNull('ssh_username');

    // Filter by server IDs if provided
    if (!empty($filters['server_ids'])) {
        $query->whereIn('id', $filters['server_ids']);
    }

    // Filter by tags if provided
    if (!empty($filters['tags'])) {
        foreach ($filters['tags'] as $tag) {
            $query->whereJsonContains('tags', $tag);
        }
    }

    // Filter by status
    if (!empty($filters['status'])) {
        $query->where('status', $filters['status']);
    }

    // Only include servers with SSH configured
    $servers = $query->get();

    return $servers->map(function ($server) {
        return [
            'hostname' => $server->hostname,
            'ansible_host' => $server->ssh_host,
            'ansible_port' => $server->ssh_port ?? 22,
            'ansible_user' => $server->ssh_username,
            'server_id' => $server->id,
            'server_uuid' => $server->server_id,
            'tags' => json_decode($server->tags ?? '[]', true),
            'distro' => $server->distro,
            'architecture' => $server->architecture,
        ];
    })->all();
}

/**
 * Get SSH private key for a server
 */
function getSSHKey(string $serverId): ?string
{
    $key = DB::table('admiral.server_private_key')
        ->join('admiral.private_keys', 'server_private_key.private_key_id', '=', 'private_keys.id')
        ->where('server_private_key.server_id', $serverId)
        ->where('server_private_key.is_primary', true)
        ->first();

    if (!$key) {
        return null;
    }

    // Decrypt the private key
    try {
        return Crypt::decryptString($key->key_data);
    } catch (\Exception $e) {
        return null;
    }
}

// Track temporary key files for cleanup
$tempKeyFiles = [];

/**
 * Cleanup temporary SSH key files
 */
function cleanupTempKeys(): void
{
    global $tempKeyFiles;
    foreach ($tempKeyFiles as $keyFile) {
        if (file_exists($keyFile)) {
            @unlink($keyFile);
        }
    }
}

// Register shutdown function to cleanup keys
register_shutdown_function('cleanupTempKeys');

/**
 * Generate Ansible inventory
 */
function generateInventory(array $filters = []): array
{
    global $tempKeyFiles;

    $servers = getServers($filters);

    $inventory = [
        '_meta' => [
            'hostvars' => []
        ],
        'all' => [
            'children' => ['ungrouped']
        ],
        'ungrouped' => [
            'hosts' => []
        ]
    ];

    // Group by distro
    $distroGroups = [];

    // Group by tags
    $tagGroups = [];

    foreach ($servers as $server) {
        $hostname = $server['hostname'];

        // Add to ungrouped
        $inventory['ungrouped']['hosts'][] = $hostname;

        // Add host variables
        $inventory['_meta']['hostvars'][$hostname] = [
            'ansible_host' => $server['ansible_host'],
            'ansible_port' => $server['ansible_port'],
            'ansible_user' => $server['ansible_user'],
            'server_id' => $server['server_id'],
            'server_uuid' => $server['server_uuid'],
            'architecture' => $server['architecture'],
        ];

        // Get SSH key for this server
        $sshKey = getSSHKey($server['server_id']);
        if ($sshKey) {
            // Write key to temporary file with secure path
            $keyPath = sys_get_temp_dir() . "/ansible_key_{$server['server_id']}_" . uniqid();
            file_put_contents($keyPath, $sshKey);
            chmod($keyPath, 0600);
            $inventory['_meta']['hostvars'][$hostname]['ansible_ssh_private_key_file'] = $keyPath;

            // Track for cleanup
            $tempKeyFiles[] = $keyPath;
        }

        // Group by distro
        if ($server['distro']) {
            $distroGroup = strtolower(str_replace(' ', '_', $server['distro']));
            if (!isset($distroGroups[$distroGroup])) {
                $distroGroups[$distroGroup] = [];
            }
            $distroGroups[$distroGroup][] = $hostname;
        }

        // Group by tags
        foreach ($server['tags'] as $tag) {
            $tagGroup = "tag_" . strtolower(str_replace([' ', '-'], '_', $tag));
            if (!isset($tagGroups[$tagGroup])) {
                $tagGroups[$tagGroup] = [];
            }
            $tagGroups[$tagGroup][] = $hostname;
        }
    }

    // Add distro groups to inventory
    foreach ($distroGroups as $group => $hosts) {
        $inventory[$group] = ['hosts' => $hosts];
        $inventory['all']['children'][] = $group;
    }

    // Add tag groups to inventory
    foreach ($tagGroups as $group => $hosts) {
        $inventory[$group] = ['hosts' => $hosts];
        $inventory['all']['children'][] = $group;
    }

    return $inventory;
}

/**
 * Get host variables for a specific host
 */
function getHost(string $hostname): array
{
    $inventory = generateInventory();
    return $inventory['_meta']['hostvars'][$hostname] ?? [];
}

// Main execution
$options = getopt('', ['list', 'host:']);

if (isset($options['list'])) {
    // Read filters from environment or stdin
    $filters = [];

    // Check for environment variables
    if ($serverIds = getenv('ANSIBLE_SERVER_IDS')) {
        $filters['server_ids'] = explode(',', $serverIds);
    }

    if ($tags = getenv('ANSIBLE_TAGS')) {
        $filters['tags'] = explode(',', $tags);
    }

    if ($status = getenv('ANSIBLE_STATUS')) {
        $filters['status'] = $status;
    }

    echo json_encode(generateInventory($filters), JSON_PRETTY_PRINT);
} elseif (isset($options['host'])) {
    echo json_encode(getHost($options['host']), JSON_PRETTY_PRINT);
} else {
    fwrite(STDERR, "Usage: dynamic.php --list | --host <hostname>\n");
    exit(1);
}
```

**Make it executable:**

```bash
chmod +x ansible/inventory/dynamic.php
```

### 2.2 Test Dynamic Inventory

**Artisan Command:** `php artisan ansible:inventory`

```php
<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class AnsibleInventoryCommand extends Command
{
    protected $signature = 'ansible:inventory
                            {--server-ids= : Comma-separated server IDs}
                            {--tags= : Comma-separated tags}
                            {--status= : Filter by status}';

    protected $description = 'Generate and display Ansible inventory';

    public function handle()
    {
        $inventoryScript = base_path('ansible/inventory/dynamic.php');

        $env = [];

        if ($serverIds = $this->option('server-ids')) {
            $env['ANSIBLE_SERVER_IDS'] = $serverIds;
        }

        if ($tags = $this->option('tags')) {
            $env['ANSIBLE_TAGS'] = $tags;
        }

        if ($status = $this->option('status')) {
            $env['ANSIBLE_STATUS'] = $status;
        }

        $process = new Process([$inventoryScript, '--list'], null, $env);
        $process->run();

        if (!$process->isSuccessful()) {
            $this->error('Failed to generate inventory:');
            $this->error($process->getErrorOutput());
            return 1;
        }

        $this->info('Ansible Inventory:');
        $this->line($process->getOutput());

        return 0;
    }
}
```

**Usage:**

```bash
# List all servers
php artisan ansible:inventory

# Filter by server IDs
php artisan ansible:inventory --server-ids=uuid1,uuid2,uuid3

# Filter by tags
php artisan ansible:inventory --tags=production,web

# Filter by status
php artisan ansible:inventory --status=active
```

---

## Phase 3: Agent Deployment Playbook

### 3.1 Main Deployment Playbook

**File:** `ansible/playbooks/deploy-agent.yml`

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
    agent_interval: "{{ agent_interval | default('5s') }}"
    agent_timeout: "{{ agent_timeout | default('3s') }}"

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

### 3.2 Agent Role - Main Tasks

**File:** `ansible/roles/nodepulse-agent/tasks/main.yml`

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

### 3.3 Download Agent Binary

**File:** `ansible/roles/nodepulse-agent/tasks/download.yml`

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

### 3.4 Configure Agent

**File:** `ansible/roles/nodepulse-agent/tasks/configure.yml`

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

### 3.5 Configuration Template

**File:** `ansible/roles/nodepulse-agent/templates/nodepulse.yml.j2`

```yaml
# Node Pulse Agent Configuration
# Deployed by Ansible on {{ ansible_date_time.iso8601 }}

server:
  endpoint: "{{ ingest_endpoint }}"
  timeout: {{ agent_timeout }}
  # Use custom CA cert if needed
  # ca_cert: "/etc/ssl/certs/ca-certificates.crt"

agent:
  server_id: "{{ generated_uuid }}"
  interval: {{ agent_interval }}
  hostname: "{{ inventory_hostname }}"

  # Tags for server categorization
  tags:
{% for tag in tags | default([]) %}
    - "{{ tag }}"
{% endfor %}

# Metrics to collect
metrics:
  cpu: true
  memory: true
  disk: true
  network: true
  processes: true

# Buffer configuration (for offline resilience)
buffer:
  enabled: true
  path: "{{ agent_data_dir }}/buffer"
  retention_hours: 48
  max_size_mb: 100

# Logging configuration
logging:
  level: info  # debug, info, warn, error
  file: "{{ agent_log_dir }}/nodepulse.log"
  max_size_mb: 50
  max_backups: 3
  max_age_days: 7
```

### 3.6 Systemd Service Template

**File:** `ansible/roles/nodepulse-agent/templates/nodepulse.service.j2`

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

### 3.7 Install and Start Service

**File:** `ansible/roles/nodepulse-agent/tasks/install.yml`

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

### 3.8 Verify Agent Health

**File:** `ansible/roles/nodepulse-agent/tasks/verify.yml`

```yaml
---
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

- name: Display verification results
  debug:
    msg: |
      Agent Active: {{ agent_active.stdout }}
      Process ID: {{ agent_process.stdout | default('Not Running') }}
      Recent Errors: {{ agent_errors.stdout_lines | length }} errors found

- name: Fail if agent is not running
  fail:
    msg: "Agent is not running on {{ inventory_hostname }}"
  when: agent_active.rc != 0
```

### 3.9 Handlers

**File:** `ansible/roles/nodepulse-agent/handlers/main.yml`

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

### 3.10 Default Variables

**File:** `ansible/roles/nodepulse-agent/defaults/main.yml`

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
ingest_endpoint: "https://dashboard.example.com/metrics"

# Agent behavior
agent_interval: "5s"
agent_timeout: "3s"

# Buffer configuration
buffer_enabled: true
buffer_retention_hours: 48
buffer_max_size_mb: 100

# Logging
log_level: "info"
log_max_size_mb: 50
log_max_backups: 3
log_max_age_days: 7
```

### 3.11 Rollback Playbook

**File:** `ansible/playbooks/rollback-agent.yml`

```yaml
---
- name: Rollback Node Pulse Agent to Previous Version
  hosts: all
  become: yes
  gather_facts: yes

  vars:
    agent_install_dir: "/opt/nodepulse"
    agent_backup_dir: "/opt/nodepulse/backups"
    previous_version: "{{ rollback_version | default('previous') }}"

  tasks:
    - name: Check if backup exists
      stat:
        path: "{{ agent_backup_dir }}/nodepulse.{{ previous_version }}"
      register: backup_file

    - name: Fail if backup not found
      fail:
        msg: "Backup version {{ previous_version }} not found"
      when: not backup_file.stat.exists

    - name: Stop current agent
      systemd:
        name: nodepulse
        state: stopped

    - name: Backup current binary
      copy:
        src: "{{ agent_install_dir }}/nodepulse"
        dest: "{{ agent_install_dir }}/nodepulse.failed"
        remote_src: yes
        owner: nodepulse
        group: nodepulse
        mode: "0755"

    - name: Restore previous version
      copy:
        src: "{{ agent_backup_dir }}/nodepulse.{{ previous_version }}"
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
        msg: "Successfully rolled back to version {{ previous_version }}"
```

### 3.12 Retry Failed Servers Playbook

**File:** `ansible/playbooks/retry-failed.yml`

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
    agent_interval: "{{ agent_interval | default('5s') }}"
    agent_timeout: "{{ agent_timeout | default('3s') }}"
    # Increase retries for failed servers
    max_retries: 5
    retry_delay: 10

  pre_tasks:
    - name: Display retry information
      debug:
        msg: |
          Retrying deployment on {{ inventory_hostname }}
          Attempt: {{ ansible_loop.index | default(1) }}
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

## Phase 4: Laravel Integration

### 4.1 Database Schema

**Migration:** `migrate/migrations/20251025_add_deployments.sql`

```sql
-- Up Migration
-- Add deployment tracking tables

CREATE TABLE admiral.deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Deployment configuration
    playbook VARCHAR(100) NOT NULL,  -- deploy-agent, update-agent, remove-agent
    server_filter JSONB,              -- Server selection criteria
    variables JSONB,                  -- Ansible extra vars

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, cancelled
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    total_servers INTEGER NOT NULL DEFAULT 0,
    successful_servers INTEGER NOT NULL DEFAULT 0,
    failed_servers INTEGER NOT NULL DEFAULT 0,
    skipped_servers INTEGER NOT NULL DEFAULT 0,

    -- Output
    output TEXT,                      -- Ansible stdout
    error_output TEXT,                -- Ansible stderr

    -- Metadata
    created_by UUID,                  -- User ID (if auth is implemented)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deployments_status ON admiral.deployments(status);
CREATE INDEX idx_deployments_created_at ON admiral.deployments(created_at DESC);


CREATE TABLE admiral.deployment_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id UUID NOT NULL REFERENCES admiral.deployments(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES admiral.servers(id) ON DELETE CASCADE,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, running, success, failed, skipped
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Results
    changed BOOLEAN DEFAULT FALSE,
    output TEXT,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(deployment_id, server_id)
);

CREATE INDEX idx_deployment_servers_deployment ON admiral.deployment_servers(deployment_id);
CREATE INDEX idx_deployment_servers_server ON admiral.deployment_servers(server_id);
CREATE INDEX idx_deployment_servers_status ON admiral.deployment_servers(status);


-- Down Migration

DROP TABLE IF EXISTS admiral.deployment_servers;
DROP TABLE IF EXISTS admiral.deployments;
```

### 4.2 Queue Configuration

**File:** `flagship/config/queue.php`

Add a dedicated queue for deployments:

```php
'connections' => [
    // ... existing connections ...

    'database' => [
        'driver' => 'database',
        'connection' => env('DB_QUEUE_CONNECTION'),
        'table' => env('DB_QUEUE_TABLE', 'jobs'),
        'queue' => env('QUEUE_NAME', 'default'),
        'retry_after' => 7200, // 2 hours for deployment jobs
        'after_commit' => false,
    ],
],

'queues' => [
    'default' => 'default',
    'deployments' => 'deployments', // Dedicated queue for Ansible deployments
],
```

**Start Queue Worker:**

```bash
# In development (use Laravel's queue worker)
php artisan queue:work --queue=deployments --tries=1 --timeout=3600

# In production (use Supervisor)
# Add to /etc/supervisor/conf.d/flagship-queue.conf
[program:flagship-queue-deployments]
process_name=%(program_name)s_%(process_num)02d
command=php /path/to/flagship/artisan queue:work --queue=deployments --sleep=3 --tries=1 --max-time=3600 --timeout=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/flagship-queue-deployments.log
stopwaitsecs=3600
```

### 4.4 Eloquent Models

**File:** `flagship/app/Models/Deployment.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Deployment extends Model
{
    protected $table = 'admiral.deployments';

    protected $fillable = [
        'name',
        'description',
        'playbook',
        'server_filter',
        'variables',
        'status',
        'started_at',
        'completed_at',
        'total_servers',
        'successful_servers',
        'failed_servers',
        'skipped_servers',
        'output',
        'error_output',
        'created_by',
    ];

    protected $casts = [
        'server_filter' => 'array',
        'variables' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function servers(): BelongsToMany
    {
        return $this->belongsToMany(
            Server::class,
            'admiral.deployment_servers',
            'deployment_id',
            'server_id'
        )->withPivot([
            'status',
            'started_at',
            'completed_at',
            'changed',
            'output',
            'error_message',
        ])->withTimestamps();
    }

    public function deploymentServers(): HasMany
    {
        return $this->hasMany(DeploymentServer::class, 'deployment_id');
    }

    public function isRunning(): bool
    {
        return $this->status === 'running';
    }

    public function isCompleted(): bool
    {
        return in_array($this->status, ['completed', 'failed', 'cancelled']);
    }

    public function getSuccessRateAttribute(): float
    {
        if ($this->total_servers === 0) {
            return 0.0;
        }

        return ($this->successful_servers / $this->total_servers) * 100;
    }

    public function getDurationAttribute(): ?int
    {
        if (!$this->started_at || !$this->completed_at) {
            return null;
        }

        return $this->started_at->diffInSeconds($this->completed_at);
    }
}
```

**File:** `flagship/app/Models/DeploymentServer.php`

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeploymentServer extends Model
{
    protected $table = 'admiral.deployment_servers';

    protected $fillable = [
        'deployment_id',
        'server_id',
        'status',
        'started_at',
        'completed_at',
        'changed',
        'output',
        'error_message',
    ];

    protected $casts = [
        'changed' => 'boolean',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function deployment(): BelongsTo
    {
        return $this->belongsTo(Deployment::class, 'deployment_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }
}
```

### 4.5 Ansible Service

**File:** `flagship/app/Services/AnsibleService.php`

```php
<?php

namespace App\Services;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

class AnsibleService
{
    private string $ansiblePath;
    private string $playbookPath;
    private string $inventoryPath;

    public function __construct()
    {
        $this->ansiblePath = base_path('ansible');
        $this->playbookPath = base_path('ansible/playbooks');
        $this->inventoryPath = base_path('ansible/inventory/dynamic.php');
    }

    /**
     * Run an Ansible playbook
     */
    public function runPlaybook(
        Deployment $deployment,
        string $playbook,
        array $serverIds = [],
        array $extraVars = []
    ): bool {
        // Update deployment status
        $deployment->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        // Build Ansible command
        $command = $this->buildCommand($playbook, $serverIds, $extraVars);

        Log::info("Running Ansible playbook", [
            'deployment_id' => $deployment->id,
            'playbook' => $playbook,
            'command' => $command,
        ]);

        // Execute Ansible
        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds),
            null,
            3600  // 1 hour timeout
        );

        // Start the process and track PID for cancellation
        $process->start();

        // Store process ID in cache for cancellation
        cache()->put("deployment:{$deployment->id}:process_id", $process->getPid(), 3600);

        $output = '';
        $errorOutput = '';

        $process->wait(function ($type, $buffer) use (&$output, &$errorOutput, $deployment) {
            if (Process::ERR === $type) {
                $errorOutput .= $buffer;
            } else {
                $output .= $buffer;
            }

            // Parse Ansible output and update progress
            $this->parseAnsibleOutput($buffer, $deployment);
        });

        // Update deployment with results
        $deployment->update([
            'status' => $process->isSuccessful() ? 'completed' : 'failed',
            'completed_at' => now(),
            'output' => $output,
            'error_output' => $errorOutput,
        ]);

        // Parse final stats
        $this->parseFinalStats($output, $deployment);

        return $process->isSuccessful();
    }

    /**
     * Build Ansible command
     */
    private function buildCommand(string $playbook, array $serverIds, array $extraVars): array
    {
        $command = [
            'ansible-playbook',
            "{$this->playbookPath}/{$playbook}",
            '-i', $this->inventoryPath,
            '--timeout=30',
        ];

        // Add extra vars
        if (!empty($extraVars)) {
            $command[] = '--extra-vars';
            $command[] = json_encode($extraVars);
        }

        // Limit to specific servers if provided
        if (!empty($serverIds)) {
            // This will be handled by environment variables in dynamic inventory
            // but we can also use --limit with hostnames
        }

        return $command;
    }

    /**
     * Build environment variables for Ansible
     */
    private function buildEnvironment(array $serverIds = []): array
    {
        $env = [
            'ANSIBLE_CONFIG' => base_path('ansible/ansible.cfg'),
            'ANSIBLE_FORCE_COLOR' => 'true',
            'ANSIBLE_HOST_KEY_CHECKING' => 'False',
        ];

        if (!empty($serverIds)) {
            $env['ANSIBLE_SERVER_IDS'] = implode(',', $serverIds);
        }

        return $env;
    }

    /**
     * Parse Ansible output for progress updates
     */
    private function parseAnsibleOutput(string $buffer, Deployment $deployment): void
    {
        // Parse task execution
        if (preg_match('/TASK \[(.*?)\]/', $buffer, $matches)) {
            Log::debug("Ansible task", [
                'deployment_id' => $deployment->id,
                'task' => $matches[1],
            ]);
        }

        // Parse host results (ok, changed, failed)
        if (preg_match('/(ok|changed|failed|skipped):\s+\[(.*?)\]/', $buffer, $matches)) {
            $status = $matches[1];
            $hostname = $matches[2];

            // Find the server and update status
            $server = $deployment->servers()
                ->where('hostname', $hostname)
                ->first();

            if ($server) {
                DeploymentServer::where('deployment_id', $deployment->id)
                    ->where('server_id', $server->id)
                    ->update([
                        'status' => $this->mapAnsibleStatus($status),
                        'changed' => $status === 'changed',
                    ]);
            }
        }
    }

    /**
     * Parse final Ansible stats
     */
    private function parseFinalStats(string $output, Deployment $deployment): void
    {
        // Parse recap section
        // Example:
        // PLAY RECAP *****
        // server1 : ok=5 changed=2 unreachable=0 failed=0 skipped=0 rescued=0 ignored=0

        $stats = [
            'successful_servers' => 0,
            'failed_servers' => 0,
            'skipped_servers' => 0,
        ];

        if (preg_match_all('/(\S+)\s+:\s+ok=(\d+).*?failed=(\d+).*?skipped=(\d+)/', $output, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $hostname = $match[1];
                $ok = (int) $match[2];
                $failed = (int) $match[3];
                $skipped = (int) $match[4];

                if ($failed > 0) {
                    $stats['failed_servers']++;
                } elseif ($skipped > 0) {
                    $stats['skipped_servers']++;
                } else {
                    $stats['successful_servers']++;
                }
            }
        }

        $deployment->update($stats);
    }

    /**
     * Map Ansible status to our status
     */
    private function mapAnsibleStatus(string $ansibleStatus): string
    {
        return match($ansibleStatus) {
            'ok', 'changed' => 'success',
            'failed' => 'failed',
            'skipped' => 'skipped',
            default => 'pending',
        };
    }

    /**
     * Test Ansible connectivity
     */
    public function testConnection(array $serverIds = []): array
    {
        $command = [
            'ansible',
            'all',
            '-i', $this->inventoryPath,
            '-m', 'ping',
            '--timeout=10',
        ];

        $process = new Process(
            $command,
            $this->ansiblePath,
            $this->buildEnvironment($serverIds)
        );

        $process->run();

        return [
            'success' => $process->isSuccessful(),
            'output' => $process->getOutput(),
            'error' => $process->getErrorOutput(),
        ];
    }
}
```

### 4.6 Deploy Agent Job

**File:** `flagship/app/Jobs/DeployAgentJob.php`

```php
<?php

namespace App\Jobs;

use App\Models\Deployment;
use App\Models\DeploymentServer;
use App\Models\Server;
use App\Services\AnsibleService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DeployAgentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $timeout = 3600; // 1 hour
    public $tries = 1;      // No retries for deployments

    public function __construct(
        private Deployment $deployment,
        private array $serverIds,
        private array $variables = []
    ) {
        $this->onQueue('deployments');
    }

    public function handle(AnsibleService $ansible): void
    {
        Log::info("Starting agent deployment", [
            'deployment_id' => $this->deployment->id,
            'servers' => count($this->serverIds),
        ]);

        // Create deployment server records
        foreach ($this->serverIds as $serverId) {
            DeploymentServer::create([
                'deployment_id' => $this->deployment->id,
                'server_id' => $serverId,
                'status' => 'pending',
            ]);
        }

        // Update total servers count
        $this->deployment->update([
            'total_servers' => count($this->serverIds),
        ]);

        try {
            // Run Ansible playbook
            $success = $ansible->runPlaybook(
                $this->deployment,
                'deploy-agent.yml',
                $this->serverIds,
                $this->variables
            );

            if ($success) {
                Log::info("Deployment completed successfully", [
                    'deployment_id' => $this->deployment->id,
                ]);
            } else {
                Log::warning("Deployment completed with errors", [
                    'deployment_id' => $this->deployment->id,
                ]);
            }
        } catch (\Exception $e) {
            Log::error("Deployment failed", [
                'deployment_id' => $this->deployment->id,
                'error' => $e->getMessage(),
            ]);

            $this->deployment->update([
                'status' => 'failed',
                'completed_at' => now(),
                'error_output' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("Deployment job failed", [
            'deployment_id' => $this->deployment->id,
            'exception' => $exception->getMessage(),
        ]);

        $this->deployment->update([
            'status' => 'failed',
            'completed_at' => now(),
            'error_output' => $exception->getMessage(),
        ]);
    }
}
```

### 4.7 API Controllers

**File:** `flagship/app/Http/Controllers/DeploymentsController.php`

```php
<?php

namespace App\Http\Controllers;

use App\Jobs\DeployAgentJob;
use App\Models\Deployment;
use App\Models\Server;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DeploymentsController extends Controller
{
    /**
     * Display deployments index page
     */
    public function index()
    {
        return Inertia::render('deployments/index');
    }

    /**
     * Get list of deployments
     */
    public function list(Request $request)
    {
        $query = Deployment::query()
            ->orderBy('created_at', 'desc');

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->input('status'));
        }

        // Search by name
        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'ilike', "%{$search}%")
                    ->orWhere('description', 'ilike', "%{$search}%");
            });
        }

        $perPage = $request->input('per_page', 20);
        $deployments = $query->paginate($perPage);

        return response()->json([
            'deployments' => $deployments->through(function ($deployment) {
                return [
                    'id' => $deployment->id,
                    'name' => $deployment->name,
                    'description' => $deployment->description,
                    'playbook' => $deployment->playbook,
                    'status' => $deployment->status,
                    'total_servers' => $deployment->total_servers,
                    'successful_servers' => $deployment->successful_servers,
                    'failed_servers' => $deployment->failed_servers,
                    'success_rate' => $deployment->success_rate,
                    'duration' => $deployment->duration,
                    'started_at' => $deployment->started_at?->toIso8601String(),
                    'completed_at' => $deployment->completed_at?->toIso8601String(),
                    'created_at' => $deployment->created_at->toIso8601String(),
                ];
            }),
            'meta' => [
                'current_page' => $deployments->currentPage(),
                'per_page' => $deployments->perPage(),
                'total' => $deployments->total(),
                'last_page' => $deployments->lastPage(),
            ],
        ]);
    }

    /**
     * Show deployment details
     */
    public function show(string $id)
    {
        $deployment = Deployment::with(['deploymentServers.server'])
            ->findOrFail($id);

        return response()->json([
            'deployment' => [
                'id' => $deployment->id,
                'name' => $deployment->name,
                'description' => $deployment->description,
                'playbook' => $deployment->playbook,
                'status' => $deployment->status,
                'variables' => $deployment->variables,
                'total_servers' => $deployment->total_servers,
                'successful_servers' => $deployment->successful_servers,
                'failed_servers' => $deployment->failed_servers,
                'skipped_servers' => $deployment->skipped_servers,
                'success_rate' => $deployment->success_rate,
                'duration' => $deployment->duration,
                'output' => $deployment->output,
                'error_output' => $deployment->error_output,
                'started_at' => $deployment->started_at?->toIso8601String(),
                'completed_at' => $deployment->completed_at?->toIso8601String(),
                'created_at' => $deployment->created_at->toIso8601String(),
                'servers' => $deployment->deploymentServers->map(function ($ds) {
                    return [
                        'id' => $ds->id,
                        'server_id' => $ds->server_id,
                        'hostname' => $ds->server->hostname,
                        'status' => $ds->status,
                        'changed' => $ds->changed,
                        'output' => $ds->output,
                        'error_message' => $ds->error_message,
                        'started_at' => $ds->started_at?->toIso8601String(),
                        'completed_at' => $ds->completed_at?->toIso8601String(),
                    ];
                }),
            ],
        ]);
    }

    /**
     * Create a new deployment
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'playbook' => 'required|in:deploy-agent.yml,update-agent.yml,remove-agent.yml',
            'server_ids' => 'required|array|min:1',
            'server_ids.*' => 'uuid|exists:admiral.servers,id',
            'variables' => 'nullable|array',
        ]);

        // Create deployment record
        $deployment = Deployment::create([
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'playbook' => $validated['playbook'],
            'server_filter' => ['server_ids' => $validated['server_ids']],
            'variables' => $validated['variables'] ?? [],
            'status' => 'pending',
        ]);

        // Dispatch deployment job
        DeployAgentJob::dispatch(
            $deployment,
            $validated['server_ids'],
            $validated['variables'] ?? []
        );

        return response()->json([
            'message' => 'Deployment started',
            'deployment' => [
                'id' => $deployment->id,
                'name' => $deployment->name,
                'status' => $deployment->status,
            ],
        ], 201);
    }

    /**
     * Cancel a running deployment
     */
    public function cancel(string $id)
    {
        $deployment = Deployment::findOrFail($id);

        if (!$deployment->isRunning()) {
            return response()->json([
                'message' => 'Deployment is not running',
            ], 400);
        }

        // Find and kill the running Ansible process
        $processId = cache()->get("deployment:{$deployment->id}:process_id");

        if ($processId && posix_getpgid($processId)) {
            // Send SIGTERM to gracefully stop Ansible
            posix_kill($processId, SIGTERM);

            // Wait 5 seconds for graceful shutdown
            sleep(5);

            // If still running, force kill with SIGKILL
            if (posix_getpgid($processId)) {
                posix_kill($processId, SIGKILL);
            }

            cache()->forget("deployment:{$deployment->id}:process_id");
        }

        $deployment->update([
            'status' => 'cancelled',
            'completed_at' => now(),
        ]);

        return response()->json([
            'message' => 'Deployment cancelled',
        ]);
    }
}
```

### 4.8 Routes

**File:** `flagship/routes/api.php` (API routes)

```php
<?php

use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

// Deployment API routes (with auth middleware)
Route::middleware(['auth', 'verified', 'admin'])->prefix('deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'list']);
    Route::post('/', [DeploymentsController::class, 'store']);
    Route::get('/{id}', [DeploymentsController::class, 'show']);
    Route::post('/{id}/cancel', [DeploymentsController::class, 'cancel']);
});
```

**File:** `flagship/routes/web.php` (Inertia page routes)

```php
<?php

use App\Http\Controllers\DeploymentsController;
use Illuminate\Support\Facades\Route;

// Deployment web routes (with auth middleware)
Route::middleware(['auth', 'verified', 'admin'])->prefix('dashboard/deployments')->group(function () {
    Route::get('/', [DeploymentsController::class, 'index'])->name('deployments.index');
    Route::get('/create', [DeploymentsController::class, 'create'])->name('deployments.create');
    Route::get('/{id}', [DeploymentsController::class, 'details'])->name('deployments.show');
});
```

---

## Phase 5: Web UI

### 5.1 Deployments Index Page

**File:** `flagship/resources/js/pages/deployments/index.tsx`

```tsx
import { useState, useEffect } from "react";
import { Head, Link } from "@inertiajs/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, RefreshCw } from "lucide-react";

interface Deployment {
  id: string;
  name: string;
  description: string;
  playbook: string;
  status: string;
  total_servers: number;
  successful_servers: number;
  failed_servers: number;
  success_rate: number;
  duration: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function DeploymentsIndex() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/deployments");
      const data = await response.json();
      setDeployments(data.deployments.data);
    } catch (error) {
      console.error("Failed to fetch deployments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeployments();
  }, []);

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "outline",
      running: "default",
      completed: "secondary",
      failed: "destructive",
      cancelled: "outline",
    };

    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return "N/A";

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
  };

  return (
    <>
      <Head title="Deployments" />

      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Agent Deployments</h1>
            <p className="text-muted-foreground mt-1">
              Manage Node Pulse agent deployments across your infrastructure
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={fetchDeployments}
              disabled={loading}
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Link href="/deployments/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Deployment
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Playbook</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Servers</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id}>
                  <TableCell>
                    <div>
                      <Link
                        href={`/deployments/${deployment.id}`}
                        className="font-medium hover:underline"
                      >
                        {deployment.name}
                      </Link>
                      {deployment.description && (
                        <p className="text-sm text-muted-foreground">
                          {deployment.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {deployment.playbook}
                    </code>
                  </TableCell>
                  <TableCell>{getStatusBadge(deployment.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm">
                      <div className="text-green-600">
                        ✓ {deployment.successful_servers}
                      </div>
                      {deployment.failed_servers > 0 && (
                        <div className="text-red-600">
                          ✗ {deployment.failed_servers}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-sm font-medium">
                      {deployment.success_rate.toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatDuration(deployment.duration)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(deployment.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/deployments/${deployment.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {deployments.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No deployments yet</p>
              <Link href="/deployments/create">
                <Button className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Deployment
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
```

### 5.2 Create Deployment Wizard

**File:** `flagship/resources/js/pages/deployments/create.tsx`

```tsx
import { useState, useEffect } from "react";
import { Head, router } from "@inertiajs/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface Server {
  id: string;
  hostname: string;
  name: string;
  ssh_host: string;
  status: string;
}

export default function CreateDeployment() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    playbook: "deploy-agent.yml",
    server_ids: [] as string[],
    variables: {
      ingest_endpoint: "",
      agent_interval: "5s",
      agent_timeout: "3s",
    },
  });
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchServers = async () => {
    const response = await fetch("/api/servers?has_ssh=true");
    const data = await response.json();
    setServers(data.servers.data);
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/deployments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-TOKEN":
            document
              .querySelector('meta[name="csrf-token"]')
              ?.getAttribute("content") || "",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to create deployment");
      }

      const data = await response.json();

      toast.success("Deployment started successfully!");
      router.visit(`/deployments/${data.deployment.id}`);
    } catch (error) {
      console.error("Failed to create deployment:", error);
      toast.error("Failed to start deployment");
    } finally {
      setLoading(false);
    }
  };

  const toggleServer = (serverId: string) => {
    setFormData((prev) => ({
      ...prev,
      server_ids: prev.server_ids.includes(serverId)
        ? prev.server_ids.filter((id) => id !== serverId)
        : [...prev.server_ids, serverId],
    }));
  };

  const selectAllServers = () => {
    setFormData((prev) => ({
      ...prev,
      server_ids: servers.map((s) => s.id),
    }));
  };

  const deselectAllServers = () => {
    setFormData((prev) => ({
      ...prev,
      server_ids: [],
    }));
  };

  return (
    <>
      <Head title="New Deployment" />

      <div className="container mx-auto py-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">New Agent Deployment</h1>
          <p className="text-muted-foreground mt-1">
            Deploy or update Node Pulse agents across your servers
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-4 mb-8">
          {[
            { num: 1, title: "Configuration" },
            { num: 2, title: "Select Servers" },
            { num: 3, title: "Review & Deploy" },
          ].map((s) => (
            <div key={s.num} className="flex items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  step >= s.num
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.num}
              </div>
              <div className="ml-2 text-sm font-medium">{s.title}</div>
              {s.num < 3 && <div className="flex-1 h-px bg-border ml-4" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Configuration */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Deployment Configuration</CardTitle>
                <CardDescription>
                  Configure basic deployment settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Deployment Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Production Agent Rollout"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional description..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="playbook">Playbook *</Label>
                  <Select
                    value={formData.playbook}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, playbook: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deploy-agent.yml">
                        Deploy Agent (Fresh Install)
                      </SelectItem>
                      <SelectItem value="update-agent.yml">
                        Update Agent (Existing Installation)
                      </SelectItem>
                      <SelectItem value="remove-agent.yml">
                        Remove Agent (Uninstall)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ingest_endpoint">
                    Dashboard Endpoint *
                  </Label>
                  <Input
                    id="ingest_endpoint"
                    value={formData.variables.ingest_endpoint}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        variables: {
                          ...prev.variables,
                          ingest_endpoint: e.target.value,
                        },
                      }))
                    }
                    placeholder="https://dashboard.example.com/metrics"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agent_interval">Report Interval</Label>
                    <Input
                      id="agent_interval"
                      value={formData.variables.agent_interval}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          variables: {
                            ...prev.variables,
                            agent_interval: e.target.value,
                          },
                        }))
                      }
                      placeholder="5s"
                    />
                  </div>

                  <div>
                    <Label htmlFor="agent_timeout">Timeout</Label>
                    <Input
                      id="agent_timeout"
                      value={formData.variables.agent_timeout}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          variables: {
                            ...prev.variables,
                            agent_timeout: e.target.value,
                          },
                        }))
                      }
                      placeholder="3s"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Select Servers */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Select Target Servers</CardTitle>
                <CardDescription>
                  Choose which servers to deploy the agent to (
                  {formData.server_ids.length} selected)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAllServers}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={deselectAllServers}
                  >
                    Deselect All
                  </Button>
                </div>

                <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                  {servers.map((server) => (
                    <label
                      key={server.id}
                      className="flex items-center p-3 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={formData.server_ids.includes(server.id)}
                        onCheckedChange={() => toggleServer(server.id)}
                      />
                      <div className="ml-3 flex-1">
                        <div className="font-medium">
                          {server.name || server.hostname}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {server.ssh_host}
                        </div>
                      </div>
                      <Badge
                        variant={
                          server.status === "active" ? "default" : "secondary"
                        }
                      >
                        {server.status}
                      </Badge>
                    </label>
                  ))}
                </div>

                {servers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No servers with SSH configured found
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Review & Deploy</CardTitle>
                <CardDescription>
                  Review your deployment configuration before starting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Deployment Details</h3>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Name:</dt>
                    <dd className="font-medium">{formData.name}</dd>

                    <dt className="text-muted-foreground">Playbook:</dt>
                    <dd className="font-mono">{formData.playbook}</dd>

                    <dt className="text-muted-foreground">Target Servers:</dt>
                    <dd className="font-medium">
                      {formData.server_ids.length} servers
                    </dd>

                    <dt className="text-muted-foreground">Ingest Endpoint:</dt>
                    <dd className="font-mono text-xs">
                      {formData.variables.ingest_endpoint}
                    </dd>
                  </dl>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-sm">
                    ⚠️ This will deploy the Node Pulse agent to{" "}
                    <strong>{formData.server_ids.length}</strong> servers. Make
                    sure you have reviewed the configuration carefully.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              Previous
            </Button>

            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !formData.name) ||
                  (step === 2 && formData.server_ids.length === 0)
                }
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={loading}>
                {loading ? "Starting Deployment..." : "Start Deployment"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
```

---

## Phase 6: Monitoring & Logging

### 6.1 Laravel Reverb Setup

**Installation:**

```bash
cd flagship
composer require laravel/reverb
php artisan reverb:install
```

**Configuration:** `flagship/config/broadcasting.php`

```php
'connections' => [
    'reverb' => [
        'driver' => 'reverb',
        'key' => env('REVERB_APP_KEY'),
        'secret' => env('REVERB_APP_SECRET'),
        'app_id' => env('REVERB_APP_ID'),
        'options' => [
            'host' => env('REVERB_HOST', '0.0.0.0'),
            'port' => env('REVERB_PORT', 8080),
            'scheme' => env('REVERB_SCHEME', 'http'),
        ],
        'client_options' => [
            // Guzzle client options
        ],
    ],
],
```

**Environment Variables:** Add to `.env`

```bash
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=flagship
REVERB_APP_KEY=your-app-key
REVERB_APP_SECRET=your-app-secret
REVERB_HOST="localhost"
REVERB_PORT=8080
REVERB_SCHEME=http

VITE_REVERB_APP_KEY="${REVERB_APP_KEY}"
VITE_REVERB_HOST="${REVERB_HOST}"
VITE_REVERB_PORT="${REVERB_PORT}"
VITE_REVERB_SCHEME="${REVERB_SCHEME}"
```

**Start Reverb Server:**

```bash
# Development
php artisan reverb:start

# Production (use Supervisor)
[program:flagship-reverb]
command=php /path/to/flagship/artisan reverb:start
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/flagship-reverb.log
```

**Frontend Setup:** `flagship/resources/js/echo.ts`

```typescript
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: import.meta.env.VITE_REVERB_HOST,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
});
```

Import in `flagship/resources/js/app.tsx`:

```typescript
import './echo';
```

### 6.2 Real-time Progress Updates

Use Laravel Echo with Reverb to broadcast deployment progress:

**File:** `flagship/app/Jobs/DeployAgentJob.php` (add broadcasting)

```php
use Illuminate\Broadcasting\InteractsWithBroadcasting;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

class DeployAgentJob implements ShouldQueue, ShouldBroadcast
{
    use InteractsWithBroadcasting;

    private function broadcastProgress(string $status, array $data = []): void
    {
        broadcast(new DeploymentProgress(
            $this->deployment->id,
            $status,
            $data
        ))->toOthers();
    }

    public function handle(AnsibleService $ansible): void
    {
        $this->broadcastProgress('started');

        // ... deployment logic ...

        $this->broadcastProgress('completed', [
            'successful' => $this->deployment->successful_servers,
            'failed' => $this->deployment->failed_servers,
        ]);
    }
}
```

**Event:** `flagship/app/Events/DeploymentProgress.php`

```php
<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DeploymentProgress implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $deploymentId,
        public string $status,
        public array $data = []
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel("deployments.{$this->deploymentId}");
    }

    public function broadcastAs(): string
    {
        return 'deployment.progress';
    }
}
```

### 6.3 Logging

**File:** `flagship/config/logging.php` (add deployment channel)

```php
'channels' => [
    // ... existing channels ...

    'deployments' => [
        'driver' => 'daily',
        'path' => storage_path('logs/deployments.log'),
        'level' => env('LOG_LEVEL', 'debug'),
        'days' => 14,
    ],
],
```

---

## Security Considerations

### 1. SSH Key Management

- **Encryption**: Store private keys encrypted in database using Laravel's `Crypt` facade
- **Access Control**: Only allow authorized users to view/manage SSH keys
- **Temporary Files**: Clean up temporary SSH key files after use
- **Key Rotation**: Implement key rotation policies

### 2. Ansible Execution

- **Sandboxing**: Run Ansible in isolated environment
- **Timeout Limits**: Set reasonable timeouts to prevent runaway processes
- **Resource Limits**: Limit CPU/memory usage of Ansible processes
- **Input Validation**: Validate all user inputs before passing to Ansible

### 3. API Security

- **Authentication**: Require authentication for all deployment endpoints
- **Authorization**: Implement role-based access control (RBAC)
- **Rate Limiting**: Limit deployment creation to prevent abuse
- **Audit Logging**: Log all deployment actions

---

## Performance Optimization

### 1. Parallel Execution

- **Forks**: Set `forks = 100` in ansible.cfg for parallel execution
- **Pipelining**: Enable SSH pipelining for faster execution
- **Fact Caching**: Cache facts to avoid re-gathering on subsequent runs

### 2. Queue Management

- **Dedicated Queue**: Use `deployments` queue for deployment jobs
- **Queue Workers**: Run multiple queue workers for concurrent deployments
- **Priority**: Implement job priorities if needed

### 3. Database Optimization

- **Indexes**: Add indexes on frequently queried columns
- **Batching**: Use batch updates for deployment server status
- **Connection Pooling**: Use persistent database connections

---

## Testing Strategy

### 1. Unit Tests

Test individual components:

- Ansible Service
- Dynamic Inventory
- Deployment Models

### 2. Integration Tests

Test end-to-end workflow:

- Create deployment → Queue job → Execute Ansible → Update status

### 3. Manual Testing

- Test with 1 server
- Test with 10 servers
- Test with 100+ servers
- Test failure scenarios (SSH failures, timeouts, etc.)

---

## Rollout Plan

### Phase 1: MVP (Week 1-2)

- ✅ Ansible foundation setup
- ✅ Dynamic inventory
- ✅ Basic deploy-agent playbook
- ✅ Laravel models and migrations
- ✅ Simple CLI command for testing

### Phase 2: API & Jobs (Week 3)

- ✅ Ansible Service
- ✅ DeployAgentJob
- ✅ API endpoints
- ✅ Job queue configuration

### Phase 3: Web UI (Week 4)

- ✅ Deployments index page
- ✅ Create deployment wizard
- ✅ Deployment details page

### Phase 4: Real-time Updates (Week 5)

- ⏳ Laravel Echo/Reverb setup
- ⏳ Progress broadcasting
- ⏳ Live status updates in UI

### Phase 5: Polish & Production (Week 6)

- ⏳ Error handling improvements
- ⏳ Performance optimization
- ⏳ Security hardening
- ⏳ Documentation
- ⏳ Production deployment

---

## Next Steps

### 1. Setup Cloudflare R2

```bash
# Create R2 bucket in Cloudflare dashboard
# Upload agent binaries with version structure:
# /latest/nodepulse-linux-amd64
# /latest/nodepulse-linux-arm64

# Add to .env
echo "AGENT_DOWNLOAD_BASE_URL=https://pub-xxxxx.r2.dev" >> flagship/.env
```

### 2. Run Database Migrations

```bash
# Navigate to migrate directory
cd migrate

# Run the deployment migration
docker compose run --rm migrate

# Or manually via psql
psql -h localhost -U postgres -d admiral -f migrations/20251025_add_deployments.sql
```

### 3. Initialize Ansible Structure

```bash
cd flagship
php artisan ansible:init
```

### 4. Configure Queue System

```bash
# Create jobs table for queue (if not exists)
php artisan queue:table
php artisan migrate

# Start queue worker (development)
php artisan queue:work --queue=deployments --tries=1 --timeout=3600

# Or add to Supervisor for production (see section 4.2)
```

### 5. Setup Laravel Reverb (Optional - for real-time updates)

```bash
cd flagship
composer require laravel/reverb
php artisan reverb:install

# Update .env with Reverb settings
# Start Reverb server
php artisan reverb:start
```

### 6. Test Dynamic Inventory

```bash
cd flagship

# List all servers
php artisan ansible:inventory

# Filter by server IDs
php artisan ansible:inventory --server-ids=uuid1,uuid2,uuid3

# Filter by tags
php artisan ansible:inventory --tags=production,web
```

### 7. Create First Deployment

**Via CLI (testing):**

```bash
cd flagship
php artisan ansible:deploy --servers=uuid1,uuid2,uuid3
```

**Via API (production):**

```bash
curl -X POST http://localhost/api/deployments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Production Agent Rollout",
    "description": "Initial deployment to production servers",
    "playbook": "deploy-agent.yml",
    "server_ids": ["uuid1", "uuid2", "uuid3"],
    "variables": {
      "ingest_endpoint": "https://dashboard.example.com/metrics",
      "agent_interval": "5s",
      "agent_timeout": "3s",
      "agent_version": "latest"
    }
  }'
```

### 8. Build Web UI

```bash
cd flagship
npm install
npm run build  # Production
# or
npm run dev    # Development with hot reload
```

Access the deployment interface at:
- **Deployments List**: `http://localhost/dashboard/deployments`
- **Create Deployment**: `http://localhost/dashboard/deployments/create`
- **View Deployment**: `http://localhost/dashboard/deployments/{id}`

---

## Summary of Fixes Applied

✅ **Issue #1**: Dynamic inventory bootstrap now uses absolute paths
✅ **Issue #2**: SSH key temporary files are tracked and cleaned up
✅ **Issue #3**: Agent binary URLs updated for Cloudflare R2
✅ **Issue #4**: Dashboard endpoint passed from Laravel via extra vars
✅ **Issue #5**: Queue configuration added with Supervisor example
✅ **Issue #6**: Deployment cancellation implemented with process tracking
✅ **Issue #7**: Reverb broadcasting setup fully documented
✅ **Issue #8**: Rollback and retry playbooks added
✅ **Issue #9**: Agent version management supported via extra vars
✅ **Issue #10**: React hooks corrected (useState → useEffect)
✅ **Auth middleware**: Added to all deployment routes
✅ **Migration instructions**: Comprehensive setup guide added
✅ **Queue worker**: Startup instructions with Supervisor config
✅ **Web routes**: Inertia page routes added

---

**End of Document**
