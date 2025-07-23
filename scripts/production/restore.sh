#!/bin/bash

# EnvKey Lite Restore Script
# This script restores EnvKey Lite data and configuration from backups

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/backup/envkey-lite}"
DATA_DIR="${DATA_DIR:-$PROJECT_ROOT/data}"
CONFIG_DIR="${CONFIG_DIR:-$PROJECT_ROOT}"

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

# Show usage
show_usage() {
    cat << EOF
EnvKey Lite Restore Script

Usage: $0 [options] <backup_name>

Options:
  -h, --help              Show this help message
  -l, --list              List available backups
  -f, --force             Force restore without confirmation
  --data-only             Restore only database data
  --config-only           Restore only configuration
  --dry-run               Show what would be restored without doing it

Environment variables:
  BACKUP_DIR              Backup directory (default: /backup/envkey-lite)
  DATA_DIR                Data directory (default: ./data)
  CONFIG_DIR              Configuration directory (default: .)

Examples:
  $0 --list                                    # List available backups
  $0 envkey-lite-backup-20240101_120000       # Restore specific backup
  $0 --data-only backup-name                  # Restore only data
  $0 --force backup-name                      # Restore without confirmation

EOF
}

# List available backups
list_backups() {
    log_info "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warn "Backup directory does not exist: $BACKUP_DIR"
        return 1
    fi
    
    local metadata_files=($(find "$BACKUP_DIR" -name "*-metadata.json" | sort -r))
    
    if [[ ${#metadata_files[@]} -eq 0 ]]; then
        log_warn "No backups found in $BACKUP_DIR"
        return 1
    fi
    
    printf "%-30s %-20s %-15s %s\n" "BACKUP NAME" "DATE" "SIZE" "VERSION"
    printf "%-30s %-20s %-15s %s\n" "$(printf '%*s' 30 '' | tr ' ' '-')" "$(printf '%*s' 20 '' | tr ' ' '-')" "$(printf '%*s' 15 '' | tr ' ' '-')" "$(printf '%*s' 10 '' | tr ' ' '-')"
    
    for metadata_file in "${metadata_files[@]}"; do
        local backup_name=$(basename "$metadata_file" -metadata.json)
        local date=$(jq -r '.date // "unknown"' "$metadata_file" 2>/dev/null || echo "unknown")
        local version=$(jq -r '.version // "unknown"' "$metadata_file" 2>/dev/null || echo "unknown")
        
        # Calculate total size of backup files
        local total_size=0
        local backup_files=($(jq -r '.files[]' "$metadata_file" 2>/dev/null || echo ""))
        
        for file in "${backup_files[@]}"; do
            local file_path="$BACKUP_DIR/$file"
            if [[ -f "$file_path" ]]; then
                local size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null || echo 0)
                total_size=$((total_size + size))
            fi
        done
        
        # Convert to human readable format
        local human_size
        if command -v numfmt >/dev/null 2>&1; then
            human_size=$(numfmt --to=iec-i --suffix=B $total_size)
        else
            human_size="${total_size}B"
        fi
        
        printf "%-30s %-20s %-15s %s\n" "$backup_name" "${date:0:19}" "$human_size" "$version"
    done
    
    echo ""
    log_info "Use '$0 <backup_name>' to restore a specific backup"
}

# Validate backup
validate_backup() {
    local backup_name="$1"
    local metadata_file="$BACKUP_DIR/$backup_name-metadata.json"
    
    log_info "Validating backup: $backup_name"
    
    # Check if metadata file exists
    if [[ ! -f "$metadata_file" ]]; then
        log_error "Backup metadata not found: $metadata_file"
        return 1
    fi
    
    # Validate JSON format
    if ! jq empty "$metadata_file" 2>/dev/null; then
        log_error "Invalid metadata file format"
        return 1
    fi
    
    # Check backup files
    local backup_files=($(jq -r '.files[]' "$metadata_file" 2>/dev/null || echo ""))
    local missing_files=()
    
    for file in "${backup_files[@]}"; do
        local file_path="$BACKUP_DIR/$file"
        if [[ ! -f "$file_path" ]]; then
            missing_files+=("$file")
        elif [[ "$file" == *.tar.gz ]]; then
            # Test archive integrity
            if ! tar -tzf "$file_path" >/dev/null 2>&1; then
                log_error "Corrupted archive: $file"
                return 1
            fi
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        log_error "Missing backup files:"
        for file in "${missing_files[@]}"; do
            log_error "  - $file"
        done
        return 1
    fi
    
    log_info "Backup validation successful"
    return 0
}

# Show backup information
show_backup_info() {
    local backup_name="$1"
    local metadata_file="$BACKUP_DIR/$backup_name-metadata.json"
    
    log_info "Backup Information:"
    echo ""
    
    local date=$(jq -r '.date // "unknown"' "$metadata_file")
    local hostname=$(jq -r '.hostname // "unknown"' "$metadata_file")
    local user=$(jq -r '.user // "unknown"' "$metadata_file")
    local version=$(jq -r '.version // "unknown"' "$metadata_file")
    local data_dir=$(jq -r '.data_dir // "unknown"' "$metadata_file")
    local config_dir=$(jq -r '.config_dir // "unknown"' "$metadata_file")
    
    echo "  Name:         $backup_name"
    echo "  Date:         $date"
    echo "  Hostname:     $hostname"
    echo "  User:         $user"
    echo "  Version:      $version"
    echo "  Data Dir:     $data_dir"
    echo "  Config Dir:   $config_dir"
    echo ""
    
    echo "  Files:"
    local backup_files=($(jq -r '.files[]' "$metadata_file"))
    for file in "${backup_files[@]}"; do
        local file_path="$BACKUP_DIR/$file"
        if [[ -f "$file_path" ]]; then
            local size=$(stat -f%z "$file_path" 2>/dev/null || stat -c%s "$file_path" 2>/dev/null || echo 0)
            local human_size
            if command -v numfmt >/dev/null 2>&1; then
                human_size=$(numfmt --to=iec-i --suffix=B $size)
            else
                human_size="${size}B"
            fi
            echo "    - $file ($human_size)"
        else
            echo "    - $file (MISSING)"
        fi
    done
    echo ""
}

# Stop service
stop_service() {
    log_info "Stopping EnvKey Lite service..."
    
    # Try different service managers
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet envkey-lite; then
        sudo systemctl stop envkey-lite
        log_info "Stopped systemd service"
    elif command -v pm2 >/dev/null 2>&1; then
        pm2 stop envkey-lite 2>/dev/null || log_warn "PM2 process not running or not found"
    else
        log_warn "No service manager found, please stop service manually"
    fi
}

# Start service
start_service() {
    log_info "Starting EnvKey Lite service..."
    
    # Try different service managers
    if command -v systemctl >/dev/null 2>&1; then
        sudo systemctl start envkey-lite
        log_info "Started systemd service"
    elif command -v pm2 >/dev/null 2>&1; then
        pm2 start envkey-lite 2>/dev/null || log_warn "Failed to start PM2 process"
    else
        log_warn "No service manager found, please start service manually"
    fi
}

# Backup current data before restore
backup_current_data() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_name="pre-restore-backup-$timestamp"
    
    log_info "Creating backup of current data before restore..."
    
    if [[ -d "$DATA_DIR" ]]; then
        tar -czf "$BACKUP_DIR/$backup_name-data.tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" 2>/dev/null || {
            log_warn "Failed to backup current data"
            return 1
        }
        log_info "Current data backed up as: $backup_name-data.tar.gz"
    fi
    
    # Backup current config
    local config_files=()
    [[ -f "$CONFIG_DIR/.env" ]] && config_files+=(".env")
    [[ -f "$CONFIG_DIR/.env.production" ]] && config_files+=(".env.production")
    
    if [[ ${#config_files[@]} -gt 0 ]]; then
        tar -czf "$BACKUP_DIR/$backup_name-config.tar.gz" -C "$CONFIG_DIR" "${config_files[@]}" 2>/dev/null || {
            log_warn "Failed to backup current config"
        }
        log_info "Current config backed up as: $backup_name-config.tar.gz"
    fi
}

# Restore database
restore_database() {
    local backup_name="$1"
    local database_backup="$BACKUP_DIR/$backup_name-database.tar.gz"
    
    if [[ ! -f "$database_backup" ]]; then
        log_warn "Database backup not found: $database_backup"
        return 1
    fi
    
    log_info "Restoring database from: $database_backup"
    
    # Remove existing data directory
    if [[ -d "$DATA_DIR" ]]; then
        rm -rf "$DATA_DIR"
    fi
    
    # Create parent directory if it doesn't exist
    mkdir -p "$(dirname "$DATA_DIR")"
    
    # Extract database backup
    tar -xzf "$database_backup" -C "$(dirname "$DATA_DIR")"
    
    log_info "Database restored successfully"
}

# Restore configuration
restore_configuration() {
    local backup_name="$1"
    local config_backup="$BACKUP_DIR/$backup_name-config.tar.gz"
    
    if [[ ! -f "$config_backup" ]]; then
        log_warn "Configuration backup not found: $config_backup"
        return 1
    fi
    
    log_info "Restoring configuration from: $config_backup"
    
    # Extract configuration backup
    tar -xzf "$config_backup" -C "$CONFIG_DIR"
    
    log_info "Configuration restored successfully"
}

# Confirm restore operation
confirm_restore() {
    local backup_name="$1"
    
    if [[ "${FORCE_RESTORE:-false}" == "true" ]]; then
        return 0
    fi
    
    echo ""
    log_warn "This will restore EnvKey Lite from backup: $backup_name"
    log_warn "Current data and configuration will be replaced!"
    echo ""
    
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi
}

# Main restore function
restore_backup() {
    local backup_name="$1"
    local restore_data="${RESTORE_DATA:-true}"
    local restore_config="${RESTORE_CONFIG:-true}"
    
    log_info "Starting restore process for: $backup_name"
    
    # Validate backup
    if ! validate_backup "$backup_name"; then
        log_error "Backup validation failed"
        exit 1
    fi
    
    # Show backup information
    show_backup_info "$backup_name"
    
    # Confirm restore
    confirm_restore "$backup_name"
    
    # Dry run mode
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        log_info "DRY RUN MODE - No changes will be made"
        log_info "Would restore:"
        [[ "$restore_data" == "true" ]] && log_info "  - Database data"
        [[ "$restore_config" == "true" ]] && log_info "  - Configuration files"
        return 0
    fi
    
    # Stop service
    stop_service
    
    # Backup current data
    backup_current_data
    
    # Restore components
    if [[ "$restore_data" == "true" ]]; then
        restore_database "$backup_name"
    fi
    
    if [[ "$restore_config" == "true" ]]; then
        restore_configuration "$backup_name"
    fi
    
    # Start service
    start_service
    
    log_info "Restore completed successfully!"
    log_info "Please verify that the application is working correctly"
}

# Parse command line arguments
BACKUP_NAME=""
LIST_BACKUPS=false
FORCE_RESTORE=false
DATA_ONLY=false
CONFIG_ONLY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -l|--list)
            LIST_BACKUPS=true
            shift
            ;;
        -f|--force)
            FORCE_RESTORE=true
            shift
            ;;
        --data-only)
            DATA_ONLY=true
            shift
            ;;
        --config-only)
            CONFIG_ONLY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -*)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            BACKUP_NAME="$1"
            shift
            ;;
    esac
done

# Set restore options based on flags
if [[ "$DATA_ONLY" == "true" ]]; then
    RESTORE_DATA=true
    RESTORE_CONFIG=false
elif [[ "$CONFIG_ONLY" == "true" ]]; then
    RESTORE_DATA=false
    RESTORE_CONFIG=true
else
    RESTORE_DATA=true
    RESTORE_CONFIG=true
fi

# Main execution
if [[ "$LIST_BACKUPS" == "true" ]]; then
    list_backups
elif [[ -n "$BACKUP_NAME" ]]; then
    restore_backup "$BACKUP_NAME"
else
    log_error "No backup name specified"
    echo ""
    show_usage
    exit 1
fi