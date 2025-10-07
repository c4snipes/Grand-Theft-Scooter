SHELL := /bin/sh
PKG ?= npm
PORT ?= 5173
PREVIEW_PORT ?= 8080
HOST ?= 0.0.0.0
IMAGE ?= grand-theft-scooter
REGISTRY ?= ghcr.io
REPO ?= $(REGISTRY)/$(GITHUB_REPOSITORY)
DC_DEV ?= docker-compose.dev.yml
SERVICE ?= web
DOCKER_COMPOSE ?= docker compose -f $(DC_DEV)
DEV_FLAGS ?= --host $(HOST) --port $(PORT)
PREVIEW_FLAGS ?= --host $(HOST) --port $(PREVIEW_PORT)

DEFAULT_GOAL := help

.PHONY: help ensure-deps setup dev-local dev build preview clean lint typecheck test check doctor docker-build docker-run docker-tag docker-push docker-dev docker-logs docker-shell up down assets

help:
	@printf 'Usage: make <target>\n\n'
	@printf 'Local workflow:\n'
	@printf '  make ensure-deps   Verify Node/npm and optional tools\n'
	@printf '  make setup         Install dependencies (npm ci)\n'
	@printf '  make assets        Confirm GLTF and texture assets are present\n'
	@printf '  make dev-local     Run Vite dev server on $(HOST):$(PORT)\n'
	@printf '  make preview       Preview production build on $(HOST):$(PREVIEW_PORT)\n'
	@printf '  make build         Build production assets\n'
	@printf '  make clean         Remove node_modules and dist\n'
	@printf '  make check         Run lint, typecheck, and tests\n'
	@printf '  make doctor        Run ensure-deps followed by check\n\n'
	@printf 'Docker workflow:\n'
	@printf '  make dev           Start docker-compose dev stack (foreground)\n'
	@printf '  make docker-dev    Start docker-compose dev stack with --build\n'
	@printf '  make up            Start docker-compose dev stack (detached)\n'
	@printf '  make down          Stop docker-compose dev stack\n'
	@printf '  make docker-build  Build production image ($(IMAGE))\n'
	@printf '  make docker-run    Run production image on port 8080\n'
	@printf '  make docker-tag    Tag image for registry push\n'
	@printf '  make docker-push   Push tagged image to $(REPO)\n'
	@printf '  make docker-logs   Tail docker-compose logs\n'
	@printf '  make docker-shell  Open a shell inside the $(SERVICE) container\n'

ensure-deps:
	SKIP_NPM_INSTALL=1 ./scripts/ensure-deps.sh
	$(PKG) install
	$(PKG) run build
	$(PKG) run lint
	$(PKG) run typecheck
	$(PKG) test --if-present


setup: ensure-deps
	$(PKG) ci
	$(PKG) run build
	$(PKG) run lint
	$(PKG) run typecheck
	$(PKG) test --if-present


dev-local:
	$(PKG) run dev -- $(DEV_FLAGS)
	$(PKG) run build
	$(PKG) run lint
	$(PKG) run typecheck
	$(PKG) test --if-present


dev:
	$(DOCKER_COMPOSE) up


build:
	$(PKG) run build

preview:
	$(PKG) run preview -- $(PREVIEW_FLAGS)


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
	@test -f public/assets/mall_kiosk.gltf
	@test -f public/assets/mall_floor_tile.gltf
	@test -f public/assets/mall_floor.png
	@test -f public/assets/mall_column.gltf
	@test -f public/assets/mall_banner.gltf
	@test -f public/assets/mall_banner.png
	@printf 'Mall assets located in public/assets/ are ready.\\n'

docker-build:
	docker build -t $(IMAGE) .

docker-run:
	docker run --rm -p 8080:80 $(IMAGE)

docker-tag:
	test -n "$(REPO)" && docker tag $(IMAGE) $(REPO):latest

docker-push:
	test -n "$(REPO)" && docker push $(REPO):latest

docker-dev:
	$(DOCKER_COMPOSE) up --build

docker-logs:
	$(DOCKER_COMPOSE) logs -f

docker-shell:
	$(DOCKER_COMPOSE) exec $(SERVICE) sh

up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down
