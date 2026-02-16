#!/bin/bash
# ============================================
# Setup Umami Analytics
# ============================================
# Run this script on your VPS to install Umami

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Load environment variables
if [ -f /opt/esports-tracker/.env ]; then
    source /opt/esports-tracker/.env
fi

# Required variables
UMAMI_APP_SECRET=${UMAMI_APP_SECRET:-$(openssl rand -hex 32)}
DB_USER=${DB_USER:-esports}
DB_PASSWORD=${DB_PASSWORD:-}
DB_HOST=${DB_HOST:-localhost}

if [ -z "$DB_PASSWORD" ]; then
    error "DB_PASSWORD is required. Set it in /opt/esports-tracker/.env"
fi

log "Setting up Umami Analytics..."

# Create umami database if it doesn't exist
log "Creating umami database..."
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'umami'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE umami OWNER $DB_USER;"

# Create Umami directory
UMAMI_DIR="/opt/umami"
mkdir -p $UMAMI_DIR
cd $UMAMI_DIR

# Create docker-compose.yml for Umami
log "Creating Umami docker-compose configuration..."
cat > docker-compose.yml << EOF
version: '3'
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    container_name: umami
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000"
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: ${UMAMI_APP_SECRET}
      DISABLE_TELEMETRY: 1
    extra_hosts:
      - "host.docker.internal:host-gateway"
EOF

# Start Umami
log "Starting Umami..."
docker compose up -d

# Wait for Umami to start
log "Waiting for Umami to be ready..."
sleep 10

# Check if Umami is running
if curl -s http://localhost:3001 > /dev/null; then
    log "Umami is running!"
else
    warn "Umami might not be ready yet. Check with: docker logs umami"
fi

# Reload nginx to apply new configuration
if [ -f /etc/nginx/sites-enabled/esports-tracker ]; then
    log "Reloading nginx..."
    sudo nginx -t && sudo systemctl reload nginx
fi

echo ""
log "=========================================="
log "Umami installation complete!"
log "=========================================="
echo ""
echo "Next steps:"
echo "1. Access Umami at: https://analytics.monsieuryordle.com"
echo "   (or http://localhost:3001 if nginx is not configured)"
echo ""
echo "2. Login with default credentials:"
echo "   Username: admin"
echo "   Password: umami"
echo ""
echo "3. IMPORTANT: Change the admin password immediately!"
echo ""
echo "4. Add your website in Umami:"
echo "   - Go to Settings → Websites → Add website"
echo "   - Name: Esports Tracker"
echo "   - Domain: monsieuryordle.com"
echo ""
echo "5. Copy the Website ID and add it to your frontend .env:"
echo "   NEXT_PUBLIC_UMAMI_WEBSITE_ID=<your-website-id>"
echo ""
echo "Umami App Secret (save this): ${UMAMI_APP_SECRET}"
