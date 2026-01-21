# Dashboard Queries Documentation

This document provides comprehensive documentation for the complex SQL queries in `dashboard_service.ts`.

## Table of Contents

1. [Data Model](#data-model)
2. [Business Rules](#business-rules)
3. [Query Patterns](#query-patterns)
4. [Edge Cases](#edge-cases)
5. [Adding New Filters](#adding-new-filters)
6. [Performance Optimization](#performance-optimization)
7. [EXPLAIN ANALYZE Examples](#explain-analyze-examples)

---

## Data Model

### Core Tables

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     teams       │     │ player_contracts │     │    players      │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ team_id (PK)    │◄────│ team_id (FK)     │────►│ player_id (PK)  │
│ slug            │     │ player_id (FK)   │     │ slug            │
│ current_name    │     │ role             │     │ current_pseudo  │
│ short_name      │     │ start_date       │     │ created_at      │
│ region          │     │ end_date         │     └─────────────────┘
│ league          │     └──────────────────┘              │
│ is_active       │                                       │
│ org_id (FK)     │                              ┌────────┴────────┐
└─────────────────┘                              │   lol_accounts  │
        │                                        ├─────────────────┤
        │                                        │ puuid (PK)      │
┌───────┴─────────┐                              │ player_id (FK)  │
│  organizations  │                              │ game_name       │
├─────────────────┤                              │ tag_line        │
│ org_id (PK)     │                              │ region          │
│ logo_url        │                              └────────┬────────┘
└─────────────────┘                                       │
                                                          │
                                                 ┌────────┴────────┐
                                                 │ lol_daily_stats │
                                                 ├─────────────────┤
                                                 │ puuid (FK)      │
                                                 │ date            │
                                                 │ games_played    │
                                                 │ wins            │
                                                 │ tier            │
                                                 │ rank            │
                                                 │ lp              │
                                                 │ total_game_dur. │
                                                 └─────────────────┘
```

### Key Relationships

- **Teams → Organizations**: Each team belongs to one org (for logo)
- **Players → Teams**: Via `player_contracts` (many-to-many with dates)
- **Players → Accounts**: One player can have multiple LoL accounts
- **Accounts → Daily Stats**: Historical rank/games data per day

### Important Fields

| Table | Field | Description |
|-------|-------|-------------|
| `player_contracts` | `end_date` | NULL = active contract |
| `teams` | `is_active` | false = historical/inactive team |
| `lol_daily_stats` | `tier` | CHALLENGER, GRANDMASTER, MASTER, etc. |
| `lol_daily_stats` | `lp` | League Points (only meaningful for Master+) |

---

## Business Rules

### 1. Best Account Selection

Players often have multiple accounts. The "best" account is determined by:

1. **Tier Priority** (CHALLENGER > GRANDMASTER > MASTER > DIAMOND > ...)
2. **LP Tiebreaker** (higher LP wins within same tier)

```sql
ROW_NUMBER() OVER (
  PARTITION BY player_id
  ORDER BY
    CASE tier
      WHEN 'CHALLENGER' THEN 1
      WHEN 'GRANDMASTER' THEN 2
      WHEN 'MASTER' THEN 3
      ELSE 4
    END,
    lp DESC
)
```

### 2. Team LP Calculation

Team LP = Sum of top 5 players' LP (from their best accounts)

```
Team LP = Σ (LP of player_1, player_2, ..., player_5)
          where players are ranked by LP DESC
```

**Why top 5?** Standard LoL team size. Prevents teams with large rosters from having inflated totals.

### 3. LP Gainers vs Losers Logic

| Metric | Best Account Determined At | Rationale |
|--------|---------------------------|-----------|
| **LP Gainers** | END of period | Shows current best performance |
| **LP Losers** | START of period | Captures players who fell from rank |

### 4. Master+ Tier Requirements

- Only MASTER, GRANDMASTER, CHALLENGER accounts have LP
- Sub-Master accounts: LP is treated as 0
- This matches Riot's ranked system design

### 5. Active Contract Filter

```sql
WHERE pc.end_date IS NULL
```

Players with `end_date` set are no longer on the team.

---

## Query Patterns

### Pattern 1: DISTINCT ON for "Latest Row per Group"

```sql
SELECT DISTINCT ON (puuid) puuid, tier, lp
FROM lol_daily_stats
WHERE date >= ? AND date <= ?
ORDER BY puuid, date DESC
```

PostgreSQL-specific. Efficiently gets the most recent row for each account.

### Pattern 2: ROW_NUMBER for "Best Among Many"

```sql
ROW_NUMBER() OVER (
  PARTITION BY player_id
  ORDER BY tier_priority, lp DESC
) as rn
...
WHERE rn = 1
```

Allows complex ranking logic with tiebreakers.

### Pattern 3: CTE Pipeline

```sql
WITH step1 AS (...),
     step2 AS (SELECT ... FROM step1),
     step3 AS (SELECT ... FROM step2)
SELECT ... FROM step3
```

Breaks complex logic into readable, testable steps.

### Pattern 4: COUNT(*) OVER() for Pagination

```sql
SELECT *, COUNT(*) OVER() as total_count
FROM results
LIMIT ? OFFSET ?
```

Gets total count without a separate query.

### Pattern 5: Period Delta Calculation

```sql
(current.value - COALESCE(previous.value, 0))::int as change
```

COALESCE handles new entries (no previous period data).

---

## Edge Cases

### 1. New Players (No Previous Period Data)

```sql
LEFT JOIN prev_stats p ON current.id = p.id
-- prev_stats columns will be NULL for new players
-- COALESCE converts to 0 for change calculations
```

### 2. Players Without Teams (Freelancers)

```sql
LEFT JOIN player_contracts pc ON p.player_id = pc.player_id
LEFT JOIN teams t ON pc.team_id = t.team_id
-- team fields will be NULL, handled in response mapping
```

### 3. Dropped Accounts (Master → Diamond)

```sql
-- In losers query, end LP defaults to 0 if not in Master+
COALESCE(ds.lp, 0) as lp_end
```

### 4. No Games in Period

```sql
CASE WHEN COALESCE(SUM(games_played), 0) > 0
     THEN wins::float / games_played
     ELSE 0 END as winrate
```

### 5. Multiple Accounts, Same Tier

ROW_NUMBER ensures deterministic selection (LP tiebreaker).

---

## Adding New Filters

### Step 1: Add to Filter Interface

```typescript
// In dashboard_service.ts
export interface LeaderboardFilters extends DashboardFilters {
  // existing filters...
  newFilter?: string  // Add new filter
}
```

### Step 2: Add Dynamic WHERE Clause

```typescript
// In query building section
if (newFilter) {
  filterConditions.push(`t.column = ?`)
  params.push(newFilter)
}
```

### Step 3: Update Cache Key

The cache key is built from all filters automatically via `buildCacheKey()`.

### Example: Adding "Minimum LP" Filter

```typescript
// 1. Add to interface
export interface LeaderboardFilters {
  minLp?: number
}

// 2. Add condition
if (minLp && minLp > 0) {
  // Add to HAVING clause since it's an aggregate
  havingParts.push('total_lp >= ?')
  params.push(minLp)
}
```

---

## Performance Optimization

### Recommended Indexes

```sql
-- For DISTINCT ON (puuid, date DESC) pattern
CREATE INDEX idx_daily_stats_puuid_date
ON lol_daily_stats (puuid, date DESC);

-- For date range queries
CREATE INDEX idx_daily_stats_date_tier
ON lol_daily_stats (date, tier)
WHERE tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER');

-- For active contracts lookup
CREATE INDEX idx_contracts_active
ON player_contracts (team_id, player_id)
WHERE end_date IS NULL;

-- For team filtering
CREATE INDEX idx_teams_league_active
ON teams (league, is_active);
```

### Query Tips

1. **Avoid SELECT ***: Only select needed columns
2. **Use EXISTS over IN** for subqueries when possible
3. **LIMIT early**: Apply limits in CTEs when data volume allows
4. **Materialized CTEs**: PostgreSQL materializes CTEs by default (use `NOT MATERIALIZED` hint if needed)

---

## EXPLAIN ANALYZE Examples

### Team Leaderboard Query

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH prev_latest_ranks AS (
  SELECT DISTINCT ON (puuid) puuid, tier, lp
  FROM lol_daily_stats
  WHERE date >= '2024-01-01' AND date <= '2024-01-07'
  ORDER BY puuid, date DESC
),
-- ... rest of CTEs ...
SELECT *, COUNT(*) OVER() as total_count
FROM teams_with_changes
ORDER BY games DESC
LIMIT 20 OFFSET 0;
```

### Expected Plan Characteristics

- **DISTINCT ON**: Should use index on (puuid, date DESC)
- **ROW_NUMBER**: Parallel-safe, uses in-memory sort
- **JOINs**: Hash joins preferred for large datasets
- **Final LIMIT**: Should push down to reduce data processed

### Monitoring Queries

```sql
-- Find slow queries
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
WHERE query LIKE '%lol_daily_stats%'
ORDER BY mean_time DESC
LIMIT 10;

-- Check index usage
SELECT relname, indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE relname = 'lol_daily_stats'
ORDER BY idx_scan DESC;
```

---

## Troubleshooting

### Common Issues

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Slow queries | Missing index on date/puuid | Add composite index |
| Wrong LP totals | Including sub-Master accounts | Check tier filter |
| Missing players | end_date filter too strict | Verify contract dates |
| Duplicate teams | Missing GROUP BY | Check aggregate columns |

### Debug Mode

Add logging to see generated queries:

```typescript
console.log('Query params:', params)
console.log('Filter conditions:', filterConditions)
```

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2024-01-18 | Initial documentation | Claude |
