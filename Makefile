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

DEFAULT_GOAL := help

.PHONY: help help-extra help-all ensure-deps setup dev docker build preview clean lint typecheck test check doctor docker-build docker-run docker-tag docker-push docker-dev docker-logs docker-shell up down assets optimize stop-all compose start docker-all

start: setup dev

docker-all: docker-build docker-tag docker-push

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
	@printf '  make ensure-deps   Verify Node/npm and run full validation\n'
	@printf '  make doctor        Full health check (ensure-deps + check)\n'
	@printf '  make assets        Verify GLTF and texture assets are present\n'
	@printf '  make optimize      Optimize GLB/GLTF assets with Draco compression\n'
	@printf '  make preview       Preview production build on $(HOST):$(PORT)\n'
	@printf '  make stop-all      Stop all running services\n'
	@printf '  scripts/setup.sh --help  Unified setup tool (deps/assets/optimize)\n\n'
	@printf '🐳 Docker & releases:\n'
	@printf '  make docker-dev    Start docker-compose with --build\n'
	@printf '  make up            Start docker-compose (detached)\n'
	@printf '  make down          Stop docker-compose\n'
	@printf '  make docker-logs   Tail docker-compose logs\n'
	@printf '  make docker-shell  Open shell in $(SERVICE) container\n'
	@printf '  make docker-run    Run production image on port 8080\n'
	@printf '  make docker-build  Build production image ($(IMAGE))\n'
	@printf '  make docker-tag    Tag image for $(REPO)\n'
	@printf '  make docker-push   Push to GitHub Container Registry\n'
	@printf '  make docker-all    Build + tag + push (full release)\n'

help-all: help help-extra

ensure-deps:
	./scripts/setup.sh --only-deps

setup:
	./scripts/setup.sh


dev: stop-all
	@printf 'Starting development server on %s:%s...\n' "$(HOST)" "$(PORT)"
	$(PKG) run dev -- --host $(HOST) --port $(PORT)

compose:
	$(DOCKER_COMPOSE) up $(COMPOSE_ARGS)

docker: stop-all
	@printf 'Starting docker-compose dev stack...\n'
	$(MAKE) compose

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



assets:
	./scripts/setup.sh --only-assets

optimize:
	./scripts/setup.sh --only-optimize

docker-build:
	docker build -f docker/Dockerfile -t $(IMAGE) .

docker-run:
	docker run --rm -p 8080:80 $(IMAGE)

docker-tag:
	test -n "$(REPO)" && docker tag $(IMAGE) $(REPO):latest

docker-push:
	test -n "$(REPO)" && docker push $(REPO):latest

docker-dev: stop-all
	@printf 'Starting docker-compose dev stack with --build...\n'
	$(MAKE) compose COMPOSE_ARGS="--build"

docker-logs:
	$(DOCKER_COMPOSE) logs -f

docker-shell:
	$(DOCKER_COMPOSE) exec $(SERVICE) sh

up:
	$(MAKE) compose COMPOSE_ARGS="-d"

down:
	$(DOCKER_COMPOSE) down
