# BugPin Dockerfile
# Multi-stage build for optimized production image

ARG BUN_VERSION=1.4.4

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM oven/bun:${BUN_VERSION}-alpine AS dev

# Pull latest Alpine security patches (libssl3, libcrypto3, musl, zlib, etc.)
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Install dependencies first (better layer caching)
# Copy package manifests and the required lockfile
COPY package.json bun.lock ./
COPY src/server/package.json ./src/server/
COPY src/admin/package.json ./src/admin/
COPY src/widget/package.json ./src/widget/
COPY src/portal/package.json ./src/portal/
COPY src/shared-ui/package.json ./src/shared-ui/

# Install the exact dependency graph from the committed lockfile
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

FROM dev AS builder

# Stamp version from build arg (set by CI from git tag) into package.json
# so both the admin build and server runtime pick it up automatically
ARG APP_VERSION
RUN if [ -n "$APP_VERSION" ]; then \
    bun -e "const fs=require('fs');const p='./package.json';const j=JSON.parse(fs.readFileSync(p));j.version='$APP_VERSION';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');"; \
  fi

# Build Admin Console, reporter portal, and widget
RUN bun run build:admin && bun run build:portal && bun run build:widget

# Build EE module (compile TypeScript to JavaScript) if submodule is present
# Create stub files for CE-only builds so COPY commands don't fail
RUN if [ -d "ee/src" ]; then bun run check:ee; fi && \
    mkdir -p ee/dist && \
    (test -f ee/package.json || echo '{}' > ee/package.json) && \
    (test -f ee/tsconfig.json || echo '{}' > ee/tsconfig.json)

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM oven/bun:${BUN_VERSION}-alpine AS runtime

WORKDIR /app

# Pull latest Alpine security patches (libssl3, libcrypto3, musl, zlib, etc.)
# and install tini for signal handling and wget for health checks.
RUN apk update && apk upgrade --no-cache && apk add --no-cache tini wget

# Copy the workspace manifests and lockfile before installing server dependencies
COPY package.json bun.lock ./
COPY src/server/package.json ./src/server/
COPY src/admin/package.json ./src/admin/
COPY src/widget/package.json ./src/widget/
COPY src/portal/package.json ./src/portal/
COPY src/shared-ui/package.json ./src/shared-ui/
RUN bun install --production --frozen-lockfile --filter @bugpin/server

# Copy server source (Bun runs TypeScript directly)
COPY src/server ./src/server
COPY src/shared ./src/shared

# Copy Enterprise Edition compiled output only (no TypeScript source)
COPY --from=builder /app/ee/dist ./ee/dist
COPY --from=builder /app/ee/package.json ./ee/package.json
COPY --from=builder /app/ee/tsconfig.json ./ee/tsconfig.json

# Copy entire widget source directory (includes dist/ and test-widget.html)
COPY --from=builder /app/src/widget ./src/widget

# Copy default branding assets (required for fallback when no custom branding uploaded)
COPY --from=builder /app/src/admin/public/branding ./src/admin/public/branding

# Create data directory and fix permissions for bun user
RUN mkdir -p /data/uploads /run/bugpin && chown -R bun:bun /data /app /run/bugpin

# Environment configuration
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=7300
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:7300/health || exit 1

# Switch to non-root user
USER bun

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start server
CMD ["bun", "run", "src/server/index.ts"]

FROM runtime AS server
ENV PORT=4300 TRUST_PROXY=token PROXY_TOKEN_FILE=/run/bugpin/proxy-token
EXPOSE 4300
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:4300/health || exit 1

FROM nginxinc/nginx-unprivileged:1.30.6-alpine AS frontend
USER root
RUN apk upgrade --no-cache && apk add --no-cache curl ca-certificates && \
    rm /etc/nginx/conf.d/default.conf && \
    mkdir -p /etc/nginx/conf.d/shared && chown -R nginx:nginx /etc/nginx/conf.d
COPY deploy/nginx/shared/ /etc/nginx/templates/shared/
COPY --chmod=755 deploy/nginx/15-bugpin.envsh /docker-entrypoint.d/15-bugpin.envsh
ENV BUGPIN_SERVER_URL=http://bugpin-server:4300 \
    BUGPIN_SERVER_CA_FILE=/etc/ssl/certs/ca-certificates.crt \
    BUGPIN_RESOLVER=127.0.0.11 \
    BUGPIN_PUBLIC_SCHEME=http \
    BUGPIN_TRUSTED_PROXIES= \
    BUGPIN_PROXY_TOKEN_FILE=/run/bugpin/proxy-token \
    NGINX_ENVSUBST_FILTER=^BUGPIN_
USER nginx

FROM frontend AS admin
COPY deploy/nginx/admin.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist/admin /usr/share/nginx/html/admin
COPY --from=builder /app/dist/portal /usr/share/nginx/html/reporter-portal
EXPOSE 7300
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:7300/admin-health > /dev/null || exit 1

FROM frontend AS portal
COPY deploy/nginx/portal.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist/portal /usr/share/nginx/html/reporter-portal
EXPOSE 7310
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:7310/portal-health > /dev/null || exit 1

# The final target preserves the default single-image build.
FROM runtime AS production
EXPOSE 7300
COPY --from=builder /app/dist/admin ./dist/admin
COPY --from=builder /app/dist/portal ./dist/portal
