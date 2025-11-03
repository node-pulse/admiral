# Node Pulse Security Hardening Plan

**Date:** 2025-10-27
**Status:** Planning / Future Implementation

---

## Overview

Security hardening for Node Pulse deployment involves multiple layers:
1. **Firewall rules** - Block unauthorized access
2. **SSH hardening** - Secure remote access
3. **Fail2ban** - Intrusion prevention
4. **Security monitoring** - Detect and respond to threats

---

## 1. Firewall Hardening (UFW/iptables)

### Port 9100 (node_exporter) - CRITICAL SECURITY ISSUE

**Problem:** node_exporter exposes metrics on port 9100, which contains sensitive system information.

**Solution:** Block external access, allow only localhost

#### Using UFW (Ubuntu/Debian - Recommended)

```bash
# Allow only localhost to access port 9100
sudo ufw deny 9100/tcp
# UFW by default allows localhost, so no explicit allow needed

# Verify
sudo ufw status numbered
```

#### Using iptables (All Linux)

```bash
# Drop all external connections to port 9100
sudo iptables -A INPUT -p tcp --dport 9100 ! -s 127.0.0.1 -j DROP

# Save rules
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### Ansible Implementation

**File:** `flagship/ansible/roles/node-exporter/tasks/firewall.yml`

```yaml
---
- name: Install UFW if not present
  apt:
    name: ufw
    state: present
    update_cache: yes
  when: ansible_facts.os_family == "Debian"

- name: Enable UFW
  ufw:
    state: enabled
    policy: deny

- name: Allow SSH (before enabling UFW)
  ufw:
    rule: allow
    port: '22'
    proto: tcp

- name: Block external access to node_exporter port 9100
  ufw:
    rule: deny
    port: '9100'
    proto: tcp
    comment: "Block external access to node_exporter"

- name: Verify UFW status
  command: ufw status
  register: ufw_status
  changed_when: false

- name: Display UFW status
  debug:
    var: ufw_status.stdout_lines
```

**Include in main.yml:**

```yaml
- name: Configure firewall
  import_tasks: firewall.yml
  tags: firewall
```

---

## 2. SSH Hardening

### Goals
- Disable root login
- Disable password authentication (key-only)
- Change default SSH port (optional)
- Rate limiting
- Restrict SSH users

### Ansible Implementation

**File:** `flagship/ansible/roles/ssh-hardening/tasks/main.yml`

```yaml
---
- name: Backup original sshd_config
  copy:
    src: /etc/ssh/sshd_config
    dest: /etc/ssh/sshd_config.backup
    remote_src: yes
    mode: '0600'
  when: not ansible_check_mode

- name: Disable root login
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?PermitRootLogin'
    line: 'PermitRootLogin no'
    state: present
  notify: restart ssh

- name: Disable password authentication
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?PasswordAuthentication'
    line: 'PasswordAuthentication no'
    state: present
  notify: restart ssh

- name: Enable public key authentication
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?PubkeyAuthentication'
    line: 'PubkeyAuthentication yes'
    state: present
  notify: restart ssh

- name: Disable empty passwords
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?PermitEmptyPasswords'
    line: 'PermitEmptyPasswords no'
    state: present
  notify: restart ssh

- name: Set SSH login grace time
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?LoginGraceTime'
    line: 'LoginGraceTime 30'
    state: present
  notify: restart ssh

- name: Set max authentication tries
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: '^#?MaxAuthTries'
    line: 'MaxAuthTries 3'
    state: present
  notify: restart ssh

- name: Restrict SSH to specific users (optional)
  lineinfile:
    path: /etc/ssh/sshd_config
    line: 'AllowUsers {{ ssh_allowed_users | join(" ") }}'
    state: present
  when: ssh_allowed_users is defined
  notify: restart ssh

- name: Validate SSH config
  command: sshd -t
  changed_when: false
  check_mode: no
```

**File:** `flagship/ansible/roles/ssh-hardening/handlers/main.yml`

```yaml
---
- name: restart ssh
  service:
    name: ssh
    state: restarted
```

**File:** `flagship/ansible/roles/ssh-hardening/defaults/main.yml`

```yaml
---
# List of users allowed to SSH (optional)
# ssh_allowed_users:
#   - deploy
#   - admin
```

---

## 3. Fail2ban - Intrusion Prevention

### Goals
- Detect and ban brute-force SSH attempts
- Detect repeated failed authentication attempts
- Protect against port scanning

### Ansible Implementation

**File:** `flagship/ansible/roles/fail2ban/tasks/main.yml`

```yaml
---
- name: Install fail2ban
  apt:
    name: fail2ban
    state: present
    update_cache: yes
  when: ansible_facts.os_family == "Debian"

- name: Create fail2ban local jail configuration
  template:
    src: jail.local.j2
    dest: /etc/fail2ban/jail.local
    mode: '0644'
  notify: restart fail2ban

- name: Enable and start fail2ban service
  service:
    name: fail2ban
    state: started
    enabled: yes

- name: Check fail2ban status
  command: fail2ban-client status
  register: fail2ban_status
  changed_when: false

- name: Display fail2ban status
  debug:
    var: fail2ban_status.stdout_lines
```

**File:** `flagship/ansible/roles/fail2ban/templates/jail.local.j2`

```ini
[DEFAULT]
# Ban duration (default: 10 minutes)
bantime = 600

# Find time window (default: 10 minutes)
findtime = 600

# Max retry attempts before ban
maxretry = 5

# Ban action (use iptables to block)
banaction = iptables-multiport

# Email notification (optional)
{% if fail2ban_email is defined %}
destemail = {{ fail2ban_email }}
sendername = Fail2ban
action = %(action_mwl)s
{% else %}
action = %(action_)s
{% endif %}

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[sshd-ddos]
enabled = true
port = ssh
filter = sshd-ddos
logpath = /var/log/auth.log
maxretry = 2
bantime = 600
```

**File:** `flagship/ansible/roles/fail2ban/handlers/main.yml`

```yaml
---
- name: restart fail2ban
  service:
    name: fail2ban
    state: restarted
```

**File:** `flagship/ansible/roles/fail2ban/defaults/main.yml`

```yaml
---
# Optional: Email for fail2ban notifications
# fail2ban_email: admin@example.com
```

---

## 4. Security Monitoring Agent

### Question: Do We Need a Security Agent?

**Short answer:** For basic fleet monitoring, **no dedicated security agent** is needed initially. Use system logs + Fail2ban + Prometheus exporters.

**Long answer:**

#### Option A: No Dedicated Agent (Recommended for MVP)

**Use existing tools:**
1. **System logs** - `/var/log/auth.log`, `/var/log/syslog`
2. **Fail2ban** - Intrusion detection and banning
3. **Prometheus node_exporter** - Already collects system metrics
4. **Auditd** - Linux kernel auditing (optional)

**Advantages:**
- No additional overhead
- Standard Linux tools
- Integrates with existing Node Pulse metrics

**Disadvantages:**
- No centralized security dashboard
- Manual log analysis required

#### Option B: Lightweight Security Agent (Future Enhancement)

**Options:**
1. **OSSEC / Wazuh** - Open-source HIDS (Host-based Intrusion Detection)
2. **Osquery** - SQL-based system introspection
3. **Falco** - Cloud-native runtime security

**Recommendation: Osquery**
- Lightweight (< 100 MB RAM)
- SQL-based queries for security events
- Active community
- No kernel modules required

#### Option C: Custom Security Module in Node Pulse Agent

**Collect security events:**
- Failed SSH attempts (`/var/log/auth.log`)
- Sudo usage
- New user/group creation
- Firewall rule changes
- Package installations/updates
- File integrity checks (critical system files)

**Implementation:**
- Add `internal/security/` module to agent
- Parse auth logs for failed logins
- Send security events to Submarines (separate endpoint)
- Store in `admiral.security_events` table
- Alert on threshold violations

---

## 5. Recommended Approach (Phased)

### Phase 1: Essential Hardening (Week 1)
1. ✅ Block external access to port 9100 (node_exporter)
2. ✅ SSH hardening (disable root, password auth)
3. ✅ Install and configure Fail2ban
4. ✅ Firewall rules (UFW)

### Phase 2: Monitoring (Week 2-3)
1. Add security metrics to Prometheus
   - Failed SSH attempts count
   - Fail2ban ban count
   - Sudo usage count
2. Create Grafana dashboards for security events
3. Alert on security thresholds

### Phase 3: Advanced Security (Future)
1. File integrity monitoring (AIDE or custom)
2. Osquery for deep system inspection
3. Centralized log aggregation (Loki or ELK)
4. Custom security agent in Node Pulse

---

## 6. Ansible Playbook Structure

### New Roles

```
flagship/ansible/roles/
├── common/
│   └── tasks/
│       └── prerequisite.yml
├── node-exporter/
│   ├── tasks/
│   │   ├── main.yml
│   │   ├── download.yml
│   │   ├── install.yml
│   │   ├── configure.yml
│   │   ├── firewall.yml  # NEW
│   │   └── verify.yml
│   ├── templates/
│   │   └── node_exporter.service.j2
│   └── defaults/
│       └── main.yml
├── ssh-hardening/       # NEW ROLE
│   ├── tasks/
│   │   └── main.yml
│   ├── handlers/
│   │   └── main.yml
│   └── defaults/
│       └── main.yml
├── fail2ban/            # NEW ROLE
│   ├── tasks/
│   │   └── main.yml
│   ├── templates/
│   │   └── jail.local.j2
│   ├── handlers/
│   │   └── main.yml
│   └── defaults/
│       └── main.yml
└── firewall/            # NEW ROLE
    ├── tasks/
    │   └── main.yml
    └── defaults/
        └── main.yml
```

### Master Playbook

**File:** `flagship/ansible/playbooks/nodepulse/harden-servers.yml`

```yaml
---
- name: Harden Node Pulse monitored servers
  hosts: all
  become: yes
  vars_prompt:
    - name: confirm_hardening
      prompt: "This will modify SSH and firewall settings. Continue? (yes/no)"
      private: no

  tasks:
    - name: Verify confirmation
      fail:
        msg: "Hardening cancelled by user"
      when: confirm_hardening != "yes"

  roles:
    - role: firewall
      tags: firewall

    - role: ssh-hardening
      tags: ssh

    - role: fail2ban
      tags: fail2ban

  post_tasks:
    - name: Display security hardening summary
      debug:
        msg:
          - "Security hardening completed successfully!"
          - "Changes applied:"
          - "  - Firewall: UFW enabled, port 9100 blocked externally"
          - "  - SSH: Root login disabled, password auth disabled"
          - "  - Fail2ban: Installed and monitoring SSH"
          - ""
          - "IMPORTANT: Ensure you have SSH key access before logging out!"
```

---

## 7. Security Checklist

### Server Hardening
- [ ] UFW firewall enabled
- [ ] Port 9100 blocked externally (node_exporter)
- [ ] SSH root login disabled
- [ ] SSH password authentication disabled
- [ ] SSH key-only authentication enforced
- [ ] Fail2ban installed and monitoring SSH
- [ ] Automatic security updates enabled

### Application Security
- [ ] Node Pulse Agent runs as non-root user
- [ ] Agent binary permissions: 0755, owned by root
- [ ] Config file permissions: 0600, owned by pulse user
- [ ] Buffer directory permissions: 0700, owned by pulse user
- [ ] Log file permissions: 0640, readable by pulse user

### Network Security
- [ ] Only required ports open (22 SSH, optionally 80/443 for web)
- [ ] Port 9100 accessible only from localhost
- [ ] Submarines Ingest uses HTTPS (not HTTP)
- [ ] Agent validates server TLS certificate

### Monitoring
- [ ] Failed SSH attempts tracked
- [ ] Fail2ban bans logged
- [ ] Security metrics collected by Prometheus
- [ ] Alerts configured for security events

---

## 8. Security Incident Response

### If server is compromised:

1. **Isolate server**
   ```bash
   # Block all incoming traffic
   sudo ufw default deny incoming

   # Block outgoing traffic (except DNS/updates)
   sudo ufw default deny outgoing
   sudo ufw allow out 53
   sudo ufw allow out 80,443
   ```

2. **Check for intrusions**
   ```bash
   # Recent SSH logins
   last -n 20

   # Failed SSH attempts
   grep "Failed password" /var/log/auth.log | tail -20

   # Sudo usage
   grep sudo /var/log/auth.log | tail -20

   # Running processes
   ps aux | grep -v "\[" | sort -k3 -rn | head -20
   ```

3. **Review Fail2ban logs**
   ```bash
   sudo fail2ban-client status sshd
   sudo tail -100 /var/log/fail2ban.log
   ```

4. **Take snapshot** (if VM) or create backup

5. **Notify team** via Slack/Email

6. **Investigate and remediate**

---

## Summary

**Essential security measures for Node Pulse:**

1. **Firewall** - Block port 9100 externally (CRITICAL)
2. **SSH hardening** - Key-only auth, no root login
3. **Fail2ban** - Auto-ban brute-force attempts
4. **Regular updates** - Automated security patches

**For Phase 1 (MVP):** Focus on #1-3 above. No dedicated security agent needed yet.

**Future phases:** Consider Osquery or custom security module for advanced monitoring.

**Implementation:** Use Ansible roles for reproducible, automated hardening across entire fleet.
