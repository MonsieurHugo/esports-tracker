#!/bin/bash

# ============================================
# Esports Tracker - Database Setup Script
# Pour VPS Hostinger
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

echo ""
echo "🗄️  Esports Tracker - Database Setup"
echo "====================================="
echo ""

# ==========================================
# Vérifications
# ==========================================
if ! command -v docker &> /dev/null; then
    log_error "Docker n'est pas installé. Lance d'abord: ./deploy/scripts/install-server.sh"
fi

# ==========================================
# Configuration
# ==========================================
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DATA_DIR="/var/lib/esports-tracker"

# Générer des mots de passe sécurisés si non définis
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    log_info "Mot de passe PostgreSQL généré"
fi

if [ -z "$REDIS_PASSWORD" ]; then
    REDIS_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    log_info "Mot de passe Redis généré"
fi

# ==========================================
# Créer les dossiers
# ==========================================
log_info "Création des dossiers de données..."

sudo mkdir -p "$DATA_DIR/postgres"
sudo mkdir -p "$DATA_DIR/redis"
sudo mkdir -p "$DATA_DIR/backups"
sudo mkdir -p "$DATA_DIR/pgadmin"

# Permissions
sudo chmod 700 "$DATA_DIR/postgres"
sudo chmod 700 "$DATA_DIR/redis"
sudo chmod 755 "$DATA_DIR/backups"

log_success "Dossiers créés dans $DATA_DIR"

# ==========================================
# Créer le fichier .env.db
# ==========================================
log_info "Création du fichier .env.db..."

cat > "$DEPLOY_DIR/.env.db" << EOF
# ============================================
# Database Configuration
# Généré le $(date)
# ============================================

# PostgreSQL
DB_USER=esports
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=esports_tracker

# Redis
REDIS_PASSWORD=$REDIS_PASSWORD

# pgAdmin (optionnel)
PGADMIN_EMAIL=admin@esports-tracker.com
PGADMIN_PASSWORD=$(openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 16)
EOF

chmod 600 "$DEPLOY_DIR/.env.db"

log_success "Fichier .env.db créé"

# ==========================================
# Lancer les services
# ==========================================
log_info "Démarrage de PostgreSQL et Redis..."

cd "$DEPLOY_DIR"

# Charger les variables
export $(cat .env.db | grep -v '^#' | xargs)

# Démarrer les services
docker compose -f docker-compose.db.yml up -d

# Attendre que PostgreSQL soit prêt
log_info "Attente du démarrage de PostgreSQL..."
sleep 10

for i in {1..30}; do
    if docker exec esports-postgres pg_isready -U esports -d esports_tracker > /dev/null 2>&1; then
        log_success "PostgreSQL est prêt!"
        break
    fi
    echo -n "."
    sleep 2
done

# ==========================================
# Vérifier la création des tables
# ==========================================
log_info "Vérification du schema..."

TABLES=$(docker exec esports-postgres psql -U esports -d esports_tracker -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

if [ "$TABLES" -gt 0 ]; then
    log_success "Schema créé avec $TABLES tables"
else
    log_warning "Les tables n'ont pas été créées automatiquement"
    log_info "Création manuelle du schema..."
    docker exec -i esports-postgres psql -U esports -d esports_tracker < scripts/schema.sql
fi

# ==========================================
# Afficher les informations
# ==========================================
echo ""
echo "============================================"
log_success "Base de données configurée!"
echo "============================================"
echo ""
echo "📊 PostgreSQL"
echo "   Host: localhost (ou esports-postgres dans Docker)"
echo "   Port: 5432"
echo "   User: esports"
echo "   Database: esports_tracker"
echo "   Password: $DB_PASSWORD"
echo ""
echo "📦 Redis"
echo "   Host: localhost (ou esports-redis dans Docker)"
echo "   Port: 6379"
echo "   Password: $REDIS_PASSWORD"
echo ""
echo "🔗 Connection strings:"
echo "   PostgreSQL: postgresql://esports:$DB_PASSWORD@localhost:5432/esports_tracker"
echo "   Redis: redis://:$REDIS_PASSWORD@localhost:6379"
echo ""
echo "📁 Données stockées dans: $DATA_DIR"
echo ""
echo "⚠️  IMPORTANT: Sauvegarde ces identifiants!"
echo "    Ils sont aussi dans: $DEPLOY_DIR/.env.db"
echo ""
echo "🔧 Commandes utiles:"
echo "   Status:    docker compose -f docker-compose.db.yml ps"
echo "   Logs:      docker compose -f docker-compose.db.yml logs -f"
echo "   Shell DB:  docker exec -it esports-postgres psql -U esports -d esports_tracker"
echo "   Backup:    ./deploy/scripts/backup-db.sh"
echo ""
