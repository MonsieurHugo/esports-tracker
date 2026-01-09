#!/bin/bash

# ============================================
# Esports Tracker - Server Installation Script
# Pour VPS Hostinger (Ubuntu 22.04/24.04)
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
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "
███████╗███████╗██████╗  ██████╗ ██████╗ ████████╗███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝
█████╗  ███████╗██████╔╝██║   ██║██████╔╝   ██║   ███████╗
██╔══╝  ╚════██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ╚════██║
███████╗███████║██║     ╚██████╔╝██║  ██║   ██║   ███████║
╚══════╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
              SERVER INSTALLATION
"

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    log_warning "Running as root. Creating dedicated user is recommended."
fi

# ==========================================
# System Update
# ==========================================
log_info "Updating system packages..."
sudo apt update && sudo apt upgrade -y
log_success "System updated"

# ==========================================
# Install Essential Tools
# ==========================================
log_info "Installing essential tools..."
sudo apt install -y \
    curl \
    wget \
    git \
    htop \
    vim \
    nano \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    apt-transport-https \
    software-properties-common

log_success "Essential tools installed"

# ==========================================
# Install Docker
# ==========================================
log_info "Installing Docker..."

# Remove old versions
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl enable docker
sudo systemctl start docker

log_success "Docker installed (version: $(docker --version))"

# ==========================================
# Install Node.js (for local testing)
# ==========================================
log_info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
log_success "Node.js installed (version: $(node --version))"

# ==========================================
# Configure Firewall (UFW)
# ==========================================
log_info "Configuring firewall..."

sudo apt install -y ufw

# Reset UFW
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (important: don't lock yourself out!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable UFW
sudo ufw --force enable

log_success "Firewall configured"
sudo ufw status

# ==========================================
# Install Fail2Ban
# ==========================================
log_info "Installing Fail2Ban..."

sudo apt install -y fail2ban

# Create local config
sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 24h
EOF

sudo systemctl enable fail2ban
sudo systemctl restart fail2ban

log_success "Fail2Ban installed and configured"

# ==========================================
# Create directories
# ==========================================
log_info "Creating directories..."

mkdir -p ~/esports-tracker
mkdir -p ~/backups
mkdir -p ~/logs

log_success "Directories created"

# ==========================================
# Configure swap (if not exists)
# ==========================================
if [ ! -f /swapfile ]; then
    log_info "Creating swap file (2GB)..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    log_success "Swap configured"
else
    log_info "Swap already exists"
fi

# ==========================================
# Configure system limits
# ==========================================
log_info "Configuring system limits..."

sudo tee -a /etc/security/limits.conf > /dev/null << 'EOF'
# Esports Tracker limits
* soft nofile 65535
* hard nofile 65535
* soft nproc 65535
* hard nproc 65535
EOF

sudo tee /etc/sysctl.d/99-esports.conf > /dev/null << 'EOF'
# Network optimizations
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15

# Memory
vm.swappiness = 10
vm.overcommit_memory = 1
EOF

sudo sysctl -p /etc/sysctl.d/99-esports.conf

log_success "System limits configured"

# ==========================================
# Install monitoring tools
# ==========================================
log_info "Installing monitoring tools..."

# Netdata (lightweight monitoring)
# curl -s https://my-netdata.io/kickstart.sh | bash -s -- --dont-wait

# For now, just htop and basic tools
sudo apt install -y \
    iotop \
    iftop \
    ncdu \
    jq

log_success "Monitoring tools installed"

# ==========================================
# Setup log rotation
# ==========================================
log_info "Configuring log rotation..."

sudo tee /etc/logrotate.d/esports-tracker > /dev/null << 'EOF'
/home/*/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
EOF

log_success "Log rotation configured"

# ==========================================
# Create helper scripts
# ==========================================
log_info "Creating helper scripts..."

# Quick status script
cat > ~/bin/esports-status << 'EOF'
#!/bin/bash
echo "=== Docker Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo ""
echo "=== Disk Usage ==="
df -h / | tail -1
echo ""
echo "=== Memory ==="
free -h | head -2
EOF

mkdir -p ~/bin
chmod +x ~/bin/esports-status

# Add to PATH
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc

log_success "Helper scripts created"

# ==========================================
# Final Summary
# ==========================================
echo ""
echo "============================================"
log_success "Server installation complete!"
echo "============================================"
echo ""
echo "Installed components:"
echo "  ✅ Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1)"
echo "  ✅ Docker Compose $(docker compose version --short)"
echo "  ✅ Node.js $(node --version)"
echo "  ✅ UFW Firewall (enabled)"
echo "  ✅ Fail2Ban (enabled)"
echo "  ✅ Swap (2GB)"
echo ""
echo "Next steps:"
echo "  1. Log out and log back in (for docker group)"
echo "  2. Clone your repository:"
echo "     git clone https://github.com/YOUR_USERNAME/esports-tracker.git"
echo "  3. Configure .env file"
echo "  4. Run: docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "Useful commands:"
echo "  esports-status  - Show status of all services"
echo "  htop            - System resources"
echo "  docker stats    - Container resources"
echo ""
log_warning "Don't forget to re-login for docker group to take effect!"
