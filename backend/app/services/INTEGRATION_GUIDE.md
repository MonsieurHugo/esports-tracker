# Cache Service Integration Guide

Step-by-step guide to integrate the cache service into existing controllers and services.

## Quick Start

### 1. Update Controller to Use Cache

**Before (without cache):**

```typescript
// app/controllers/lol_dashboard_controller.ts
export default class LolDashboardController {
  async getLeaderboard({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '7d')

    // Direct database query - slow!
    const leaderboard = await db
      .from('teams')
      .select('*')
      .orderBy('avg_lp', 'desc')
      .limit(50)

    return response.ok(leaderboard)
  }
}
```

**After (with cache):**

```typescript
// app/controllers/lol_dashboard_controller.ts
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'

export default class LolDashboardController {
  async getLeaderboard({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '7d')

    // Cache-first approach - fast!
    const leaderboard = await cacheService.getOrSet(
      CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period),
      CACHE_TTL.LEADERBOARD,
      async () => {
        return await db
          .from('teams')
          .select('*')
          .orderBy('avg_lp', 'desc')
          .limit(50)
      }
    )

    return response.ok(leaderboard)
  }
}
```

**Result**: First request takes normal time, subsequent requests are 80-150x faster!

---

## Integration Checklist

### Step 1: Import Cache Service

Add to the top of your controller/service:

```typescript
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'
```

### Step 2: Identify Cacheable Endpoints

Look for endpoints that:
- ✅ Return the same data for the same inputs (deterministic)
- ✅ Are read-heavy (GET requests)
- ✅ Query large datasets or perform aggregations
- ✅ Are frequently accessed
- ❌ Return user-specific data
- ❌ Are write operations (POST, PUT, DELETE)

### Step 3: Wrap Database Queries

Replace direct queries with `getOrSet()`:

```typescript
// Before
const data = await SomeModel.query().where(...)

// After
const data = await cacheService.getOrSet(
  'cache:key',
  CACHE_TTL.APPROPRIATE_TTL,
  async () => await SomeModel.query().where(...)
)
```

### Step 4: Add Cache Invalidation

After mutations, clear affected caches:

```typescript
async update({ params, request, response }: HttpContext) {
  const record = await SomeModel.findOrFail(params.id)
  await record.merge(request.body()).save()

  // Invalidate caches
  await cacheService.deletePattern('related:cache:*')

  return response.ok(record)
}
```

---

## Real-World Examples

### Example 1: Dashboard Leaderboards

```typescript
// app/controllers/lol_dashboard_controller.ts
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'

export default class LolDashboardController {
  async teamLeaderboard({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '7d')
    const { startDate, endDate } = this.getDateRange(request)

    const cacheKey = CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period)

    const leaderboard = await cacheService.getOrSet(
      cacheKey,
      CACHE_TTL.LEADERBOARD,
      async () => {
        return await this.dashboardService.getTeamLeaderboard(
          leagueId,
          startDate,
          endDate
        )
      }
    )

    return response.ok(leaderboard)
  }

  async playerLeaderboard({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '7d')
    const { startDate, endDate } = this.getDateRange(request)

    const cacheKey = CACHE_KEYS.PLAYER_LEADERBOARD(leagueId, period)

    const leaderboard = await cacheService.getOrSet(
      cacheKey,
      CACHE_TTL.LEADERBOARD,
      async () => {
        return await this.dashboardService.getPlayerLeaderboard(
          leagueId,
          startDate,
          endDate
        )
      }
    )

    return response.ok(leaderboard)
  }

  async topGrinders({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '24h')
    const limit = request.input('limit', 10)

    const cacheKey = CACHE_KEYS.TOP_GRINDERS(leagueId, period)

    const grinders = await cacheService.getOrSet(
      cacheKey,
      CACHE_TTL.GRINDERS,
      async () => {
        return await this.dashboardService.getTopGrinders(
          leagueId,
          period,
          limit
        )
      }
    )

    return response.ok(grinders)
  }
}
```

### Example 2: League/Split Metadata

```typescript
// app/controllers/leagues_controller.ts
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'

export default class LeaguesController {
  async index({ response }: HttpContext) {
    const leagues = await cacheService.getOrSet(
      CACHE_KEYS.LEAGUES,
      CACHE_TTL.LEAGUES,
      async () => {
        return await League.query()
          .where('is_active', true)
          .orderBy('priority', 'asc')
      }
    )

    return response.ok(leagues)
  }

  async splits({ response }: HttpContext) {
    const splits = await cacheService.getOrSet(
      CACHE_KEYS.SPLITS,
      CACHE_TTL.SPLITS,
      async () => {
        return await Split.query()
          .preload('league')
          .orderBy('start_date', 'desc')
      }
    )

    return response.ok(splits)
  }
}
```

### Example 3: Player Profile with Cache

```typescript
// app/controllers/players_controller.ts
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'

export default class PlayersController {
  async show({ params, response }: HttpContext) {
    const playerId = params.id
    const cacheKey = CACHE_KEYS.PLAYER_PROFILE(playerId)

    const player = await cacheService.getOrSet(
      cacheKey,
      CACHE_TTL.PLAYER_PROFILE,
      async () => {
        return await Player.query()
          .where('id', playerId)
          .preload('team')
          .preload('soloqAccounts', (query) => {
            query.orderBy('rank_value', 'desc')
          })
          .firstOrFail()
      }
    )

    return response.ok(player)
  }

  async update({ params, request, response }: HttpContext) {
    const player = await Player.findOrFail(params.id)

    player.merge(request.only(['name', 'team_id', 'role']))
    await player.save()

    // IMPORTANT: Invalidate caches after update
    await cacheService.invalidatePlayer(player.id)
    await cacheService.invalidateLeaderboards()

    return response.ok(player)
  }

  async delete({ params, response }: HttpContext) {
    const player = await Player.findOrFail(params.id)
    const playerId = player.id

    await player.delete()

    // IMPORTANT: Invalidate caches after delete
    await cacheService.invalidatePlayer(playerId)
    await cacheService.invalidateLeaderboards()

    return response.noContent()
  }
}
```

### Example 4: Admin Cache Management

```typescript
// app/controllers/admin_controller.ts
import { cacheService } from '#services/cache_service'

export default class AdminController {
  async clearCache({ request, response }: HttpContext) {
    const type = request.input('type', 'all')

    switch (type) {
      case 'leaderboards':
        await cacheService.invalidateLeaderboards()
        break

      case 'leagues':
        await cacheService.delete(CACHE_KEYS.LEAGUES)
        await cacheService.delete(CACHE_KEYS.SPLITS)
        break

      case 'all':
        await cacheService.flush()
        break

      default:
        return response.badRequest({ message: 'Invalid cache type' })
    }

    return response.ok({ message: `${type} cache cleared` })
  }

  async cacheStats({ response }: HttpContext) {
    const stats = await cacheService.getStats()

    if (!stats) {
      return response.ok({
        enabled: false,
        message: 'Redis not available',
      })
    }

    const hitRate = stats.hits / (stats.hits + stats.misses) || 0

    return response.ok({
      enabled: true,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${(hitRate * 100).toFixed(2)}%`,
      totalKeys: stats.keys,
      memory: stats.memory,
    })
  }
}
```

---

## Service Layer Integration

If you use service classes (recommended), integrate caching at the service level:

```typescript
// app/services/dashboard_service.ts
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'
import { inject } from '@adonisjs/core'

@inject()
export default class DashboardService {
  async getTeamLeaderboard(leagueId: string, period: string) {
    return await cacheService.getOrSet(
      CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period),
      CACHE_TTL.LEADERBOARD,
      async () => {
        // Complex business logic here
        const teams = await this.fetchTeamStats(leagueId, period)
        return this.calculateLeaderboard(teams)
      }
    )
  }

  async updatePlayerStats(playerId: string, stats: any) {
    // Update database
    await this.savePlayerStats(playerId, stats)

    // Invalidate affected caches
    await cacheService.invalidatePlayer(playerId)
    await cacheService.invalidateLeaderboards()
  }

  private async fetchTeamStats(leagueId: string, period: string) {
    // Database logic
  }

  private calculateLeaderboard(teams: any[]) {
    // Business logic
  }
}
```

---

## Migration Strategy

### Phase 1: Non-Critical Endpoints (Week 1)

Start with low-risk, high-impact endpoints:

1. ✅ GET /api/leagues (rarely changes)
2. ✅ GET /api/splits (rarely changes)
3. ✅ GET /api/teams/:id (profile pages)

### Phase 2: Dashboard Endpoints (Week 2)

Add caching to main dashboard:

1. ✅ GET /api/lol/dashboard/leaderboards
2. ✅ GET /api/lol/dashboard/top-grinders
3. ✅ GET /api/lol/dashboard/lp-gainers

### Phase 3: All Read Endpoints (Week 3)

Comprehensive rollout:

1. ✅ All remaining GET endpoints
2. ✅ Add cache invalidation to all mutations
3. ✅ Monitor cache hit rate

### Phase 4: Optimization (Week 4)

Fine-tune based on metrics:

1. ✅ Adjust TTLs based on hit rates
2. ✅ Add cache warming for popular queries
3. ✅ Implement cache preloading

---

## Testing Your Integration

### 1. Test Cache Hit/Miss

```bash
# First request (cache miss)
curl http://localhost:3333/api/leagues
# Check logs: "Cache miss, executing fetcher"

# Second request (cache hit)
curl http://localhost:3333/api/leagues
# Check logs: "Cache hit"
```

### 2. Test Cache Invalidation

```bash
# Update a record
curl -X PUT http://localhost:3333/api/players/123 -d '{"name":"Updated"}'

# Verify cache was cleared
curl http://localhost:3333/api/leaderboard
# Check logs: "Cache miss" (cache was invalidated)
```

### 3. Monitor Performance

```bash
# Get cache statistics
curl http://localhost:3333/api/admin/cache/stats

# Expected output:
{
  "hits": 1523,
  "misses": 234,
  "hitRate": "86.70%",
  "keys": 45,
  "memory": "2.3M"
}
```

### 4. Load Testing

```bash
# Install autocannon
npm install -g autocannon

# Test without cache (cold start)
autocannon -c 10 -d 30 http://localhost:3333/api/leaderboard

# Test with cache (should be much faster)
autocannon -c 10 -d 30 http://localhost:3333/api/leaderboard
```

---

## Common Pitfalls

### ❌ Pitfall 1: Not Invalidating Cache

```typescript
// BAD - Cache never cleared
async update({ params, request }: HttpContext) {
  const player = await Player.findOrFail(params.id)
  await player.merge(request.body()).save()
  return response.ok(player)
  // Cache still has old data!
}

// GOOD - Clear affected caches
async update({ params, request }: HttpContext) {
  const player = await Player.findOrFail(params.id)
  await player.merge(request.body()).save()

  await cacheService.invalidatePlayer(player.id)
  await cacheService.invalidateLeaderboards()

  return response.ok(player)
}
```

### ❌ Pitfall 2: Caching User-Specific Data

```typescript
// BAD - Same cache for all users
async getMyStats({ auth }: HttpContext) {
  return await cacheService.getOrSet(
    'user:stats', // Same key for everyone!
    300,
    async () => await getUserStats(auth.user.id)
  )
}

// GOOD - User-specific cache key
async getMyStats({ auth }: HttpContext) {
  return await cacheService.getOrSet(
    `user:stats:${auth.user.id}`, // Unique per user
    300,
    async () => await getUserStats(auth.user.id)
  )
}
```

### ❌ Pitfall 3: TTL Too Long

```typescript
// BAD - Real-time data cached for 1 hour
const lpChanges = await cacheService.getOrSet(
  'lp:changes',
  3600, // 1 hour - too long!
  async () => await getRecentLpChanges()
)

// GOOD - Short TTL for frequently changing data
const lpChanges = await cacheService.getOrSet(
  'lp:changes',
  CACHE_TTL.LP_CHANGES, // 60 seconds
  async () => await getRecentLpChanges()
)
```

---

## Performance Expectations

After integrating the cache service, expect:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Dashboard load | 1.5s | 150ms | 10x faster |
| Leaderboard | 800ms | 10ms | 80x faster |
| Cache hit rate | 0% | 85%+ | +85% |
| Database load | 100% | 15% | -85% |
| Server CPU | High | Low | Significant |

---

## Next Steps

1. ✅ Enable Redis: Set `REDIS_ENABLED=true` in `.env`
2. ✅ Import cache service in your controllers
3. ✅ Start with 1-2 endpoints
4. ✅ Monitor logs for cache hits/misses
5. ✅ Gradually expand to more endpoints
6. ✅ Add cache invalidation to mutations
7. ✅ Monitor cache statistics
8. ✅ Optimize TTLs based on hit rates

For questions or issues, refer to:
- `CACHE_SERVICE_README.md` - Full documentation
- `cache_service.example.ts` - More examples
- `tests/unit/services/cache_service.spec.ts` - Test cases
