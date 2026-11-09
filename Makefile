.DEFAULT_GOAL := help
.PHONY: help dev dev-server dev-admin dev-widget dev-portal build build-server build-admin build-widget build-portal typecheck typecheck-server typecheck-admin typecheck-widget typecheck-shared-ui typecheck-portal typecheck-ee typecheck-tests test test-server test-admin test-widget test-portal test-ee test-e2e check-ee knip format format-check check-widget-size check-portal-bundle check-dependency-age start migrate reset-password reset-two-factor reset-portal-origin repair-github-links

help:
	@echo "BugPin targets: dev dev-server dev-admin dev-widget dev-portal build build-server build-admin build-widget build-portal typecheck typecheck-server typecheck-admin typecheck-widget typecheck-shared-ui typecheck-portal typecheck-ee typecheck-tests test test-server test-admin test-widget test-portal test-ee test-e2e check-ee knip format format-check check-widget-size check-portal-bundle check-dependency-age start migrate reset-password reset-two-factor reset-portal-origin repair-github-links"

dev:
	bun run dev

dev-server:
	bun run dev:server

dev-admin:
	bun run dev:admin

dev-widget:
	bun run dev:widget

dev-portal:
	bun run dev:portal

build:
	bun run build

build-server:
	bun run build:server

build-admin:
	bun run build:admin

build-widget:
	bun run build:widget

build-portal:
	bun run build:portal

typecheck:
	bun run typecheck

typecheck-server:
	bun run typecheck:server

typecheck-admin:
	bun run typecheck:admin

typecheck-widget:
	bun run typecheck:widget

typecheck-shared-ui:
	bun run typecheck:shared-ui

typecheck-portal:
	bun run typecheck:portal

typecheck-ee:
	bun run typecheck:ee

typecheck-tests:
	bun run typecheck:tests

test:
	bun run test

test-server:
	bun run test:server

test-admin:
	bun run test:admin

test-widget:
	bun run test:widget

test-portal:
	bun run test:portal

test-ee:
	bun run test:ee

test-e2e:
	bun run test:e2e

check-ee:
	bun run check:ee

knip:
	bun run knip

format:
	bun run format

format-check:
	bun run format:check

check-widget-size:
	bun run check:widget-size

check-portal-bundle:
	bun run check:portal-bundle

check-dependency-age:
	bun run check:dependency-age

start:
	bun run start

migrate:
	bun run migrate

reset-password:
	bun run reset-password

reset-two-factor:
	bun run reset-two-factor

reset-portal-origin:
	bun run reset-portal-origin

repair-github-links:
	bun run repair-github-links
