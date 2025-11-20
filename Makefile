.PHONY: help deploy install pull update mtls-setup mtls-renew health env-check version push dev-up dev-down dev-logs dev-restart dev-rebuild dev-clean prod-up prod-down prod-logs prod-restart prod-rebuild prod-clean db-backup subs-logs subs-restart ingest-logs digest-logs flagship-logs caddy-logs valkey-cli

# Default target - show help
help:
	@echo "Node Pulse Admiral - Available Make Targets"
	@echo ""
	@echo "Production Deployment:"
	@echo "  make deploy        - Run full production deployment (runs deploy.sh)"
	@echo "  make install       - Alias for 'deploy'"
	@echo "  make pull          - Pull latest Docker images from registry"
	@echo "  make update        - Pull images and restart services"
	@echo "  make mtls-setup    - Bootstrap mTLS certificates"
	@echo "  make mtls-renew    - Renew mTLS CA certificate"
	@echo "  make health        - Check health of all services"
	@echo "  make env-check     - Validate .env configuration"
	@echo "  make version       - Show version information"
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
	@echo "  make flagship-logs - Follow flagship logs"
	@echo "  make caddy-logs    - Follow caddy logs"
	@echo ""
	@echo "Utilities:"
	@echo "  make valkey-cli    - Open valkey-cli interactive session"

# Git operations
push:
	git push origin main && git push origin --tags

# Production deployment targets
deploy:
	@echo "Starting production deployment..."
	@sudo ./scripts/deploy.sh

install: deploy

pull:
	@echo "Pulling latest Docker images..."
	@docker compose pull
	@echo "✓ Images pulled"

update: pull prod-restart
	@echo "✓ Update complete"

mtls-setup:
	@echo "Setting up mTLS..."
	@./scripts/setup-mtls.sh

mtls-renew:
	@echo "Renewing mTLS CA..."
	@./scripts/setup-mtls.sh --force

health:
	@echo "Health Check:"
	@echo ""
	@echo "Ingest Service:"
	@curl -sf http://localhost:8080/health | jq || echo "✗ Not responding"
	@echo ""
	@echo "Caddy Proxy:"
	@curl -sf http://localhost:8000/health || echo "✗ Not responding"

env-check:
	@echo "Checking .env configuration..."
	@if [ ! -f .env ]; then \
		echo "✗ .env file not found"; \
		echo "  Run: cp .env.example .env"; \
		exit 1; \
	fi
	@echo "✓ .env file exists"
	@echo ""
	@echo "Required variables:"
	@for var in POSTGRES_PASSWORD VALKEY_PASSWORD JWT_SECRET APP_KEY; do \
		if grep -q "^$$var=" .env; then \
			echo "  ✓ $$var"; \
		else \
			echo "  ✗ $$var (missing)"; \
		fi; \
	done

version:
	@echo "Node Pulse Admiral"
	@echo ""
	@if [ -f VERSION ]; then \
		echo "Version: $$(cat VERSION)"; \
	else \
		echo "Version: development"; \
	fi
	@echo ""
	@echo "Service Images:"
	@docker compose config | grep 'image:' | sed 's/^[ ]*/  /'

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
	docker compose logs -f submarines-ingest submarines-digest

subs-restart:
	docker compose restart submarines-ingest submarines-digest

# Individual service operations
ingest-logs:
	docker compose logs -f submarines-ingest

digest-logs:
	docker compose logs -f submarines-digest

flagship-logs:
	docker compose logs -f flagship

caddy-logs:
	docker compose logs -f caddy

valkey-cli:
	docker exec -it node-pulse-valkey valkey-cli -a $${VALKEY_PASSWORD:-valkeypassword}
