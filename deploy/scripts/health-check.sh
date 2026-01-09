#!/bin/bash

# ============================================
# Esports Tracker - Health Check & Monitoring
# ============================================

# Configuration
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/esports-tracker}"
COMPOSE_FILE="docker-compose.prod.yml"
ALERT_EMAIL="${ALERT_EMAIL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Status tracking
OVERALL_STATUS="healthy"
ISSUES=()

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; ISSUES+=("$1"); }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; ISSUES+=("$1"); OVERALL_STATUS="unhealthy"; }

# ==========================================
# Check Docker
# ==========================================
check_docker() {
    echo ""
    echo "🐳 Docker Status"
    echo "----------------"
    
    if docker info &> /dev/null; then
        log_ok "Docker daemon is running"
    else
        log_error "Docker daemon is not running"
        return 1
    fi
    
    # Check disk space for Docker
    local docker_usage=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1)
    log_info "Docker disk usage: $docker_usage"
}

# ==========================================
# Check Containers
# ==========================================
check_containers() {
    echo ""
    echo "📦 Container Status"
    echo "-------------------"
    
    cd "$DEPLOY_DIR"
    
    local services=("postgres" "redis" "backend" "frontend" "worker" "traefik")
    
    for service in "${services[@]}"; do
        local status=$(docker compose -f "$COMPOSE_FILE" ps --format json "$service" 2>/dev/null | jq -r '.State' 2>/dev/null)
        local health=$(docker compose -f "$COMPOSE_FILE" ps --format json "$service" 2>/dev/null | jq -r '.Health' 2>/dev/null)
        
        if [ "$status" = "running" ]; then
            if [ "$health" = "healthy" ] || [ "$health" = "" ]; then
                log_ok "$service: running"
            else
                log_warning "$service: running but $health"
            fi
        elif [ -z "$status" ]; then
            log_warning "$service: not deployed"
        else
            log_error "$service: $status"
        fi
    done
}

# ==========================================
# Check Services Health
# ==========================================
check_services() {
    echo ""
    echo "🔍 Service Health"
    echo "-----------------"
    
    # Backend API
    if curl -sf http://localhost:3333/health > /dev/null 2>&1; then
        log_ok "Backend API: healthy"
    else
        log_error "Backend API: not responding"
    fi
    
    # Frontend
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
        log_ok "Frontend: healthy"
    else
        log_error "Frontend: not responding"
    fi
    
    # PostgreSQL
    cd "$DEPLOY_DIR"
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_ok "PostgreSQL: accepting connections"
    else
        log_error "PostgreSQL: not accepting connections"
    fi
    
    # Redis
    if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_ok "Redis: responding to ping"
    else
        log_error "Redis: not responding"
    fi
}

# ==========================================
# Check Resources
# ==========================================
check_resources() {
    echo ""
    echo "💻 System Resources"
    echo "-------------------"
    
    # CPU Load
    local load=$(cat /proc/loadavg | awk '{print $1}')
    local cpus=$(nproc)
    local load_percent=$(echo "$load $cpus" | awk '{printf "%.0f", ($1/$2)*100}')
    
    if [ "$load_percent" -lt 70 ]; then
        log_ok "CPU Load: $load ($load_percent%)"
    elif [ "$load_percent" -lt 90 ]; then
        log_warning "CPU Load: $load ($load_percent%) - High"
    else
        log_error "CPU Load: $load ($load_percent%) - Critical"
    fi
    
    # Memory
    local mem_total=$(free -m | awk '/^Mem:/{print $2}')
    local mem_used=$(free -m | awk '/^Mem:/{print $3}')
    local mem_percent=$((mem_used * 100 / mem_total))
    
    if [ "$mem_percent" -lt 80 ]; then
        log_ok "Memory: ${mem_used}MB / ${mem_total}MB ($mem_percent%)"
    elif [ "$mem_percent" -lt 95 ]; then
        log_warning "Memory: ${mem_used}MB / ${mem_total}MB ($mem_percent%) - High"
    else
        log_error "Memory: ${mem_used}MB / ${mem_total}MB ($mem_percent%) - Critical"
    fi
    
    # Disk
    local disk_percent=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
    local disk_used=$(df -h / | awk 'NR==2{print $3}')
    local disk_total=$(df -h / | awk 'NR==2{print $2}')
    
    if [ "$disk_percent" -lt 80 ]; then
        log_ok "Disk: $disk_used / $disk_total ($disk_percent%)"
    elif [ "$disk_percent" -lt 95 ]; then
        log_warning "Disk: $disk_used / $disk_total ($disk_percent%) - High"
    else
        log_error "Disk: $disk_used / $disk_total ($disk_percent%) - Critical"
    fi
}

# ==========================================
# Check SSL Certificate
# ==========================================
check_ssl() {
    echo ""
    echo "🔒 SSL Certificate"
    echo "------------------"
    
    local domain="${DOMAIN:-localhost}"
    
    if [ "$domain" = "localhost" ]; then
        log_info "SSL check skipped (localhost)"
        return 0
    fi
    
    local expiry=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    
    if [ -z "$expiry" ]; then
        log_warning "Could not check SSL certificate"
        return 0
    fi
    
    local expiry_epoch=$(date -d "$expiry" +%s)
    local now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
    
    if [ "$days_left" -gt 30 ]; then
        log_ok "SSL Certificate: Valid for $days_left days"
    elif [ "$days_left" -gt 7 ]; then
        log_warning "SSL Certificate: Expires in $days_left days"
    else
        log_error "SSL Certificate: Expires in $days_left days - Renew now!"
    fi
}

# ==========================================
# Check Logs for Errors
# ==========================================
check_logs() {
    echo ""
    echo "📋 Recent Errors"
    echo "----------------"
    
    cd "$DEPLOY_DIR"
    
    local error_count=$(docker compose -f "$COMPOSE_FILE" logs --since 1h 2>/dev/null | grep -ci "error\|exception\|fatal" || echo "0")
    
    if [ "$error_count" -eq 0 ]; then
        log_ok "No errors in the last hour"
    elif [ "$error_count" -lt 10 ]; then
        log_warning "$error_count errors in the last hour"
    else
        log_error "$error_count errors in the last hour - Check logs!"
    fi
}

# ==========================================
# Send Alert
# ==========================================
send_alert() {
    if [ "$OVERALL_STATUS" = "healthy" ]; then
        return 0
    fi
    
    local message="🚨 Esports Tracker Health Alert\n\nStatus: $OVERALL_STATUS\n\nIssues:\n"
    for issue in "${ISSUES[@]}"; do
        message+="- $issue\n"
    done
    
    # Email alert
    if [ -n "$ALERT_EMAIL" ]; then
        echo -e "$message" | mail -s "Esports Tracker Alert" "$ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # Slack alert
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK" > /dev/null 2>&1 || true
    fi
}

# ==========================================
# Summary
# ==========================================
print_summary() {
    echo ""
    echo "=============================="
    if [ "$OVERALL_STATUS" = "healthy" ]; then
        echo -e "${GREEN}✅ Overall Status: HEALTHY${NC}"
    else
        echo -e "${RED}❌ Overall Status: UNHEALTHY${NC}"
        echo ""
        echo "Issues found:"
        for issue in "${ISSUES[@]}"; do
            echo "  - $issue"
        done
    fi
    echo "=============================="
    echo ""
}

# ==========================================
# Watch mode (continuous monitoring)
# ==========================================
watch_mode() {
    log_info "Starting watch mode (Ctrl+C to stop)..."
    
    while true; do
        clear
        echo "Last check: $(date)"
        main_check
        sleep 60
    done
}

# ==========================================
# Main check
# ==========================================
main_check() {
    # Load environment
    if [ -f "$DEPLOY_DIR/.env" ]; then
        source "$DEPLOY_DIR/.env"
    fi
    
    check_docker
    check_containers
    check_services
    check_resources
    check_ssl
    check_logs
    print_summary
    send_alert
}

# ==========================================
# JSON output
# ==========================================
json_output() {
    cd "$DEPLOY_DIR"
    
    local containers=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | jq -s '.' 2>/dev/null || echo "[]")
    local mem_percent=$(free | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
    local disk_percent=$(df / | awk 'NR==2{print $5}' | tr -d '%')
    local load=$(cat /proc/loadavg | awk '{print $1}')
    
    cat << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$OVERALL_STATUS",
  "resources": {
    "cpu_load": $load,
    "memory_percent": $mem_percent,
    "disk_percent": $disk_percent
  },
  "containers": $containers,
  "issues": $(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .)
}
EOF
}

# ==========================================
# Handle arguments
# ==========================================
case "${1:-check}" in
    check)
        echo ""
        echo "🏥 Esports Tracker Health Check"
        echo "================================"
        main_check
        ;;
    watch)
        watch_mode
        ;;
    json)
        main_check > /dev/null 2>&1
        json_output
        ;;
    *)
        echo "Usage: $0 {check|watch|json}"
        exit 1
        ;;
esac

# Exit with appropriate code
if [ "$OVERALL_STATUS" = "healthy" ]; then
    exit 0
else
    exit 1
fi
