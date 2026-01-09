#!/bin/bash

# ============================================
# Esports Tracker - Backup Script
# ============================================

set -e

# Configuration
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/esports-tracker}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
COMPOSE_FILE="docker-compose.prod.yml"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ==========================================
# Create backup directory
# ==========================================
setup() {
    log_info "Setting up backup..."
    
    mkdir -p "$BACKUP_DIR/database"
    mkdir -p "$BACKUP_DIR/redis"
    mkdir -p "$BACKUP_DIR/volumes"
    
    log_success "Backup directories ready"
}

# ==========================================
# Backup PostgreSQL
# ==========================================
backup_database() {
    log_info "Backing up PostgreSQL database..."
    
    local backup_file="$BACKUP_DIR/database/esports_tracker_$TIMESTAMP.sql.gz"
    
    cd "$DEPLOY_DIR"
    
    # Dump database and compress
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_dump -U "${DB_USER:-postgres}" -d "${DB_DATABASE:-esports_tracker}" \
        | gzip > "$backup_file"
    
    local size=$(du -h "$backup_file" | cut -f1)
    log_success "Database backup created: $backup_file ($size)"
}

# ==========================================
# Backup Redis
# ==========================================
backup_redis() {
    log_info "Backing up Redis data..."
    
    local backup_file="$BACKUP_DIR/redis/redis_$TIMESTAMP.rdb"
    
    cd "$DEPLOY_DIR"
    
    # Trigger Redis BGSAVE
    docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE
    
    # Wait for save to complete
    sleep 5
    
    # Copy RDB file
    docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$backup_file" 2>/dev/null || {
        log_warning "Redis backup skipped (no data or BGSAVE not complete)"
        return 0
    }
    
    if [ -f "$backup_file" ]; then
        gzip "$backup_file"
        log_success "Redis backup created: ${backup_file}.gz"
    fi
}

# ==========================================
# Backup Docker volumes
# ==========================================
backup_volumes() {
    log_info "Backing up Docker volumes..."
    
    local backup_file="$BACKUP_DIR/volumes/volumes_$TIMESTAMP.tar.gz"
    
    cd "$DEPLOY_DIR"
    
    # Get volume names
    local volumes=$(docker compose -f "$COMPOSE_FILE" config --volumes 2>/dev/null | tr -d ' ')
    
    if [ -z "$volumes" ]; then
        log_warning "No volumes to backup"
        return 0
    fi
    
    # Create temporary container to access volumes
    for volume in $volumes; do
        local full_volume_name="${PWD##*/}_${volume}"
        full_volume_name=$(echo "$full_volume_name" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]_-')
        
        log_info "Backing up volume: $volume"
        
        docker run --rm \
            -v "${full_volume_name}:/source:ro" \
            -v "$BACKUP_DIR/volumes:/backup" \
            alpine tar czf "/backup/${volume}_$TIMESTAMP.tar.gz" -C /source . 2>/dev/null || {
                log_warning "Could not backup volume $volume"
            }
    done
    
    log_success "Volumes backup completed"
}

# ==========================================
# Cleanup old backups
# ==========================================
cleanup_old_backups() {
    log_info "Cleaning up backups older than $RETENTION_DAYS days..."
    
    find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -delete
    
    log_success "Old backups cleaned up"
}

# ==========================================
# Upload to remote (optional)
# ==========================================
upload_backup() {
    # Uncomment and configure if you want remote backups
    
    # Example: Upload to S3
    # if command -v aws &> /dev/null; then
    #     log_info "Uploading to S3..."
    #     aws s3 sync "$BACKUP_DIR" "s3://your-bucket/esports-tracker-backups/"
    #     log_success "Uploaded to S3"
    # fi
    
    # Example: Upload to Google Cloud Storage
    # if command -v gsutil &> /dev/null; then
    #     log_info "Uploading to GCS..."
    #     gsutil -m rsync -r "$BACKUP_DIR" "gs://your-bucket/esports-tracker-backups/"
    #     log_success "Uploaded to GCS"
    # fi
    
    log_info "Remote backup not configured (optional)"
}

# ==========================================
# Verify backup
# ==========================================
verify_backup() {
    log_info "Verifying backup integrity..."
    
    local db_backup="$BACKUP_DIR/database/esports_tracker_$TIMESTAMP.sql.gz"
    
    if [ -f "$db_backup" ]; then
        # Test gzip integrity
        if gzip -t "$db_backup" 2>/dev/null; then
            log_success "Database backup verified"
        else
            log_error "Database backup is corrupted!"
        fi
    fi
    
    log_success "Backup verification completed"
}

# ==========================================
# List backups
# ==========================================
list_backups() {
    echo ""
    echo "📦 Available Backups"
    echo "===================="
    echo ""
    
    echo "Database backups:"
    ls -lh "$BACKUP_DIR/database/" 2>/dev/null || echo "  (none)"
    echo ""
    
    echo "Redis backups:"
    ls -lh "$BACKUP_DIR/redis/" 2>/dev/null || echo "  (none)"
    echo ""
    
    echo "Volume backups:"
    ls -lh "$BACKUP_DIR/volumes/" 2>/dev/null || echo "  (none)"
    echo ""
    
    echo "Total size:"
    du -sh "$BACKUP_DIR" 2>/dev/null || echo "  0"
}

# ==========================================
# Restore database
# ==========================================
restore_database() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "Usage: $0 restore <backup_file>"
        echo ""
        echo "Available backups:"
        ls -1 "$BACKUP_DIR/database/"
        exit 1
    fi
    
    if [ ! -f "$backup_file" ]; then
        # Try with full path
        backup_file="$BACKUP_DIR/database/$backup_file"
    fi
    
    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
    fi
    
    log_warning "This will OVERWRITE the current database!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi
    
    log_info "Restoring database from $backup_file..."
    
    cd "$DEPLOY_DIR"
    
    # Decompress and restore
    gunzip -c "$backup_file" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U "${DB_USER:-postgres}" -d "${DB_DATABASE:-esports_tracker}"
    
    log_success "Database restored successfully"
}

# ==========================================
# Main
# ==========================================
main() {
    echo ""
    echo "💾 Esports Tracker Backup"
    echo "========================="
    echo ""
    
    local start_time=$(date +%s)
    
    # Load environment
    if [ -f "$DEPLOY_DIR/.env" ]; then
        source "$DEPLOY_DIR/.env"
    fi
    
    setup
    backup_database
    backup_redis
    backup_volumes
    cleanup_old_backups
    verify_backup
    upload_backup
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "========================="
    log_success "Backup completed in ${duration}s"
    echo "========================="
    echo ""
    
    list_backups
}

# ==========================================
# Handle arguments
# ==========================================
case "${1:-backup}" in
    backup)
        main
        ;;
    list)
        list_backups
        ;;
    restore)
        restore_database "$2"
        ;;
    cleanup)
        cleanup_old_backups
        ;;
    *)
        echo "Usage: $0 {backup|list|restore <file>|cleanup}"
        exit 1
        ;;
esac
