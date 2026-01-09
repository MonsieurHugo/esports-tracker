# CLAUDE.md - Esports Tracker

## 📋 Project Overview

**Esports Tracker** est une plateforme de suivi et d'analyse des performances esports pour League of Legends et Valorant.

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
  id: string;
  summonerName: string;
  rank: RankTier;
  stats: PlayerStats;
}

// ✅ Utiliser des enums pour les valeurs fixes
enum RankTier {
  IRON = 'IRON',
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  // ...
}

// ✅ Fonctions avec types de retour explicites
async function fetchPlayerStats(playerId: string): Promise<PlayerStats> {
  // ...
}
```

### Conventions de nommage

| Type | Convention | Exemple |
|------|------------|---------|
| Components | PascalCase | `PlayerCard.tsx` |
| Hooks | camelCase avec "use" | `usePlayerStats.ts` |
| Utils | camelCase | `formatRank.ts` |
| API Routes | kebab-case | `player-stats.ts` |
| DB Tables | snake_case | `player_matches` |
| Env vars | SCREAMING_SNAKE | `RIOT_API_KEY` |

### Structure des composants React

```tsx
// components/PlayerCard/PlayerCard.tsx
'use client';

import { type FC } from 'react';
import { usePlayerStats } from '@/hooks/usePlayerStats';
import type { Player } from '@/types';

interface PlayerCardProps {
  player: Player;
  showDetails?: boolean;
}

export const PlayerCard: FC<PlayerCardProps> = ({ player, showDetails = false }) => {
  const { stats, isLoading } = usePlayerStats(player.id);
  
  if (isLoading) return <PlayerCardSkeleton />;
  
  return (
    <div className="rounded-lg bg-gray-900 p-4">
      {/* ... */}
    </div>
  );
};
```

### Structure API AdonisJS

```typescript
// app/controllers/players_controller.ts
import type { HttpContext } from '@adonisjs/core/http';
import Player from '#models/player';

export default class PlayersController {
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1);
    const players = await Player.query()
      .preload('stats')
      .paginate(page, 20);
    
    return response.ok(players);
  }

  async show({ params, response }: HttpContext) {
    const player = await Player.query()
      .where('id', params.id)
      .preload('stats')
      .preload('matches')
      .firstOrFail();
    
    return response.ok(player);
  }
}
```

---

## 🔌 APIs Externes

### Riot Games API

```typescript
// Configuration requise
const RIOT_CONFIG = {
  baseUrl: 'https://euw1.api.riotgames.com',
  apiKey: process.env.RIOT_API_KEY,
  rateLimit: {
    requests: 100,
    perSeconds: 120
  }
};

// Endpoints principaux
// GET /lol/summoner/v4/summoners/by-name/{summonerName}
// GET /lol/match/v5/matches/by-puuid/{puuid}/ids
// GET /lol/match/v5/matches/{matchId}
```

### DDragon (Assets)

```typescript
// Version actuelle à récupérer dynamiquement
const DDRAGON_VERSION = '14.24.1'; // Mettre à jour régulièrement
const DDRAGON_BASE = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}`;

// Champion icon: ${DDRAGON_BASE}/img/champion/{championName}.png
// Item icon: ${DDRAGON_BASE}/img/item/{itemId}.png
```

---

## 🗄️ Database Schema

### Tables principales

```sql
-- players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  riot_puuid VARCHAR(100) UNIQUE NOT NULL,
  summoner_name VARCHAR(50) NOT NULL,
  summoner_id VARCHAR(100),
  region VARCHAR(10) DEFAULT 'EUW1',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- player_stats
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  queue_type VARCHAR(20), -- RANKED_SOLO_5x5, RANKED_FLEX_SR
  tier VARCHAR(20),
  rank VARCHAR(5),
  lp INTEGER,
  wins INTEGER,
  losses INTEGER,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  riot_match_id VARCHAR(50) UNIQUE NOT NULL,
  game_mode VARCHAR(20),
  game_duration INTEGER,
  game_start_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🧪 Testing Guidelines

### Frontend (Vitest + Testing Library)

```typescript
// __tests__/components/PlayerCard.test.tsx
import { render, screen } from '@testing-library/react';
import { PlayerCard } from '@/components/PlayerCard';
import { mockPlayer } from '@/tests/mocks';

describe('PlayerCard', () => {
  it('displays player summoner name', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText(mockPlayer.summonerName)).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByTestId('player-card-skeleton')).toBeInTheDocument();
  });
});
```

### Backend (Japa)

```typescript
// tests/functional/players.spec.ts
import { test } from '@japa/runner';
import Player from '#models/player';

test.group('Players API', () => {
  test('GET /api/players returns paginated list', async ({ client }) => {
    const response = await client.get('/api/players');
    
    response.assertStatus(200);
    response.assertBodyContains({ meta: { total: expect.any(Number) } });
  });

  test('GET /api/players/:id returns player with stats', async ({ client }) => {
    const player = await Player.create({ /* ... */ });
    
    const response = await client.get(`/api/players/${player.id}`);
    
    response.assertStatus(200);
    response.assertBodyContains({ id: player.id });
  });
});
```

---

## 📁 File Structure Reference

### Frontend

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (lol)/             # Routes League of Legends
│   │   │   └── lol/
│   │   │       ├── page.tsx   # Dashboard principal
│   │   │       └── player/[slug]/page.tsx
│   │   ├── api/               # API Routes (proxy)
│   │   ├── admin/             # Admin panel
│   │   ├── monitoring/        # Worker monitoring
│   │   ├── design/            # Design system
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css        # Variables CSS + Tailwind
│   ├── components/
│   │   ├── ui/                # Composants UI génériques
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   ├── Table.tsx
│   │   │   └── Tabs.tsx
│   │   ├── dashboard/         # Composants dashboard
│   │   │   ├── GamesChart.tsx
│   │   │   ├── LpChart.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── TopGrinders.tsx
│   │   │   ├── StreakList.tsx
│   │   │   ├── PeriodSelector.tsx
│   │   │   ├── LeagueDropdown.tsx
│   │   │   ├── PlayerLeaderboard/
│   │   │   └── TeamLeaderboard/
│   │   ├── monitoring/        # Composants monitoring worker
│   │   └── layout/            # Header, Footer, Navigation
│   ├── hooks/                 # Custom hooks
│   │   └── useWorkerWebSocket.ts
│   ├── lib/                   # Utilitaires
│   │   ├── api.ts             # Client API avec proxy
│   │   ├── types.ts           # Types TypeScript
│   │   ├── utils.ts           # Helpers (cn, etc.)
│   │   ├── constants.ts
│   │   └── dateUtils.ts
│   ├── stores/                # Zustand stores
│   │   ├── dashboardStore.ts
│   │   ├── themeStore.ts
│   │   └── workerMonitoringStore.ts
│   └── tests/                 # Tests
│       ├── setup.ts
│       └── mocks.ts
├── public/
│   └── images/
│       ├── ranks/             # Icons des rangs LoL
│       ├── roles/             # Icons des rôles
│       └── teams/             # Logos des équipes
├── package.json
├── next.config.ts             # Config avec proxy API
├── vitest.config.ts
└── tsconfig.json
```

### Backend

```
backend/
├── app/
│   ├── controllers/
│   ├── models/
│   ├── services/              # Business logic
│   ├── validators/
│   └── middleware/
├── config/
├── database/
│   ├── migrations/
│   └── seeders/
├── start/
│   ├── routes.ts
│   └── kernel.ts
├── tests/
└── package.json
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

# E2E tests
cd frontend && pnpm test:e2e
```

---

## ⚠️ Common Pitfalls

1. **Rate Limiting Riot API** - Toujours utiliser le worker Python pour les appels API, jamais directement depuis le frontend
2. **WebSocket reconnection** - Implémenter un exponential backoff pour les reconnexions
3. **Hydration errors** - Utiliser `'use client'` uniquement quand nécessaire
4. **Tailwind v4** - Nouvelle syntaxe CSS-first, pas de `tailwind.config.js`

---

## 🔐 Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_WS_URL=ws://localhost:3333

# Backend (.env)
PORT=3333
HOST=0.0.0.0
NODE_ENV=development
APP_KEY=your-app-key-here
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=esports_tracker
RIOT_API_KEY=your-riot-api-key

# Worker (.env)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/esports_tracker
RIOT_API_KEY=your-riot-api-key
```
