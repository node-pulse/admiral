# Secure PostgreSQL Database Access

## Overview

For security reasons, pgweb has been removed from production. This guide shows you how to securely connect to your PostgreSQL database using desktop clients.

## Method 1: SSH Tunnel (Recommended for Production)

### Step 1: Create SSH Tunnel

```bash
# Create tunnel: local port 5433 → remote PostgreSQL port 5432
ssh -L 5433:localhost:5432 user@your-production-server

# Keep this terminal open while you work
```

### Step 2: Connect Desktop Client

Use any PostgreSQL desktop client:

**Connection Settings:**

- **Host:** `localhost`
- **Port:** `5433` (your local tunnel port)
- **Database:** `node_pulse_admiral`
- **Username:** Your PostgreSQL username
- **Password:** Your PostgreSQL password

### Popular Desktop Clients:

2. **DBeaver** (Free, cross-platform)

   - Download: https://dbeaver.io/download/

3. **TablePlus** (Paid, macOS/Windows)

   - Download: https://tableplus.com/

4. **DataGrip** (Paid, JetBrains, free for personal use)

   - Download: https://www.jetbrains.com/datagrip/

5. **Postico** (Paid, macOS only)
   - Download: https://eggerapps.at/postico/

### Why SSH Tunnel is Secure:

✅ No database port exposed to internet
✅ Encrypted connection via SSH
✅ Uses existing SSH authentication
✅ No additional services needed

---

## Method 2: Direct Connection (Development Only)

For **local development** only, you can expose PostgreSQL port:

### Edit compose.yml

```yaml
postgres:
  image: postgres:18-alpine@sha256:...
  ports:
    - "5432:5432" # Add this line
```

### Connect Desktop Client

**Connection Settings:**

- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `node_pulse_admiral`
- **Username:** `postgres` (or from .env)
- **Password:** From your `.env` file

⚠️ **WARNING:** Never expose port 5432 in production!

---

## Method 3: Docker Exec (Quick Queries)

For quick queries without desktop client:

```bash
# Interactive psql session
docker exec -it node-pulse-postgres psql -U postgres -d node_pulse_admiral

# Single query
docker exec -it node-pulse-postgres psql -U postgres -d node_pulse_admiral \
  -c "SELECT * FROM backend.servers LIMIT 10;"

# Export query results to CSV
docker exec -it node-pulse-postgres psql -U postgres -d node_pulse_admiral \
  -c "COPY (SELECT * FROM backend.metrics WHERE created_at > NOW() - INTERVAL '1 day') TO STDOUT CSV HEADER" \
  > metrics.csv
```

---

## Method 4: SSH Config + Desktop Client (Advanced)

### Step 1: Add SSH Tunnel to ~/.ssh/config

```
Host nodepulse-db-tunnel
    HostName your-production-server
    User your-ssh-user
    LocalForward 5433 localhost:5432
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

### Step 2: Start Tunnel

```bash
ssh -N nodepulse-db-tunnel
# -N means "no remote command" (just tunnel)
```

### Step 3: Connect Desktop Client

Same as Method 1:

- Host: `localhost`
- Port: `5433`

---

## Database Schema Overview

Your database has 1 main schema:

1. **`admiral`** - All application data (servers, metrics, alerts, users, SSH sessions)

### Viewing All Schemas

```sql
-- List all schemas
SELECT schema_name FROM information_schema.schemata;

-- List tables in backend schema
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'backend';

-- View server data
SELECT * FROM backend.servers;

-- View recent metrics
SELECT * FROM backend.metrics
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

---

## Common Tasks

### View Active Servers

```sql
SELECT
  server_id,
  hostname,
  ip_address,
  last_seen,
  EXTRACT(EPOCH FROM (NOW() - last_seen))::int AS seconds_since_last_seen
FROM backend.servers
WHERE last_seen > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen DESC;
```

### Check Database Size

```sql
SELECT
  pg_size_pretty(pg_database_size('node_pulse_admiral')) AS database_size;

-- Size per schema
SELECT
  schema_name,
  pg_size_pretty(SUM(pg_total_relation_size(quote_ident(schema_name) || '.' || quote_ident(table_name)))::bigint) AS size
FROM information_schema.tables
WHERE table_schema = 'admiral'
GROUP BY schema_name;
```

### Export Backup

```bash
# Full database backup
docker exec node-pulse-postgres pg_dump -U postgres node_pulse_admiral \
  > nodepulse_backup_$(date +%Y%m%d_%H%M%S).sql

# Backup only backend schema
docker exec node-pulse-postgres pg_dump -U postgres -n backend node_pulse_admiral \
  > backend_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## Troubleshooting

### SSH Tunnel Connection Refused

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs node-pulse-postgres

# Verify SSH access
ssh user@your-production-server "docker ps"
```

### Desktop Client Can't Connect

1. **Check tunnel is active:** Look for the `ssh -L` process
2. **Verify port:** Make sure you're connecting to `localhost:5433` (not 5432)
3. **Check credentials:** Use the same credentials from your `.env` file
4. **Firewall:** Ensure local firewall allows port 5433

### Performance Issues

For production databases, consider:

- **Read replicas** for heavy queries
- **Connection pooling** (PgBouncer)
- **Query optimization** (use EXPLAIN ANALYZE)

---

## Security Best Practices

✅ **DO:**

- Use SSH tunnels for production access
- Rotate database passwords regularly
- Use read-only users for reporting
- Enable PostgreSQL SSL/TLS in production
- Audit database access logs

❌ **DON'T:**

- Expose PostgreSQL port 5432 to the internet
- Use web-based database tools in production
- Share database credentials
- Disable SSL/TLS connections
- Use default passwords

---

## Creating Read-Only User (Optional)

For safer querying, create a read-only user:

```sql
-- Create read-only user
CREATE USER readonly_user WITH PASSWORD 'strong_password_here';

-- Grant connect
GRANT CONNECT ON DATABASE node_pulse_admiral TO readonly_user;

-- Grant schema usage
GRANT USAGE ON SCHEMA backend TO readonly_user;

-- Grant select on all tables
GRANT SELECT ON ALL TABLES IN SCHEMA backend TO readonly_user;

-- Grant select on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA backend
GRANT SELECT ON TABLES TO readonly_user;
```

Then use these credentials in your desktop client for safer exploration.
