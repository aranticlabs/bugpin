# BugPin Dockerfile
# Multi-stage build for optimized production image

# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
# Copy package.json files (lockfile is optional)
COPY package.json ./
COPY bun.lock* ./
COPY src/server/package.json ./src/server/
COPY src/admin/package.json ./src/admin/
COPY src/widget/package.json ./src/widget/

# Install dependencies (canvas is optional and may fail on Alpine, which is OK)
RUN bun install; exit 0

# Copy source code
COPY . .

# Build admin portal and widget
RUN bun run build:admin && bun run build:widget

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM oven/bun:1-alpine

WORKDIR /app

# Install tini for proper signal handling and wget for health checks
RUN apk add --no-cache tini wget

# Copy server package.json and install production dependencies only
# We use the server's package.json directly to avoid workspace issues
COPY src/server/package.json ./src/server/
WORKDIR /app/src/server
RUN bun install --production

# Back to app root
WORKDIR /app

# Copy server source (Bun runs TypeScript directly)
COPY src/server ./src/server
COPY src/shared ./src/shared

# Copy built frontend assets from builder
COPY --from=builder /app/dist/admin ./dist/admin

# Copy entire widget source directory (includes dist/ and test-widget.html)
COPY --from=builder /app/src/widget ./src/widget

# Copy default branding assets (required for fallback when no custom branding uploaded)
COPY --from=builder /app/src/admin/public/branding ./src/admin/public/branding

# Create data directory and fix permissions for bun user
RUN mkdir -p /data/uploads && chown -R bun:bun /data /app

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

# Expose port
EXPOSE 7300

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start server
CMD ["bun", "run", "src/server/index.ts"]
