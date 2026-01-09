#!/bin/bash

# ============================================
# 🚀 Esports Tracker - Installation Wizard
# Guide interactif étape par étape
# ============================================

set -e

# ==========================================
# Configuration
# ==========================================
INSTALL_DIR="${INSTALL_DIR:-$(pwd)}"
DATA_DIR="/var/lib/esports-tracker"
LOG_FILE="/tmp/esports-install.log"
CONFIG_ALREADY_EXISTS=false

# Vérifier si la config existe déjà (générée depuis le PC)
if [ -f ".env" ] || [ -f "deploy/generated/.env" ]; then
    CONFIG_ALREADY_EXISTS=true
fi

# ==========================================
# Couleurs et styles
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

           🎮 INSTALLATION WIZARD 🎮
    
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
print_question() { echo -e "${CYAN}? ${NC} $1"; }

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

ask_input_required() {
    local question=$1
    local var_name=$2
    local is_password=${3:-false}
    
    while true; do
        ask_input "$question" "" "$var_name" "$is_password"
        
        eval "value=\$$var_name"
        if [ -n "$value" ]; then
            break
        fi
        echo -e "${RED}  Cette information est obligatoire${NC}"
    done
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
    openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24
}

press_enter() {
    echo ""
    echo -ne "${DIM}Appuie sur Entrée pour continuer...${NC}"
    read -r
}

# ==========================================
# Étape 0 : Vérification des prérequis
# ==========================================
check_prerequisites() {
    print_step 0 7 "Vérification des prérequis"
    
    local errors=0
    
    # Check root
    print_info "Vérification des permissions..."
    if [ "$EUID" -eq 0 ]; then
        print_success "Exécuté en tant que root"
    else
        print_warning "Pas root - certaines commandes nécessiteront sudo"
    fi
    
    # Check Docker
    print_info "Vérification de Docker..."
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | cut -d' ' -f3 | tr -d ',')
        print_success "Docker installé (v$docker_version)"
    else
        print_error "Docker n'est pas installé"
        ((errors++))
    fi
    
    # Check Docker Compose
    print_info "Vérification de Docker Compose..."
    if docker compose version &> /dev/null; then
        local compose_version=$(docker compose version --short)
        print_success "Docker Compose installé (v$compose_version)"
    else
        print_error "Docker Compose n'est pas installé"
        ((errors++))
    fi
    
    # Check Git
    print_info "Vérification de Git..."
    if command -v git &> /dev/null; then
        print_success "Git installé"
    else
        print_warning "Git n'est pas installé (optionnel)"
    fi
    
    # Check disk space
    print_info "Vérification de l'espace disque..."
    local free_space=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    if [ "$free_space" -gt 10 ]; then
        print_success "Espace disque suffisant (${free_space}G disponible)"
    else
        print_warning "Espace disque faible (${free_space}G disponible, 10G recommandé)"
    fi
    
    # Check memory
    print_info "Vérification de la mémoire..."
    local total_mem=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$total_mem" -ge 4 ]; then
        print_success "Mémoire suffisante (${total_mem}G)"
    else
        print_warning "Mémoire faible (${total_mem}G, 4G recommandé)"
    fi
    
    echo ""
    
    if [ $errors -gt 0 ]; then
        print_error "Des prérequis manquent. Installe Docker avec :"
        echo ""
        echo -e "  ${CYAN}curl -fsSL https://get.docker.com | sh${NC}"
        echo ""
        
        if ! ask_yes_no "Veux-tu installer Docker maintenant ?" "y"; then
            echo ""
            print_error "Installation annulée."
            exit 1
        fi
        
        print_info "Installation de Docker..."
        curl -fsSL https://get.docker.com | sh >> "$LOG_FILE" 2>&1
        
        if [ "$EUID" -ne 0 ]; then
            sudo usermod -aG docker $USER
            print_warning "Tu devras te reconnecter pour utiliser Docker sans sudo"
        fi
        
        print_success "Docker installé !"
    fi
    
    press_enter
}

# ==========================================
# Étape 1 : Configuration du domaine
# ==========================================
configure_domain() {
    print_step 1 7 "Configuration du domaine"
    
    print_info "Le domaine sera utilisé pour :"
    echo "  • Frontend : https://ton-domaine.com"
    echo "  • API :      https://api.ton-domaine.com"
    echo "  • SSL :      Certificat Let's Encrypt automatique"
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
    print_info "Email utilisé pour les certificats SSL (Let's Encrypt)"
    
    while true; do
        ask_input "Ton email" "" "ACME_EMAIL"
        
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
    
    echo ""
    print_info "Configuration DNS requise :"
    echo ""
    echo -e "  ${BOLD}Ajoute ces enregistrements DNS chez ton registrar :${NC}"
    echo ""
    echo -e "  ${DIM}Type${NC}    ${DIM}Nom${NC}     ${DIM}Valeur${NC}"
    echo -e "  ${CYAN}A${NC}       @       $(curl -s ifconfig.me 2>/dev/null || echo "TON_IP_VPS")"
    echo -e "  ${CYAN}A${NC}       api     $(curl -s ifconfig.me 2>/dev/null || echo "TON_IP_VPS")"
    echo -e "  ${CYAN}A${NC}       www     $(curl -s ifconfig.me 2>/dev/null || echo "TON_IP_VPS")"
    echo ""
    
    press_enter
}

# ==========================================
# Étape 2 : Configuration de la base de données
# ==========================================
configure_database() {
    print_step 2 7 "Configuration de la base de données"
    
    print_info "PostgreSQL sera installé en local sur ce serveur"
    print_info "Les données seront stockées dans : /var/lib/esports-tracker/"
    echo ""
    
    # Nom d'utilisateur DB
    ask_input "Nom d'utilisateur PostgreSQL" "esports" "DB_USER"
    
    # Mot de passe DB
    echo ""
    print_info "Mot de passe PostgreSQL"
    
    if ask_yes_no "Générer un mot de passe sécurisé automatiquement ?" "y"; then
        DB_PASSWORD=$(generate_password)
        print_success "Mot de passe généré : ${DIM}(sauvegardé dans .env)${NC}"
    else
        while true; do
            ask_input "Entre ton mot de passe" "" "DB_PASSWORD" true
            if [ ${#DB_PASSWORD} -ge 8 ]; then
                print_success "Mot de passe défini"
                break
            else
                print_error "Le mot de passe doit faire au moins 8 caractères"
            fi
        done
    fi
    
    # Nom de la base
    ask_input "Nom de la base de données" "esports_tracker" "DB_DATABASE"
    
    # Redis
    echo ""
    print_info "Configuration Redis (cache)"
    
    if ask_yes_no "Générer un mot de passe Redis automatiquement ?" "y"; then
        REDIS_PASSWORD=$(generate_password)
        print_success "Mot de passe Redis généré"
    else
        ask_input "Mot de passe Redis" "" "REDIS_PASSWORD" true
    fi
    
    echo ""
    print_success "Base de données configurée !"
    
    press_enter
}

# ==========================================
# Étape 3 : Configuration Riot Games API
# ==========================================
configure_riot_api() {
    print_step 3 7 "Configuration de l'API Riot Games"
    
    print_info "L'API Riot Games est nécessaire pour récupérer les données LoL"
    echo ""
    echo "  Pour obtenir une clé API :"
    echo "  1. Va sur ${CYAN}https://developer.riotgames.com${NC}"
    echo "  2. Connecte-toi avec ton compte Riot"
    echo "  3. Copie ta ${BOLD}Development API Key${NC}"
    echo ""
    print_warning "La clé de développement expire toutes les 24h"
    print_info "Pour la production, demande une clé permanente"
    echo ""
    
    if ask_yes_no "As-tu déjà une clé API Riot ?" "y"; then
        while true; do
            ask_input "Ta clé API Riot (RGAPI-xxx...)" "" "RIOT_API_KEY"
            
            if [[ $RIOT_API_KEY =~ ^RGAPI-[a-f0-9-]+$ ]]; then
                print_success "Format de clé valide"
                break
            else
                print_error "Format invalide. La clé doit commencer par RGAPI-"
                if ! ask_yes_no "Réessayer ?" "y"; then
                    RIOT_API_KEY="CHANGE_ME"
                    print_warning "Tu devras configurer la clé plus tard dans .env"
                    break
                fi
            fi
        done
    else
        RIOT_API_KEY="CHANGE_ME"
        print_warning "N'oublie pas de configurer ta clé dans .env plus tard"
    fi
    
    press_enter
}

# ==========================================
# Étape 4 : Configuration GitHub (optionnel)
# ==========================================
configure_github() {
    print_step 4 7 "Configuration GitHub (optionnel)"
    
    print_info "GitHub est utilisé pour :"
    echo "  • Héberger le code source"
    echo "  • CI/CD automatique"
    echo "  • Stocker les images Docker (GitHub Container Registry)"
    echo ""
    
    if ask_yes_no "Veux-tu configurer GitHub ?" "n"; then
        ask_input "Ton username/repo GitHub (ex: user/esports-tracker)" "" "GITHUB_REPO"
        
        echo ""
        print_info "Token GitHub (pour push les images Docker)"
        print_info "Crée un token sur : ${CYAN}https://github.com/settings/tokens${NC}"
        print_info "Permissions requises : write:packages, read:packages"
        echo ""
        
        if ask_yes_no "As-tu un token GitHub ?" "n"; then
            ask_input "Ton token GitHub" "" "GITHUB_TOKEN" true
            print_success "Token GitHub configuré"
        else
            GITHUB_TOKEN=""
            print_warning "Tu pourras le configurer plus tard"
        fi
    else
        GITHUB_REPO=""
        GITHUB_TOKEN=""
        print_info "Configuration GitHub ignorée"
    fi
    
    press_enter
}

# ==========================================
# Étape 5 : Récapitulatif
# ==========================================
show_summary() {
    print_step 5 7 "Récapitulatif de la configuration"
    
    echo -e "${BOLD}🌐 Domaine${NC}"
    print_config_item "Domaine" "$DOMAIN"
    print_config_item "Email SSL" "$ACME_EMAIL"
    echo ""
    
    echo -e "${BOLD}🗄️ Base de données${NC}"
    print_config_item "Utilisateur" "$DB_USER"
    print_config_item "Base" "$DB_DATABASE"
    print_config_item "Mot de passe" "${DB_PASSWORD:0:4}****"
    echo ""
    
    echo -e "${BOLD}📦 Redis${NC}"
    print_config_item "Mot de passe" "${REDIS_PASSWORD:0:4}****"
    echo ""
    
    echo -e "${BOLD}🎮 Riot API${NC}"
    if [ "$RIOT_API_KEY" = "CHANGE_ME" ]; then
        print_config_item "Clé API" "${YELLOW}À configurer${NC}"
    else
        print_config_item "Clé API" "${RIOT_API_KEY:0:15}****"
    fi
    echo ""
    
    if [ -n "$GITHUB_REPO" ]; then
        echo -e "${BOLD}🐙 GitHub${NC}"
        print_config_item "Repository" "$GITHUB_REPO"
        echo ""
    fi
    
    echo -e "${BOLD}📁 Chemins${NC}"
    print_config_item "Installation" "$INSTALL_DIR"
    print_config_item "Données" "$DATA_DIR"
    echo ""
    
    if ! ask_yes_no "Cette configuration est-elle correcte ?" "y"; then
        print_warning "Relance le script pour recommencer"
        exit 0
    fi
    
    press_enter
}

# ==========================================
# Étape 6 : Installation
# ==========================================
run_installation() {
    print_step 6 7 "Installation en cours..."
    
    # Créer les dossiers
    print_info "Création des dossiers..."
    sudo mkdir -p "$DATA_DIR"/{postgres,redis,backups}
    sudo chmod 700 "$DATA_DIR/postgres"
    print_success "Dossiers créés"
    
    # Générer APP_KEY
    APP_KEY=$(openssl rand -hex 32)
    
    # Créer le fichier .env
    print_info "Génération du fichier .env..."
    
    cat > "$INSTALL_DIR/.env" << EOF
# ============================================
# Esports Tracker - Configuration
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

# Connection string
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

# ==========================================
# GITHUB (optionnel)
# ==========================================
GITHUB_REPOSITORY=$GITHUB_REPO
EOF

    chmod 600 "$INSTALL_DIR/.env"
    print_success "Fichier .env créé"
    
    # Lancer la base de données
    print_info "Démarrage de PostgreSQL et Redis..."
    cd "$INSTALL_DIR"
    
    docker compose -f docker-compose.db.yml up -d >> "$LOG_FILE" 2>&1
    
    # Attendre que PostgreSQL soit prêt
    print_info "Attente du démarrage de PostgreSQL..."
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if docker exec esports-postgres pg_isready -U "$DB_USER" -d "$DB_DATABASE" > /dev/null 2>&1; then
            break
        fi
        echo -n "."
        sleep 2
        ((attempts++))
    done
    echo ""
    
    if [ $attempts -eq 30 ]; then
        print_error "PostgreSQL n'a pas démarré correctement"
        print_info "Consulte les logs : docker logs esports-postgres"
        exit 1
    fi
    
    print_success "PostgreSQL démarré"
    
    # Vérifier Redis
    if docker exec esports-redis redis-cli -a "$REDIS_PASSWORD" ping > /dev/null 2>&1; then
        print_success "Redis démarré"
    else
        print_warning "Redis peut prendre quelques secondes de plus..."
    fi
    
    # Créer les tables
    print_info "Création des tables..."
    docker exec -i esports-postgres psql -U "$DB_USER" -d "$DB_DATABASE" < scripts/schema.sql >> "$LOG_FILE" 2>&1
    print_success "Tables créées"
    
    # Vérifier le nombre de tables
    local table_count=$(docker exec esports-postgres psql -U "$DB_USER" -d "$DB_DATABASE" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
    print_success "$table_count tables créées dans la base"
    
    press_enter
}

# ==========================================
# Étape 7 : Finalisation
# ==========================================
show_final_instructions() {
    print_step 7 7 "Installation terminée ! 🎉"
    
    echo -e "${GREEN}"
    cat << 'EOF'
    
   ╔═══════════════════════════════════════════════════════╗
   ║                                                       ║
   ║    ✅ INSTALLATION RÉUSSIE !                         ║
   ║                                                       ║
   ╚═══════════════════════════════════════════════════════╝
    
EOF
    echo -e "${NC}"
    
    echo -e "${BOLD}📊 Services démarrés :${NC}"
    echo ""
    docker compose -f docker-compose.db.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose -f docker-compose.db.yml ps
    echo ""
    
    echo -e "${BOLD}🔗 Connexions :${NC}"
    echo ""
    echo "  PostgreSQL : postgresql://$DB_USER:****@localhost:5432/$DB_DATABASE"
    echo "  Redis      : redis://:****@localhost:6379"
    echo ""
    
    echo -e "${BOLD}📁 Fichiers importants :${NC}"
    echo ""
    echo "  Configuration : $INSTALL_DIR/.env"
    echo "  Données       : $DATA_DIR/"
    echo "  Logs          : $LOG_FILE"
    echo ""
    
    echo -e "${BOLD}🚀 Prochaines étapes :${NC}"
    echo ""
    echo "  1. ${CYAN}Configurer les DNS${NC}"
    echo "     Ajoute les enregistrements A pour $DOMAIN"
    echo ""
    
    if [ "$RIOT_API_KEY" = "CHANGE_ME" ]; then
        echo "  2. ${CYAN}Configurer la clé Riot API${NC}"
        echo "     Édite .env et remplace RIOT_API_KEY"
        echo ""
    fi
    
    echo "  3. ${CYAN}Lancer l'application complète${NC}"
    echo "     docker compose -f docker-compose.prod.yml up -d"
    echo ""
    
    echo "  4. ${CYAN}Vérifier les logs${NC}"
    echo "     docker compose -f docker-compose.prod.yml logs -f"
    echo ""
    
    echo -e "${BOLD}🔧 Commandes utiles :${NC}"
    echo ""
    echo "  # Status des services"
    echo "  docker compose -f docker-compose.db.yml ps"
    echo ""
    echo "  # Accéder à PostgreSQL"
    echo "  docker exec -it esports-postgres psql -U $DB_USER -d $DB_DATABASE"
    echo ""
    echo "  # Backup de la base"
    echo "  ./deploy/scripts/backup-db.sh"
    echo ""
    echo "  # Voir les logs"
    echo "  docker compose -f docker-compose.db.yml logs -f"
    echo ""
    
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Merci d'utiliser Esports Tracker !${NC}"
    echo -e "  ${DIM}Documentation : docs/DATABASE.md${NC}"
    echo ""
}

# ==========================================
# Menu principal
# ==========================================
main_menu() {
    print_banner
    
    echo -e "${BOLD}Bienvenue dans l'assistant d'installation !${NC}"
    echo ""
    echo "Ce wizard va te guider pour configurer :"
    echo ""
    echo "  • 🌐 Ton domaine et SSL"
    echo "  • 🗄️ PostgreSQL + Redis"
    echo "  • 🎮 L'API Riot Games"
    echo "  • 🐙 GitHub (optionnel)"
    echo ""
    echo -e "${DIM}Durée estimée : 5-10 minutes${NC}"
    echo ""
    
    if ! ask_yes_no "Prêt à commencer ?" "y"; then
        echo ""
        print_info "Installation annulée. À bientôt !"
        exit 0
    fi
}

# ==========================================
# Point d'entrée
# ==========================================
main() {
    # Vérifier qu'on est dans le bon dossier
    if [ ! -f "docker-compose.db.yml" ]; then
        echo -e "${RED}Erreur : Lance ce script depuis le dossier esports-tracker${NC}"
        echo ""
        echo "  cd esports-tracker"
        echo "  ./install.sh"
        exit 1
    fi
    
    # Si la config existe déjà (générée depuis le PC)
    if [ "$CONFIG_ALREADY_EXISTS" = true ]; then
        print_banner
        
        echo -e "${GREEN}✓ Configuration détectée !${NC}"
        echo ""
        
        # Charger la config existante
        if [ -f "deploy/generated/.env" ]; then
            cp deploy/generated/.env .env
            print_success "Configuration copiée depuis deploy/generated/.env"
        fi
        
        if [ -f ".env" ]; then
            source <(grep -v '^#' .env | grep '=')
            
            echo -e "${BOLD}Configuration trouvée :${NC}"
            echo ""
            print_config_item "Domaine" "${DOMAIN:-non défini}"
            print_config_item "Email" "${ACME_EMAIL:-non défini}"
            print_config_item "DB User" "${DB_USER:-non défini}"
            print_config_item "DB Name" "${DB_DATABASE:-non défini}"
            echo ""
            
            if ask_yes_no "Utiliser cette configuration ?" "y"; then
                check_prerequisites
                run_installation
                show_final_instructions
                exit 0
            fi
        fi
    fi
    
    # Menu principal (configuration manuelle)
    main_menu
    
    # Étapes
    check_prerequisites
    configure_domain
    configure_database
    configure_riot_api
    configure_github
    show_summary
    run_installation
    show_final_instructions
}

# Lancer le script
main "$@"
