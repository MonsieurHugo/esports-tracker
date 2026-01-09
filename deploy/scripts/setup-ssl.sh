#!/bin/bash

# ============================================
# Esports Tracker - SSL Setup Script
# Configure SSL with Let's Encrypt (Certbot)
# ============================================

set -e

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
# Configuration
# ==========================================
DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 esports-tracker.com admin@esports-tracker.com"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    log_error "Email is required for Let's Encrypt notifications"
fi

echo ""
echo "🔒 SSL Setup for $DOMAIN"
echo "========================="
echo ""

# ==========================================
# Install Certbot
# ==========================================
install_certbot() {
    log_info "Installing Certbot..."
    
    sudo apt update
    sudo apt install -y certbot
    
    # Check if using Nginx
    if command -v nginx &> /dev/null; then
        sudo apt install -y python3-certbot-nginx
        log_success "Certbot with Nginx plugin installed"
    else
        log_success "Certbot installed (standalone mode)"
    fi
}

# ==========================================
# Obtain Certificate
# ==========================================
obtain_certificate() {
    log_info "Obtaining SSL certificate..."
    
    # Check if using Nginx
    if command -v nginx &> /dev/null && systemctl is-active --quiet nginx; then
        log_info "Using Nginx plugin..."
        
        sudo certbot certonly \
            --nginx \
            -d "$DOMAIN" \
            -d "www.$DOMAIN" \
            -d "api.$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos \
            --non-interactive \
            --redirect
    else
        log_info "Using standalone mode..."
        
        # Stop services temporarily if needed
        if lsof -i:80 &> /dev/null; then
            log_warning "Port 80 is in use. Stopping services temporarily..."
            sudo docker compose -f ~/esports-tracker/docker-compose.prod.yml stop traefik 2>/dev/null || true
        fi
        
        sudo certbot certonly \
            --standalone \
            -d "$DOMAIN" \
            -d "www.$DOMAIN" \
            -d "api.$DOMAIN" \
            --email "$EMAIL" \
            --agree-tos \
            --non-interactive
        
        # Restart services
        sudo docker compose -f ~/esports-tracker/docker-compose.prod.yml start traefik 2>/dev/null || true
    fi
    
    log_success "SSL certificate obtained"
}

# ==========================================
# Setup Auto-renewal
# ==========================================
setup_renewal() {
    log_info "Setting up auto-renewal..."
    
    # Test renewal
    sudo certbot renew --dry-run
    
    # Certbot installs a systemd timer by default
    if systemctl list-timers | grep -q certbot; then
        log_success "Auto-renewal timer is active"
    else
        # Create cron job as fallback
        log_info "Creating cron job for renewal..."
        
        (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx || docker compose -f ~/esports-tracker/docker-compose.prod.yml restart traefik'") | crontab -
        
        log_success "Cron job created"
    fi
}

# ==========================================
# Verify Certificate
# ==========================================
verify_certificate() {
    log_info "Verifying SSL certificate..."
    
    local cert_path="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    
    if [ -f "$cert_path" ]; then
        local expiry=$(sudo openssl x509 -enddate -noout -in "$cert_path" | cut -d= -f2)
        local expiry_epoch=$(date -d "$expiry" +%s)
        local now_epoch=$(date +%s)
        local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
        
        log_success "Certificate valid for $days_left days"
        log_info "Expires: $expiry"
    else
        log_error "Certificate not found at $cert_path"
    fi
}

# ==========================================
# Show Certificate Info
# ==========================================
show_info() {
    echo ""
    echo "=============================="
    log_success "SSL Setup Complete!"
    echo "=============================="
    echo ""
    echo "Certificate location:"
    echo "  /etc/letsencrypt/live/$DOMAIN/"
    echo ""
    echo "Files:"
    echo "  fullchain.pem  - Full certificate chain"
    echo "  privkey.pem    - Private key"
    echo "  cert.pem       - Server certificate"
    echo "  chain.pem      - Intermediate certificates"
    echo ""
    echo "For Traefik:"
    echo "  Traefik handles SSL automatically via ACME"
    echo "  Make sure ACME_EMAIL is set in .env"
    echo ""
    echo "For Nginx:"
    echo "  Copy deploy/nginx/esports-tracker.conf to /etc/nginx/sites-available/"
    echo "  Update paths and domain names"
    echo "  Run: sudo nginx -t && sudo systemctl reload nginx"
    echo ""
}

# ==========================================
# Main
# ==========================================
main() {
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
        log_error "This script requires sudo privileges"
    fi
    
    install_certbot
    obtain_certificate
    setup_renewal
    verify_certificate
    show_info
}

main
