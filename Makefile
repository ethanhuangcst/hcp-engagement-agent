# HCP Engagement Assistant — common developer / ops targets
#
#   make help
#   make dev         # local stack: qdrant + mcp(dev) + web(dev)
#   make down
#   make compose-up  # pull GHCR images + docker compose

.DEFAULT_GOAL := help

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
RUN  := $(ROOT)/.run
LOGS := $(RUN)/logs

# Compose image tag (GHCR). Override: make compose-up IMAGE_TAG=sha-abc1234
IMAGE_TAG ?= latest
export IMAGE_TAG

# Prefer repo .env over stale shell DATABASE_URL (postgresql leftover).
LOAD_ENV = set -a; [ -f "$(ROOT)/.env" ] && . "$(ROOT)/.env"; set +a; unset HCA_ENV_LOADED

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\n"} /^[a-zA-Z0-9_.-]+:.*?##/ { printf "  %-18s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: install
install: ## npm install (workspace)
	cd "$(ROOT)" && npm install

.PHONY: build
build: ## Build all workspaces
	cd "$(ROOT)" && npm run build

.PHONY: typecheck
typecheck: ## Typecheck all workspaces
	cd "$(ROOT)" && npm run typecheck

.PHONY: test
test: ## Run unit tests
	cd "$(ROOT)" && npm run test

.PHONY: migrate
migrate: ## Apply MySQL migrations (db:migrate)
	cd "$(ROOT)" && $(LOAD_ENV) && npm run db:migrate

.PHONY: migrate-pg
migrate-pg: ## Copy Postgres → MySQL (db:migrate:pg-to-mysql)
	cd "$(ROOT)" && $(LOAD_ENV) && npm run db:migrate:pg-to-mysql

.PHONY: migrate-mysql
migrate-mysql: ## Copy MySQL → MySQL (db:migrate:mysql-to-mysql)
	cd "$(ROOT)" && $(LOAD_ENV) && npm run db:migrate:mysql-to-mysql

.PHONY: seed
seed: ## Seed compliance RAG corpus
	cd "$(ROOT)" && $(LOAD_ENV) && npm run rag:seed-compliance

.PHONY: init
init: ## Full bootstrap (scripts/init.sh)
	cd "$(ROOT)" && bash scripts/init.sh

.PHONY: qdrant
qdrant: ## Start local Qdrant (:6333) in background
	@mkdir -p "$(LOGS)" "$(RUN)"
	@if [ -f "$(RUN)/qdrant.pid" ] && kill -0 "$$(cat "$(RUN)/qdrant.pid")" 2>/dev/null; then \
		echo "qdrant already running pid=$$(cat "$(RUN)/qdrant.pid")"; \
	elif lsof -nP -iTCP:6333 -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "qdrant already listening on :6333"; \
	else \
		cd "$(ROOT)" && $(LOAD_ENV) && \
		nohup npm run start:qdrant >"$(LOGS)/qdrant.log" 2>&1 & echo $$! >"$(RUN)/qdrant.pid"; \
		echo "qdrant started pid=$$(cat "$(RUN)/qdrant.pid") → http://127.0.0.1:6333"; \
	fi

.PHONY: mcp
mcp: ## Start hcp-twin-mcp (:3200) from dist, background
	@mkdir -p "$(LOGS)" "$(RUN)"
	@if [ -f "$(RUN)/mcp.pid" ] && kill -0 "$$(cat "$(RUN)/mcp.pid")" 2>/dev/null; then \
		echo "mcp already running pid=$$(cat "$(RUN)/mcp.pid")"; \
	else \
		cd "$(ROOT)" && $(LOAD_ENV) && \
		nohup npm run start:hcp-twin-mcp >"$(LOGS)/mcp.log" 2>&1 & echo $$! >"$(RUN)/mcp.pid"; \
		echo "mcp started pid=$$(cat "$(RUN)/mcp.pid") → http://127.0.0.1:3200/health"; \
	fi

.PHONY: mcp-dev
mcp-dev: ## Start hcp-twin-mcp in watch mode (:3200), background
	@mkdir -p "$(LOGS)" "$(RUN)"
	@if [ -f "$(RUN)/mcp.pid" ] && kill -0 "$$(cat "$(RUN)/mcp.pid")" 2>/dev/null; then \
		echo "mcp already running pid=$$(cat "$(RUN)/mcp.pid")"; \
	else \
		cd "$(ROOT)" && $(LOAD_ENV) && \
		nohup npm run dev:hcp-twin-mcp >"$(LOGS)/mcp.log" 2>&1 & echo $$! >"$(RUN)/mcp.pid"; \
		echo "mcp-dev started pid=$$(cat "$(RUN)/mcp.pid") → http://127.0.0.1:3200/health"; \
	fi

.PHONY: web
web: ## Start Next.js web (:3001) in background
	@mkdir -p "$(LOGS)" "$(RUN)"
	@if [ -f "$(RUN)/web.pid" ] && kill -0 "$$(cat "$(RUN)/web.pid")" 2>/dev/null; then \
		echo "web already running pid=$$(cat "$(RUN)/web.pid")"; \
	else \
		cd "$(ROOT)" && $(LOAD_ENV) && \
		nohup npm run dev:web >"$(LOGS)/web.log" 2>&1 & echo $$! >"$(RUN)/web.pid"; \
		echo "web started pid=$$(cat "$(RUN)/web.pid") → http://127.0.0.1:3001"; \
	fi

.PHONY: up
up: qdrant mcp web ## Start qdrant + mcp(dist) + web
	@echo "up: web :3001 · mcp :3200 · qdrant :6333"

.PHONY: dev
dev: qdrant mcp-dev web ## Local dev: qdrant + mcp(watch) + web(dev)
	@echo "dev: http://127.0.0.1:3001  (mcp :3200 · qdrant :6333)"
	@echo "     make logs · make status · make down"

.PHONY: down
down: ## Stop processes from make up / scripts/init.sh
	cd "$(ROOT)" && npm run stop

.PHONY: logs
logs: ## Tail web + mcp logs
	@mkdir -p "$(LOGS)"
	@touch "$(LOGS)/web.log" "$(LOGS)/mcp.log"
	tail -n 80 -f "$(LOGS)/web.log" "$(LOGS)/mcp.log"

.PHONY: status
status: ## Show listeners on 3001 / 3200 / 6333
	@echo "=== ports ==="
	@lsof -nP -iTCP:3001 -sTCP:LISTEN 2>/dev/null || echo "3001: (down)"
	@lsof -nP -iTCP:3200 -sTCP:LISTEN 2>/dev/null || echo "3200: (down)"
	@lsof -nP -iTCP:6333 -sTCP:LISTEN 2>/dev/null || echo "6333: (down)"
	@echo "=== health ==="
	@curl -sS -m 3 http://127.0.0.1:3200/health 2>/dev/null || echo "mcp: unreachable"
	@echo
	@curl -sS -m 3 -o /dev/null -w "web: HTTP %{http_code}\n" http://127.0.0.1:3001/ 2>/dev/null || echo "web: unreachable"

.PHONY: compose-pull
compose-pull: ## docker compose pull (GHCR + qdrant)
	cd "$(ROOT)" && docker compose pull

.PHONY: compose-up
compose-up: ## docker compose up -d (images from GHCR)
	cd "$(ROOT)" && docker compose pull && docker compose up -d

.PHONY: compose-down
compose-down: ## docker compose down
	cd "$(ROOT)" && docker compose down

.PHONY: compose-logs
compose-logs: ## docker compose logs -f web hcp-twin-mcp
	cd "$(ROOT)" && docker compose logs -f web hcp-twin-mcp
