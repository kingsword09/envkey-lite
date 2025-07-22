# EnvKey Lite Deployment Guide

This guide covers different deployment options for EnvKey Lite, from local development to production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Health Monitoring](#health-monitoring)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- At least 512MB RAM
- 1GB disk space (for file-based database)

### Option 1: Direct Node.js

```bash
# Clone and install
git clone <repository-url>
cd envkey-lite
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Initialize and start
npm run init
npm start
```

### Option 2: Docker

```bash
# Clone repository
git clone <repository-url>
cd envkey-lite

# Configure environment
cp .env.docker.example .env
# Edit .env with your settings

# Start with Docker Compose
docker-compose up -d
```

## Local Development

### Development Setup

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Or use Docker for development
npm run docker:dev
```

### Development Commands

```bash
# Database management
npm run init                    # Initialize database
npm run create-admin           # Create admin user
npm run manage status          # Show system status
npm run manage health          # Run health checks

# Configuration
npm run config check           # Check current configuration
npm run config validate .env   # Validate config file
npm run config generate        # Generate example config

# Testing
npm test                       # Run tests
npm run test:watch            # Watch mode
npm run test:coverage         # With coverage
```

## Docker Deployment

### Development with Docker

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop
docker-compose -f docker-compose.dev.yml down
```

### Production with Docker

```bash
# Configure environment
cp .env.docker.example .env
# Edit .env with production values

# Start production environment
docker-compose up -d

# View logs
docker-compose logs -f envkey-lite

# Stop
docker-compose down
```

### Docker Commands

```bash
# Build image
docker build -t envkey-lite .

# Run container
docker run -d \
  --name envkey-lite \
  -p 3000:3000 \
  -v envkey_data:/app/data \
  -e JWT_SECRET="your-secret" \
  -e ENCRYPTION_KEY="your-key" \
  envkey-lite

# Execute commands in container
docker exec envkey-lite node dist/scripts/manage.js status
docker exec envkey-lite node dist/scripts/manage.js health
```

## Production Deployment

### Security Checklist

Before deploying to production:

- [ ] Generate secure JWT_SECRET (64+ characters)
- [ ] Generate secure ENCRYPTION_KEY (32+ characters)
- [ ] Set appropriate CORS_ORIGIN
- [ ] Configure admin user credentials
- [ ] Set up HTTPS/TLS termination
- [ ] Configure log retention
- [ ] Set up monitoring and alerting
- [ ] Plan backup strategy

### Environment Variables

Required for production:

```bash
# Security (REQUIRED)
JWT_SECRET=your-super-secure-jwt-secret-with-at-least-64-characters
ENCRYPTION_KEY=your-32-character-encryption-key
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=secure-admin-password

# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=https://yourdomain.com

# Database
DATABASE_DIR=/app/data

# Logging
LOG_LEVEL=warn
AUDIT_LOG_RETENTION_DAYS=365

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=50
SESSION_TIMEOUT_HOURS=8
```

### Reverse Proxy Setup

#### Nginx Example

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

#### Traefik Example

```yaml
version: '3.8'

services:
  envkey-lite:
    image: envkey-lite
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.envkey.rule=Host(\`yourdomain.com\`)"
      - "traefik.http.routers.envkey.tls=true"
      - "traefik.http.routers.envkey.tls.certresolver=letsencrypt"
      - "traefik.http.services.envkey.loadbalancer.server.port=3000"
      - "traefik.http.routers.envkey.middlewares=secure-headers"
    networks:
      - traefik
    volumes:
      - envkey_data:/app/data
    environment:
      - NODE_ENV=production
      # ... other environment variables

networks:
  traefik:
    external: true
```

### Systemd Service

For direct Node.js deployment:

```ini
# /etc/systemd/system/envkey-lite.service
[Unit]
Description=EnvKey Lite
After=network.target

[Service]
Type=simple
User=envkey
WorkingDirectory=/opt/envkey-lite
ExecStart=/usr/bin/node dist/scripts/start.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/envkey-lite/.env

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/envkey-lite/data

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable envkey-lite
sudo systemctl start envkey-lite
sudo systemctl status envkey-lite
```

## Configuration

### Configuration Files

EnvKey Lite loads configuration from multiple sources in order of precedence:

1. Environment variables
2. `.env` file
3. `.env.local` file
4. `config/app.env` file
5. `/etc/envkey-lite/config.env` file
6. `config/default.env` file (built-in defaults)

### Configuration Validation

```bash
# Validate current configuration
npm run config check

# Validate specific file
npm run config validate .env.production

# Generate example configuration
npm run config generate .env.example
```

### Key Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server host |
| `DATABASE_DIR` | `undefined` | Database directory (empty = in-memory) |
| `JWT_SECRET` | *required* | JWT signing secret (32+ chars) |
| `ENCRYPTION_KEY` | *required* | Data encryption key (32+ chars) |
| `LOG_LEVEL` | `info` | Logging level |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Rate limit per window |
| `SESSION_TIMEOUT_HOURS` | `24` | Session timeout |
| `AUDIT_LOG_RETENTION_DAYS` | `90` | Audit log retention |

## Health Monitoring

### Health Check Endpoint

```bash
# Check application health
curl http://localhost:3000/health

# Example response
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600000,
  "checks": {
    "database": {
      "status": "pass",
      "message": "Database is healthy",
      "responseTime": 5
    },
    "memory": {
      "status": "pass",
      "message": "Memory usage normal",
      "details": {
        "heapUsagePercent": "45.2%"
      }
    }
  }
}
```

### Monitoring Commands

```bash
# System status
npm run manage status

# Health check
npm run manage health

# List users
npm run manage list-users
```

### Monitoring Integration

#### Prometheus Metrics

The health endpoint can be scraped by Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'envkey-lite'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/health'
    scrape_interval: 30s
```

#### Uptime Monitoring

Configure external monitoring services to check:
- `GET /health` - Application health
- Response time < 1000ms
- Status code 200
- Response contains `"status": "healthy"`

## Backup and Recovery

### Database Backup

For file-based database:

```bash
# Create backup
tar -czf envkey-backup-$(date +%Y%m%d).tar.gz data/

# Restore backup
tar -xzf envkey-backup-20240101.tar.gz
```

### Docker Volume Backup

```bash
# Backup Docker volume
docker run --rm -v envkey_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/envkey-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore Docker volume
docker run --rm -v envkey_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/envkey-backup-20240101.tar.gz -C /data
```

### Automated Backup Script

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/envkey-lite"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="envkey-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

# Create backup
docker run --rm \
  -v envkey_data:/data \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/$BACKUP_FILE" -C /data .

# Keep only last 7 backups
find "$BACKUP_DIR" -name "envkey-backup-*.tar.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"
```

## Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check configuration
npm run config check

# Check logs
docker-compose logs envkey-lite

# Check system status
npm run manage status
```

#### Database Issues

```bash
# Reset database (WARNING: deletes all data)
npm run manage reset-db -- --confirm

# Reinitialize
npm run init
npm run create-admin
```

#### Permission Issues

```bash
# Fix file permissions
sudo chown -R envkey:envkey /app/data
sudo chmod -R 755 /app/data
```

#### Memory Issues

```bash
# Check memory usage
npm run manage health

# Increase Docker memory limit
docker-compose up -d --memory=1g
```

### Log Analysis

```bash
# View application logs
docker-compose logs -f envkey-lite

# Filter error logs
docker-compose logs envkey-lite | grep ERROR

# View system logs (systemd)
sudo journalctl -u envkey-lite -f
```

### Performance Tuning

#### Database Performance

- Use file-based database for persistence
- Regular cleanup of audit logs
- Monitor disk space

#### Memory Optimization

- Set appropriate Node.js memory limits
- Monitor heap usage via health endpoint
- Consider horizontal scaling for high load

#### Rate Limiting

Adjust rate limits based on usage:

```bash
# High traffic
RATE_LIMIT_MAX_REQUESTS=500
RATE_LIMIT_WINDOW_MS=900000

# Low traffic
RATE_LIMIT_MAX_REQUESTS=50
RATE_LIMIT_WINDOW_MS=900000
```

### Getting Help

1. Check this deployment guide
2. Review application logs
3. Run health checks
4. Check GitHub issues
5. Contact support

---

For more information, see the main [README.md](README.md) file.