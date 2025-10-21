.PHONY: help push dev dev-down dev-logs dev-restart dev-rebuild dev-clean prod prod-down prod-logs prod-restart prod-rebuild prod-clean up down logs restart clean ps db-backup subs-logs subs-restart ingest-logs worker-logs status-logs flagship-logs cruiser-logs valkey-cli

# Default target - show help
help:
	@echo "NodePulse Admiral - Available Make Targets"
	@echo ""
	@echo "Git Operations:"
	@echo "  make push          - Push to origin/main and push all tags"
	@echo ""
	@echo "Docker Compose - Development:"
	@echo "  make dev           - Start development stack (compose.development.yml)"
	@echo "  make dev-down      - Stop development stack"
	@echo "  make dev-logs      - Follow development logs"
	@echo "  make dev-restart   - Restart development stack"
	@echo "  make dev-rebuild   - Rebuild and restart development stack"
	@echo "  make dev-clean     - Stop development stack and remove volumes"
	@echo ""
	@echo "Docker Compose - Production:"
	@echo "  make prod          - Start production stack (compose.yml)"
	@echo "  make prod-down     - Stop production stack"
	@echo "  make prod-logs     - Follow production logs"
	@echo "  make prod-restart  - Restart production stack"
	@echo "  make prod-rebuild  - Rebuild and restart production stack"
	@echo "  make prod-clean    - Stop production stack and remove volumes"
	@echo ""
	@echo "Database:"
	@echo "  make db-backup     - Create database backup"
	@echo ""
	@echo "Submarines (Go services):"
	@echo "  make subs-logs     - Follow logs for all submarines services"
	@echo "  make subs-restart  - Restart all submarines services"
	@echo ""
	@echo "Individual Service Logs:"
	@echo "  make ingest-logs   - Follow submarines-ingest logs"
	@echo "  make worker-logs   - Follow submarines-worker logs"
	@echo "  make status-logs   - Follow submarines-status logs"
	@echo "  make flagship-logs - Follow flagship logs"
	@echo "  make cruiser-logs  - Follow cruiser logs"
	@echo ""
	@echo "Utilities:"
	@echo "  make valkey-cli    - Open valkey-cli interactive session"

# Git operations
push:
	git push origin main && git push origin --tags

# Development environment
dev:
	docker compose -f compose.development.yml up -d

dev-down:
	docker compose -f compose.development.yml down

dev-logs:
	docker compose -f compose.development.yml logs -f

dev-restart:
	docker compose -f compose.development.yml restart

dev-rebuild:
	docker compose -f compose.development.yml up -d --build

# Production environment
prod:
	docker compose -f compose.yml up -d

prod-down:
	docker compose -f compose.yml down

prod-logs:
	docker compose -f compose.yml logs -f

prod-restart:
	docker compose -f compose.yml restart

prod-rebuild:
	docker compose -f compose.yml up -d --build

# Clean development
dev-clean:
	@echo "WARNING: This will stop development containers and remove volumes (data will be lost)!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose -f compose.development.yml down -v; \
	fi

# Clean production
prod-clean:
	@echo "WARNING: This will stop production containers and remove volumes (data will be lost)!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose -f compose.yml down -v; \
	fi

# Clean everything (both dev and prod)
clean:
	@echo "WARNING: This will stop ALL containers and remove ALL volumes (data will be lost)!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose -f compose.yml down -v; \
		docker compose -f compose.development.yml down -v; \
	fi

db-backup:
	@mkdir -p backups
	docker exec node-pulse-postgres pg_dump -U postgres node_pulse_admiral > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup created in backups/ directory"

# Submarines operations
subs-logs:
	docker compose logs -f submarines-ingest submarines-worker submarines-status

subs-restart:
	docker compose restart submarines-ingest submarines-worker submarines-status

# Individual service operations
ingest-logs:
	docker compose logs -f submarines-ingest

worker-logs:
	docker compose logs -f submarines-worker

status-logs:
	docker compose logs -f submarines-status

flagship-logs:
	docker compose logs -f flagship

cruiser-logs:
	docker compose logs -f cruiser

valkey-cli:
	docker exec -it node-pulse-valkey valkey-cli -a $${VALKEY_PASSWORD:-valkeypassword}
