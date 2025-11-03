# NodePulse Agent - Uninstallation Guide

This guide covers how to uninstall the NodePulse agent from your servers, both manually and using Ansible.

## Table of Contents

- [Automated Uninstall (Ansible)](#automated-uninstall-ansible)
- [Manual Uninstall](#manual-uninstall)
- [Installed Files Reference](#installed-files-reference)
- [Partial Uninstall Options](#partial-uninstall-options)

---

## Automated Uninstall (Ansible)

The recommended way to uninstall agents from multiple servers.

### Complete Uninstall

Removes all agent files, configuration, and data:

```bash
cd flagship/ansible
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml
```

### Uninstall from Specific Host

```bash
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml --limit web-01
```

### Dry Run (Check Mode)

Preview what will be removed without actually removing anything:

```bash
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml --check
```

### Preserve Configuration

Keep configuration and server_id for future reinstallation:

```bash
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml -e "keep_config=true"
```

### Preserve Logs

Keep log files while removing everything else:

```bash
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml -e "keep_logs=true"
```

### Preserve Both Config and Logs

```bash
ansible-playbook -i inventory.yml playbooks/uninstall-agent.yml -e "keep_config=true keep_logs=true"
```

---

## Manual Uninstall

If Ansible is not available, use these manual steps on each server.

### Complete Uninstall Script

Copy and paste this script to completely remove the agent:

```bash
#!/bin/bash
# NodePulse Agent - Complete Uninstall Script

echo "Stopping NodePulse agent..."

# Stop and disable systemd service
sudo systemctl stop node-pulse 2>/dev/null
sudo systemctl disable node-pulse 2>/dev/null

# Stop and disable auto-updater timer
sudo systemctl stop node-pulse-updater.timer 2>/dev/null
sudo systemctl disable node-pulse-updater.timer 2>/dev/null

# Stop daemon mode (if running)
if [ -f /tmp/nodepulse.pid ]; then
    sudo kill $(cat /tmp/nodepulse.pid) 2>/dev/null
    sudo rm -f /tmp/nodepulse.pid
fi

echo "Removing systemd units..."

# Remove systemd service files
sudo rm -f /etc/systemd/system/node-pulse.service
sudo rm -f /etc/systemd/system/node-pulse-updater.service
sudo rm -f /etc/systemd/system/node-pulse-updater.timer

# Reload systemd
sudo systemctl daemon-reload

echo "Removing agent files..."

# Remove binary
sudo rm -f /usr/local/bin/pulse

# Remove configuration
sudo rm -rf /etc/node-pulse

# Remove data and buffer
sudo rm -rf /var/lib/node-pulse

# Remove logs
sudo rm -rf /var/log/node-pulse

echo "NodePulse agent completely uninstalled!"
```

### Step-by-Step Manual Uninstall

If you prefer manual commands:

#### 1. Stop the Agent

```bash
# If using systemd service
sudo systemctl stop node-pulse

# If using daemon mode
sudo pulse stop
# OR
sudo kill $(cat /tmp/nodepulse.pid)
```

#### 2. Disable and Remove Systemd Units

```bash
# Disable services
sudo systemctl disable node-pulse
sudo systemctl disable node-pulse-updater.timer

# Stop updater timer
sudo systemctl stop node-pulse-updater.timer

# Remove service files
sudo rm -f /etc/systemd/system/node-pulse.service
sudo rm -f /etc/systemd/system/node-pulse-updater.service
sudo rm -f /etc/systemd/system/node-pulse-updater.timer

# Reload systemd
sudo systemctl daemon-reload
```

#### 3. Remove Agent Files

```bash
# Remove binary
sudo rm -f /usr/local/bin/pulse

# Remove configuration
sudo rm -rf /etc/node-pulse

# Remove data and buffer
sudo rm -rf /var/lib/node-pulse

# Remove logs (optional)
sudo rm -rf /var/log/node-pulse

# Remove PID file (if exists)
sudo rm -f /tmp/nodepulse.pid
```

#### 4. Verify Removal

```bash
# Check binary
which pulse
# Should output: pulse not found

# Check systemd service
systemctl status node-pulse
# Should output: Unit node-pulse.service could not be found

# Check files
ls -la /etc/node-pulse
ls -la /var/lib/node-pulse
# Should output: No such file or directory
```

---

## Installed Files Reference

The following files and directories are created by the agent installation:

### Binary
- `/usr/local/bin/pulse` - Main executable

### Configuration
- `/etc/node-pulse/` - Configuration directory
  - `/etc/node-pulse/nodepulse.yml` - Configuration file

### Data/State
- `/var/lib/node-pulse/` - Data directory
  - `/var/lib/node-pulse/server_id` - Persisted server UUID
  - `/var/lib/node-pulse/buffer/` - Failed metrics buffer
    - `/var/lib/node-pulse/buffer/*.jsonl` - Buffer files

### Logs (Optional)
- `/var/log/node-pulse/` - Log directory
  - `/var/log/node-pulse/agent.log` - Current log
  - `/var/log/node-pulse/agent.log.*.gz` - Rotated logs

### Runtime
- `/tmp/nodepulse.pid` - PID file (daemon mode only)

### Systemd Units
- `/etc/systemd/system/node-pulse.service` - Main service
- `/etc/systemd/system/node-pulse-updater.service` - Updater service
- `/etc/systemd/system/node-pulse-updater.timer` - Updater timer

---

## Partial Uninstall Options

### Keep Configuration for Reinstall

Useful if you plan to reinstall later with the same server_id:

```bash
# Stop and remove service
sudo systemctl stop node-pulse
sudo systemctl disable node-pulse
sudo rm -f /etc/systemd/system/node-pulse.service
sudo rm -f /etc/systemd/system/node-pulse-updater.{service,timer}
sudo systemctl daemon-reload

# Remove binary only
sudo rm -f /usr/local/bin/pulse

# Keep: /etc/node-pulse and /var/lib/node-pulse
```

When you reinstall, the agent will reuse the existing `server_id` from `/var/lib/node-pulse/server_id`.

### Remove Service but Keep Agent Binary

Switch from systemd service to daemon mode:

```bash
# Uninstall service only
sudo pulse service uninstall

# Agent binary remains at /usr/local/bin/pulse
# You can now use: pulse start -d
```

### Clean Buffer but Keep Agent

Free up disk space by clearing failed metrics buffer:

```bash
# Remove buffer files
sudo rm -rf /var/lib/node-pulse/buffer/*

# Agent and config remain intact
```

---

## Troubleshooting

### "Service still running after uninstall"

If the service appears to still be running:

```bash
# Force kill the process
sudo pkill -9 pulse

# Ensure systemd units are removed
sudo rm -f /etc/systemd/system/node-pulse*
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

### "Permission denied" errors

Ensure you're using `sudo`:

```bash
# All removal commands require root
sudo rm -rf /etc/node-pulse
sudo rm -rf /var/lib/node-pulse
```

### Verify complete removal

```bash
# Check for any remaining pulse processes
ps aux | grep pulse

# Check for any remaining files
sudo find / -name "*pulse*" -o -name "*nodepulse*" 2>/dev/null
```

---

## Reinstallation After Uninstall

### Complete Reinstall (New Server ID)

```bash
# Download and install
curl -fsSL https://get.nodepulse.sh | sudo bash

# Setup with new configuration
sudo pulse setup

# Install and start service
sudo pulse service install
sudo pulse service start
```

### Reinstall with Same Server ID

If you preserved `/var/lib/node-pulse/server_id`:

```bash
# Download and install
curl -fsSL https://get.nodepulse.sh | sudo bash

# Copy config back (if you backed it up)
sudo cp /path/to/backup/nodepulse.yml /etc/node-pulse/

# Install and start service
sudo pulse service install
sudo pulse service start

# Verify it's using the same server_id
pulse status
```

---

## See Also

- [Agent Installation Documentation](../../agent/INSTALLATION.md) - Full installation details
- [Ansible Deployment Guide](ansible-deployment.md) - Automated deployment
- [Agent README](../../agent/README.md) - Usage and configuration
