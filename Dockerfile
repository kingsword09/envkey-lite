# Multi-stage build for production
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S envkey -u 1001

# Copy built application
COPY --from=builder --chown=envkey:nodejs /app/dist ./dist
COPY --from=builder --chown=envkey:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=envkey:nodejs /app/package*.json ./

# Create data directory for PGlite
RUN mkdir -p /app/data && chown -R envkey:nodejs /app/data

# Switch to non-root user
USER envkey

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "dist/index.js"]