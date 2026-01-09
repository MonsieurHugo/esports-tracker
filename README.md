# 🎮 Esports Tracker

Track and analyze your esports performance for **League of Legends** and **Valorant**.

![Stack](https://img.shields.io/badge/Stack-Next.js%2016%20%7C%20AdonisJS%206%20%7C%20Python-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 🏗️ Architecture

```
esports-tracker/
├── frontend/          # Next.js 16 + React 19 + TypeScript + Tailwind 4
├── backend/           # AdonisJS 6 + Node.js 20 + PostgreSQL
├── worker/            # Python 3.11+ async workers (Riot API sync)
├── docker-compose.yml # Local development orchestration
└── .claude/           # Claude Code configuration & agents
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- [Riot Games API Key](https://developer.riotgames.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/esports-tracker.git
cd esports-tracker

# Run the setup script
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### Configuration

1. Get your Riot API Key from [developer.riotgames.com](https://developer.riotgames.com/)
2. Update the `.env` files with your API key:
   - `.env` (root)
   - `backend/.env`
   - `worker/.env`

### Start Development

**Option 1: Docker (recommended)**
```bash
docker-compose up -d
```

**Option 2: Manual**
```bash
# Terminal 1: Database
docker-compose up -d postgres redis

# Terminal 2: Backend
cd backend && node ace serve --watch

# Terminal 3: Frontend
cd frontend && pnpm dev

# Terminal 4: Worker
cd worker && source venv/bin/activate && python -m src.main
```

### Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3333
- **pgAdmin**: http://localhost:5050 (if enabled)

## 🤖 Claude Code Integration

This project is optimized for [Claude Code](https://www.anthropic.com/claude-code).

### Available Agents

| Agent | Description |
|-------|-------------|
| `frontend-developer` | React 19 + Next.js 16 specialist |
| `backend-developer` | AdonisJS 6 + API design |
| `database-architect` | PostgreSQL optimization |
| `code-reviewer` | Code quality & best practices |
| `qa-engineer` | Testing & coverage |

### Custom Commands

```bash
# Inside Claude Code
/generate-component PlayerCard    # Generate a React component
/generate-api players             # Generate CRUD API
/generate-test path/to/file.ts    # Generate tests
/review staged                    # Review staged changes
/db-migration create players      # Generate migration
```

### Install Claude Code Templates

```bash
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
```

## 📁 Project Structure

### Frontend (`/frontend`)

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Protected routes
│   ├── (public)/          # Public routes
│   └── api/               # API routes
├── components/
│   ├── ui/                # Generic UI components
│   └── features/          # Business components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities & API clients
├── stores/                # Zustand state management
└── types/                 # TypeScript definitions
```

### Backend (`/backend`)

```
app/
├── controllers/           # HTTP controllers
├── models/               # Lucid ORM models
├── services/             # Business logic
├── validators/           # Request validation
└── middleware/           # Custom middleware
config/                   # Configuration files
database/
├── migrations/           # Database migrations
└── seeders/              # Data seeders
start/
├── routes.ts             # Route definitions
└── kernel.ts             # App bootstrap
```

### Worker (`/worker`)

```
src/
├── main.py               # Entry point
├── config.py             # Settings
├── services/             # External services
│   ├── riot_api.py       # Riot Games API client
│   └── database.py       # Database operations
└── jobs/                 # Scheduled jobs
    ├── fetch_players.py  # Sync player stats
    └── fetch_matches.py  # Sync match history
```

## 🔌 API Endpoints

### Players

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/players` | List all players |
| GET | `/api/players/:id` | Get player details |
| POST | `/api/players` | Add new player |
| PUT | `/api/players/:id` | Update player |
| DELETE | `/api/players/:id` | Remove player |

### Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/players/:id/stats` | Get player stats |
| GET | `/api/players/:id/matches` | Get match history |

## 🧪 Testing

```bash
# Frontend
cd frontend && pnpm test

# Backend
cd backend && node ace test

# Worker
cd worker && pytest
```

## 📊 Database Schema

See [scripts/init-db.sql](scripts/init-db.sql) for the complete schema.

### Main Tables

- `players` - Tracked summoners
- `player_stats` - Ranked statistics
- `matches` - Match history
- `match_participants` - Per-player match data

## 🚢 Deployment

### Hostinger VPS

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Clone and setup
git clone https://github.com/your-username/esports-tracker.git
cd esports-tracker

# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables (Production)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
RIOT_API_KEY=your-production-key
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

Built with ❤️ using Claude Code
