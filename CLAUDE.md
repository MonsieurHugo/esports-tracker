# CLAUDE.md - Esports Tracker

## 📋 Project Overview

**Esports Tracker** est une plateforme de suivi et d'analyse des performances esports pour League of Legends.

### Architecture

```
esports-tracker/
├── frontend/          # Next.js 16 + React 19 + TypeScript
├── backend/           # AdonisJS 6 + Node.js 20
├── worker/            # Python 3.11+ async workers
├── docker-compose.yml # Orchestration locale
└── .claude/           # Configuration Claude Code
```

### Stack Technique

| Layer | Technologies |
|-------|-------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5.6, Tailwind CSS 4, Zustand 5, Recharts |
| **Backend** | AdonisJS 6, Node.js 20, TypeScript, Lucid ORM, WebSocket |
| **Worker** | Python 3.11+, httpx, asyncpg, APScheduler, Pydantic 2 |
| **Database** | PostgreSQL 16 |
| **Infrastructure** | Docker Compose, GitHub Actions, Hostinger VPS |

---

## 🎨 Design System

### Theme (Terminal Dark)

```css
:root {
  /* Background colors */
  --bg-primary: #07070a;
  --bg-secondary: #0c0c0f;
  --bg-card: #101014;
  --bg-hover: #16161c;

  /* Border */
  --border: #1e1e24;

  /* Text colors */
  --text-primary: #f0f0f0;
  --text-secondary: #b0b0b8;
  --text-muted: #8a8a94;

  /* Accent colors */
  --accent: #00dc82;        /* Vert principal */
  --accent-hover: #00c974;
  --lol: #c89b3c;           /* Or LoL */
  --positive: #00dc82;      /* Vert positif */
  --negative: #ff4757;      /* Rouge négatif */
  --warning: #f59e0b;       /* Orange warning */
}
```

### Fonts

- **Inter** - Texte principal (`--font-inter`)
- **JetBrains Mono** - Chiffres et code (`--font-mono`)

### Components Pattern

```tsx
// Utilisation de clsx + CSS variables
import { cn } from '@/lib/utils'

const Card = ({ className, children }) => (
  <div className={cn(
    'bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-6',
    className
  )}>
    {children}
  </div>
)
```

---

## 🔧 Coding Standards

### TypeScript (Frontend & Backend)

```typescript
// ✅ Préférer les types explicites
interface Player {
  playerId: number;
  currentPseudo: string;
  slug: string;
  isActive: boolean;
}

// ✅ Fonctions avec types de retour explicites
async function fetchPlayerStats(playerId: number): Promise<PlayerStats> {
  // ...
}
```

### Conventions de nommage

| Type | Convention | Exemple |
|------|------------|---------|
| Components | PascalCase | `PlayerCard.tsx` |
| Hooks | camelCase avec "use" | `useDashboardData.ts` |
| Utils | camelCase | `formatRank.ts` |
| API Routes | kebab-case | `player-stats.ts` |
| DB Tables | snake_case | `lol_accounts` |
| Env vars | SCREAMING_SNAKE | `RIOT_API_KEY` |

### Structure des composants React

```tsx
// components/dashboard/PlayerCard.tsx
'use client';

import { type FC } from 'react';
import type { PlayerLeaderboardEntry } from '@/lib/types';

interface PlayerCardProps {
  player: PlayerLeaderboardEntry;
  showDetails?: boolean;
}

export const PlayerCard: FC<PlayerCardProps> = ({ player, showDetails = false }) => {
  return (
    <div className="rounded-lg bg-[var(--bg-card)] p-4">
      {/* ... */}
    </div>
  );
};
```

---

## 🔌 API Patterns

### Response Formats

```typescript
// Paginated list response
{
  data: T[],
  meta: {
    total: number,
    perPage: number,      // Default: 20, Max: 100
    currentPage: number,  // 1-indexed
    lastPage: number
  }
}

// Batch response (dashboard)
{
  grinders: { data: TopGrinderEntry[] },
  gainers: { data: LpChangeEntry[] },
  losers: { data: LpChangeEntry[] }
}

// Simple response
{
  data: T,
  message?: string
}

// Auth success response
{
  success: true,
  message?: string,
  user?: SerializedUser
}
```

### Error Responses

```typescript
// Standard error format
{
  error: string,      // Error code or message
  message?: string    // User-friendly message (French)
}

// HTTP Status Codes
// 400 - Bad Request: Invalid parameters, validation errors
// 401 - Unauthorized: Invalid credentials, missing session
// 403 - Forbidden: 2FA required, insufficient permissions
// 404 - Not Found: Resource not found
// 409 - Conflict: Duplicate resource (email already exists)
// 423 - Locked: Account locked after too many failed attempts
// 500 - Internal Server Error: Masked in production
```

### Frontend ApiError Class

```typescript
// frontend/src/lib/api.ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: unknown
  )

  get isUnauthorized(): boolean  // status === 401
  get isForbidden(): boolean     // status === 403
  get isNotFound(): boolean      // status === 404
  get isServerError(): boolean   // status >= 500
}
```

### Date Handling

All dates use ISO 8601 format (`YYYY-MM-DD` for dates, ISO string for timestamps).

```typescript
// Query parameters
?startDate=2024-01-15&endDate=2024-01-20

// Validation errors
{ error: 'Invalid startDate format. Use ISO 8601 (e.g., 2024-01-15).' }
{ error: 'startDate must be before endDate' }
{ error: 'Date range cannot exceed 365 days' }
```

---

## 🗄️ Database Schema

### Core Tables

```sql
-- organizations: Esports organizations (Karmine Corp, G2, etc.)
organizations (
  org_id INT PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  current_name VARCHAR(100) NOT NULL,
  current_short_name VARCHAR(20),
  logo_url VARCHAR(500),
  country VARCHAR(50)
)

-- games: Supported games (League of Legends, Valorant)
games (
  game_id INT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,      -- 'League of Legends'
  short_name VARCHAR(10) NOT NULL,        -- 'LoL'
  is_active BOOLEAN DEFAULT true
)

-- teams: Competitive teams linked to organizations and games
teams (
  team_id INT PRIMARY KEY,
  org_id INT FK -> organizations.org_id ON DELETE SET NULL,
  game_id INT FK -> games.game_id NOT NULL,
  slug VARCHAR(100) NOT NULL,             -- Unique per game
  current_name VARCHAR(100) NOT NULL,
  short_name VARCHAR(20) NOT NULL,
  league VARCHAR(50),                     -- LEC, LCK, LFL, etc.
  is_active BOOLEAN DEFAULT true,
  UNIQUE (slug, game_id)
)

-- players: Individual player profiles
players (
  player_id INT PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  current_pseudo VARCHAR(50) NOT NULL,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  nationality VARCHAR(50),
  is_active BOOLEAN DEFAULT true
)

-- player_contracts: Links players to teams with roles
player_contracts (
  contract_id INT PRIMARY KEY,
  player_id INT FK -> players.player_id ON DELETE CASCADE,
  team_id INT FK -> teams.team_id ON DELETE CASCADE,
  role VARCHAR(20),                       -- Top, Jungle, Mid, ADC, Support
  is_starter BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE                           -- NULL = active contract
)

-- leagues: Regional/competitive leagues with colors
leagues (
  league_id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(20) UNIQUE NOT NULL, -- LEC, LCK, LFL
  region VARCHAR(20) NOT NULL,
  tier INT DEFAULT 1,                     -- 1=pro, 2=secondary
  color VARCHAR(7)                        -- Hex color (#00e5bf)
)
```

### LoL Data Tables

```sql
-- lol_accounts: Riot accounts linked to players
lol_accounts (
  account_id INT PRIMARY KEY,
  puuid VARCHAR(100) UNIQUE,              -- Can be NULL during validation
  player_id INT FK -> players.player_id ON DELETE CASCADE,
  game_name VARCHAR(50),
  tag_line VARCHAR(10),
  region VARCHAR(10) DEFAULT 'EUW',
  is_primary BOOLEAN DEFAULT false,
  last_fetched_at TIMESTAMP,
  last_match_at TIMESTAMP,
  -- Priority queue fields (V2)
  activity_score FLOAT DEFAULT 50.0,      -- 0-100
  activity_tier VARCHAR(20) DEFAULT 'moderate',
  next_fetch_at TIMESTAMP,
  consecutive_empty_fetches INT DEFAULT 0
)

-- lol_matches: Match data from Riot API
lol_matches (
  match_id VARCHAR(50) PRIMARY KEY,       -- EUW1_1234567890
  game_start TIMESTAMP NOT NULL,
  game_duration INT NOT NULL,             -- Seconds
  queue_id INT NOT NULL,
  game_version VARCHAR(20)
)

-- lol_match_stats: Per-player stats for each match
lol_match_stats (
  id INT PRIMARY KEY,
  match_id VARCHAR(50) FK -> lol_matches.match_id,
  puuid VARCHAR(100) FK -> lol_accounts.puuid,
  champion_id INT NOT NULL,
  win BOOLEAN NOT NULL,
  kills INT, deaths INT, assists INT,
  cs INT, vision_score INT, damage_dealt INT, gold_earned INT,
  role VARCHAR(20),
  UNIQUE (match_id, puuid)
)

-- lol_daily_stats: Daily aggregated performance
lol_daily_stats (
  id INT PRIMARY KEY,
  puuid VARCHAR(100) FK -> lol_accounts.puuid,
  date DATE NOT NULL,
  games_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  total_kills INT, total_deaths INT, total_assists INT,
  total_game_duration INT,
  -- Rank tracking
  tier VARCHAR(20), rank VARCHAR(5), lp INT,
  tier_start VARCHAR(20), tier_end VARCHAR(20),
  rank_start VARCHAR(5), rank_end VARCHAR(5),
  lp_start INT, lp_end INT,
  UNIQUE (puuid, date)
)

-- lol_current_ranks: Latest rank per queue type
lol_current_ranks (
  id INT PRIMARY KEY,
  puuid VARCHAR(100) FK -> lol_accounts.puuid,
  queue_type VARCHAR(30) NOT NULL,        -- RANKED_SOLO_5x5, RANKED_FLEX_SR
  tier VARCHAR(20), rank VARCHAR(5),
  league_points INT DEFAULT 0,
  wins INT, losses INT,
  UNIQUE (puuid, queue_type)
)

-- lol_streaks: Win/loss streak tracking
lol_streaks (
  id INT PRIMARY KEY,
  puuid VARCHAR(100) UNIQUE FK -> lol_accounts.puuid,
  current_streak INT DEFAULT 0,           -- Positive=wins, negative=losses
  current_streak_start TIMESTAMP,
  best_win_streak INT DEFAULT 0,
  worst_loss_streak INT DEFAULT 0
)

-- lol_champion_stats: Per-champion aggregated stats
lol_champion_stats (
  id INT PRIMARY KEY,
  puuid VARCHAR(100) FK -> lol_accounts.puuid,
  champion_id INT NOT NULL,
  games_played INT, wins INT,
  total_kills INT, total_deaths INT, total_assists INT,
  UNIQUE (puuid, champion_id)
)
```

### Key Relationships

```
organizations (1) --> (M) teams
teams (1) --> (M) player_contracts --> (M) players
players (1) --> (M) lol_accounts

lol_accounts (1) --> (M) lol_match_stats --> (M) lol_matches
lol_accounts (1) --> (M) lol_daily_stats
lol_accounts (1) --> (1) lol_current_ranks (per queue)
lol_accounts (1) --> (1) lol_streaks
lol_accounts (1) --> (M) lol_champion_stats

leagues referenced by teams.league via short_name
```

---

## 📦 State Management

### Split Stores Architecture

The frontend uses Zustand 5 with a split stores pattern for better performance and maintainability.

```typescript
// Individual stores - import directly for new code
import { usePeriodStore } from '@/stores/periodStore'
import { useFilterStore } from '@/stores/filterStore'
import { useSelectionStore } from '@/stores/selectionStore'
import { useUIStore } from '@/stores/uiStore'
import { useLeagueStore } from '@/stores/leagueStore'

// Facade pattern (deprecated but available for compatibility)
import { useDashboardStore } from '@/stores/dashboardStore'
```

### Store Responsibilities

| Store | Purpose | Persisted |
|-------|---------|-----------|
| `periodStore` | Date range & period selection | Yes |
| `filterStore` | Leagues, roles, min games (per view) | Yes |
| `selectionStore` | Team/player comparison selections | No |
| `uiStore` | Sort, pagination, view mode | Yes |
| `leagueStore` | League metadata with colors | No |

### Hydration Pattern

Zustand persist causes SSR mismatches. Use the hydration check hook:

```typescript
// hooks/useStoresHydrated.ts
export function useStoresHydrated(): boolean {
  const filterHydrated = useFilterStore(s => s._hasHydrated)
  const periodHydrated = usePeriodStore(s => s._hasHydrated)
  const uiHydrated = useUIStore(s => s._hasHydrated)
  return filterHydrated && periodHydrated && uiHydrated
}

// Usage in components
function Dashboard() {
  const hasHydrated = useStoresHydrated()
  if (!hasHydrated) return <Skeleton />
  return <DashboardContent />
}
```

### Selectors with useShallow

```typescript
// Prevent unnecessary re-renders
import { useShallow } from 'zustand/react/shallow'

const { period, referenceDate } = usePeriodStore(
  useShallow(state => ({
    period: state.period,
    referenceDate: state.referenceDate,
  }))
)
```

---

## 🪝 Custom Hooks Patterns

### Data Fetching with Debounce + AbortController

```typescript
// hooks/useDashboardData.ts pattern
useEffect(() => {
  const abortController = new AbortController()

  const fetchData = async () => {
    try {
      const response = await api.get('/endpoint', {
        signal: abortController.signal,
      })
      if (!abortController.signal.aborted) {
        setData(response)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setError(error)
    }
  }

  // 300ms debounce for filter changes
  const timer = setTimeout(fetchData, 300)

  return () => {
    clearTimeout(timer)
    abortController.abort()
  }
}, [filters])
```

### Race Condition Prevention with requestIdRef

```typescript
// hooks/useHistoryData.ts pattern
const requestIdRef = useRef(0)

useEffect(() => {
  const currentRequestId = ++requestIdRef.current

  const fetchData = async () => {
    const result = await api.get('/batch')

    // Ignore stale responses
    if (currentRequestId !== requestIdRef.current) return

    setData(result)
  }

  fetchData()
}, [deps])
```

### Retry Pattern

```typescript
const [retryTrigger, setRetryTrigger] = useState(0)

const retry = useCallback(() => {
  setError(null)
  setRetryTrigger(prev => prev + 1)
}, [])

useEffect(() => {
  // fetch logic
}, [retryTrigger, ...deps])
```

---

## ⚙️ Worker Architecture

### Available Jobs

| Job | Purpose | Scheduling |
|-----|---------|-----------|
| `FetchMatchesJob` | Fetches matches from Riot API (V1) | Continuous loop |
| `FetchMatchesJobV2` | Priority-based match fetching | Continuous with dynamic sleep |
| `SyncChampionsJob` | Downloads champion data from DDragon | Startup only |
| `ValidateAccountsJob` | Validates accounts without PUUID | Every 5 minutes |
| `ImportEsportsDataJobV2` | Imports teams/players from JSON | Manual script |

### Priority Queue System (V2)

Activity-based scheduling for efficient API usage:

```python
# Activity Score (0-100)
# - Recent activity: games today (0-35) + games last 3 days (0-20)
# - Recency: exponential decay from last_match_at (0-30)
# - Weekly trend: average games/day over 7 days (0-15)

# Activity Tiers
VERY_ACTIVE = score >= 70   # Check every 3-5 minutes
ACTIVE = score >= 40        # Check every 15-30 minutes
MODERATE = score >= 20      # Check every 60-120 minutes
INACTIVE = score < 20       # Check every 240-360 minutes
```

### Worker Services

| Service | Purpose |
|---------|---------|
| `DatabaseService` | Async PostgreSQL with connection pooling |
| `RiotAPIService` | HTTP client with rate limiting (20 req/s) |
| `ActivityScorer` | Calculates activity scores and tiers |
| `AccountSelector` | Manages regional priority queues |

---

## 🧪 Testing Guidelines

### Frontend (Vitest + Testing Library)

```typescript
// src/components/dashboard/LpChart.test.tsx
import { render, screen } from '@testing-library/react'
import { LpChart } from './LpChart'
import { mockTeamHistory } from '@/tests/mocks'

describe('LpChart', () => {
  it('renders chart with team data', () => {
    render(<LpChart data={mockTeamHistory} />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
```

### Backend (Japa)

```typescript
// tests/functional/lol_dashboard.spec.ts
import { test } from '@japa/runner'

test.group('Dashboard API', () => {
  test('GET /lol/dashboard/teams returns paginated teams', async ({ client }) => {
    const response = await client.get('/lol/dashboard/teams')

    response.assertStatus(200)
    response.assertBodyContains({
      data: expect.any(Array),
      meta: { total: expect.any(Number) }
    })
  })
})
```

---

## 📁 File Structure Reference

### Frontend

```
frontend/src/
├── app/                        # Next.js App Router
│   ├── (lol)/lol/             # LoL routes
│   │   ├── page.tsx           # Dashboard
│   │   └── player/[slug]/page.tsx
│   ├── admin/                 # Admin panel
│   └── monitoring/            # Worker monitoring
├── components/
│   ├── ui/                    # Generic UI (Modal, Badge, Skeleton, TeamLogo)
│   ├── dashboard/             # Dashboard components
│   │   ├── PlayerLeaderboard/
│   │   ├── TeamLeaderboard/
│   │   ├── LpChart.tsx, GamesChart.tsx
│   │   ├── TopGrinders.tsx, TopLpGainers.tsx, TopLpLosers.tsx
│   │   ├── StreakList.tsx
│   │   ├── LeagueDropdown.tsx, GamesFilter.tsx
│   │   └── ChartsModal.tsx
│   └── monitoring/            # Worker monitoring components
├── hooks/
│   ├── useDashboardData.ts    # Main dashboard data fetching
│   ├── useHistoryData.ts      # Team/player history with batch
│   ├── useStoresHydrated.ts   # SSR hydration check
│   ├── useLeagues.ts          # League metadata
│   └── useChartTicks.ts       # Responsive chart utilities
├── stores/                    # Zustand stores
│   ├── periodStore.ts, filterStore.ts
│   ├── selectionStore.ts, uiStore.ts
│   ├── leagueStore.ts, dashboardStore.ts (facade)
│   └── themeStore.ts
└── lib/
    ├── api.ts                 # API client with ApiError
    ├── types.ts               # TypeScript types
    ├── utils.ts               # cn(), formatters
    ├── constants.ts           # VALID_ROLES, etc.
    ├── dateUtils.ts           # Date helpers
    └── chartUtils.ts          # Chart helpers
```

### Backend

```
backend/
├── app/
│   ├── controllers/
│   │   ├── lol_dashboard_controller.ts  # Main dashboard API
│   │   ├── auth_controller.ts           # Authentication
│   │   ├── admin_controller.ts          # Admin operations
│   │   └── worker_controller.ts         # Worker monitoring
│   ├── models/                          # Lucid ORM models
│   ├── services/
│   │   ├── cache_service.ts             # Redis caching
│   │   └── dashboard_service.ts         # Dashboard queries
│   ├── validators/
│   ├── middleware/
│   │   ├── rate_limit_middleware.ts
│   │   ├── request_logger_middleware.ts
│   │   └── worker_auth_middleware.ts
│   └── exceptions/handler.ts            # Global error handler
├── database/migrations/                  # 39+ migrations
├── start/routes.ts
└── tests/
```

### Worker

```
worker/
├── src/
│   ├── main.py                # Entry point, orchestration
│   ├── config.py              # Environment variables
│   ├── jobs/
│   │   ├── fetch_matches.py   # V1 match fetching
│   │   ├── fetch_matches_v2.py # Priority-based fetching
│   │   ├── sync_champions.py  # DDragon sync
│   │   └── validate_accounts.py
│   └── services/
│       ├── database.py        # Async PostgreSQL
│       ├── riot_api.py        # Riot API client
│       ├── activity_scorer.py # Score calculation
│       └── account_selector.py # Priority queues
└── tests/
```

---

## 🚀 Commands

### Development

```bash
# Démarrer tout l'environnement
docker-compose up -d

# Frontend uniquement
cd frontend && pnpm dev

# Backend uniquement
cd backend && node ace serve --watch

# Worker uniquement
cd worker && python -m src.main
```

### Database

```bash
# Migrations
cd backend && node ace migration:run

# Rollback
cd backend && node ace migration:rollback

# Seed
cd backend && node ace db:seed
```

### Tests

```bash
# Frontend tests
cd frontend && pnpm test

# Backend tests
cd backend && node ace test
```

---

## ⚠️ Common Pitfalls

1. **Rate Limiting Riot API** - Always use the Python worker for Riot API calls, never from frontend/backend directly

2. **Hydration Errors with Zustand Persist** - Use `useStoresHydrated()` hook before rendering components that depend on persisted state

3. **Race Conditions in Hooks** - Use `requestIdRef` pattern alongside AbortController for batch requests

4. **PUUID Can Be Null** - Since migration 38, `lol_accounts.puuid` can be NULL for accounts pending validation. Always handle this case.

5. **Tailwind v4** - Uses CSS-first syntax, no `tailwind.config.js`. Variables defined in `globals.css`

6. **Filter State per View** - `filterStore` maintains separate filter state for teams vs players views (`teamsSelectedLeagues` vs `playersSelectedLeagues`)

7. **LocalStorage Validation** - `filterStore` has custom storage with validation/migration. Other stores may fail silently on corrupted data.

8. **Active Contract Query** - Use `WHERE end_date IS NULL` to find active contracts, not `is_active`

---

## 🔐 Environment Variables

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_WS_URL=ws://localhost:3333
```

### Backend (.env)

```bash
# Server
PORT=3333
HOST=0.0.0.0
NODE_ENV=development
APP_KEY=your-app-key-here

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=esports_tracker

# Auth
APP_DEV_TOKENS=true              # Return verification tokens in dev

# Worker Authentication
WORKER_AUTH_SECRET=your-secret   # Shared secret for worker → backend auth
```

### Worker (.env)

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/esports_tracker

# Riot API
RIOT_API_KEY=your-riot-api-key
RIOT_API_RATE_LIMIT=100          # Requests per 2 minutes (default: 100)

# Application
DEBUG=false
LOG_LEVEL=INFO

# Priority Queue (V2)
USE_PRIORITY_QUEUE=true

# Tier thresholds (score 0-100)
PRIORITY_TIER_VERY_ACTIVE=70.0
PRIORITY_TIER_ACTIVE=40.0
PRIORITY_TIER_MODERATE=20.0

# Base intervals (minutes)
PRIORITY_INTERVAL_VERY_ACTIVE=3
PRIORITY_INTERVAL_ACTIVE=15
PRIORITY_INTERVAL_MODERATE=60
PRIORITY_INTERVAL_INACTIVE=240

# Max intervals (backoff caps)
PRIORITY_MAX_INTERVAL_VERY_ACTIVE=5
PRIORITY_MAX_INTERVAL_ACTIVE=30
PRIORITY_MAX_INTERVAL_MODERATE=120
PRIORITY_MAX_INTERVAL_INACTIVE=360

# Batch size per region per cycle
PRIORITY_BATCH_SIZE=10
```
