# BugPin Makefile
# Usage: make [target]
# Run 'make' or 'make help' for available commands

SHELL := /bin/bash
LOCAL_COMPOSE := docker compose -f docker-compose.local.yml
PROD_COMPOSE := docker compose -p bugpin -f docker-compose.yml
REGISTRY := registry.arantic.cloud/bugpin
BUGPIN_TAG ?= latest

.PHONY: help \
        dev dev-server dev-admin dev-portal dev-widget build-dev \
        build-local local deploy-local logs-local down-local \
        build-prod prod deploy-prod logs-prod down-prod \
        typecheck test knip format \
        seed-all seed-projects seed-user seed-reports \
        seed-clean-all seed-clean-projects seed-clean-user seed-clean-reports \
        clean clean-db clean-uploads clean-data clean-deps clean-all clean-purge \
        version-check bump-version bump-patch bump-minor bump-major \
        release release-widget retag

# Colors
GREEN := \033[0;32m
BLUE := \033[0;34m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m

# Runtime data directory (override with: make clean-db DATA_DIR=/path/to/data)
DATA_DIR ?= data

# ==============================================================================
# Host development
# ==============================================================================

dev:
	@echo "Server: http://localhost:4300  Admin Console HMR: http://localhost:7300/admin/  Portal HMR: http://127.0.0.1:7310/reporter-portal/"
	@echo "Do not run make local at the same time."
	@bun run dev

dev-server:
	@bun run dev:server

dev-admin:
	@bun run dev:admin

dev-portal:
	@bun run dev:portal

dev-widget:
	@bun run dev:widget

build-dev:
	@bun run build

# ==============================================================================
# Local containers (docker-compose.local.yml, with HMR)
# ==============================================================================

build-local:
	@$(LOCAL_COMPOSE) build

local:
	@$(LOCAL_COMPOSE) up -d -V
	@echo "Admin Console HMR: http://localhost:7300/admin/"
	@echo "Reporter Portal HMR: http://127.0.0.1:7310/reporter-portal/"
	@echo "Logs: make logs-local  Stop: make down-local"
	@echo "Do not run make dev at the same time."

deploy-local: build-local local

logs-local:
	@$(LOCAL_COMPOSE) logs -f

down-local:
	@$(LOCAL_COMPOSE) down --remove-orphans
	@echo "Local containers removed. ./data was kept."

# ==============================================================================
# Production containers (docker-compose.yml)
# ==============================================================================

build-prod:
	@for target in server admin portal; do \
		docker build --target $$target -t $(REGISTRY)/bugpin-$$target:$(BUGPIN_TAG) . || exit 1; \
	done

prod:
	@BUGPIN_TAG=$(BUGPIN_TAG) $(PROD_COMPOSE) --profile separate-portal up -d --pull never
	@echo "Admin Console: http://localhost:7300/admin/  Portal frontend: http://localhost:7310/reporter-portal/"
	@echo "Logs: make logs-prod  Stop: make down-prod"

deploy-prod: build-prod prod

logs-prod:
	@$(PROD_COMPOSE) --profile separate-portal logs -f

down-prod:
	@$(PROD_COMPOSE) --profile separate-portal down
	@echo "Production containers removed. Volumes were kept."

# ==============================================================================
# Checks (host)
# ==============================================================================

typecheck:
	@bun run typecheck
	@bun run typecheck:tests

test:
	@bun run test

knip:
	@bun run knip

format:
	@bun run format

# ==============================================================================
# Seed Data (host, writes to ./data)
# ==============================================================================

seed-all:
	@$(MAKE) seed-projects seed-user seed-reports

seed-projects:
	@bun scripts/seed/seed.ts projects

seed-user:
	@bun scripts/seed/seed.ts users

seed-reports:
	@bun scripts/seed/seed.ts reports

seed-clean-all:
	@bun scripts/seed/seed.ts clean-all

seed-clean-projects:
	@bun scripts/seed/seed.ts clean-projects

seed-clean-user:
	@bun scripts/seed/seed.ts clean-users

seed-clean-reports:
	@bun scripts/seed/seed.ts clean-reports

# ==============================================================================
# Clean
# ==============================================================================

clean:
	@echo "$(BLUE)[INFO]$(NC) Cleaning build artifacts..."
	@rm -rf dist
	@rm -rf src/server/dist
	@rm -rf src/admin/dist
	@rm -rf src/portal/dist
	@rm -rf src/widget/dist
	@echo "$(GREEN)[SUCCESS]$(NC) Build artifacts removed"

clean-db:
	@echo "$(BLUE)[INFO]$(NC) Removing SQLite database files from $(DATA_DIR)/..."
	@rm -f "$(DATA_DIR)/bugpin.db" "$(DATA_DIR)/bugpin.db-wal" "$(DATA_DIR)/bugpin.db-shm"
	@echo "$(GREEN)[SUCCESS]$(NC) Database files removed (uploads and .secret kept)"
	@echo "$(YELLOW)[NOTE]$(NC) Restart the server to recreate and migrate a fresh database"

clean-uploads:
	@echo "$(BLUE)[INFO]$(NC) Removing uploaded files from $(DATA_DIR)/uploads/..."
	@rm -rf "$(DATA_DIR)/uploads"
	@echo "$(GREEN)[SUCCESS]$(NC) Uploads removed (database and .secret kept)"

clean-data:
	@echo "$(YELLOW)[WARN]$(NC) This deletes $(DATA_DIR)/ including the database, uploads, and .secret."
	@echo "$(YELLOW)[WARN]$(NC) Encrypted data and sessions cannot be recovered after .secret is removed."
	@printf "$(YELLOW)Proceed? [y/N]$(NC) "; \
	read -r CONFIRM; \
	if [ "$$CONFIRM" != "y" ] && [ "$$CONFIRM" != "Y" ]; then \
		echo "$(RED)[ABORT]$(NC) clean-data cancelled."; \
		exit 1; \
	fi
	@echo "$(BLUE)[INFO]$(NC) Removing runtime data directory $(DATA_DIR)/..."
	@rm -rf "$(DATA_DIR)"
	@echo "$(GREEN)[SUCCESS]$(NC) Runtime data removed"
	@echo "$(YELLOW)[NOTE]$(NC) Restart the server to recreate data/, .secret, and a fresh database"

clean-deps:
	@echo "$(BLUE)[INFO]$(NC) Removing node_modules..."
	@rm -rf node_modules
	@rm -rf src/server/node_modules
	@rm -rf src/admin/node_modules
	@rm -rf src/portal/node_modules
	@rm -rf src/shared-ui/node_modules
	@rm -rf src/widget/node_modules
	@echo "$(GREEN)[SUCCESS]$(NC) Dependencies removed"

clean-all: clean clean-deps
	@echo "$(GREEN)[SUCCESS]$(NC) Build artifacts and dependencies removed"

clean-purge: clean clean-deps
	@echo "$(YELLOW)[WARN]$(NC) This also deletes $(DATA_DIR)/ including the database, uploads, and .secret."
	@printf "$(YELLOW)Proceed with full purge? [y/N]$(NC) "; \
	read -r CONFIRM; \
	if [ "$$CONFIRM" != "y" ] && [ "$$CONFIRM" != "Y" ]; then \
		echo "$(RED)[ABORT]$(NC) clean-purge cancelled after build/deps cleanup."; \
		exit 1; \
	fi
	@echo "$(BLUE)[INFO]$(NC) Removing runtime data directory $(DATA_DIR)/..."
	@rm -rf "$(DATA_DIR)"
	@echo "$(GREEN)[SUCCESS]$(NC) Full purge complete (build, deps, and data)"

# ==============================================================================
# Version Management
# ==============================================================================

version-check:
	@echo "$(BLUE)[INFO]$(NC) Checking version consistency..."
	@ROOT_V=$$(node -p "require('./package.json').version"); \
	SERVER_V=$$(node -p "require('./src/server/package.json').version"); \
	ADMIN_V=$$(node -p "require('./src/admin/package.json').version"); \
	WIDGET_V=$$(node -p "require('./src/widget/package.json').version"); \
	echo "  Root:     $$ROOT_V"; \
	echo "  Server:   $$SERVER_V"; \
	echo "  Admin:    $$ADMIN_V"; \
	echo "  Widget:   $$WIDGET_V (own versioning)"; \
	echo ""; \
	if [ "$$ROOT_V" = "$$SERVER_V" ] && [ "$$ROOT_V" = "$$ADMIN_V" ]; then \
		echo "$(GREEN)[SUCCESS]$(NC) Root, server, and admin versions match: $$ROOT_V"; \
	else \
		echo "$(RED)[ERROR]$(NC) Version mismatch between root, server, or admin!"; \
		exit 1; \
	fi

bump-version:
	@if [ -z "$(v)" ]; then \
		echo "$(RED)[ERROR]$(NC) Version required. Usage: make bump-version v=1.0.0"; \
		exit 1; \
	fi
	@node -e "const fs=require('fs');const p='./package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$(v)';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
	@node -e "const fs=require('fs');const p='./src/server/package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$(v)';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
	@node -e "const fs=require('fs');const p='./src/admin/package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$(v)';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"

bump-patch:
	@echo "$(BLUE)[INFO]$(NC) Bumping patch version..."
	@CURRENT_VERSION=$$(node -p "require('./package.json').version" | sed 's/-.*//' ); \
	NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{$$3 = $$3 + 1;} 1' OFS=.); \
	$(MAKE) bump-version v=$$NEW_VERSION

bump-minor:
	@echo "$(BLUE)[INFO]$(NC) Bumping minor version..."
	@CURRENT_VERSION=$$(node -p "require('./package.json').version" | sed 's/-.*//' ); \
	NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{$$2 = $$2 + 1; $$3 = 0;} 1' OFS=.); \
	$(MAKE) bump-version v=$$NEW_VERSION

bump-major:
	@echo "$(BLUE)[INFO]$(NC) Bumping major version..."
	@CURRENT_VERSION=$$(node -p "require('./package.json').version" | sed 's/-.*//' ); \
	NEW_VERSION=$$(echo $$CURRENT_VERSION | awk -F. '{$$1 = $$1 + 1; $$2 = 0; $$3 = 0;} 1' OFS=.); \
	$(MAKE) bump-version v=$$NEW_VERSION

release:
	@if [ -z "$(v)" ]; then \
		echo "$(RED)[ERROR]$(NC) Version required."; \
		echo "  Dev:        make release v=X.Y.Z-dev"; \
		echo "  Beta:       make release v=X.Y.Z-beta.N"; \
		echo "  Prod:       make release v=X.Y.Z"; \
		exit 1; \
	fi
	@echo "$(BLUE)================================================$(NC)"
	@echo "$(BLUE)  BugPin Release v$(v)$(NC)"
	@echo "$(BLUE)================================================$(NC)"
	@echo ""
	@BASE_VERSION=$$(echo "$(v)" | sed 's/-dev.*//'); \
	IS_DEV=$$(echo "$(v)" | grep -qE -- '(-dev|-beta)' && echo true || echo false); \
	BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$IS_DEV" = "true" ] && [ "$$BRANCH" != "dev" ]; then \
		echo "$(RED)[ERROR]$(NC) Dev releases must be tagged from the dev branch (currently on $$BRANCH)"; \
		exit 1; \
	fi; \
	if [ "$$IS_DEV" = "false" ] && [ "$$BRANCH" != "main" ]; then \
		echo "$(RED)[ERROR]$(NC) Production releases must be tagged from the main branch (currently on $$BRANCH)"; \
		exit 1; \
	fi; \
	echo "  Branch:  $$BRANCH"; \
	echo "  Version: $$BASE_VERSION"; \
	echo "  Tag:     v$(v)"; \
	if [ "$$IS_DEV" = "true" ]; then \
		echo "  Images:  $(v), dev"; \
	else \
		echo "  Images:  $(v), latest"; \
	fi; \
	echo ""; \
	printf "$(YELLOW)Proceed? [y/N]$(NC) "; \
	read -r CONFIRM; \
	if [ "$$CONFIRM" != "y" ] && [ "$$CONFIRM" != "Y" ]; then \
		echo "$(RED)[ABORT]$(NC) Release cancelled."; \
		exit 1; \
	fi; \
	echo ""; \
	if [ "$$IS_DEV" = "true" ]; then \
		echo "$(BLUE)[INFO]$(NC) Creating and pushing tag v$(v)..."; \
		git tag -f v$(v); \
		git push origin v$(v) --force; \
		echo ""; \
		echo "$(GREEN)[SUCCESS]$(NC) Dev/beta tag v$(v) pushed — Docker image build triggered."; \
		echo "  Image tags: $(v), dev"; \
		echo "  Version in Docker image will be: $(v)"; \
	else \
		echo "$(BLUE)[INFO]$(NC) Bumping version to $(v)..."; \
		$(MAKE) -s bump-version v=$(v); \
		echo "$(BLUE)[INFO]$(NC) Committing changes..."; \
		git add -A; \
		git diff --cached --quiet && echo "$(YELLOW)[SKIP]$(NC) No changes to commit" || \
		git commit -m "chore: bump version to $(v)"; \
		echo "$(BLUE)[INFO]$(NC) Pushing commit to $$BRANCH..."; \
		git push origin $$BRANCH; \
		echo "$(BLUE)[INFO]$(NC) Creating and pushing tag v$(v)..."; \
		git tag v$(v); \
		git push origin v$(v); \
		echo ""; \
		echo "$(GREEN)[SUCCESS]$(NC) Production release v$(v) complete."; \
		echo "  Image tags: $(v), latest"; \
	fi

release-widget:
	@if [ -z "$(v)" ]; then \
		echo "$(RED)[ERROR]$(NC) Version required. Usage: make release-widget v=X.Y.Z"; \
		exit 1; \
	fi
	@if ! echo "$(v)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$'; then \
		echo "$(RED)[ERROR]$(NC) Widget version must use stable X.Y.Z format"; \
		exit 1; \
	fi
	@echo "$(BLUE)================================================$(NC)"
	@echo "$(BLUE)  BugPin Widget Release v$(v)$(NC)"
	@echo "$(BLUE)================================================$(NC)"
	@echo ""
	@set -e; \
	CURRENT_V=$$(node -p "require('./src/widget/package.json').version"); \
	echo "  Current: $$CURRENT_V"; \
	echo "  New:     $(v)"; \
	echo ""; \
	echo "$(YELLOW)npm requires an active login session to publish.$(NC)"; \
	echo "  If not logged in, run: npm login"; \
	echo "  To check your session: npm whoami"; \
	echo ""; \
	printf "$(YELLOW)Are you logged into npm? [y/N]$(NC) "; \
	read -r CONFIRM; \
	if [ "$$CONFIRM" != "y" ] && [ "$$CONFIRM" != "Y" ]; then \
		echo "$(RED)[ABORT]$(NC) Run 'npm login' first, then re-run this command."; \
		exit 1; \
	fi; \
	echo ""; \
	echo "$(BLUE)[INFO]$(NC) Verifying npm session..."; \
	NPM_USER=$$(npm whoami 2>/dev/null); \
	if [ -z "$$NPM_USER" ]; then \
		echo "$(RED)[ERROR]$(NC) Not logged into npm. Run 'npm login' first."; \
		exit 1; \
	fi; \
	echo "$(GREEN)[OK]$(NC) Logged in as $$NPM_USER"; \
	echo ""; \
	echo "$(BLUE)[INFO]$(NC) Bumping widget version to $(v)..."; \
	node -e "const fs=require('fs');const p='./src/widget/package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$(v)';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"; \
	echo "$(BLUE)[INFO]$(NC) Building widget..."; \
	(cd src/widget && bun run build); \
	echo "$(BLUE)[INFO]$(NC) Publishing to npm..."; \
	(cd src/widget && npm publish) || { \
		echo ""; \
		echo "$(RED)[ERROR]$(NC) npm publish failed. Check your login session with: npm whoami"; \
		echo "  To log in, run: npm login"; \
		exit 1; \
	}; \
	echo ""; \
	echo "$(GREEN)[SUCCESS]$(NC) Widget v$(v) published to npm."

retag:
	@if [ -z "$(v)" ]; then \
		echo "$(RED)[ERROR]$(NC) Version required. Usage: make retag v=1.0.3-dev"; \
		exit 1; \
	fi
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	echo "$(BLUE)[INFO]$(NC) Pushing $$BRANCH to origin..."; \
	git push origin $$BRANCH
	@echo "$(BLUE)[INFO]$(NC) Retagging v$(v)..."
	@git tag -d v$(v) 2>/dev/null || true
	@git push origin :refs/tags/v$(v) 2>/dev/null || true
	@git tag v$(v)
	@git push origin v$(v)
	@echo "$(GREEN)[SUCCESS]$(NC) Tag v$(v) re-pushed to origin"

# ==============================================================================
# Help
# ==============================================================================

help:
	@if [ -t 1 ] && [ -z "$${NO_COLOR:-}" ]; then \
		H=$$'\033[1;34m'; B=$$'\033[1m'; P=$$'\033[36m'; R=$$'\033[0m'; \
	else \
		H=''; B=''; P=''; R=''; \
	fi; \
	section() { printf '\n%s%s%s\n' "$$H" "$$1" "$$R"; }; \
	row() { printf '  %-38s %s\n' "$$1" "$$2"; }; \
	ports() { printf '  %-38s %s%s%s\n' '' "$$P" "$$1" "$$R"; }; \
	printf '%s%s%s\n' "$$B" 'BugPin development commands' "$$R"; \
	section 'Host development'; \
	row 'make dev' 'Server, Admin Console HMR, and Reporter Portal HMR on the host'; \
	ports ':4300 server    :7300 Admin Console    :7310 Reporter Portal'; \
	row 'make dev-server|dev-admin|dev-portal' 'Start one of them on the host'; \
	row 'make dev-widget' 'Build the widget in watch mode'; \
	row 'make build-dev' 'Build server, Admin Console, portal, and widget into dist/'; \
	section 'Local containers'; \
	row 'make local' 'Start the Docker stack with HMR, without rebuilding'; \
	ports ':7300 Admin Console HMR    :7310 Reporter Portal HMR'; \
	row 'make deploy-local' 'Rebuild the development image, then start the stack'; \
	row 'make build-local' 'Build the development image'; \
	row 'make logs-local' 'Follow local container logs'; \
	row 'make down-local' 'Remove local containers and keep ./data'; \
	section 'Production containers'; \
	row 'make build-prod' 'Build the server, admin, and portal images (BUGPIN_TAG, default latest)'; \
	row 'make prod' 'Start docker-compose.yml with those images, portal included'; \
	ports ':7300 Admin Console    :7310 Reporter Portal'; \
	row 'make deploy-prod' 'Build, then start production containers'; \
	row 'make logs-prod' 'Follow production container logs'; \
	row 'make down-prod' 'Remove production containers and keep volumes'; \
	section 'Checks'; \
	row 'make typecheck' 'Type check all components and tests'; \
	row 'make test' 'Run all tests'; \
	row 'make knip' 'Find unused code and dependencies'; \
	row 'make format' 'Format with Prettier'; \
	section 'Seed data'; \
	row 'make seed-all' 'Seed projects, users, and reports'; \
	row 'make seed-projects|seed-user|seed-reports' 'Seed one kind'; \
	row 'make seed-clean-all' 'Remove all seeded data'; \
	row 'make seed-clean-projects|user|reports' 'Remove one kind of seeded data'; \
	section 'Clean'; \
	row 'make clean' 'Remove build output'; \
	row 'make clean-db' 'Remove the SQLite database files'; \
	row 'make clean-uploads' 'Remove uploaded files'; \
	row 'make clean-data' 'Remove data/ (database, uploads, .secret), asks first'; \
	row 'make clean-deps' 'Remove all node_modules'; \
	row 'make clean-all' 'Remove build output and node_modules'; \
	row 'make clean-purge' 'Remove build output, node_modules, and data/, asks first'; \
	section 'Release'; \
	row 'make version-check' 'Check package.json versions match'; \
	row 'make bump-version v=1.2.3' 'Set every package version'; \
	row 'make bump-patch|bump-minor|bump-major' 'Increment that part of every version'; \
	row 'make release v=1.2.3' 'Tag a production release from main'; \
	row 'make release v=1.2.3-dev' 'Tag a dev release from dev'; \
	row 'make release v=1.2.3-beta.1' 'Tag a beta release from dev'; \
	row 'make retag v=1.2.3' 'Delete and re-push a tag'; \
	row 'make release-widget v=1.2.3' 'Bump the widget version and publish to npm'; \
	section 'Notes'; \
	printf '  %s\n' \
		'- Run make dev or make local, not both: they use the same ports.' \
		'- The server is not published in local or production containers; use the frontends.'

.DEFAULT_GOAL := help
