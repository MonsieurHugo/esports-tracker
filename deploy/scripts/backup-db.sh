#!/bin/bash

# ============================================
# Esports Tracker - Database Backup Script
# ============================================

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/lib/esports-tracker/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# ==========================================
# Backup PostgreSQL
# ==========================================
backup_postgres() {
    log_info "Backup PostgreSQL..."
    
    local backup_file="$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"
    
    # Dump complet avec compression
    docker exec esports-postgres pg_dump \
        -U esports \
        -d esports_tracker \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        | gzip > "$backup_file"
    
    local size=$(du -h "$backup_file" | cut -f1)
    log_success "PostgreSQL backup: $backup_file ($size)"
    
    echo "$backup_file"
}

# ==========================================
# Backup Redis
# ==========================================
backup_redis() {
    log_info "Backup Redis..."
    
    local backup_file="$BACKUP_DIR/redis_$TIMESTAMP.rdb"
    
    # Trigger BGSAVE
    docker exec esports-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE 2>/dev/null || true
    sleep 3
    
    # Copy RDB file
    docker cp esports-redis:/data/dump.rdb "$backup_file" 2>/dev/null || {
        log_warning "Pas de données Redis à sauvegarder"
        return 0
    }
    
    gzip "$backup_file"
    log_success "Redis backup: ${backup_file}.gz"
}

# ==========================================
# Cleanup old backups
# ==========================================
cleanup_old() {
    log_info "Nettoyage des backups > $RETENTION_DAYS jours..."
    
    find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.sql" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    
    log_success "Nettoyage terminé"
}

# ==========================================
# List backups
# ==========================================
list_backups() {
    echo ""
    echo "📦 Backups disponibles:"
    echo "========================"
    ls -lh "$BACKUP_DIR"/*.gz 2>/dev/null || echo "Aucun backup trouvé"
    echo ""
    echo "Espace utilisé: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
}

# ==========================================
# Restore PostgreSQL
# ==========================================
restore_postgres() {
    local backup_file="$1"
    
    if [ -z "$backup_file" ]; then
        echo "Usage: $0 restore <fichier_backup>"
        echo ""
        list_backups
        exit 1
    fi
    
    # Chercher le fichier
    if [ ! -f "$backup_file" ]; then
        backup_file="$BACKUP_DIR/$backup_file"
    fi
    
    if [ ! -f "$backup_file" ]; then
        echo "❌ Fichier non trouvé: $backup_file"
        exit 1
    fi
    
    echo ""
    echo "⚠️  ATTENTION: Ceci va ÉCRASER la base de données actuelle!"
    echo "   Fichier: $backup_file"
    echo ""
    read -p "Confirmer (oui/non): " confirm
    
    if [ "$confirm" != "oui" ]; then
        echo "Annulé."
        exit 0
    fi
    
    log_info "Restauration en cours..."
    
    # Décompresser et restaurer
    gunzip -c "$backup_file" | docker exec -i esports-postgres psql -U esports -d esports_tracker
    
    log_success "Base de données restaurée!"
}

# ==========================================
# Main
# ==========================================
main() {
    mkdir -p "$BACKUP_DIR"
    
    # Charger les variables d'environnement
    if [ -f ".env.db" ]; then
        export $(cat .env.db | grep -v '^#' | xargs)
    fi
    
    echo ""
    echo "💾 Database Backup"
    echo "=================="
    echo ""
    
    backup_postgres
    backup_redis
    cleanup_old
    
    echo ""
    log_success "Backup terminé!"
    list_backups
}

# ==========================================
# Arguments
# ==========================================
case "${1:-backup}" in
    backup)
        main
        ;;
    restore)
        restore_postgres "$2"
        ;;
    list)
        list_backups
        ;;
    cleanup)
        cleanup_old
        ;;
    *)
        echo "Usage: $0 {backup|restore <file>|list|cleanup}"
        exit 1
        ;;
esac
