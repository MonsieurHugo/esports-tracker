# Architecture - Esports Tracker

> Dernière mise à jour : 2026-02-09

---

## 1. Pages Frontend (Next.js 16 - App Router)

Toutes les routes utilisent le paramètre dynamique `[locale]` (i18n avec next-intl).

| Route | Fichier | Statut | Description |
|-------|---------|--------|-------------|
| `/:locale/` | `[locale]/page.tsx` | Active | Page d'accueil "Coming Soon" |
| `/:locale/lol` | `[locale]/(lol)/lol/page.tsx` | Active | Dashboard principal LoL (SoloQ) |
| `/:locale/lol/player/:slug` | `[locale]/(lol)/lol/player/[slug]/page.tsx` | Active | Profil joueur (stats, champions, duos, heatmap) |
| `/:locale/monitoring` | `[locale]/monitoring/page.tsx` | Active | Monitoring du worker SoloQ |
| `/:locale/monitoring/pro` | `[locale]/monitoring/pro/page.tsx` | Active | Monitoring du worker Pro |
| `/:locale/design` | `[locale]/design/page.tsx` | Active | Preview du design system (dev only) |
| `/:locale/toast-demo` | `[locale]/toast-demo/page.tsx` | Active | Demo des notifications toast (dev only) |
| `/api/revalidate` | `api/revalidate/route.ts` | Active | API ISR revalidation |

**Fichiers globaux :** `layout.tsx` (root + locale), `error.tsx`, `not-found.tsx`

---

## 2. Base de Données (PostgreSQL 16)

**83 migrations** au total. Voici toutes les tables :

### Tables Core

| Table | Model Lucid | Utilisée | Par qui |
|-------|:-----------:|:--------:|---------|
| `organizations` | oui | oui | Metadata des équipes (logo, pays) |
| `teams` | oui | oui | Leaderboards, contrats, dashboard |
| `players` | oui | oui | Leaderboards, profils joueurs |
| `player_contracts` | oui | oui | Composition des équipes, filtrage par rôle |
| `leagues` | oui | oui | Filtrage dashboard, couleurs des ligues |
| `splits` | oui | **non** | Jamais requêtée dans les controllers |

### Tables LoL SoloQ

| Table | Model Lucid | Utilisée | Par qui |
|-------|:-----------:|:--------:|---------|
| `lol_accounts` | oui | oui | Worker SoloQ (fetch), dashboard, monitoring |
| `lol_matches` | oui | oui | Stockage des matchs Riot API |
| `lol_match_stats` | oui | oui | Stats par joueur par match (10 rows/match) |
| `lol_daily_stats` | oui | oui | Leaderboards, historique LP, graphiques |
| `lol_champion_stats` | oui | oui | Stats par champion sur la page joueur |
| `lol_streaks` | oui | **non** | Model existe mais aucun controller ne la query |
| `lol_player_synergy` | oui | **quasi non** | Écrite par le worker mais pas lue par le frontend |

### Tables Worker / Monitoring

| Table | Model Lucid | Utilisée | Par qui |
|-------|:-----------:|:--------:|---------|
| `worker_status` | oui | oui | Page monitoring SoloQ |
| `worker_metrics_hourly` | oui | oui | Graphiques de performance worker |
| `worker_logs` | oui | oui | Viewer de logs |

### Tables Pro Esports

Aucun model Lucid - toutes requêtées en raw SQL dans `pro_monitoring_controller.ts`.

| Table | Utilisée | Par qui |
|-------|:--------:|---------|
| `pro_tournaments` | oui | Monitoring pro, liste des tournois |
| `pro_stages` | oui | Structure des tournois |
| `pro_matches` | oui | Liste et détails des matchs |
| `pro_games` | oui | Jeux individuels dans un match |
| `pro_teams` | oui | Références d'équipes pro |
| `pro_player_stats` | oui | Stats de joueurs pro par game |
| `pro_draft_actions` | oui | Picks/bans avec rôles |
| `pro_drafts` | oui | Configuration des drafts |
| `pro_leagues` | oui | CRUD des ligues pro |
| `pro_sync_requests` | oui | File d'attente de synchronisation |
| `pro_game_events` | **minimal** | Comptée dans monitoring seulement |
| `pro_team_stats` | **non** | Créée mais jamais populée/requêtée |
| `pro_player_aggregated_stats` | **non** | Créée mais jamais populée/requêtée |
| `pro_champion_stats` | **non** | Comptée dans monitoring seulement |
| `pro_player_timing_stats` | **non** | Créée (migration 63) mais pas utilisée |
| `pro_champion_daily_stats` | oui | Agrégation champion stats quotidiennes |

### Tables Supprimées (DROP)

| Table | Migration | Raison |
|-------|-----------|--------|
| `users` | #40 | Auth supprimée |
| `password_reset_tokens` | #40 | Auth supprimée |
| `email_verification_tokens` | #40 | Auth supprimée |
| `oauth_accounts` | #40 | Auth supprimée |
| `auth_audit_logs` | #40 | Auth supprimée |
| `lol_current_ranks` | #41 | Remplacée par tracking dans `lol_daily_stats` |

---

## 3. Workers

### Architecture Générale

Deux workers Python indépendants qui tournent en parallèle :

```
Worker SoloQ (main.py)          Worker Pro (main_pro.py)
    │                                │
    ├─ Riot Games API               ├─ GRID API (GraphQL + Files)
    ├─ Rate limit: 20req/s          ├─ Rate limit: 10req/s
    ├─ Boucle continue              ├─ Polling toutes les 5 min
    └─ Port: aucun                  └─ Port: 8000 (HTTP API)
```

---

### Worker SoloQ (`python -m src.main`)

**But :** Récupérer les matchs ranked de tous les comptes LoL suivis via l'API Riot.

**Jobs :**

| Job | Déclenchement | Fonctionnement |
|-----|--------------|----------------|
| `SyncChampionsJob` | Au démarrage uniquement | Télécharge les données champion depuis DDragon (images + JSON) et les sauvegarde dans `frontend/` |
| `FetchMatchesJobV2` | Boucle continue (défaut) | Système de file de priorité basée sur l'activité du joueur |
| `FetchMatchesJob` (V1) | Boucle continue (legacy) | Polling uniforme de tous les comptes toutes les 5s |
| `ValidateAccountsJob` | Toutes les 5 min + au démarrage | Valide les comptes sans PUUID via l'API Riot |

**Système de priorité (V2) :**

```
Score d'activité (0-100)
├── Activité récente (0-55 pts) : matchs aujourd'hui + 3 derniers jours
├── Récence (0-30 pts) : decay exponentiel depuis le dernier match
└── Tendance (0-15 pts) : moyenne matchs/jour sur 7 jours

Tiers :
├── VERY_ACTIVE (>=70) → check toutes les 3-5 min
├── ACTIVE (>=40)       → check toutes les 15-30 min
├── MODERATE (>=20)     → check toutes les 60-120 min
└── INACTIVE (<20)      → check toutes les 4-6 heures
```

**Flux de données par match :**
1. Fetch des IDs de matchs récents (Ranked Solo, depuis 2026-01-01)
2. Pour chaque nouveau match : télécharge les données complètes (10 participants)
3. Insert dans `lol_matches` + 10 rows dans `lol_match_stats`
4. Met à jour : `lol_daily_stats`, `lol_streaks`, `lol_champion_stats`, `lol_player_synergy`
5. Recalcule le score d'activité et reprogramme le prochain fetch

**Services :**
- `RiotAPIService` : Client HTTP async, rate limiting par région (EUW, NA, KR, BR), retry avec backoff
- `DatabaseService` : Pool asyncpg (5-20 connexions), sémaphore à 15 ops concurrentes
- `ActivityScorer` : Calcul du score d'activité
- `AccountSelector` : Min-heap priority queue par région

---

### Worker Pro (`python -m src.main_pro`)

**But :** Synchroniser les données d'esport professionnel (tournois, matchs, stats, drafts) depuis l'API GRID.

**Jobs :**

| Job | Déclenchement | Fonctionnement |
|-----|--------------|----------------|
| `SyncProDataJob` | Toutes les 5 min + à la demande | Synchro des tournois suivis, télécharge les events JSONL par game |
| `AggregateChampionStatsJob` | Après chaque sync | Agrège les stats pick/ban champion par jour |
| Poll sync requests | Toutes les 30s | Traite les demandes de sync depuis `pro_sync_requests` |

**Flux de synchronisation :**
1. Query GraphQL pour les tournois de l'année
2. Pour chaque tournoi : query les séries (matchs)
3. Pour chaque game : télécharge `events.jsonl.gz` depuis GRID
4. Parse les events avec `EventsParser` pour extraire :
   - Stats joueurs (KDA, CS, damage, vision, items, runes, timing@15min)
   - Draft picks/bans avec rôles
   - Events (kills, objectifs, tours, plaques)
   - Stats de proximité et d'isolation
5. Upsert dans les tables `pro_*`
6. Agrège les stats champion quotidiennes

**API HTTP (port 8000) :**
- `GET /api/health` - Santé du worker (sans auth)
- `GET /api/tournaments/fetch?year=2026` - Fetch tournois GRID (avec API key)
- `POST /api/sync/tracked` - Déclenche une sync manuelle (avec API key)

**Services :**
- `GridClient` : Client HTTP avec rate limiting (10 req/s)
- `GridGraphQL` : Queries GraphQL (tournois, séries, équipes, joueurs)
- `GridFiles` : Téléchargement events/summary/details
- `EventsParser` : Parse les JSONL pour extraire toutes les stats

---

## 4. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js 16)                  │
│  /lol (dashboard) │ /lol/player/:slug │ /monitoring(/pro)   │
└──────────┬──────────────────┬───────────────────────────────┘
           │                  │
           ▼                  ▼
┌──────────────────────────────────────────┐
│           BACKEND (AdonisJS 6)           │
│  lol_dashboard_controller                │
│  pro_monitoring_controller               │
│  worker_controller                       │
└──────────┬──────────────────┬────────────┘
           │                  │
           ▼                  ▼
┌──────────────────────────────────────────┐
│          POSTGRESQL 16                    │
│  Core: organizations, teams, players...  │
│  SoloQ: lol_matches, lol_daily_stats...  │
│  Pro: pro_tournaments, pro_games...      │
│  Worker: worker_status, worker_logs...   │
└──────────┬──────────────────┬────────────┘
           ▲                  ▲
           │                  │
┌──────────┴───────┐ ┌───────┴────────────┐
│  Worker SoloQ    │ │  Worker Pro         │
│  (Riot API)      │ │  (GRID API)         │
│  Priority Queue  │ │  GraphQL + Events   │
│  20 req/s        │ │  10 req/s           │
└──────────────────┘ └─────────────────────┘
```

---

## 5. Tables potentiellement inutilisées (à nettoyer)

- `splits` - Jamais requêtée
- `lol_streaks` - Model existe mais jamais lue par le frontend
- `lol_player_synergy` - Écrite par le worker mais pas lue
- `pro_team_stats` - Créée mais jamais populée
- `pro_player_aggregated_stats` - Créée mais jamais populée
- `pro_player_timing_stats` - Créée mais pas utilisée
