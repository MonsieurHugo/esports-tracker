#!/bin/bash

# ============================================
# 🖥️ Esports Tracker - Configuration Locale
# À lancer sur ton PC (VS Code terminal)
# ============================================

set -e

# ==========================================
# Couleurs
# ==========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ==========================================
# Fonctions d'affichage
# ==========================================
print_banner() {
    clear
    echo -e "${CYAN}"
    cat << 'EOF'
    
███████╗███████╗██████╗  ██████╗ ██████╗ ████████╗███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝
█████╗  ███████╗██████╔╝██║   ██║██████╔╝   ██║   ███████╗
██╔══╝  ╚════██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ╚════██║
███████╗███████║██║     ╚██████╔╝██║  ██║   ██║   ███████║
╚══════╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝

        🖥️ CONFIGURATION LOCALE (PC) 🖥️
    
EOF
    echo -e "${NC}"
}

print_step() {
    local step=$1
    local total=$2
    local title=$3
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${CYAN}  ÉTAPE $step/$total : $title${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_info() { echo -e "${BLUE}ℹ ${NC} $1"; }
print_success() { echo -e "${GREEN}✓ ${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠ ${NC} $1"; }
print_error() { echo -e "${RED}✗ ${NC} $1"; }

print_config_item() {
    local label=$1
    local value=$2
    printf "  ${DIM}%-20s${NC} ${BOLD}%s${NC}\n" "$label:" "$value"
}

# ==========================================
# Fonctions utilitaires
# ==========================================
ask_yes_no() {
    local question=$1
    local default=${2:-"y"}
    
    if [ "$default" = "y" ]; then
        prompt="[O/n]"
    else
        prompt="[o/N]"
    fi
    
    while true; do
        echo -ne "${CYAN}? ${NC}$question $prompt "
        read -r answer
        answer=${answer:-$default}
        
        case "${answer,,}" in
            o|oui|y|yes) return 0 ;;
            n|non|no) return 1 ;;
            *) echo -e "${YELLOW}  Réponds par 'o' (oui) ou 'n' (non)${NC}" ;;
        esac
    done
}

ask_input() {
    local question=$1
    local default=$2
    local var_name=$3
    local is_password=${4:-false}
    
    if [ -n "$default" ]; then
        prompt=" ${DIM}[$default]${NC}"
    else
        prompt=""
    fi
    
    echo -ne "${CYAN}? ${NC}$question$prompt : "
    
    if [ "$is_password" = true ]; then
        read -rs answer
        echo ""
    else
        read -r answer
    fi
    
    answer=${answer:-$default}
    eval "$var_name='$answer'"
}

validate_domain() {
    local domain=$1
    if [[ $domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$ ]]; then
        return 0
    fi
    return 1
}

validate_email() {
    local email=$1
    if [[ $email =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
        return 0
    fi
    return 1
}

generate_password() {
    # Compatible Mac et Linux
    if command -v openssl &> /dev/null; then
        openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24
    else
        # Fallback pour Windows Git Bash
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 24 2>/dev/null || echo "ChangeMe$(date +%s)"
    fi
}

generate_hex() {
    if command -v openssl &> /dev/null; then
        openssl rand -hex 32
    else
        cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64 2>/dev/null || echo "$(date +%s)$(date +%s)"
    fi
}

press_enter() {
    echo ""
    echo -ne "${DIM}Appuie sur Entrée pour continuer...${NC}"
    read -r
}

# ==========================================
# Étape 1 : Infos serveur
# ==========================================
configure_server() {
    print_step 1 5 "Informations du serveur Hostinger"
    
    print_info "Ces infos sont dans ton panel Hostinger → VPS → Accès SSH"
    echo ""
    
    # IP du serveur
    while true; do
        ask_input "Adresse IP de ton VPS Hostinger" "" "VPS_HOST"
        
        if [ -z "$VPS_HOST" ]; then
            print_error "L'IP est obligatoire"
            continue
        fi
        
        # Validation basique de l'IP
        if [[ $VPS_HOST =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            print_success "IP valide : $VPS_HOST"
            break
        else
            print_error "Format d'IP invalide (ex: 123.45.67.89)"
        fi
    done
    
    # Utilisateur SSH
    ask_input "Utilisateur SSH" "root" "VPS_USER"
    print_success "Utilisateur : $VPS_USER"
    
    # Port SSH
    ask_input "Port SSH" "22" "VPS_PORT"
    
    press_enter
}

# ==========================================
# Étape 2 : Configuration du domaine
# ==========================================
configure_domain() {
    print_step 2 5 "Configuration du domaine"
    
    print_info "Le domaine sera utilisé pour :"
    echo "  • Frontend : https://ton-domaine.com"
    echo "  • API :      https://api.ton-domaine.com"
    echo ""
    
    # Domaine
    while true; do
        ask_input "Ton nom de domaine (ex: esports-tracker.com)" "" "DOMAIN"
        
        if [ -z "$DOMAIN" ]; then
            print_error "Le domaine est obligatoire"
            continue
        fi
        
        if validate_domain "$DOMAIN"; then
            print_success "Domaine valide : $DOMAIN"
            break
        else
            print_error "Format de domaine invalide"
        fi
    done
    
    # Email
    echo ""
    while true; do
        ask_input "Ton email (pour SSL Let's Encrypt)" "" "ACME_EMAIL"
        
        if [ -z "$ACME_EMAIL" ]; then
            print_error "L'email est obligatoire"
            continue
        fi
        
        if validate_email "$ACME_EMAIL"; then
            print_success "Email valide : $ACME_EMAIL"
            break
        else
            print_error "Format d'email invalide"
        fi
    done
    
    press_enter
}

# ==========================================
# Étape 3 : Base de données
# ==========================================
configure_database() {
    print_step 3 5 "Configuration de la base de données"
    
    print_info "PostgreSQL sera installé sur ton VPS"
    echo ""
    
    # Nom d'utilisateur DB
    ask_input "Nom d'utilisateur PostgreSQL" "esports" "DB_USER"
    
    # Mot de passe DB
    echo ""
    if ask_yes_no "Générer un mot de passe PostgreSQL automatiquement ?" "y"; then
        DB_PASSWORD=$(generate_password)
        print_success "Mot de passe généré"
    else
        while true; do
            ask_input "Mot de passe PostgreSQL" "" "DB_PASSWORD" true
            if [ ${#DB_PASSWORD} -ge 8 ]; then
                print_success "Mot de passe défini"
                break
            else
                print_error "Minimum 8 caractères"
            fi
        done
    fi
    
    # Nom de la base
    ask_input "Nom de la base de données" "esports_tracker" "DB_DATABASE"
    
    # Redis
    echo ""
    if ask_yes_no "Générer un mot de passe Redis automatiquement ?" "y"; then
        REDIS_PASSWORD=$(generate_password)
        print_success "Mot de passe Redis généré"
    else
        ask_input "Mot de passe Redis" "" "REDIS_PASSWORD" true
    fi
    
    # APP_KEY
    APP_KEY=$(generate_hex)
    
    press_enter
}

# ==========================================
# Étape 4 : Riot API
# ==========================================
configure_riot_api() {
    print_step 4 5 "Configuration de l'API Riot Games"
    
    echo "  Pour obtenir une clé API :"
    echo "  1. Va sur ${CYAN}https://developer.riotgames.com${NC}"
    echo "  2. Connecte-toi avec ton compte Riot"
    echo "  3. Copie ta ${BOLD}Development API Key${NC}"
    echo ""
    
    if ask_yes_no "As-tu déjà une clé API Riot ?" "y"; then
        while true; do
            ask_input "Ta clé API Riot (RGAPI-xxx...)" "" "RIOT_API_KEY"
            
            if [[ $RIOT_API_KEY =~ ^RGAPI-[a-f0-9-]+$ ]]; then
                print_success "Format de clé valide"
                break
            else
                print_warning "Format non reconnu, mais on continue"
                break
            fi
        done
    else
        RIOT_API_KEY="CHANGE_ME_LATER"
        print_warning "Tu devras configurer la clé plus tard"
    fi
    
    press_enter
}

# ==========================================
# Étape 5 : Génération des fichiers
# ==========================================
generate_files() {
    print_step 5 5 "Génération de la configuration"
    
    local config_dir="./deploy/generated"
    mkdir -p "$config_dir"
    
    # ==========================================
    # Fichier .env
    # ==========================================
    print_info "Génération de .env..."
    
    cat > "$config_dir/.env" << EOF
# ============================================
# Esports Tracker - Configuration Production
# Généré le $(date)
# ============================================

# ==========================================
# DOMAINE
# ==========================================
DOMAIN=$DOMAIN
ACME_EMAIL=$ACME_EMAIL

# ==========================================
# BASE DE DONNÉES
# ==========================================
DB_HOST=esports-postgres
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_DATABASE=$DB_DATABASE
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@esports-postgres:5432/$DB_DATABASE

# ==========================================
# REDIS
# ==========================================
REDIS_HOST=esports-redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=redis://:$REDIS_PASSWORD@esports-redis:6379

# ==========================================
# APPLICATION
# ==========================================
NODE_ENV=production
APP_KEY=$APP_KEY

# ==========================================
# RIOT API
# ==========================================
RIOT_API_KEY=$RIOT_API_KEY

# ==========================================
# FRONTEND
# ==========================================
NEXT_PUBLIC_API_URL=https://api.$DOMAIN
NEXT_PUBLIC_WS_URL=wss://api.$DOMAIN
EOF

    print_success ".env généré"
    
    # ==========================================
    # Script d'installation serveur
    # ==========================================
    print_info "Génération du script serveur..."
    
    cat > "$config_dir/install-on-server.sh" << 'SERVERSCRIPT'
#!/bin/bash

# ============================================
# 🚀 Installation sur serveur Hostinger
# Script auto-généré - ne pas modifier
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}[INFO]${NC} Démarrage de l'installation..."

# Créer les dossiers
echo -e "${BLUE}[INFO]${NC} Création des dossiers..."
mkdir -p /var/lib/esports-tracker/{postgres,redis,backups}
chmod 700 /var/lib/esports-tracker/postgres

# Copier .env
if [ -f ".env.uploaded" ]; then
    mv .env.uploaded .env
    chmod 600 .env
    echo -e "${GREEN}[OK]${NC} Configuration .env installée"
fi

# Installer Docker si nécessaire
if ! command -v docker &> /dev/null; then
    echo -e "${BLUE}[INFO]${NC} Installation de Docker..."
    curl -fsSL https://get.docker.com | sh
fi

# Démarrer la base de données
echo -e "${BLUE}[INFO]${NC} Démarrage de PostgreSQL et Redis..."
docker compose -f docker-compose.db.yml up -d

# Attendre PostgreSQL
echo -e "${BLUE}[INFO]${NC} Attente de PostgreSQL..."
sleep 15

# Charger les variables
export $(cat .env | grep -v '^#' | xargs)

# Créer les tables
echo -e "${BLUE}[INFO]${NC} Création des tables..."
docker exec -i esports-postgres psql -U "$DB_USER" -d "$DB_DATABASE" < scripts/schema.sql

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✅ INSTALLATION TERMINÉE !${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Services démarrés :"
docker compose -f docker-compose.db.yml ps
echo ""
echo "Prochaine étape :"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo ""
SERVERSCRIPT

    chmod +x "$config_dir/install-on-server.sh"
    print_success "Script serveur généré"
    
    # ==========================================
    # Script de déploiement (à lancer depuis le PC)
    # ==========================================
    print_info "Génération du script de déploiement..."
    
    cat > "$config_dir/deploy-to-server.sh" << EOF
#!/bin/bash

# ============================================
# 📤 Déploiement vers Hostinger
# Lancer depuis ton PC
# ============================================

set -e

VPS_HOST="$VPS_HOST"
VPS_USER="$VPS_USER"
VPS_PORT="$VPS_PORT"

echo "📤 Déploiement vers \$VPS_USER@\$VPS_HOST..."
echo ""

# Aller à la racine du projet
cd "\$(dirname "\$0")/../.."

# Vérifier la connexion SSH
echo "🔑 Test de connexion SSH..."
ssh -p \$VPS_PORT -o ConnectTimeout=10 \$VPS_USER@\$VPS_HOST "echo 'Connexion OK'" || {
    echo "❌ Impossible de se connecter au serveur"
    echo ""
    echo "Vérifie :"
    echo "  1. L'IP du serveur : \$VPS_HOST"
    echo "  2. L'utilisateur : \$VPS_USER"
    echo "  3. Ta clé SSH est configurée"
    echo ""
    echo "Pour configurer SSH :"
    echo "  ssh-copy-id -p \$VPS_PORT \$VPS_USER@\$VPS_HOST"
    exit 1
}

echo ""
echo "📦 Création de l'archive..."
tar --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='*.log' -czf /tmp/esports-tracker.tar.gz .

echo "📤 Upload vers le serveur..."
scp -P \$VPS_PORT /tmp/esports-tracker.tar.gz \$VPS_USER@\$VPS_HOST:~/

echo "📂 Extraction sur le serveur..."
ssh -p \$VPS_PORT \$VPS_USER@\$VPS_HOST << 'REMOTE'
    cd ~
    rm -rf esports-tracker
    mkdir -p esports-tracker
    tar -xzf esports-tracker.tar.gz -C esports-tracker
    rm esports-tracker.tar.gz
    
    cd esports-tracker
    
    # Copier le .env généré
    if [ -f "deploy/generated/.env" ]; then
        cp deploy/generated/.env .env
        chmod 600 .env
    fi
    
    # Lancer l'installation
    chmod +x deploy/generated/install-on-server.sh
    ./deploy/generated/install-on-server.sh
REMOTE

echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "Pour voir les logs :"
echo "  ssh -p \$VPS_PORT \$VPS_USER@\$VPS_HOST 'cd esports-tracker && docker compose -f docker-compose.db.yml logs -f'"
EOF

    chmod +x "$config_dir/deploy-to-server.sh"
    print_success "Script de déploiement généré"
    
    # ==========================================
    # Fichier récapitulatif
    # ==========================================
    cat > "$config_dir/README.txt" << EOF
╔═══════════════════════════════════════════════════════════════╗
║           ESPORTS TRACKER - CONFIGURATION GÉNÉRÉE             ║
╚═══════════════════════════════════════════════════════════════╝

Généré le : $(date)

═══════════════════════════════════════════════════════════════
📋 RÉCAPITULATIF
═══════════════════════════════════════════════════════════════

🌐 SERVEUR
   IP :          $VPS_HOST
   Utilisateur : $VPS_USER
   Port SSH :    $VPS_PORT

🌍 DOMAINE
   Domaine :     $DOMAIN
   Email SSL :   $ACME_EMAIL

🗄️ BASE DE DONNÉES
   Utilisateur : $DB_USER
   Base :        $DB_DATABASE
   Mot de passe : $DB_PASSWORD

📦 REDIS
   Mot de passe : $REDIS_PASSWORD

🔑 APPLICATION
   APP_KEY :     $APP_KEY

🎮 RIOT API
   Clé API :     $RIOT_API_KEY

═══════════════════════════════════════════════════════════════
🚀 ÉTAPES SUIVANTES
═══════════════════════════════════════════════════════════════

1. CONFIGURER SSH (si pas déjà fait)
   ssh-copy-id -p $VPS_PORT $VPS_USER@$VPS_HOST

2. DÉPLOYER SUR LE SERVEUR
   ./deploy/generated/deploy-to-server.sh

3. CONFIGURER LES DNS
   Type A | @ | $VPS_HOST
   Type A | api | $VPS_HOST
   Type A | www | $VPS_HOST

4. LANCER L'APPLICATION COMPLÈTE (sur le serveur)
   ssh $VPS_USER@$VPS_HOST
   cd esports-tracker
   docker compose -f docker-compose.prod.yml up -d

═══════════════════════════════════════════════════════════════
⚠️ IMPORTANT : SAUVEGARDE CE FICHIER !
   Il contient tous tes mots de passe
═══════════════════════════════════════════════════════════════
EOF

    print_success "README.txt généré"
    
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   ✅ CONFIGURATION GÉNÉRÉE !${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}📁 Fichiers créés dans : ${CYAN}deploy/generated/${NC}"
    echo ""
    ls -la "$config_dir"
    echo ""
    
    echo -e "${BOLD}🚀 Prochaines étapes :${NC}"
    echo ""
    echo "  1. ${CYAN}Configure ta clé SSH${NC} (si pas déjà fait)"
    echo "     ssh-copy-id -p $VPS_PORT $VPS_USER@$VPS_HOST"
    echo ""
    echo "  2. ${CYAN}Déploie sur le serveur${NC}"
    echo "     ./deploy/generated/deploy-to-server.sh"
    echo ""
    echo "  3. ${CYAN}Configure tes DNS${NC} chez Hostinger"
    echo "     A | @ | $VPS_HOST"
    echo "     A | api | $VPS_HOST"
    echo ""
    
    echo -e "${YELLOW}⚠️  Sauvegarde le fichier ${BOLD}deploy/generated/README.txt${NC}"
    echo -e "${YELLOW}   Il contient tous tes mots de passe !${NC}"
    echo ""
}

# ==========================================
# Main
# ==========================================
main() {
    print_banner
    
    echo -e "${BOLD}Bienvenue dans l'assistant de configuration !${NC}"
    echo ""
    echo "Ce wizard va générer tous les fichiers nécessaires"
    echo "pour déployer sur ton VPS Hostinger."
    echo ""
    echo -e "${DIM}Tu pourras ensuite déployer en une seule commande.${NC}"
    echo ""
    
    if ! ask_yes_no "Prêt à commencer ?" "y"; then
        echo ""
        print_info "Configuration annulée."
        exit 0
    fi
    
    configure_server
    configure_domain
    configure_database
    configure_riot_api
    generate_files
}

main "$@"
