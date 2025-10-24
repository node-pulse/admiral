.PHONY: help push dev-up dev-down dev-logs dev-restart dev-rebuild dev-clean prod-up prod-down prod-logs prod-restart prod-rebuild prod-clean db-backup subs-logs subs-restart ingest-logs worker-logs status-logs flagship-logs cruiser-logs valkey-cli traefik-status traefik-routers traefik-services

# Default target - show help
help:
	@echo "Node Pulse Admiral - Available Make Targets"
	@echo ""
	@echo "Git Operations:"
	@echo "  make push          - Push to origin/main and push all tags"
	@echo ""
	@echo "Docker Compose - Development:"
	@echo "  make dev-up       - Start development stack (compose.development.yml)"
	@echo "  make dev-down     - Stop development stack"
	@echo "  make dev-logs     - Follow development logs"
	@echo "  make dev-restart  - Restart development stack"
	@echo "  make dev-rebuild  - Rebuild and restart development stack"
	@echo "  make dev-clean    - Stop development stack and remove volumes"
	@echo ""
	@echo "Docker Compose - Production:"
	@echo "  make prod-up       - Start production stack (compose.yml)"
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
	@echo "  make digest-logs   - Follow submarines-digest logs"
	@echo "  make status-logs   - Follow submarines-status logs"
	@echo "  make flagship-logs - Follow flagship logs"
	@echo "  make cruiser-logs  - Follow cruiser logs"
	@echo ""
	@echo "Utilities:"
	@echo "  make valkey-cli       - Open valkey-cli interactive session"
	@echo ""
	@echo "Traefik Status (API):"
	@echo "  make traefik-status   - Show Traefik overview"
	@echo "  make traefik-routers  - Show all HTTP routers"
	@echo "  make traefik-services - Show all services with health checks"

# Git operations
push:
	git push origin main && git push origin --tags

# Development environment
dev-up:
	docker compose -f compose.development.yml up -d

dev-down:
	docker compose -f compose.development.yml down

dev-logs:
	docker compose -f compose.development.yml logs -f

dev-restart:
	docker compose -f compose.development.yml restart

dev-rebuild:
	docker compose -f compose.development.yml up -d --build

dev-clean:
	docker compose -f compose.development.yml down -v --rmi all --remove-orphans

# Production environment
prod-up:
	docker compose -f compose.yml up -d

prod-down:
	docker compose -f compose.yml down

prod-logs:
	docker compose -f compose.yml logs -f

prod-restart:
	docker compose -f compose.yml restart

prod-rebuild:
	docker compose -f compose.yml up -d --build

prod-clean:
	docker compose -f compose.yml down -v --rmi all --remove-orphans

db-backup:
	@mkdir -p backups
	docker exec node-pulse-postgres pg_dump -U postgres node_pulse_admiral > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup created in backups/ directory"

# Submarines operations
subs-logs:
	docker compose logs -f submarines-ingest submarines-digest submarines-status

subs-restart:
	docker compose restart submarines-ingest submarines-digest submarines-status

# Individual service operations
ingest-logs:
	docker compose logs -f submarines-ingest

digest-logs:
	docker compose logs -f submarines-digest

status-logs:
	docker compose logs -f submarines-status

flagship-logs:
	docker compose logs -f flagship

cruiser-logs:
	docker compose logs -f cruiser

valkey-cli:
	docker exec -it node-pulse-valkey valkey-cli -a $${VALKEY_PASSWORD:-valkeypassword}

# Traefik status via API
traefik-status:
	@./scripts/traefik-status.sh overview

traefik-routers:
	@./scripts/traefik-status.sh routers

traefik-services:
	@./scripts/traefik-status.sh services
