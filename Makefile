SHELL := /bin/sh
PKG ?= npm
PORT ?= 5173
PREVIEW_PORT ?= 8080
IMAGE ?= grand-theft-scooter
REGISTRY ?= ghcr.io
REPO ?= $(REGISTRY)/$(GITHUB_REPOSITORY)
DC_DEV ?= docker-compose.dev.yml

.PHONY: ensure-deps setup dev build preview clean lint typecheck test docker-build docker-run docker-tag docker-push docker-dev up down

ensure-deps:
	SKIP_NPM_INSTALL=1 ./scripts/ensure-deps.sh

setup: ensure-deps
	$(PKG) ci

dev:
	docker compose -f $(DC_DEV) up

build:
	$(PKG) run build

preview:
	$(PKG) run preview -- --host 0.0.0.0 --port $(PREVIEW_PORT)

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
	docker compose -f $(DC_DEV) up --build

up:
	docker compose -f $(DC_DEV) up -d

down:
	docker compose -f $(DC_DEV) down