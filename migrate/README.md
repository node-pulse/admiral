# Database Migrations

This directory contains PostgreSQL database migrations for the NodePulse Admiral project using [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

## Overview

We use **node-pg-migrate** to manage database schema changes. Migrations are written in **SQL** format for simplicity and clarity.

## Migration Tool: node-pg-migrate

### Why node-pg-migrate?

- **SQL-native**: Write migrations in plain SQL instead of learning a programmatic API
- **Single-file design**: Both up and down migrations in one file
- **Simple parsing**: Uses SQL comments as separators - elegant and readable
- **Git-friendly**: Easy to review both forward and rollback logic in the same diff
- **PostgreSQL-specific**: Designed specifically for PostgreSQL, not a generic ORM tool

### SQL Migration Format

node-pg-migrate uses a **comment-based separator** to divide up and down migrations in a single SQL file:

```sql
-- Up Migration
-- Add new features, columns, tables, etc.

CREATE TABLE example (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);


-- Down Migration
-- Rollback changes (reverse of up migration)

DROP TABLE example;
```

#### How It Works

The library parses SQL files using these regex patterns:

```regex
/^\s*--\s*up\s+migration/im
/^\s*--\s*down\s+migration/im
```

This means:
- Everything **before** `-- Down Migration` comment = **up migration**
- Everything **after** `-- Down Migration` comment = **down migration**

The regex is **case-insensitive** and allows **flexible whitespace**, so these all work:
- `-- Up Migration` ✅
- `-- up migration` ✅
- `-- DOWN MIGRATION` ✅
- `--up migration` ✅
- `--   Up   Migration` ✅

## Directory Structure

```
migrate/
├── migrations/           # Migration SQL files
│   ├── 20251016211918_initial-schema.sql
│   └── 20251021000001_add_disk_and_processes.sql
├── migrations.json       # node-pg-migrate configuration
├── package.json          # Dependencies and scripts
├── Dockerfile           # Container for running migrations
└── README.md            # This file
```

## Configuration

The migration configuration is in `migrations.json`:

```json
{
  "database-url": "DATABASE_URL",
  "migrations-dir": "migrations",
  "migrations-table": "pgmigrations",
  "migrations-schema": "public",
  "create-schema": true,
  "check-order": true,
  "verbose": true,
  "migration-filename-format": "utc",
  "migration-file-language": "sql"
}
```

Key settings:
- `migration-file-language: "sql"` - Use SQL files instead of JavaScript/TypeScript
- `migrations-table: "pgmigrations"` - Tracks which migrations have been run
- `check-order: true` - Ensures migrations run in the correct order

## Running Migrations

### Using npm scripts (local development)

```bash
cd migrate

# Run all pending migrations
npm run migrate:up

# Rollback the last migration
npm run migrate:down

# Check migration status (dry run)
npm run migrate:status
```

### Using Docker Compose

The recommended way to run migrations in the project:

```bash
# From project root
docker compose run --rm migrate
```

This uses the `migrate` service defined in `compose.yml`, which automatically:
- Connects to the PostgreSQL database
- Runs all pending migrations
- Exits when complete

### Manual execution with Docker

```bash
docker compose run --rm migrate \
  npx node-pg-migrate up --config-file migrations.json
```

## Creating New Migrations

### 1. Generate a new migration file

```bash
cd migrate
npm run create my-migration-name
```

This creates a timestamped file like: `migrations/20251021123456_my-migration-name.sql`

### 2. Write your SQL

Edit the generated file following this template:

```sql
-- Up Migration
-- Description of what this migration does

-- Example: Add new column
ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS new_field DOUBLE PRECISION;

-- Example: Create index
CREATE INDEX IF NOT EXISTS idx_metrics_new_field
    ON submarines.metrics(new_field);


-- Down Migration
-- Rollback the changes

-- Drop index first (reverse order)
DROP INDEX IF EXISTS submarines.idx_metrics_new_field;

-- Drop column
ALTER TABLE submarines.metrics
    DROP COLUMN IF EXISTS new_field;
```

### 3. Apply the migration

```bash
docker compose run --rm migrate
```

## Best Practices

### 1. Always Write Down Migrations

Every migration should have a corresponding rollback. This allows you to:
- Test the migration locally and roll back if needed
- Safely revert problematic migrations in production
- Understand the full impact of a schema change

### 2. Use `IF EXISTS` / `IF NOT EXISTS`

Make migrations idempotent when possible:

```sql
-- Good: Idempotent
CREATE TABLE IF NOT EXISTS my_table (...);
DROP TABLE IF EXISTS my_table;

-- Bad: Will fail if run twice
CREATE TABLE my_table (...);
DROP TABLE my_table;
```

### 3. Order Matters in Down Migrations

Reverse the order of operations in down migrations:

```sql
-- Up Migration
CREATE TABLE my_table (...);
CREATE INDEX idx_my_table ON my_table(col);
ALTER TABLE my_table ADD CONSTRAINT ...;

-- Down Migration (reverse order!)
ALTER TABLE my_table DROP CONSTRAINT ...;
DROP INDEX idx_my_table;
DROP TABLE my_table;
```

### 4. Use Proper PostgreSQL Types

For metrics and floating-point data, prefer `DOUBLE PRECISION` over `NUMERIC`:

```sql
-- Good: Fast, appropriate for metrics
cpu_usage_percent DOUBLE PRECISION

-- Avoid: Slower, unnecessary precision
cpu_usage_percent NUMERIC(5,2)
```

### 5. Use Schema Prefixes

Always specify the schema explicitly:

```sql
-- Good: Explicit schema
ALTER TABLE submarines.metrics ADD COLUMN ...;

-- Bad: Relies on search_path
ALTER TABLE metrics ADD COLUMN ...;
```

### 6. Comment Your Changes

Add helpful comments explaining why:

```sql
-- Add disk metrics to support new agent payload format (v1.2.0)
ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS disk_used_gb DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_total_gb DOUBLE PRECISION;

COMMENT ON COLUMN submarines.metrics.disk_used_gb IS 'Disk space used in gigabytes';
```

## Database Schemas

The project uses **multiple PostgreSQL schemas** for logical separation:

- **`submarines`** - Submarines (Go) service tables (servers, metrics, alerts)
- **`flagship`** - Flagship (Rails) service tables
- **`better_auth`** - Next.js authentication (Better Auth)
- **`kratos`** - Ory Kratos identity management (auto-managed)

## Troubleshooting

### Migration fails with "relation already exists"

Use `IF EXISTS` / `IF NOT EXISTS` clauses to make migrations idempotent.

### Can't connect to database

Check your `DATABASE_URL` environment variable:

```bash
echo $DATABASE_URL
# Should be: postgres://admiral:password@postgres:5432/node_pulse_admiral
```

### Migration applied but not showing in database

Check the migrations tracking table:

```sql
SELECT * FROM public.pgmigrations ORDER BY run_on DESC;
```

### Need to rollback a migration

```bash
# Rollback the last migration
docker compose run --rm migrate npx node-pg-migrate down --config-file migrations.json

# Rollback to a specific migration
docker compose run --rm migrate npx node-pg-migrate down 20251016211918 --config-file migrations.json
```

## Example: Adding New Columns

Here's a complete example from the project:

```sql
-- Up Migration
-- Add disk and processes metrics to the schema
-- Extends the metrics table to match the full agent JSON payload

ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS disk_used_gb DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_total_gb DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_usage_percent DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS disk_mount_point VARCHAR(255);

ALTER TABLE submarines.metrics
    ADD COLUMN IF NOT EXISTS processes JSONB;

CREATE INDEX IF NOT EXISTS idx_metrics_processes
    ON submarines.metrics USING GIN(processes);

COMMENT ON COLUMN submarines.metrics.disk_used_gb IS 'Disk space used in gigabytes';
COMMENT ON COLUMN submarines.metrics.processes IS 'Process information including top_cpu and top_memory arrays';


-- Down Migration
-- Rollback disk and processes metrics addition

ALTER TABLE submarines.metrics
    DROP COLUMN IF EXISTS disk_used_gb,
    DROP COLUMN IF EXISTS disk_total_gb,
    DROP COLUMN IF EXISTS disk_usage_percent,
    DROP COLUMN IF EXISTS disk_mount_point,
    DROP COLUMN IF EXISTS processes;

DROP INDEX IF EXISTS submarines.idx_metrics_processes;
```

## Resources

- [node-pg-migrate GitHub](https://github.com/salsita/node-pg-migrate)
- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- [PostgreSQL ALTER TABLE Documentation](https://www.postgresql.org/docs/current/sql-altertable.html)
- [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype.html)
