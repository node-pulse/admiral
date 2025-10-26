# Ansible Agent Deployment - Quick Start Guide

🚀 **Get your agent deployment system running in 5 minutes!**

---

## Prerequisites

- ✅ Admiral stack running (`docker compose up -d`)
- ✅ At least one server added to dashboard with SSH key configured
- ✅ Cloudflare R2 bucket created (or any S3-compatible storage)

---

## Step 1: Run the Migration (1 minute)

```bash
cd /Users/yumin/ventures/node-pulse-stack/admiral
docker compose exec postgres psql -U flagship -d flagship -f /migrations/20251025120000001_add_deployments_tables.sql
```

**Expected output:**
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
...
```

---

## Step 2: Upload Agent Binary to R2 (2 minutes)

### Option A: Using Web Console

1. Go to your Cloudflare R2 dashboard
2. Create a public bucket (or use existing)
3. Upload your agent binary:
   - Path: `latest/nodepulse-linux-amd64`
   - File: Your compiled agent binary

### Option B: Using rclone

```bash
# Configure rclone first (one-time setup)
rclone config

# Upload binary
rclone copy /path/to/nodepulse-linux-amd64 \
  r2:your-bucket/latest/nodepulse-linux-amd64
```

### Get Your R2 Public URL

Example: `https://pub-abc123xyz.r2.dev`

---

## Step 3: Configure Environment (30 seconds)

Add to `flagship/.env`:

```bash
# Cloudflare R2 Configuration
AGENT_DOWNLOAD_BASE_URL=https://pub-abc123xyz.r2.dev

# Queue (already configured in queue.php)
QUEUE_CONNECTION=database
```

**Restart containers:**

```bash
docker compose restart flagship
```

---

## Step 4: Start Queue Worker (30 seconds)

### Development (Terminal)

```bash
docker compose exec flagship php artisan queue:work \
  --queue=deployments --tries=1 --timeout=3600
```

Keep this terminal open.

### Production (Supervisor)

Create `/etc/supervisor/conf.d/flagship-queue.conf`:

```ini
[program:flagship-queue-deployments]
process_name=%(program_name)s_%(process_num)02d
command=docker compose -f /path/to/admiral/compose.yml exec flagship php artisan queue:work --queue=deployments --tries=1 --timeout=3600
autostart=true
autorestart=true
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/flagship-queue.log
stopwaitsecs=3600
```

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start flagship-queue-deployments:*
```

---

## Step 5: Test the System (1 minute)

### Test Inventory

```bash
docker compose exec flagship php artisan ansible:inventory
```

**Expected output:** JSON with your servers listed.

### Test in Browser

1. Navigate to: `http://localhost/dashboard/deployments` (or your domain)
2. Click **"New Deployment"**
3. You should see:
   - Your servers listed
   - Playbook dropdown
   - Agent version input

---

## Step 6: Create Your First Deployment (30 seconds)

1. **Name**: "Test Deployment"
2. **Playbook**: "Deploy Agent (New Installation)"
3. **Agent Version**: `latest`
4. **Select**: Check one server
5. Click **"Create Deployment"**

**Monitor progress:**
- Click on the deployment in the list
- Watch real-time status updates
- View Ansible output logs

---

## ✅ Success Checklist

After creating your first deployment, you should see:

- ✅ Deployment status changes: `pending` → `running` → `completed`
- ✅ Server status shows `success` with green checkmark
- ✅ Success rate: `100%`
- ✅ Ansible output logs appear in the "Deployment Output" section
- ✅ On the server: `systemctl status nodepulse` shows `active (running)`

---

## 🐛 Quick Troubleshooting

### Deployment Stuck at "Pending"

**Problem:** Queue worker not running

**Fix:**
```bash
# Check if queue worker is running
docker compose exec flagship php artisan queue:work --queue=deployments --timeout=3600
```

### "Failed to download agent binary"

**Problem:** R2 URL incorrect or binary missing

**Fix:**
```bash
# Test URL manually
curl https://pub-abc123xyz.r2.dev/latest/nodepulse-linux-amd64

# Should download the binary, not return 404
```

### "SSH connection failed"

**Problem:** SSH key not configured

**Fix:**
1. Go to **Dashboard → Servers → Your Server**
2. Attach an SSH key
3. Test: `docker compose exec flagship php artisan ansible:inventory`
4. Verify `ansible_ssh_private_key_file` is set for the server

---

## 🚀 Next Steps

### Deploy to Multiple Servers

1. Create a new deployment
2. Select multiple servers (use "Select All")
3. Click "Create Deployment"
4. Watch all servers deploy in parallel (up to 100 at once!)

### Use Different Playbooks

- **Update Agent**: Updates existing installations
- **Remove Agent**: Uninstalls the agent
- **Rollback Agent**: Reverts to previous version

### Monitor Deployments

- All deployments are saved with full logs
- Filter by status: pending, running, completed, failed
- Search by name
- View per-server status

---

## 📊 Production Deployment (1000+ Servers)

### Recommended Approach

1. **Test with 5 servers** first
2. **Test with 50 servers** next
3. **Deploy to 500 servers** in batches
4. **Full deployment to 1000+ servers**

### Performance Tips

- Ansible is configured for 100 parallel connections (adjustable in `ansible/ansible.cfg`)
- Queue worker timeout is 1 hour (adjust if needed)
- Monitor system resources during large deployments
- Use tags to group servers for selective deployments

---

## 📚 Full Documentation

- **Complete guide**: `ANSIBLE_IMPLEMENTATION.md`
- **Architecture details**: `docs/ansible-agent-deployment.md`
- **Ansible docs**: `ansible/README.md`

---

## 🎉 You're Ready!

You now have a fully functional agent deployment system. Start with a few servers and scale up to thousands!

**Questions?** Check the troubleshooting section in `ANSIBLE_IMPLEMENTATION.md` or review the playbook logs in the dashboard.
