#!/bin/bash

# EnvKey Lite Production Deployment Script
# This script automates the deployment process for production environments

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_USER="${DEPLOY_USER:-envkey}"
DEPLOY_GROUP="${DEPLOY_GROUP:-envkey}"
INSTALL_DIR="${INSTALL_DIR:-/opt/envkey-lite}"
DATA_DIR="${DATA_DIR:-/var/lib/envkey-lite}"
LOG_DIR="${LOG_DIR:-/var/log/envkey-lite}"
BACKUP_DIR="${BACKUP_DIR:-/backup/envkey-lite}"
SERVICE_NAME="${SERVICE_NAME:-envkey-lite}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Node.js version
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    local required_version="18.0.0"
    
    if ! printf '%s\n%s\n' "$required_version" "$node_version" | sort -V -C; then
        log_error "Node.js version $node_version is too old. Required: $required_version+"
        exit 1
    fi
    
    log_info "Node.js version: $node_version ✓"
    
    # Check npm
    if ! command -v npm >/dev/null 2>&1; then
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check available disk space
    local available_space=$(df / | awk 'NR==2 {print $4}')
    local required_space=1048576  # 1GB in KB
    
    if [[ $available_space -lt $required_space ]]; then
        log_error "Insufficient disk space. Required: 1GB, Available: $(($available_space / 1024))MB"
        exit 1
    fi
    
    log_info "System requirements check passed ✓"
}

# Create system user and group
create_user() {
    log_info "Creating system user and group..."
    
    # Create group if it doesn't exist
    if ! getent group "$DEPLOY_GROUP" >/dev/null 2>&1; then
        groupadd --system "$DEPLOY_GROUP"
        log_info "Created group: $DEPLOY_GROUP"
    fi
    
    # Create user if it doesn't exist
    if ! getent passwd "$DEPLOY_USER" >/dev/null 2>&1; then
        useradd --system --gid "$DEPLOY_GROUP" --home-dir "$INSTALL_DIR" \
                --shell /bin/false --comment "EnvKey Lite Service User" "$DEPLOY_USER"
        log_info "Created user: $DEPLOY_USER"
    fi
}

# Create directory structure
create_directories() {
    log_info "Creating directory structure..."
    
    local directories=(
        "$INSTALL_DIR"
        "$DATA_DIR"
        "$LOG_DIR"
        "$BACKUP_DIR"
        "/etc/envkey-lite"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        log_debug "Created directory: $dir"
    done
    
    # Set ownership and permissions
    chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR"
    chmod 755 "$INSTALL_DIR" "$DATA_DIR" "$BACKUP_DIR"
    chmod 750 "$LOG_DIR"
    chmod 755 "/etc/envkey-lite"
    
    log_info "Directory structure created ✓"
}

# Install application files
install_application() {
    log_info "Installing application files..."
    
    # Stop service if running
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        log_info "Stopping existing service..."
        systemctl stop "$SERVICE_NAME"
    fi
    
    # Backup existing installation
    if [[ -d "$INSTALL_DIR/dist" ]]; then
        log_info "Backing up existing installation..."
        mv "$INSTALL_DIR" "$INSTALL_DIR.backup.$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$INSTALL_DIR"
    fi
    
    # Copy application files
    cp -r "$PROJECT_ROOT"/* "$INSTALL_DIR/"
    
    # Install dependencies
    log_info "Installing dependencies..."
    cd "$INSTALL_DIR"
    npm ci --only=production --silent
    
    # Build application
    log_info "Building application..."
    npm run build
    
    # Set ownership and permissions
    chown -R "$DEPLOY_USER:$DEPLOY_GROUP" "$INSTALL_DIR"
    find "$INSTALL_DIR" -type f -exec chmod 644 {} \;
    find "$INSTALL_DIR" -type d -exec chmod 755 {} \;
    chmod +x "$INSTALL_DIR/scripts"/*.sh
    
    log_info "Application installed ✓"
}

# Configure environment
configure_environment() {
    log_info "Configuring environment..."
    
    local env_file="/etc/envkey-lite/.env"
    
    # Create production environment file if it doesn't exist
    if [[ ! -f "$env_file" ]]; then
        log_info "Creating production environment configuration..."
        
        # Generate JWT secret if not provided
        local jwt_secret="${JWT_SECRET:-$(openssl rand -base64 32)}"
        
        cat > "$env_file" << EOF
# EnvKey Lite Production Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Security
JWT_SECRET=$jwt_secret

# Paths
DATABASE_DIR=$DATA_DIR
LOG_FILE=$LOG_DIR/app.log

# HTTPS (configure as needed)
HTTPS_ENABLED=false
HTTPS_PORT=3443

# Security Headers
SECURITY_HEADERS_ENABLED=true
CSP_ENABLED=true
HSTS_ENABLED=true
FRAME_OPTIONS=DENY

# CORS (configure for your domain)
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_REQUESTS=true
LOG_RESPONSES=false

# Monitoring
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true
PERFORMANCE_MONITORING_ENABLED=true

# Backup
AUTO_BACKUP_ENABLED=true
BACKUP_DIR=$BACKUP_DIR
BACKUP_RETENTION_DAYS=30
EOF
        
        chmod 600 "$env_file"
        chown "$DEPLOY_USER:$DEPLOY_GROUP" "$env_file"
        
        log_info "Environment configuration created: $env_file"
        log_warn "Please review and update the configuration file before starting the service"
    else
        log_info "Environment configuration already exists: $env_file"
    fi
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."
    
    local service_file="/etc/systemd/system/$SERVICE_NAME.service"
    
    cat > "$service_file" << EOF
[Unit]
Description=EnvKey Lite - Environment Variable Management System
Documentation=https://github.com/your-org/envkey-lite
After=network.target
Wants=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node dist/index.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/etc/envkey-lite/.env

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR $LOG_DIR $BACKUP_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    log_info "Systemd service created and enabled ✓"
}

# Setup log rotation
setup_log_rotation() {
    log_info "Setting up log rotation..."
    
    local logrotate_file="/etc/logrotate.d/$SERVICE_NAME"
    
    cat > "$logrotate_file" << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $DEPLOY_USER $DEPLOY_GROUP
    postrotate
        systemctl reload $SERVICE_NAME > /dev/null 2>&1 || true
    endscript
}
EOF
    
    log_info "Log rotation configured ✓"
}

# Setup backup cron job
setup_backup_cron() {
    log_info "Setting up backup cron job..."
    
    local cron_file="/etc/cron.d/$SERVICE_NAME-backup"
    local backup_script="$INSTALL_DIR/scripts/production/backup.sh"
    
    cat > "$cron_file" << EOF
# EnvKey Lite Backup Cron Job
# Runs daily at 2:00 AM
0 2 * * * $DEPLOY_USER BACKUP_DIR=$BACKUP_DIR DATA_DIR=$DATA_DIR $backup_script >/dev/null 2>&1
EOF
    
    chmod 644 "$cron_file"
    
    log_info "Backup cron job configured ✓"
}

# Configure firewall (if ufw is available)
configure_firewall() {
    if command -v ufw >/dev/null 2>&1; then
        log_info "Configuring firewall..."
        
        # Allow SSH (if not already allowed)
        ufw allow ssh >/dev/null 2>&1 || true
        
        # Allow HTTP and HTTPS
        ufw allow 80/tcp >/dev/null 2>&1 || true
        ufw allow 443/tcp >/dev/null 2>&1 || true
        
        # Allow application port if different
        if [[ "${PORT:-3000}" != "80" && "${PORT:-3000}" != "443" ]]; then
            ufw allow "${PORT:-3000}/tcp" >/dev/null 2>&1 || true
        fi
        
        log_info "Firewall configured ✓"
    else
        log_warn "UFW not found, skipping firewall configuration"
    fi
}

# Initialize database
initialize_database() {
    log_info "Initializing database..."
    
    cd "$INSTALL_DIR"
    
    # Run as the service user
    sudo -u "$DEPLOY_USER" npm run init
    
    log_info "Database initialized ✓"
}

# Create admin user
create_admin_user() {
    if [[ "${CREATE_ADMIN:-true}" == "true" ]]; then
        log_info "Creating admin user..."
        
        cd "$INSTALL_DIR"
        
        # Run as the service user
        sudo -u "$DEPLOY_USER" npm run create-admin
        
        log_info "Admin user created ✓"
    fi
}

# Start service
start_service() {
    log_info "Starting EnvKey Lite service..."
    
    systemctl start "$SERVICE_NAME"
    
    # Wait for service to start
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "Service started successfully ✓"
        
        # Show service status
        systemctl status "$SERVICE_NAME" --no-pager -l
    else
        log_error "Failed to start service"
        log_error "Check logs: journalctl -u $SERVICE_NAME -f"
        exit 1
    fi
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    local health_url="http://localhost:${PORT:-3000}/health"
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -s "$health_url" >/dev/null 2>&1; then
            log_info "Health check passed ✓"
            break
        fi
        
        log_debug "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Health check failed after $max_attempts attempts"
        log_error "Check service logs: journalctl -u $SERVICE_NAME -f"
        exit 1
    fi
    
    # Show installation summary
    log_info "Installation completed successfully!"
    echo ""
    echo "Installation Summary:"
    echo "  Service Name:     $SERVICE_NAME"
    echo "  Install Directory: $INSTALL_DIR"
    echo "  Data Directory:   $DATA_DIR"
    echo "  Log Directory:    $LOG_DIR"
    echo "  Backup Directory: $BACKUP_DIR"
    echo "  Config File:      /etc/envkey-lite/.env"
    echo "  Service User:     $DEPLOY_USER"
    echo ""
    echo "Service Management:"
    echo "  Start:   systemctl start $SERVICE_NAME"
    echo "  Stop:    systemctl stop $SERVICE_NAME"
    echo "  Restart: systemctl restart $SERVICE_NAME"
    echo "  Status:  systemctl status $SERVICE_NAME"
    echo "  Logs:    journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "Access the application at: http://localhost:${PORT:-3000}"
    echo ""
    log_warn "Please review the configuration file: /etc/envkey-lite/.env"
    log_warn "Update CORS_ORIGIN and other settings for your environment"
}

# Show usage
show_usage() {
    cat << EOF
EnvKey Lite Production Deployment Script

Usage: $0 [options]

Options:
  -h, --help              Show this help message
  --skip-admin            Skip admin user creation
  --skip-backup-cron      Skip backup cron job setup
  --skip-firewall         Skip firewall configuration

Environment variables:
  DEPLOY_USER             Service user name (default: envkey)
  DEPLOY_GROUP            Service group name (default: envkey)
  INSTALL_DIR             Installation directory (default: /opt/envkey-lite)
  DATA_DIR                Data directory (default: /var/lib/envkey-lite)
  LOG_DIR                 Log directory (default: /var/log/envkey-lite)
  BACKUP_DIR              Backup directory (default: /backup/envkey-lite)
  SERVICE_NAME            Systemd service name (default: envkey-lite)
  JWT_SECRET              JWT secret key (auto-generated if not set)
  PORT                    Application port (default: 3000)

Examples:
  $0                                    # Full deployment
  $0 --skip-admin                      # Deploy without creating admin user
  INSTALL_DIR=/app/envkey-lite $0      # Custom installation directory

EOF
}

# Parse command line arguments
SKIP_ADMIN=false
SKIP_BACKUP_CRON=false
SKIP_FIREWALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        --skip-admin)
            SKIP_ADMIN=true
            shift
            ;;
        --skip-backup-cron)
            SKIP_BACKUP_CRON=true
            shift
            ;;
        --skip-firewall)
            SKIP_FIREWALL=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Set options based on flags
[[ "$SKIP_ADMIN" == "true" ]] && CREATE_ADMIN=false

# Main deployment function
main() {
    log_info "Starting EnvKey Lite production deployment..."
    
    # Pre-deployment checks
    check_root
    check_requirements
    
    # System setup
    create_user
    create_directories
    
    # Application deployment
    install_application
    configure_environment
    
    # Service setup
    create_systemd_service
    setup_log_rotation
    
    # Optional components
    [[ "$SKIP_BACKUP_CRON" != "true" ]] && setup_backup_cron
    [[ "$SKIP_FIREWALL" != "true" ]] && configure_firewall
    
    # Database initialization
    initialize_database
    [[ "${CREATE_ADMIN:-true}" == "true" ]] && create_admin_user
    
    # Start and verify
    start_service
    verify_installation
}

# Run main function
main "$@"