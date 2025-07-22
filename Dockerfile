# Multi-stage build for production
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S envkey -u 1001 -G nodejs

# Copy built application and production dependencies
COPY --from=builder --chown=envkey:nodejs /app/dist ./dist
COPY --from=builder --chown=envkey:nodejs /app/package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Create directories with proper permissions
RUN mkdir -p /app/data /app/config /app/logs && \
    chown -R envkey:nodejs /app/data /app/config /app/logs

# Copy configuration files
COPY --chown=envkey:nodejs config/ ./config/

# Switch to non-root user
USER envkey

# Expose port
EXPOSE 3000

# Health check using dedicated script
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node dist/scripts/docker-healthcheck.js

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application using our startup script
CMD ["node", "dist/scripts/start.js"]