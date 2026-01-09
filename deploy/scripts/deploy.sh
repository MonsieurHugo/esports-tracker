#!/bin/bash

# ============================================
# Esports Tracker - Deployment Script
# ============================================

set -e

# Configuration
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/esports-tracker}"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"

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
# Pre-deployment checks
# ==========================================
check_requirements() {
    log_info "Checking requirements..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
    fi
    
    # Check if compose file exists
    if [ ! -f "$DEPLOY_DIR/$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $DEPLOY_DIR/$COMPOSE_FILE"
    fi
    
    # Check .env file
    if [ ! -f "$DEPLOY_DIR/.env" ]; then
        log_error ".env file not found in $DEPLOY_DIR"
    fi
    
    log_success "All requirements met"
}

# ==========================================
# Backup before deployment
# ==========================================
backup() {
    if [ "$BACKUP_BEFORE_DEPLOY" = "true" ]; then
        log_info "Creating backup before deployment..."
        
        if [ -f "$DEPLOY_DIR/deploy/scripts/backup.sh" ]; then
            bash "$DEPLOY_DIR/deploy/scripts/backup.sh"
        else
            log_warning "Backup script not found, skipping backup"
        fi
    fi
}

# ==========================================
# Pull latest code
# ==========================================
pull_code() {
    log_info "Pulling latest code from Git..."
    
    cd "$DEPLOY_DIR"
    
    # Stash any local changes
    git stash --quiet 2>/dev/null || true
    
    # Pull latest
    git pull origin main
    
    log_success "Code updated"
}

# ==========================================
# Pull Docker images
# ==========================================
pull_images() {
    log_info "Pulling Docker images..."
    
    cd "$DEPLOY_DIR"
    docker compose -f "$COMPOSE_FILE" pull
    
    log_success "Images pulled"
}

# ==========================================
# Deploy containers
# ==========================================
deploy() {
    log_info "Deploying containers..."
    
    cd "$DEPLOY_DIR"
    
    # Stop old containers
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    
    # Start new containers
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_success "Containers deployed"
}

# ==========================================
# Run migrations
# ==========================================
run_migrations() {
    log_info "Running database migrations..."
    
    cd "$DEPLOY_DIR"
    
    # Wait for database to be ready
    log_info "Waiting for database..."
    sleep 10
    
    # Run migrations
    docker compose -f "$COMPOSE_FILE" exec -T backend node ace migration:run --force
    
    log_success "Migrations completed"
}

# ==========================================
# Health check
# ==========================================
health_check() {
    log_info "Running health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        # Check backend
        if curl -sf http://localhost:3333/health > /dev/null 2>&1; then
            log_success "Backend is healthy"
            
            # Check frontend
            if curl -sf http://localhost:3000 > /dev/null 2>&1; then
                log_success "Frontend is healthy"
                return 0
            fi
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
}

# ==========================================
# Cleanup
# ==========================================
cleanup() {
    log_info "Cleaning up old images..."
    
    docker image prune -af --filter "until=24h"
    
    log_success "Cleanup completed"
}

# ==========================================
# Rollback
# ==========================================
rollback() {
    log_warning "Rolling back to previous version..."
    
    cd "$DEPLOY_DIR"
    
    # Get previous commit
    git checkout HEAD~1
    
    # Redeploy
    docker compose -f "$COMPOSE_FILE" down
    docker compose -f "$COMPOSE_FILE" up -d
    
    log_info "Rolled back. Please investigate the issue."
}

# ==========================================
# Main
# ==========================================
main() {
    echo ""
    echo "🚀 Esports Tracker Deployment"
    echo "=============================="
    echo ""
    
    local start_time=$(date +%s)
    
    # Run deployment steps
    check_requirements
    backup
    pull_code
    pull_images
    deploy
    run_migrations
    health_check
    cleanup
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "=============================="
    log_success "Deployment completed in ${duration}s"
    echo "=============================="
    echo ""
    
    # Show status
    docker compose -f "$COMPOSE_FILE" ps
}

# ==========================================
# Handle arguments
# ==========================================
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    health)
        health_check
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health}"
        exit 1
        ;;
esac
