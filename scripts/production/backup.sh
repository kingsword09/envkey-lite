#!/bin/bash

# EnvKey Lite Backup Script
# This script creates backups of the EnvKey Lite data and configuration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/backup/envkey-lite}"
DATA_DIR="${DATA_DIR:-$PROJECT_ROOT/data}"
CONFIG_DIR="${CONFIG_DIR:-$PROJECT_ROOT}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="envkey-lite-backup-$TIMESTAMP"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# Check if running as root (for system-wide installations)
check_permissions() {
    if [[ ! -r "$DATA_DIR" ]]; then
        log_error "Cannot read data directory: $DATA_DIR"
        log_error "Please run with appropriate permissions or check DATA_DIR path"
        exit 1
    fi
}

# Create backup directory
create_backup_dir() {
    log_info "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    
    if [[ ! -w "$BACKUP_DIR" ]]; then
        log_error "Cannot write to backup directory: $BACKUP_DIR"
        exit 1
    fi
}

# Stop EnvKey Lite service (optional)
stop_service() {
    if [[ "${STOP_SERVICE:-false}" == "true" ]]; then
        log_info "Stopping EnvKey Lite service..."
        
        # Try different service managers
        if command -v systemctl >/dev/null 2>&1; then
            sudo systemctl stop envkey-lite || log_warn "Failed to stop systemd service"
        elif command -v pm2 >/dev/null 2>&1; then
            pm2 stop envkey-lite || log_warn "Failed to stop PM2 process"
        else
            log_warn "No service manager found, service may still be running"
        fi
    fi
}

# Start EnvKey Lite service (optional)
start_service() {
    if [[ "${STOP_SERVICE:-false}" == "true" ]]; then
        log_info "Starting EnvKey Lite service..."
        
        # Try different service managers
        if command -v systemctl >/dev/null 2>&1; then
            sudo systemctl start envkey-lite || log_warn "Failed to start systemd service"
        elif command -v pm2 >/dev/null 2>&1; then
            pm2 start envkey-lite || log_warn "Failed to start PM2 process"
        else
            log_warn "No service manager found, please start service manually"
        fi
    fi
}

# Create database backup
backup_database() {
    log_info "Backing up database..."
    
    if [[ -d "$DATA_DIR" ]]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME-database.tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
        log_info "Database backup created: $BACKUP_NAME-database.tar.gz"
    else
        log_warn "Data directory not found: $DATA_DIR"
    fi
}

# Create configuration backup
backup_configuration() {
    log_info "Backing up configuration..."
    
    local config_files=()
    
    # Add configuration files if they exist
    [[ -f "$CONFIG_DIR/.env" ]] && config_files+=(".env")
    [[ -f "$CONFIG_DIR/.env.production" ]] && config_files+=(".env.production")
    [[ -f "$CONFIG_DIR/package.json" ]] && config_files+=("package.json")
    [[ -f "$CONFIG_DIR/package-lock.json" ]] && config_files+=("package-lock.json")
    [[ -d "$CONFIG_DIR/config" ]] && config_files+=("config/")
    
    if [[ ${#config_files[@]} -gt 0 ]]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME-config.tar.gz" -C "$CONFIG_DIR" "${config_files[@]}"
        log_info "Configuration backup created: $BACKUP_NAME-config.tar.gz"
    else
        log_warn "No configuration files found to backup"
    fi
}

# Create application backup (optional)
backup_application() {
    if [[ "${BACKUP_APP:-false}" == "true" ]]; then
        log_info "Backing up application code..."
        
        # Exclude node_modules and other unnecessary directories
        tar -czf "$BACKUP_DIR/$BACKUP_NAME-app.tar.gz" \
            --exclude="node_modules" \
            --exclude="dist" \
            --exclude="data" \
            --exclude=".git" \
            --exclude="*.log" \
            -C "$(dirname "$PROJECT_ROOT")" "$(basename "$PROJECT_ROOT")"
        
        log_info "Application backup created: $BACKUP_NAME-app.tar.gz"
    fi
}

# Create metadata file
create_metadata() {
    log_info "Creating backup metadata..."
    
    cat > "$BACKUP_DIR/$BACKUP_NAME-metadata.json" << EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "user": "$(whoami)",
  "data_dir": "$DATA_DIR",
  "config_dir": "$CONFIG_DIR",
  "files": [
    "$BACKUP_NAME-database.tar.gz",
    "$BACKUP_NAME-config.tar.gz"$([ "${BACKUP_APP:-false}" == "true" ] && echo ",")
$([ "${BACKUP_APP:-false}" == "true" ] && echo "    \"$BACKUP_NAME-app.tar.gz\"")
  ],
  "version": "$(cd "$PROJECT_ROOT" && npm run --silent version 2>/dev/null || echo 'unknown')"
}
EOF
    
    log_info "Metadata created: $BACKUP_NAME-metadata.json"
}

# Verify backup integrity
verify_backup() {
    log_info "Verifying backup integrity..."
    
    local backup_files=(
        "$BACKUP_DIR/$BACKUP_NAME-database.tar.gz"
        "$BACKUP_DIR/$BACKUP_NAME-config.tar.gz"
        "$BACKUP_DIR/$BACKUP_NAME-metadata.json"
    )
    
    [[ "${BACKUP_APP:-false}" == "true" ]] && backup_files+=("$BACKUP_DIR/$BACKUP_NAME-app.tar.gz")
    
    local all_good=true
    for file in "${backup_files[@]}"; do
        if [[ -f "$file" ]]; then
            # Test archive integrity for .tar.gz files
            if [[ "$file" == *.tar.gz ]]; then
                if tar -tzf "$file" >/dev/null 2>&1; then
                    log_info "✓ $file is valid"
                else
                    log_error "✗ $file is corrupted"
                    all_good=false
                fi
            else
                log_info "✓ $file exists"
            fi
        else
            log_error "✗ $file is missing"
            all_good=false
        fi
    done
    
    if [[ "$all_good" == "true" ]]; then
        log_info "All backup files verified successfully"
    else
        log_error "Backup verification failed"
        exit 1
    fi
}

# Clean up old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    # Find and delete old backup files
    find "$BACKUP_DIR" -name "envkey-lite-backup-*" -type f -mtime +$RETENTION_DAYS -delete
    
    # Count remaining backups
    local backup_count=$(find "$BACKUP_DIR" -name "envkey-lite-backup-*-metadata.json" | wc -l)
    log_info "Backup cleanup completed. $backup_count backups remaining."
}

# Calculate backup size
calculate_backup_size() {
    local total_size=0
    local backup_files=(
        "$BACKUP_DIR/$BACKUP_NAME-database.tar.gz"
        "$BACKUP_DIR/$BACKUP_NAME-config.tar.gz"
        "$BACKUP_DIR/$BACKUP_NAME-metadata.json"
    )
    
    [[ "${BACKUP_APP:-false}" == "true" ]] && backup_files+=("$BACKUP_DIR/$BACKUP_NAME-app.tar.gz")
    
    for file in "${backup_files[@]}"; do
        if [[ -f "$file" ]]; then
            local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
            total_size=$((total_size + size))
        fi
    done
    
    # Convert to human readable format
    if command -v numfmt >/dev/null 2>&1; then
        local human_size=$(numfmt --to=iec-i --suffix=B $total_size)
    else
        local human_size="${total_size} bytes"
    fi
    
    log_info "Total backup size: $human_size"
}

# Send notification (optional)
send_notification() {
    if [[ -n "${NOTIFICATION_WEBHOOK:-}" ]]; then
        log_info "Sending backup notification..."
        
        local status="success"
        local message="EnvKey Lite backup completed successfully: $BACKUP_NAME"
        
        curl -X POST "$NOTIFICATION_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\":\"$message\",\"status\":\"$status\"}" \
            >/dev/null 2>&1 || log_warn "Failed to send notification"
    fi
}

# Main backup function
main() {
    log_info "Starting EnvKey Lite backup process..."
    log_info "Backup name: $BACKUP_NAME"
    log_info "Data directory: $DATA_DIR"
    log_info "Backup directory: $BACKUP_DIR"
    
    # Pre-backup checks
    check_permissions
    create_backup_dir
    
    # Stop service if requested
    stop_service
    
    # Create backups
    backup_database
    backup_configuration
    backup_application
    create_metadata
    
    # Start service if it was stopped
    start_service
    
    # Post-backup tasks
    verify_backup
    calculate_backup_size
    cleanup_old_backups
    send_notification
    
    log_info "Backup process completed successfully!"
    log_info "Backup location: $BACKUP_DIR"
    log_info "Backup files:"
    ls -la "$BACKUP_DIR/$BACKUP_NAME"*
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "EnvKey Lite Backup Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Environment variables:"
        echo "  BACKUP_DIR          Backup directory (default: /backup/envkey-lite)"
        echo "  DATA_DIR            Data directory (default: ./data)"
        echo "  CONFIG_DIR          Configuration directory (default: .)"
        echo "  RETENTION_DAYS      Backup retention in days (default: 30)"
        echo "  STOP_SERVICE        Stop service during backup (default: false)"
        echo "  BACKUP_APP          Include application code (default: false)"
        echo "  NOTIFICATION_WEBHOOK Webhook URL for notifications"
        echo ""
        echo "Examples:"
        echo "  $0                                    # Basic backup"
        echo "  STOP_SERVICE=true $0                 # Stop service during backup"
        echo "  BACKUP_APP=true $0                   # Include application code"
        echo "  RETENTION_DAYS=7 $0                  # Keep backups for 7 days"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac