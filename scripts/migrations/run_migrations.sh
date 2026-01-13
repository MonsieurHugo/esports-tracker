#!/bin/bash
# Script d'execution des migrations
# Usage: ./run_migrations.sh [migration_number]
#   Sans argument: execute toutes les migrations
#   Avec numero: execute seulement cette migration (ex: ./run_migrations.sh 001)

set -e  # Arreter en cas d'erreur

# Configuration (modifier selon votre environnement)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-esports_tracker}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Chemin du script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Liste des migrations dans l'ordre
MIGRATIONS=(
    "001_performance_indexes.sql"
    "002_total_lp_column.sql"
    "003_data_integrity.sql"
    "004_leaderboard_cache.sql"
    "005_valorant_schema.sql"
    "006_worker_indexes.sql"
)

# Fonction pour executer une migration
run_migration() {
    local migration_file="$1"
    local migration_path="$SCRIPT_DIR/$migration_file"

    if [ ! -f "$migration_path" ]; then
        echo -e "${RED}[ERROR] Migration file not found: $migration_file${NC}"
        return 1
    fi

    echo -e "${YELLOW}[RUNNING] $migration_file${NC}"

    PGPASSWORD="$DB_PASSWORD" psql \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -f "$migration_path" \
        --echo-errors \
        --set ON_ERROR_STOP=on

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[SUCCESS] $migration_file${NC}"
        return 0
    else
        echo -e "${RED}[FAILED] $migration_file${NC}"
        return 1
    fi
}

# Fonction pour executer via Docker
run_migration_docker() {
    local migration_file="$1"
    local migration_path="/migrations/$migration_file"

    echo -e "${YELLOW}[RUNNING via Docker] $migration_file${NC}"

    docker exec -i esports-tracker-db psql \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        < "$SCRIPT_DIR/$migration_file"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[SUCCESS] $migration_file${NC}"
        return 0
    else
        echo -e "${RED}[FAILED] $migration_file${NC}"
        return 1
    fi
}

# Verifier si on utilise Docker
USE_DOCKER=false
if docker ps | grep -q "esports-tracker-db"; then
    USE_DOCKER=true
    echo -e "${YELLOW}Docker container detected, using docker exec${NC}"
fi

# Main
echo "=================================="
echo "Esports Tracker - Database Migrations"
echo "=================================="
echo "Host: $DB_HOST:$DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Si un numero de migration est specifie
if [ -n "$1" ]; then
    # Trouver la migration correspondante
    FOUND=false
    for migration in "${MIGRATIONS[@]}"; do
        if [[ "$migration" == "$1"* ]]; then
            FOUND=true
            if [ "$USE_DOCKER" = true ]; then
                run_migration_docker "$migration"
            else
                run_migration "$migration"
            fi
            break
        fi
    done

    if [ "$FOUND" = false ]; then
        echo -e "${RED}[ERROR] Migration not found: $1${NC}"
        echo "Available migrations:"
        for m in "${MIGRATIONS[@]}"; do
            echo "  - $m"
        done
        exit 1
    fi
else
    # Executer toutes les migrations
    echo "Running all migrations..."
    echo ""

    FAILED=0
    for migration in "${MIGRATIONS[@]}"; do
        if [ "$USE_DOCKER" = true ]; then
            run_migration_docker "$migration" || FAILED=$((FAILED + 1))
        else
            run_migration "$migration" || FAILED=$((FAILED + 1))
        fi
        echo ""
    done

    echo "=================================="
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}All migrations completed successfully!${NC}"
    else
        echo -e "${RED}$FAILED migration(s) failed${NC}"
        exit 1
    fi
fi
