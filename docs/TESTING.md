# Testing Guide - Exposing Local Development to Internet

This guide explains how to test your NodePulse Dashboard locally with deployed agents by exposing your development environment to the internet.

## Prerequisites

- Docker Compose stack running locally (`compose.development.yml`)
- Agents deployed to remote servers
- Either Cloudflare account (recommended) or ngrok account

## Quick Start

### Option 1: Cloudflare Tunnel (Recommended)

**Advantages:**

- No rate limits
- Free tier is very generous
- Better performance for production-like testing
- Can use custom domains
- More stable connections

**Disadvantages:**

- Slightly more setup than ngrok
- Requires Cloudflare account

### Option 2: ngrok

**Advantages:**

- Extremely simple setup (1 command)
- Great for quick tests
- No account needed for basic usage

**Disadvantages:**

- Rate limits on free tier
- URL changes on restart (unless paid)
- 40 connections/minute limit on free tier

---

## Method 1: Cloudflare Tunnel (Recommended)

### Step 1: Install cloudflared

**macOS:**

```bash
brew install cloudflared
```

**Windows:**
Download from: https://github.com/cloudflare/cloudflared/releases

### Step 2: Authenticate

- go to cloudflare dashboard
- go to Zero Trust --> Networks --> Tunnels
- click `Create a tunnel`
- click `Select cloudflared`
- type `node-pulse-dev` for tunnel name
- copy or run the command
- or, you can install `cloudflared` first

  ```
    brew install cloudflared

  ```

- and then, install the service like the following

  ```bash
  sudo cloudflared service install xxxxx(token)

  # if it requires password, it's your computer's password
  ```

### Step 3: Start Your Services

```bash
# Start the development stack
docker compose -f compose.development.yml up -d

# Verify services are running
docker compose -f compose.development.yml ps
```

### Step 4: Configure Your Agents

Update your agent configuration on remote servers:

**`/etc/node-pulse/nodepulse.yml`:**

```yaml
server:
  endpoint: "https://nodepulse-dev.yourdomain.com/metrics"
  timeout: 3s

agent:
  server_id: "auto-generated-uuid"
  interval: 5s
```

Restart agents:

```bash
sudo systemctl restart node-pulse-agent
```

### Step 9: Verify Connection

Watch the logs to see metrics coming in:

```bash
# Watch Submarines ingest logs
docker compose -f compose.development.yml logs -f submarines-ingest

# Watch Submarines digest logs
docker compose -f compose.development.yml logs -f submarines-digest

# Check PostgreSQL for new metrics
docker compose -f compose.development.yml exec postgres psql -U nodepulse -d nodepulse -c "SELECT COUNT(*) FROM backend.metrics;"
```

### Managing Cloudflare Tunnel

**List tunnels:**

```bash
cloudflared tunnel list
```

**Stop tunnel:**

```bash
# If running in foreground: Ctrl+C
# If running in background: kill the process
pkill cloudflared
```

**Delete tunnel:**

```bash
cloudflared tunnel delete nodepulse-dev
```

---

## Method 2: ngrok (Quick Testing)

### Step 1: Install ngrok

**macOS:**

```bash
brew install ngrok
```

**Linux/Windows:**
Download from: https://ngrok.com/download

### Step 2: Sign Up (Optional but Recommended)

Visit https://dashboard.ngrok.com/signup and get your authtoken.

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### Step 3: Start Your Services

```bash
docker compose -f compose.development.yml up -d
```

### Step 4: Expose Port 80

```bash
ngrok http 80
```

You'll see output like:

```
Forwarding   https://abc123.ngrok.io -> http://localhost:80
```

### Step 5: Configure Your Agents

Update your agent configuration:

**`/etc/node-pulse/nodepulse.yml`:**

```yaml
server:
  endpoint: "https://abc123.ngrok.io/metrics"
  timeout: 3s

agent:
  server_id: "auto-generated-uuid"
  interval: 5s
```

Restart agents:

```bash
sudo systemctl restart node-pulse-agent
```

### Step 6: Monitor Traffic

ngrok provides a web interface at: http://127.0.0.1:4040

This shows:

- All HTTP requests
- Request/response headers
- Request/response bodies
- Timing information

### ngrok Limitations (Free Tier)

- **40 connections/minute** - May be insufficient for large fleets
- **Random URL** - Changes every restart (unless paid)
- **1 tunnel** - Can't expose multiple services simultaneously
- **Session timeout** - 8 hours maximum

---

## Troubleshooting

### Agents Can't Connect

1. **Check tunnel is running:**

   ```bash
   # Cloudflare
   cloudflared tunnel list

   # ngrok - visit http://127.0.0.1:4040
   ```

2. **Check local services:**

   ```bash
   docker compose -f compose.development.yml ps
   curl http://localhost/health
   ```

3. **Check DNS (Cloudflare only):**

   ```bash
   dig nodepulse-dev.yourdomain.com
   ```

4. **Check agent logs:**
   ```bash
   # On remote server
   sudo journalctl -u node-pulse-agent -f
   ```

### High Latency

- **Cloudflare:** Generally low latency, check your tunnel region
- **ngrok:** Free tier routes through US servers, paid tier offers regional endpoints

### Connection Drops

- **Cloudflare:** Very stable, check your internet connection
- **ngrok:** Free tier has 8-hour session limit, may need to reconnect

### Metrics Not Appearing

1. **Check ingest logs:**

   ```bash
   docker compose -f compose.development.yml logs submarines-ingest
   ```

2. **Check digest logs:**

   ```bash
   docker compose -f compose.development.yml logs submarines-digest
   ```

3. **Check Valkey stream:**

   ```bash
   docker compose -f compose.development.yml exec valkey valkey-cli
   > XLEN nodepulse:metrics:stream
   ```

4. **Check PostgreSQL:**
   ```bash
   docker compose -f compose.development.yml exec postgres psql -U nodepulse -d nodepulse
   nodepulse=# SELECT COUNT(*) FROM backend.metrics;
   nodepulse=# SELECT * FROM backend.servers;
   ```

---

## Production Deployment Considerations

⚠️ **Important:** These methods are for **testing only**. For production:

1. **Deploy to a real server** (VPS, cloud instance)
2. **Use proper DNS** with your domain
3. **Enable TLS** with valid certificates
4. **Implement authentication** (JWT for agents)
5. **Add rate limiting** at Caddy/nginx level
6. **Use production compose file** (`compose.yml`)
7. **Configure backups** for PostgreSQL
8. **Set up monitoring** for the dashboard itself
9. **Harden security** (firewall, fail2ban, etc.)

---

## Testing Checklist

- [ ] Local development stack is running
- [ ] Tunnel is active and accessible from internet
- [ ] Agent configuration updated with tunnel URL
- [ ] Agents restarted on remote servers
- [ ] Metrics appearing in Submarines ingest logs
- [ ] Metrics being processed by Submarines worker
- [ ] Data visible in PostgreSQL
- [ ] Flagship dashboard shows server data
- [ ] No errors in any service logs

---

## Example: Full Workflow with Cloudflare Tunnel

```bash
# 1. Start local stack
docker compose -f compose.development.yml up -d

# 2. Verify services
docker compose -f compose.development.yml ps

# 3. Start tunnel (assuming already configured)
cloudflared tunnel run nodepulse-dev

# 4. In another terminal, watch logs
docker compose -f compose.development.yml logs -f submarines-ingest submarines-digest

# 5. On remote server(s), update agent config
# Edit /etc/node-pulse/nodepulse.yml
sudo systemctl restart node-pulse-agent

# 6. Watch metrics flow in
# You should see POST /metrics requests in the logs

# 7. Check database
docker compose -f compose.development.yml exec postgres psql -U nodepulse -d nodepulse -c "SELECT * FROM backend.servers;"

# 8. Access Flagship dashboard
# Visit https://nodepulse-dev.yourdomain.com

# 9. When done, stop tunnel
pkill cloudflared

# 10. Stop local stack
docker compose -f compose.development.yml down
```

---

## Advanced: Multiple Services with Cloudflare Tunnel

If you want to expose multiple services separately:

**`~/.cloudflared/config.yml`:**

```yaml
tunnel: nodepulse-dev
credentials-file: /Users/YOUR_USERNAME/.cloudflared/TUNNEL_ID.json

ingress:
  # Submarines ingest (agent metrics)
  - hostname: ingest.nodepulse-dev.yourdomain.com
    service: http://localhost:8080

  # Flagship dashboard
  - hostname: dashboard.nodepulse-dev.yourdomain.com
    service: http://localhost:80

  # Main domain (via Caddy)
  - hostname: nodepulse-dev.yourdomain.com
    service: http://localhost:80

  - service: http_status:404
```

Create DNS records for each:

```bash
cloudflared tunnel route dns nodepulse-dev ingest.nodepulse-dev.yourdomain.com
cloudflared tunnel route dns nodepulse-dev dashboard.nodepulse-dev.yourdomain.com
cloudflared tunnel route dns nodepulse-dev app.nodepulse-dev.yourdomain.com
cloudflared tunnel route dns nodepulse-dev nodepulse-dev.yourdomain.com
```

---

## Resources

- **Cloudflare Tunnel Docs:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **ngrok Docs:** https://ngrok.com/docs
- **NodePulse Agent Repo:** `../agent/`
- **Docker Compose Reference:** https://docs.docker.com/compose/
