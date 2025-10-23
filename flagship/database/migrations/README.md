# Laravel Migrations Disabled

This Laravel application uses **centralized database migrations** managed by `node-pg-migrate` in the `/migrate` directory.

## Why?

NodePulse Admiral is a multi-service stack with:
- **Submarines** (Go-Gin) - Metrics ingestion
- **Flagship** (Laravel) - Dashboard UI
- **Cruiser** (Next.js) - Secondary UI

All services share the **same PostgreSQL database** with the `admiral` schema. Managing migrations in one central location prevents conflicts and ensures consistency.

## Database Schema

All tables are in the `admiral` schema:
- `admiral.users` - Laravel user authentication
- `admiral.servers` - Server/agent registry
- `admiral.metrics` - Time-series data
- `admiral.alerts` - Alert records
- And more...

## Running Migrations

**DO NOT** use Laravel's `php artisan migrate` command.

Instead, use the centralized migration system:

```bash
# From project root
cd /path/to/admiral
docker compose run --rm migrate
```

Or locally:

```bash
cd migrate
npm run migrate:up
```

## Creating New Migrations

```bash
cd migrate
npx node-pg-migrate create my_migration_name --config-file migrations.json
```

This creates a timestamped SQL file in `migrate/migrations/`.

## Laravel Configuration

Laravel is configured to:
1. Connect to PostgreSQL using the `admiral` schema (via `search_path` in `config/database.php`)
2. **NOT** run Laravel migrations (this directory is empty)
3. Use tables created by the centralized migration system

## References

- **Centralized migrations**: `/migrate/README.md`
- **Migration files**: `/migrate/migrations/`
- **Database config**: `config/database.php`
