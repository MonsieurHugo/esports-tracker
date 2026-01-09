#!/bin/bash

# ============================================
# Esports Tracker - Setup Script
# ============================================

set -e

echo "
███████╗███████╗██████╗  ██████╗ ██████╗ ████████╗███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝
█████╗  ███████╗██████╔╝██║   ██║██████╔╝   ██║   ███████╗
██╔══╝  ╚════██║██╔═══╝ ██║   ██║██╔══██╗   ██║   ╚════██║
███████╗███████║██║     ╚██████╔╝██║  ██║   ██║   ███████║
╚══════╝╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
                    TRACKER SETUP
"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 20+"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "Node.js 20+ required. Current: $(node -v)"
        exit 1
    fi
    log_success "Node.js $(node -v) ✓"
    
    # pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm not found, installing..."
        npm install -g pnpm
    fi
    log_success "pnpm $(pnpm -v) ✓"
    
    # Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3.11+ is not installed"
        exit 1
    fi
    log_success "Python $(python3 --version) ✓"
    
    # Docker
    if ! command -v docker &> /dev/null; then
        log_warning "Docker not found. Docker is recommended for development."
    else
        log_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) ✓"
    fi
    
    # Claude Code
    if ! command -v claude &> /dev/null; then
        log_warning "Claude Code CLI not found. Installing..."
        npm install -g @anthropic-ai/claude-code
    fi
    log_success "Claude Code ✓"
}

# Setup Frontend
setup_frontend() {
    log_info "Setting up Frontend (Next.js 16 + React 19)..."
    
    cd frontend
    
    if [ ! -f "package.json" ]; then
        pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
    fi
    
    # Install additional dependencies
    pnpm add zustand recharts @tanstack/react-query axios
    pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/node
    
    cd ..
    log_success "Frontend setup complete ✓"
}

# Setup Backend
setup_backend() {
    log_info "Setting up Backend (AdonisJS 6)..."
    
    cd backend
    
    if [ ! -f "package.json" ]; then
        pnpm create adonisjs@latest . --kit=api --db=postgres --auth-guard=access_tokens
    fi
    
    # Install additional dependencies
    pnpm add @adonisjs/redis @adonisjs/transmit
    pnpm add -D @japa/browser-client
    
    cd ..
    log_success "Backend setup complete ✓"
}

# Setup Worker
setup_worker() {
    log_info "Setting up Worker (Python)..."
    
    cd worker
    
    if [ ! -f "requirements.txt" ]; then
        cat > requirements.txt << EOF
httpx>=0.27.0
asyncpg>=0.29.0
apscheduler>=3.10.0
pydantic>=2.9.0
python-dotenv>=1.0.0
redis>=5.0.0
EOF
    fi
    
    # Create virtual environment
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    deactivate
    
    cd ..
    log_success "Worker setup complete ✓"
}

# Setup Claude Code Templates
setup_claude_code() {
    log_info "Installing Claude Code Templates (AITMPL)..."
    
    npx claude-code-templates@latest \
        --agent development-team/frontend-developer \
        --agent development-team/backend-developer \
        --agent development-team/database-architect \
        --agent development-tools/code-reviewer \
        --agent development-team/qa-engineer \
        --command testing/generate-tests \
        --hook git/pre-commit-validation \
        --mcp development/github-integration \
        --mcp database/postgresql-integration \
        --yes
    
    log_success "Claude Code Templates installed ✓"
}

# Setup environment files
setup_env() {
    log_info "Setting up environment files..."
    
    # Root .env
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# Database
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=esports_tracker

# Riot Games API
RIOT_API_KEY=your-riot-api-key-here
EOF
        log_success "Created .env"
    fi
    
    # Frontend .env.local
    if [ ! -f "frontend/.env.local" ]; then
        cat > frontend/.env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_WS_URL=ws://localhost:3333
EOF
        log_success "Created frontend/.env.local"
    fi
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        cat > backend/.env << EOF
PORT=3333
HOST=0.0.0.0
NODE_ENV=development
APP_KEY=$(openssl rand -hex 32)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=esports_tracker
REDIS_HOST=localhost
REDIS_PORT=6379
RIOT_API_KEY=your-riot-api-key-here
EOF
        log_success "Created backend/.env"
    fi
    
    # Worker .env
    if [ ! -f "worker/.env" ]; then
        cat > worker/.env << EOF
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/esports_tracker
REDIS_URL=redis://localhost:6379
RIOT_API_KEY=your-riot-api-key-here
EOF
        log_success "Created worker/.env"
    fi
}

# Initialize Git
setup_git() {
    log_info "Initializing Git repository..."
    
    if [ ! -d ".git" ]; then
        git init
    fi
    
    # Create .gitignore
    cat > .gitignore << EOF
# Dependencies
node_modules/
venv/
__pycache__/
.pnpm-store/

# Environment
.env
.env.local
.env*.local

# Build
.next/
build/
dist/
*.pyc

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Test
coverage/
.nyc_output/

# Misc
*.tmp
*.temp
EOF
    
    log_success "Git repository initialized ✓"
}

# Main
main() {
    echo ""
    log_info "Starting Esports Tracker setup..."
    echo ""
    
    check_prerequisites
    echo ""
    
    setup_env
    echo ""
    
    setup_frontend
    echo ""
    
    setup_backend
    echo ""
    
    setup_worker
    echo ""
    
    setup_git
    echo ""
    
    setup_claude_code
    echo ""
    
    log_success "============================================"
    log_success "   Esports Tracker setup complete! 🎮"
    log_success "============================================"
    echo ""
    log_info "Next steps:"
    echo "  1. Add your RIOT_API_KEY to the .env files"
    echo "  2. Start the database: docker-compose up -d postgres redis"
    echo "  3. Run migrations: cd backend && node ace migration:run"
    echo "  4. Start development:"
    echo "     - Frontend: cd frontend && pnpm dev"
    echo "     - Backend:  cd backend && node ace serve --watch"
    echo "     - Worker:   cd worker && source venv/bin/activate && python -m src.main"
    echo ""
    log_info "Or start everything with Docker:"
    echo "  docker-compose up -d"
    echo ""
    log_info "Claude Code is ready! Run 'claude' in the project root."
    echo ""
}

# Run
main "$@"
