# SSH Key Management Setup Guide

This guide explains how to set up and use the SSH key management feature in NodePulse Flagship dashboard.

## Overview

NodePulse Flagship uses a **Coolify-inspired** SSH key management system that allows you to:

- Generate or import SSH keys via the web interface
- Store keys securely with Rails encryption
- Connect to and manage remote servers via SSH
- Test SSH connections directly from the dashboard

## Prerequisites

1. Rails master key configured (see below)
2. PostgreSQL database running
3. Gems installed (`sshkey`, `net-ssh`)

## Initial Setup

### 1. Generate Rails Master Key

The Rails master key is used to encrypt SSH private keys in the database. You **must** generate and securely store this key.

> This step is taken care of by the `deploy.sh` script; you do not need to do it manually

```bash
cd flagship

# Generate master key (if not exists)
rails credentials:edit
# This creates config/master.key automatically
```

**IMPORTANT:** The `config/master.key` file is gitignored. You must back it up securely!

### 2. Add Master Key to Environment

Add the master key to your `.env` file in the project root:

```bash
# In admiral/.env
RAILS_MASTER_KEY=your_master_key_here
```

**How to get your master key:**

```bash
cd flagship
cat config/master.key
```

### 3. Run Database Migrations

The migrations are handled by the `migrate` service in Docker Compose, which uses SQL migration files in `migrate/migrations/`:

- `20251016211918_initial-schema.sql` - Updated with SSH fields on `servers` table
- `20251023010000_add_private_keys.sql` - New `private_keys` table

To run migrations:

```bash
# In admiral/ directory
docker compose up flagship-migrate
```

Or for a fresh database:

```bash
# Drop and recreate
docker compose down -v
docker compose up -d postgres
docker compose up flagship-migrate
```

This creates:

- `submarines.private_keys` table - Stores SSH keys (encrypted)
- SSH fields on `submarines.servers` table - Links servers to SSH keys

### 4. Start the Application

#### Development:

```bash
cd flagship
bin/rails server
```

#### Production (Docker):

```bash
cd ..  # Back to admiral/
docker compose up -d --build flagship
```

## Using SSH Key Management

### Add SSH Key (Generate)

1. Navigate to **Servers** → **SSH Keys** → **Add SSH Key**
2. Click **"Generate New Key"**
3. Fill in:
   - **Name**: e.g., "Production Servers"
   - **Description**: Optional notes
   - **Key Type**: Ed25519 (recommended) or RSA 4096
4. Click **"Generate SSH Key"**
5. **Copy the public key** shown on the next page
6. Add the public key to your target servers:

```bash
# On your remote server:
echo 'ssh-ed25519 AAAA...' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Add SSH Key (Import)

1. Navigate to **Servers** → **SSH Keys** → **Add SSH Key**
2. Click **"Import Existing Key"**
3. Fill in:
   - **Name**: e.g., "My Existing Key"
   - **Description**: Optional notes
   - **Private Key**: Paste your existing private key
4. Click **"Import SSH Key"**

### Add a Server with SSH Access

1. Navigate to **Servers** → **Add Server**
2. Fill in server information:
   - **Server Name**: Friendly name
   - **Hostname**: For agent identification
3. Configure SSH access:
   - **SSH Host**: IP address or domain
   - **SSH Port**: Default 22
   - **SSH Username**: Default root
   - **SSH Private Key**: Select from dropdown
4. Click **"Add Server"**

### Test SSH Connection

1. Navigate to a server's detail page
2. Click **"Test SSH Connection"** button
3. The system will:
   - Attempt to connect via SSH
   - Execute `whoami` to verify authentication
   - Update connection status
   - Show success/failure message

## Security Best Practices

### Master Key Protection

**DO:**

- ✅ Store `RAILS_MASTER_KEY` in your password manager (1Password, LastPass, etc.)
- ✅ Backup the key to a secure location
- ✅ Use environment variables in production
- ✅ Restrict access to `.env` file (chmod 600)

**DON'T:**

- ❌ Commit `config/master.key` to git (already gitignored)
- ❌ Share master key in Slack, email, or unencrypted channels
- ❌ Store master key in plain text on production servers
- ❌ Use the same master key across different environments

### SSH Key Best Practices

**DO:**

- ✅ Use Ed25519 keys (faster, more secure than RSA)
- ✅ Rotate keys periodically
- ✅ Delete unused keys from the dashboard
- ✅ Use different keys for different server groups (if needed)
- ✅ Restrict SSH to specific IP addresses (firewall level)

**DON'T:**

- ❌ Share SSH keys across multiple teams without proper access control
- ❌ Use weak SSH usernames (avoid default 'admin', 'ubuntu')
- ❌ Allow root SSH login (use sudo instead)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Flagship Rails App                                      │
│                                                          │
│ ┌────────────────────────────────────────────────────┐ │
│ │ config/master.key (from RAILS_MASTER_KEY env var) │ │
│ │ - AES-256 encryption key                          │ │
│ └────────────────────────────────────────────────────┘ │
│                   │                                      │
│                   │ (encrypts/decrypts)                  │
│                   ▼                                      │
│ ┌────────────────────────────────────────────────────┐ │
│ │ PostgreSQL Database                                │ │
│ │ submarines.private_keys table:                     │ │
│ │ - name                                             │ │
│ │ - private_key_content (ENCRYPTED)                  │ │
│ │ - public_key                                       │ │
│ │ - fingerprint                                      │ │
│ └────────────────────────────────────────────────────┘ │
│                   │                                      │
│                   │ (decrypted in memory)                │
│                   ▼                                      │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Net::SSH Client                                    │ │
│ │ - Connects to remote servers                       │ │
│ │ - Executes commands                                │ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────┘
                           │ SSH connection
                           │ (using decrypted private key)
                           ▼
                 ┌─────────────────────┐
                 │ Remote Linux Server │
                 │ ~/.ssh/authorized_  │
                 │ keys contains       │
                 │ PUBLIC key          │
                 └─────────────────────┘
```

## Troubleshooting

### Error: "Rails master key is missing"

**Solution:**

```bash
# Check if master key exists
cd flagship
cat config/master.key

# If missing, generate it:
rails credentials:edit

# Add to .env:
echo "RAILS_MASTER_KEY=$(cat config/master.key)" >> ../.env
```

### Error: "SSH connection failed: Authentication failed"

**Possible causes:**

1. Public key not added to remote server's `~/.ssh/authorized_keys`
2. Wrong SSH username
3. SSH key permissions issue on remote server

**Solution:**

```bash
# On remote server:
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# Verify public key is present:
cat ~/.ssh/authorized_keys | grep 'ssh-ed25519'
```

### Error: "Connection timeout"

**Possible causes:**

1. Wrong IP address or hostname
2. Firewall blocking port 22
3. SSH daemon not running

**Solution:**

```bash
# Check if SSH is running on remote server:
sudo systemctl status sshd

# Check firewall rules:
sudo ufw status

# Allow SSH:
sudo ufw allow 22/tcp
```

### Error: "Cannot delete key: key is in use"

**Solution:**

1. Go to the SSH key detail page
2. Check which servers are using the key
3. Either:
   - Delete those servers first, OR
   - Assign a different SSH key to those servers
4. Then delete the key

## Migration to Production Secret Manager (Future)

When ready to migrate to a production-grade secret manager (Vault, AWS Secrets Manager):

1. Export all SSH keys from database
2. Import keys into secret manager
3. Update `PrivateKey` model to fetch from secret manager instead of database
4. Update references to use secret manager IDs
5. Delete encrypted keys from database (keep metadata only)

Example migration path to HashiCorp Vault:

```ruby
# app/models/private_key.rb (future)
class PrivateKey < ApplicationRecord
  def ssh_private_key
    VaultClient.read("ssh_keys/#{id}")
  end
end
```

## Support

For issues or questions:

- Check logs: `docker compose logs flagship`
- Review this document
- Check CLAUDE.md for project architecture

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project architecture overview
- [Rails Encryption Guide](https://guides.rubyonrails.org/active_record_encryption.html)
- [Coolify SSH Keys](https://coolify.io/docs) - Inspiration for this implementation
