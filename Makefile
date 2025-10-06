SHELL := /bin/sh
PKG ?= npm
PORT ?= 5173
PREVIEW_PORT ?= 8080
HOST ?= 0.0.0.0
IMAGE ?= grand-theft-scooter
REGISTRY ?= ghcr.io
REPO ?= $(REGISTRY)/$(GITHUB_REPOSITORY)
DC_DEV ?= docker-compose.dev.yml
DOCKER_COMPOSE ?= docker compose -f $(DC_DEV)
DEV_FLAGS ?= --host $(HOST) --port $(PORT)
PREVIEW_FLAGS ?= --host $(HOST) --port $(PREVIEW_PORT)

DEFAULT_GOAL := help

.PHONY: help ensure-deps setup dev-local dev build preview clean lint typecheck test docker-build docker-run docker-tag docker-push docker-dev up down

help:
	@printf 'Usage: make <target>\n\n'
	@printf 'Local workflow:\n'
	@printf '  make ensure-deps   Verify Node/npm and optional tools\n'
	@printf '  make setup         Install dependencies (npm ci)\n'
	@printf '  make dev-local     Run Vite dev server on $(HOST):$(PORT)\n'
	@printf '  make preview       Preview production build on $(HOST):$(PREVIEW_PORT)\n'
	@printf '  make build         Build production assets\n'
	@printf '  make clean         Remove node_modules and dist\n\n'
	@printf 'Docker workflow:\n'
	@printf '  make dev           Start docker-compose dev stack (foreground)\n'
	@printf '  make docker-dev    Start docker-compose dev stack with --build\n'
	@printf '  make up            Start docker-compose dev stack (detached)\n'
	@printf '  make down          Stop docker-compose dev stack\n'
	@printf '  make docker-build  Build production image ($(IMAGE))\n'
	@printf '  make docker-run    Run production image on port 8080\n'
	@printf '  make docker-tag    Tag image for registry push\n'
	@printf '  make docker-push   Push tagged image to $(REPO)\n'

ensure-deps:
	SKIP_NPM_INSTALL=1 ./scripts/ensure-deps.sh

setup: ensure-deps
	$(PKG) ci

dev-local:
	$(PKG) run dev -- $(DEV_FLAGS)

dev:
	$(DOCKER_COMPOSE) up

build:
	$(PKG) run build

preview:
	$(PKG) run preview -- $(PREVIEW_FLAGS)

clean:
	rm -rf node_modules dist

lint:
	$(PKG) run lint --if-present

typecheck:
	$(PKG) run typecheck --if-present

test:
	$(PKG) test --if-present

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

up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down
