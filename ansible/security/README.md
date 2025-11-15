# Security Playbooks

This directory contains Ansible playbooks for hardening and securing Linux servers.

## Available Playbooks

### 1. SSH Hardening (`harden-ssh.yml`)

Hardens SSH configuration with security best practices.

**Features:**
- ✅ Disable password authentication (key-only access)
- ✅ Disable root login
- ✅ Change SSH port (configurable)
- ✅ Set SSH Protocol 2 only
- ✅ Configure connection timeouts
- ✅ Disable X11 forwarding
- ✅ Automatic configuration backup
- ✅ Pre-flight SSH key verification (prevents lockout)
- ✅ Configuration syntax validation before applying

**Supported Distributions:**
- Ubuntu 20.04+, 22.04+, 24.04+
- Debian 11+, 12+
- CentOS 7+, 8+
- RHEL 8+, 9+
- Rocky Linux 8+, 9+
- AlmaLinux 8+, 9+
- Oracle Linux 8+, 9+
- Amazon Linux 2, 2023

**Usage:**

```bash
# Default settings (port 22, disable password auth)
ansible-playbook -i inventory.yml harden-ssh.yml

# Change SSH port to 2222
ansible-playbook -i inventory.yml harden-ssh.yml -e "ssh_port=2222"

# Keep password authentication enabled (not recommended)
ansible-playbook -i inventory.yml harden-ssh.yml -e "disable_password_auth=false"

# Disable root login (if you have a non-root user with sudo)
ansible-playbook -i inventory.yml harden-ssh.yml -e "disable_root_login=true"
```

**⚠️ Important:**
- Ensure you have SSH key-based access configured before running!
- If changing SSH port, update your firewall rules accordingly
- Test SSH connection in a new terminal before closing current session
- Backup is saved to `/root/ssh-backups/`

**Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ssh_port` | `22` | SSH port to use |
| `disable_password_auth` | `true` | Disable password authentication |
| `disable_root_login` | `false` | Disable root login (disabled by default since many users connect as root) |
| `max_auth_tries` | `3` | Maximum authentication attempts |
| `login_grace_time` | `60` | Time allowed for authentication (seconds) |
| `client_alive_interval` | `300` | Send keepalive every N seconds |
| `client_alive_count_max` | `2` | Disconnect after N missed keepalives |

---

### 2. Firewall Configuration (`configure-firewall.yml`)

Configures firewall (UFW on Debian/Ubuntu, firewalld on RHEL-based systems).

**Features:**
- ✅ Auto-detects OS and installs appropriate firewall (UFW or firewalld)
- ✅ Configurable SSH, HTTP, HTTPS ports
- ✅ Support for custom TCP/UDP ports
- ✅ Logging of denied connections
- ✅ Default deny incoming, allow outgoing policy
- ✅ Optional firewall disable mode (via firewall_enabled flag)
- ✅ Real-time status verification and reporting

**Supported Distributions:**
- Ubuntu 20.04+, 22.04+, 24.04+ (uses UFW)
- Debian 11+, 12+ (uses UFW)
- CentOS 7+, 8+ (uses firewalld)
- RHEL 8+, 9+ (uses firewalld)
- Rocky Linux 8+, 9+ (uses firewalld)
- AlmaLinux 8+, 9+ (uses firewalld)
- Oracle Linux 8+, 9+ (uses firewalld)
- Amazon Linux 2, 2023 (uses firewalld)

**Usage:**

```bash
# Default settings (SSH port 22, HTTP, HTTPS)
ansible-playbook -i inventory.yml configure-firewall.yml

# Custom SSH port
ansible-playbook -i inventory.yml configure-firewall.yml -e "ssh_port=2222"

# Disable HTTP/HTTPS
ansible-playbook -i inventory.yml configure-firewall.yml -e "allow_http=false allow_https=false"

# Add custom ports
ansible-playbook -i inventory.yml configure-firewall.yml -e "custom_tcp_ports=[3000,8080,9000]"

# Add custom UDP ports
ansible-playbook -i inventory.yml configure-firewall.yml -e "custom_udp_ports=[5353,1194]"

# Disable logging
ansible-playbook -i inventory.yml configure-firewall.yml -e "enable_logging=false"

# Disable firewall (for testing or special cases)
ansible-playbook -i inventory.yml configure-firewall.yml -e "firewall_enabled=false"
```

**⚠️ Important:**
- Ensure SSH port matches your SSH configuration to avoid lockout!
- Test SSH connection in a new terminal before closing current session
- If locked out, use console/KVM access to disable firewall
- The playbook verifies SSH key access before disabling password authentication

**Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ssh_port` | `22` | SSH port to allow |
| `allow_http` | `true` | Allow HTTP (port 80) |
| `allow_https` | `true` | Allow HTTPS (port 443) |
| `custom_tcp_ports` | `[]` | List of custom TCP ports to allow |
| `custom_udp_ports` | `[]` | List of custom UDP ports to allow |
| `enable_logging` | `true` | Log denied connections |
| `log_level` | `low` | UFW log level (off, low, medium, high, full) |
| `firewall_enabled` | `true` | Enable firewall after configuration |

---

## Recommended Deployment Order

For a comprehensive security hardening, run playbooks in this order:

1. **Firewall Configuration** - Set up firewall first
2. **SSH Hardening** - Then harden SSH (ensure firewall allows SSH port!)
3. **fail2ban** - Finally install fail2ban (available as community playbook)

### Example Complete Hardening

```bash
# Step 1: Configure firewall with custom SSH port
ansible-playbook -i inventory.yml configure-firewall.yml -e "ssh_port=2222"

# Step 2: Harden SSH with same custom port
ansible-playbook -i inventory.yml harden-ssh.yml -e "ssh_port=2222"

# Step 3: Install fail2ban from community playbooks
# (Available in Admiral dashboard under Community Playbooks)
```

---

## Testing

Before deploying to production servers, test on a disposable VM:

```bash
# Test on a single test server
ansible-playbook -i inventory.yml harden-ssh.yml --limit test-server

# Dry-run mode (check only, no changes)
ansible-playbook -i inventory.yml harden-ssh.yml --check

# Verbose output for debugging
ansible-playbook -i inventory.yml harden-ssh.yml -vvv
```

---

## Recovery from Lockout

If you lock yourself out:

### SSH Lockout Recovery

1. Access server via console/KVM
2. Restore backup configuration:
   ```bash
   sudo cp /root/ssh-backups/sshd_config.*.bak /etc/ssh/sshd_config
   sudo systemctl restart sshd  # or 'ssh' on Ubuntu/Debian
   ```

### Firewall Lockout Recovery

1. Access server via console/KVM
2. Disable firewall:
   ```bash
   # Ubuntu/Debian (UFW)
   sudo ufw disable

   # RHEL/CentOS/Rocky/Alma/Oracle (firewalld)
   sudo systemctl stop firewalld
   sudo systemctl disable firewalld
   ```

---

## Additional Security Recommendations

After running these playbooks, consider:

1. **fail2ban** - Install from community playbooks to block brute-force attacks
2. **Automatic Updates** - Enable unattended-upgrades (Ubuntu/Debian) or dnf-automatic (RHEL)
3. **SELinux/AppArmor** - Ensure mandatory access control is enabled
4. **Audit Logging** - Enable auditd for security event logging
5. **Two-Factor Authentication** - Configure 2FA for SSH (Google Authenticator)

---

## Support

For issues or questions:
- Check playbook output for error messages
- Review `/var/log/auth.log` (Debian) or `/var/log/secure` (RHEL) for SSH issues
- Verify firewall rules with `ufw status verbose` or `firewall-cmd --list-all`
- Ensure you have console/KVM access before making security changes

---

**Last Updated:** November 14, 2025
