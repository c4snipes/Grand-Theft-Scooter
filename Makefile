SHELL := /bin/sh
PKG ?= npm
PORT ?= 5173
HOST ?= 0.0.0.0
IMAGE ?= grand-theft-scooter
REGISTRY ?= ghcr.io
REPO ?= $(REGISTRY)/c4snipes/grand-theft-scooter
DC_DEV ?= .docker-compose.yml
SERVICE ?= web
DOCKER_COMPOSE ?= docker compose -f $(DC_DEV)
DEV_FLAGS ?= --host $(HOST) --port $(PORT)
PREVIEW_FLAGS ?= --host $(HOST) --port $(PORT)
GLTF_IMAGE ?= gltf-transform
GLTF_REPO ?= $(REGISTRY)/c4snipes/gltf-transform
GLTF_DOCKERFILE ?= docker/gltf-transform/Dockerfile

DEFAULT_GOAL := help

.PHONY: help help-extra help-all setup dev docker docker-stop build preview clean lint typecheck test check doctor docker-build docker-run docker-tag docker-push docker-logs docker-shell stop-all start docker-all docker-build-gltf docker-tag-gltf docker-push-gltf

start: setup dev

docker-all: docker-build docker-build-gltf docker-tag docker-tag-gltf docker-push docker-push-gltf

help:
	@printf 'Usage: make <target>\n\n'
	@printf '⚡ Essentials:\n'
	@printf '  make start         Install deps + start dev server (recommended)\n'
	@printf '  make setup         Install dependencies (npm ci)\n'
	@printf '  make dev           Start development server on $(HOST):$(PORT)\n'
	@printf '  make check         Run lint, typecheck, and tests\n'
	@printf '  make build         Build production assets\n'
	@printf '  make clean         Remove node_modules and dist\n'
	@printf '  make docker        Start docker-compose dev stack in foreground\n\n'
	@printf 'Need more? Run: make help-extra (or make help-all)\n'

help-extra:
	@printf '🧰 Tooling & validation:\n'
	@printf '  make setup SETUP_ARGS=\"--only-deps\"      Verify Node/npm\n'
	@printf '  make setup SETUP_ARGS=\"--only-assets\"   Verify GLTF and texture assets\n'
	@printf '  make setup SETUP_ARGS=\"--only-optimize\" Optimize GLB/GLTF assets with Draco compression\n'
	@printf '  make doctor                              Full health check (deps + check)\n'
	@printf '  make preview                             Preview production build on $(HOST):$(PORT)\n'
	@printf '  make stop-all      Stop all running services\n'
	@printf '  scripts/setup.sh --help  Unified setup tool (deps/assets/optimize)\n\n'
	@printf '🐳 Docker & releases:\n'
	@printf '  make docker REBUILD=1   Start docker-compose with --build\n'
	@printf '  make docker DETACH=1    Start docker-compose detached\n'
	@printf '  make docker-stop        Stop docker-compose stack\n'
	@printf '  make docker-logs   Tail docker-compose logs\n'
	@printf '  make docker-shell  Open shell in $(SERVICE) container\n'
	@printf '  make docker-run    Run production image on port 8080\n'
	@printf '  make docker-build  Build production image ($(IMAGE))\n'
	@printf '  make docker-tag    Tag image for $(REPO)\n'
	@printf '  make docker-push   Push to GitHub Container Registry\n'
	@printf '  make docker-all    Build + tag + push (full release)\n'

help-all: help help-extra

setup:
	./scripts/setup.sh $(SETUP_ARGS)


dev: stop-all
	@printf 'Starting development server on %s:%s...\n' "$(HOST)" "$(PORT)"
	$(PKG) run dev -- --host $(HOST) --port $(PORT)

docker: stop-all
	@printf 'Starting docker-compose dev stack...\n'
	$(DOCKER_COMPOSE) up $(if $(REBUILD),--build,) $(if $(DETACH),-d,) $(COMPOSE_ARGS)

docker-stop:
	$(DOCKER_COMPOSE) down

stop-all:
	@printf 'Stopping any running services...\n'
	-$(DOCKER_COMPOSE) down 2>/dev/null || true
	-docker stop $$(docker ps -q --filter "ancestor=$(IMAGE)") 2>/dev/null || true
	-pkill -f "vite.*$(PORT)" 2>/dev/null || true


build:
	$(PKG) run build


clean:
	rm -rf node_modules
	rm -rf dist
	rm -rf build
	rm -rf .output
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) rm -f


lint:
	$(PKG) run lint --if-present

typecheck:
	$(PKG) run typecheck --if-present

test:
	$(PKG) test --if-present

check: lint typecheck test

doctor:
	$(MAKE) setup SETUP_ARGS="--only-deps"
	$(MAKE) check

preview:
	$(PKG) run preview -- $(PREVIEW_FLAGS)

docker-build:
	@$(MAKE) docker-check
	docker build -f docker/Dockerfile -t $(IMAGE) .

docker-build-gltf:
	@$(MAKE) docker-check
	docker build -f $(GLTF_DOCKERFILE) -t $(GLTF_IMAGE) .

docker-check:
	@echo "Checking Docker daemon..."
	@docker info >/dev/null 2>&1 || (echo "Docker daemon not available. Start Docker Desktop (open -a Docker) and wait until it's running, then retry." >&2; exit 1)

docker-run:
	docker run --rm -p 8080:80 $(IMAGE)

docker-tag:
	test -n "$(REPO)" && docker tag $(IMAGE) $(REPO):latest

docker-tag-gltf:
	test -n "$(GLTF_REPO)" && docker tag $(GLTF_IMAGE) $(GLTF_REPO):latest

docker-push:
	test -n "$(REPO)" && docker push $(REPO):latest

docker-push-gltf:
	test -n "$(GLTF_REPO)" && docker push $(GLTF_REPO):latest

docker-logs:
	$(DOCKER_COMPOSE) logs -f

docker-shell:
	$(DOCKER_COMPOSE) exec $(SERVICE) sh
