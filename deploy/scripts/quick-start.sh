#!/bin/bash

# ============================================
# Esports Tracker - Quick Start for Hostinger
# One-script deployment solution
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
log_step() { echo -e "\n${CYAN}▶ $1${NC}\n"; }

# ==========================================
# Banner
# ==========================================
show_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
    
███████╗███████╗██████╗  ██████╗ ██████╗ ████████╗███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝
█████╗  ███████╗██████╔╝██║   ██║██████╔╝   ██║   ███████╗
██╔══╝  ╚════██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ╚════██║
███████╗███████║██║     ╚██████╔╝██║  ██║   ██║   ███████║
╚══════╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
                  QUICK START DEPLOYMENT

EOF
    echo -e "${NC}"
}

# ==========================================
# Collect Information
# ==========================================
collect_info() {
    log_step "Configuration"
    
    # Domain
    read -p "Enter your domain (e.g., esports-tracker.com): " DOMAIN
    if [ -z "$DOMAIN" ]; then
        log_error "Domain is required"
    fi
    
    # Email
    read -p "Enter your email (for SSL certificates): " EMAIL
    if [ -z "$EMAIL" ]; then
        log_error "Email is required"
    fi
    
    # Riot API Key
    read -p "Enter your Riot API Key (RGAPI-xxx): " RIOT_API_KEY
    if [ -z "$RIOT_API_KEY" ]; then
        log_warning "Riot API Key not provided. You'll need to add it later."
        RIOT_API_KEY="CHANGE_ME"
    fi
    
    # GitHub repository
    read -p "Enter your GitHub repository (username/repo): " GITHUB_REPO
    if [ -z "$GITHUB_REPO" ]; then
        GITHUB_REPO="your-username/esports-tracker"
        log_warning "Using default: $GITHUB_REPO"
    fi
    
    # GitHub token
    read -s -p "Enter your GitHub Personal Access Token (for pulling images): " GITHUB_TOKEN
    echo ""
    if [ -z "$GITHUB_TOKEN" ]; then
        log_warning "GitHub token not provided. You'll need to authenticate manually."
    fi
    
    # Confirm
    echo ""
    echo "Configuration Summary:"
    echo "  Domain: $DOMAIN"
    echo "  Email: $EMAIL"
    echo "  GitHub Repo: $GITHUB_REPO"
    echo "  Riot API Key: ${RIOT_API_KEY:0:10}..."
    echo ""
    
    read -p "Is this correct? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        log_error "Aborted by user"
    fi
}

# ==========================================
# Install Dependencies
# ==========================================
install_dependencies() {
    log_step "Installing Dependencies"
    
    # Update system
    log_info "Updating system packages..."
    sudo apt update && sudo apt upgrade -y
    
    # Install essentials
    log_info "Installing essential tools..."
    sudo apt install -y curl wget git htop ufw fail2ban
    
    # Install Docker
    if ! command -v docker &> /dev/null; then
        log_info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker $USER
    else
        log_info "Docker already installed"
    fi
    
    # Verify Docker Compose
    if ! docker compose version &> /dev/null; then
        log_info "Installing Docker Compose plugin..."
        sudo apt install -y docker-compose-plugin
    fi
    
    log_success "Dependencies installed"
}

# ==========================================
# Configure Firewall
# ==========================================
configure_firewall() {
    log_step "Configuring Firewall"
    
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    sudo ufw allow 22/tcp   # SSH
    sudo ufw allow 80/tcp   # HTTP
    sudo ufw allow 443/tcp  # HTTPS
    sudo ufw --force enable
    
    log_success "Firewall configured"
}

# ==========================================
# Clone Repository
# ==========================================
clone_repo() {
    log_step "Setting up Project"
    
    cd ~
    
    if [ -d "esports-tracker" ]; then
        log_info "Project directory exists, updating..."
        cd esports-tracker
        git pull origin main
    else
        log_info "Cloning repository..."
        git clone "https://github.com/$GITHUB_REPO.git" esports-tracker
        cd esports-tracker
    fi
    
    log_success "Project ready"
}

# ==========================================
# Generate Environment
# ==========================================
generate_env() {
    log_step "Generating Environment Configuration"
    
    cd ~/esports-tracker
    
    # Generate secrets
    local APP_KEY=$(openssl rand -hex 32)
    local DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    local REDIS_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    
    # Create .env file
    cat > .env << EOF
# ============================================
# Generated by Quick Start - $(date)
# ============================================

# Domain
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=esports
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=esports_tracker

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD

# Application
NODE_ENV=production
APP_KEY=$APP_KEY

# Riot API
RIOT_API_KEY=$RIOT_API_KEY

# Frontend URLs
NEXT_PUBLIC_API_URL=https://api.$DOMAIN
NEXT_PUBLIC_WS_URL=wss://api.$DOMAIN

# GitHub
GITHUB_REPOSITORY=$GITHUB_REPO
EOF
    
    log_success "Environment file created"
    log_warning "Please save these credentials securely!"
    echo ""
    echo "Database Password: $DB_PASSWORD"
    echo "Redis Password: $REDIS_PASSWORD"
    echo "App Key: $APP_KEY"
    echo ""
}

# ==========================================
# Docker Login
# ==========================================
docker_login() {
    log_step "Authenticating with GitHub Container Registry"
    
    if [ -n "$GITHUB_TOKEN" ]; then
        echo "$GITHUB_TOKEN" | docker login ghcr.io -u "${GITHUB_REPO%%/*}" --password-stdin
        log_success "Authenticated with GHCR"
    else
        log_warning "Skipping Docker login (no token provided)"
        log_info "You can login manually with: docker login ghcr.io"
    fi
}

# ==========================================
# Deploy Application
# ==========================================
deploy_app() {
    log_step "Deploying Application"
    
    cd ~/esports-tracker
    
    # Pull images
    log_info "Pulling Docker images..."
    docker compose -f docker-compose.prod.yml pull || {
        log_warning "Could not pull images. Building locally..."
        docker compose -f docker-compose.prod.yml build
    }
    
    # Start services
    log_info "Starting services..."
    docker compose -f docker-compose.prod.yml up -d
    
    # Wait for services
    log_info "Waiting for services to start..."
    sleep 30
    
    # Run migrations
    log_info "Running database migrations..."
    docker compose -f docker-compose.prod.yml exec -T backend node ace migration:run --force || {
        log_warning "Migrations may have already run or backend is starting up"
    }
    
    log_success "Application deployed"
}

# ==========================================
# Setup Cron Jobs
# ==========================================
setup_cron() {
    log_step "Setting up Scheduled Tasks"
    
    # Backup cron (daily at 3 AM)
    (crontab -l 2>/dev/null | grep -v "backup.sh"; echo "0 3 * * * /home/$USER/esports-tracker/deploy/scripts/backup.sh >> /home/$USER/logs/backup.log 2>&1") | crontab -
    
    # Health check cron (every 5 minutes)
    (crontab -l 2>/dev/null | grep -v "health-check.sh"; echo "*/5 * * * * /home/$USER/esports-tracker/deploy/scripts/health-check.sh >> /home/$USER/logs/health.log 2>&1") | crontab -
    
    # Docker cleanup (weekly on Sunday at 4 AM)
    (crontab -l 2>/dev/null | grep -v "docker system prune"; echo "0 4 * * 0 docker system prune -af >> /home/$USER/logs/docker-cleanup.log 2>&1") | crontab -
    
    # Create logs directory
    mkdir -p ~/logs
    
    log_success "Cron jobs configured"
}

# ==========================================
# Final Checks
# ==========================================
final_checks() {
    log_step "Running Final Checks"
    
    cd ~/esports-tracker
    
    # Check containers
    log_info "Container status:"
    docker compose -f docker-compose.prod.yml ps
    
    # Check health
    log_info "Checking service health..."
    sleep 10
    
    if curl -sf http://localhost:3333/health > /dev/null 2>&1; then
        log_success "Backend API is healthy"
    else
        log_warning "Backend API is not responding yet (may still be starting)"
    fi
    
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        log_success "Frontend is healthy"
    else
        log_warning "Frontend is not responding yet (may still be starting)"
    fi
}

# ==========================================
# Show Summary
# ==========================================
show_summary() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}   🎉 Deployment Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "Your Esports Tracker is now running!"
    echo ""
    echo "URLs (after DNS propagation):"
    echo "  Frontend: https://$DOMAIN"
    echo "  API:      https://api.$DOMAIN"
    echo ""
    echo "Local access (for testing):"
    echo "  Frontend: http://$(curl -s ifconfig.me):3000"
    echo "  API:      http://$(curl -s ifconfig.me):3333"
    echo ""
    echo "Useful commands:"
    echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
    echo "  Restart:       docker compose -f docker-compose.prod.yml restart"
    echo "  Stop:          docker compose -f docker-compose.prod.yml down"
    echo "  Health check:  ./deploy/scripts/health-check.sh"
    echo "  Backup:        ./deploy/scripts/backup.sh"
    echo ""
    echo "Next steps:"
    echo "  1. Configure DNS records pointing to this server"
    echo "  2. Wait for DNS propagation (up to 48h)"
    echo "  3. SSL will be automatically configured by Traefik"
    echo ""
    echo "Important:"
    echo "  - Save your credentials from above!"
    echo "  - Update RIOT_API_KEY in .env if not set"
    echo ""
    log_warning "You need to re-login for Docker group to take effect."
    echo ""
}

# ==========================================
# Main
# ==========================================
main() {
    show_banner
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root. Consider creating a dedicated user."
    fi
    
    collect_info
    install_dependencies
    configure_firewall
    clone_repo
    generate_env
    docker_login
    deploy_app
    setup_cron
    final_checks
    show_summary
}

# Run
main "$@"
