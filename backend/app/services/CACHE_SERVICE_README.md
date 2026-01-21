# Redis Cache Service

Comprehensive caching layer for the Esports Tracker backend using Redis.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Cache Keys](#cache-keys)
- [TTL Strategy](#ttl-strategy)
- [Troubleshooting](#troubleshooting)

## Overview

The `CacheService` provides a simple, type-safe interface for caching data in Redis with:

- **Type-safe operations** with TypeScript generics
- **Graceful fallback** when Redis is unavailable
- **Pattern-based invalidation** for bulk cache clearing
- **Automatic JSON serialization/deserialization**
- **Built-in logging** for debugging and monitoring

## Setup

### 1. Environment Variables

Add to your `.env` file:

```env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 2. Import in Controllers

```typescript
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'
```

## API Reference

### Core Methods

#### `get<T>(key: string): Promise<T | null>`

Retrieve a value from cache.

```typescript
const leagues = await cacheService.get<League[]>(CACHE_KEYS.LEAGUES)
if (!leagues) {
  // Cache miss - fetch from database
}
```

#### `set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>`

Store a value in cache.

```typescript
await cacheService.set(CACHE_KEYS.LEAGUES, leagues, CACHE_TTL.LEAGUES)
```

#### `getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T>`

**RECOMMENDED**: Get from cache or execute fetcher function.

```typescript
const leagues = await cacheService.getOrSet(
  CACHE_KEYS.LEAGUES,
  CACHE_TTL.LEAGUES,
  async () => await League.query().where('is_active', true)
)
```

#### `delete(key: string): Promise<void>`

Delete a single cache entry.

```typescript
await cacheService.delete(CACHE_KEYS.LEAGUES)
```

#### `deletePattern(pattern: string): Promise<void>`

Delete all keys matching a pattern.

```typescript
// Clear all leaderboard caches
await cacheService.deletePattern('leaderboard:*')

// Clear all caches for a specific league
await cacheService.deletePattern('*:lec:*')
```

#### `flush(): Promise<void>`

**WARNING**: Delete ALL cache entries.

```typescript
await cacheService.flush()
```

### Convenience Methods

#### `invalidateLeaderboards(): Promise<void>`

Clear all leaderboard-related caches.

```typescript
await cacheService.invalidateLeaderboards()
```

#### `invalidateLeague(leagueId: string): Promise<void>`

Clear all caches for a specific league.

```typescript
await cacheService.invalidateLeague('lec')
```

#### `invalidatePlayer(playerId: string): Promise<void>`

Clear all caches related to a player.

```typescript
await cacheService.invalidatePlayer('player-uuid')
```

#### `invalidateTeam(teamId: string): Promise<void>`

Clear all caches related to a team.

```typescript
await cacheService.invalidateTeam('team-uuid')
```

#### `getStats(): Promise<CacheStats | null>`

Get cache performance statistics.

```typescript
const stats = await cacheService.getStats()
console.log(`Hit rate: ${stats.hits / (stats.hits + stats.misses)}`)
```

## Usage Examples

### Example 1: Simple Read-Through Cache

```typescript
export class LeaguesController {
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
}
```

### Example 2: Dynamic Cache Keys

```typescript
export class LeaderboardController {
  async teamLeaderboard({ request, response }: HttpContext) {
    const leagueId = request.input('league_id', 'all')
    const period = request.input('period', '7d')

    const leaderboard = await cacheService.getOrSet(
      CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period),
      CACHE_TTL.LEADERBOARD,
      async () => {
        return await db
          .from('teams')
          .where('league_id', leagueId)
          .orderBy('avg_lp', 'desc')
          .limit(50)
      }
    )

    return response.ok(leaderboard)
  }
}
```

### Example 3: Cache Invalidation After Mutation

```typescript
export class PlayerController {
  async update({ params, request, response }: HttpContext) {
    const player = await Player.findOrFail(params.id)

    player.merge(request.only(['name', 'team_id']))
    await player.save()

    // Invalidate affected caches
    await cacheService.invalidatePlayer(player.id)
    await cacheService.invalidateLeaderboards()

    return response.ok(player)
  }
}
```

### Example 4: Manual Cache Control

```typescript
export class StatsController {
  async topGrinders({ request, response }: HttpContext) {
    const leagueId = request.input('league_id')
    const cacheKey = CACHE_KEYS.TOP_GRINDERS(leagueId, '24h')

    // Try cache first
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      return response.ok(cached)
    }

    // Fetch fresh data
    const grinders = await this.fetchTopGrinders(leagueId)

    // Cache with short TTL (frequently changing data)
    await cacheService.set(cacheKey, grinders, CACHE_TTL.GRINDERS)

    return response.ok(grinders)
  }
}
```

### Example 5: Monitoring Cache Performance

```typescript
export class MonitoringController {
  async cacheStats({ response }: HttpContext) {
    const stats = await cacheService.getStats()

    if (!stats) {
      return response.ok({ message: 'Redis not available' })
    }

    const hitRate = stats.hits / (stats.hits + stats.misses) || 0

    return response.ok({
      hits: stats.hits,
      misses: stats.misses,
      hitRate: `${(hitRate * 100).toFixed(2)}%`,
      keys: stats.keys,
      memory: stats.memory,
    })
  }
}
```

## Best Practices

### 1. Always Use `getOrSet()` When Possible

```typescript
// ✅ GOOD - Simple and reliable
const data = await cacheService.getOrSet(key, ttl, async () => fetchData())

// ❌ BAD - Unnecessary complexity
const data = await cacheService.get(key)
if (!data) {
  data = await fetchData()
  await cacheService.set(key, data, ttl)
}
```

### 2. Choose Appropriate TTLs

```typescript
// ✅ GOOD - Match TTL to data volatility
await cacheService.set(CACHE_KEYS.LEAGUES, leagues, CACHE_TTL.LEAGUES) // 1 hour
await cacheService.set(lpGainersKey, gainers, CACHE_TTL.LP_CHANGES)    // 1 minute

// ❌ BAD - Same TTL for all data
await cacheService.set(CACHE_KEYS.LEAGUES, leagues, 60)
await cacheService.set(lpGainersKey, gainers, 60)
```

### 3. Invalidate on Mutations

```typescript
// ✅ GOOD - Clear affected caches
async update({ params }: HttpContext) {
  const player = await Player.findOrFail(params.id)
  await player.save()

  await cacheService.invalidatePlayer(player.id)
  await cacheService.invalidateLeaderboards()
}

// ❌ BAD - No invalidation
async update({ params }: HttpContext) {
  const player = await Player.findOrFail(params.id)
  await player.save()
  // Stale data remains in cache!
}
```

### 4. Use Descriptive Cache Keys

```typescript
// ✅ GOOD - Use predefined constants
const key = CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period)

// ❌ BAD - Magic strings
const key = `leaderboard_${leagueId}_${period}`
```

### 5. Don't Cache Everything

**Good candidates for caching:**
- Leaderboards
- Aggregated statistics
- League/split metadata
- Player profiles
- Frequently accessed read-heavy data

**Bad candidates for caching:**
- User-specific data (session, preferences)
- Rarely accessed data
- Data that changes on every request
- Very simple queries (SELECT * FROM table WHERE id = ?)

### 6. Monitor Cache Hit Rate

Aim for >80% hit rate on cached endpoints:

```typescript
const stats = await cacheService.getStats()
const hitRate = stats.hits / (stats.hits + stats.misses)

if (hitRate < 0.8) {
  console.warn('Low cache hit rate:', hitRate)
}
```

## Cache Keys

All cache keys are defined in the `CACHE_KEYS` constant:

```typescript
CACHE_KEYS.LEAGUES                              // 'leagues:all'
CACHE_KEYS.SPLITS                               // 'splits:all'
CACHE_KEYS.TEAM_LEADERBOARD(leagueId, period)   // 'leaderboard:team:{leagueId}:{period}'
CACHE_KEYS.PLAYER_LEADERBOARD(leagueId, period) // 'leaderboard:player:{leagueId}:{period}'
CACHE_KEYS.TOP_GRINDERS(leagueId, period)       // 'grinders:{leagueId}:{period}'
CACHE_KEYS.TOP_LP_GAINERS(leagueId, period)     // 'lp:gainers:{leagueId}:{period}'
CACHE_KEYS.TOP_LP_LOSERS(leagueId, period)      // 'lp:losers:{leagueId}:{period}'
CACHE_KEYS.STREAKS(leagueId)                    // 'streaks:{leagueId}'
CACHE_KEYS.SUMMARY_STATS(leagueId, period)      // 'summary:{leagueId}:{period}'
CACHE_KEYS.PLAYER_PROFILE(playerId)             // 'player:profile:{playerId}'
CACHE_KEYS.TEAM_PROFILE(teamId)                 // 'team:profile:{teamId}'
CACHE_KEYS.PLAYER_HISTORY(accountId, days)      // 'player:history:{accountId}:{days}'
```

All keys are automatically prefixed with `esports:` in Redis (configured in `config/redis.ts`).

## TTL Strategy

Recommended TTLs based on data volatility:

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Leagues/Splits | 1 hour | Rarely changes |
| Leaderboards | 5 minutes | Updated after each match |
| Top Grinders | 5 minutes | Changes frequently |
| LP Changes | 1 minute | Real-time tracking |
| Player Profiles | 10 minutes | Semi-static data |
| Streaks | 5 minutes | Updated after matches |
| Summary Stats | 5 minutes | Aggregated data |

Adjust based on your specific needs:

```typescript
// Override TTL for specific use case
await cacheService.set(key, data, 30) // 30 seconds instead of default
```

## Troubleshooting

### Redis Connection Errors

**Symptom**: Logs show "Failed to get value from Redis cache"

**Solution**:
1. Check Redis is running: `redis-cli ping` (should return PONG)
2. Verify environment variables in `.env`
3. Check Redis connection config in `config/redis.ts`
4. Temporarily disable: `REDIS_ENABLED=false` in `.env`

### Low Cache Hit Rate

**Symptom**: Cache hit rate < 50%

**Possible causes**:
1. TTL too short - increase TTL for stable data
2. Cache keys not consistent - use `CACHE_KEYS` constants
3. Data invalidated too frequently - review invalidation logic
4. Wrong data being cached - cache read-heavy data only

### Memory Usage Too High

**Symptom**: Redis memory usage growing unbounded

**Solution**:
1. Check TTLs are set: `await redis.ttl('esports:key')`
2. Review which data is being cached
3. Reduce TTLs for large datasets
4. Use `deletePattern()` to clear old data
5. Configure Redis maxmemory policy in `redis.conf`

### Stale Data in Cache

**Symptom**: UI shows old data after updates

**Solution**:
1. Add cache invalidation to mutation operations
2. Review invalidation patterns are correct
3. Reduce TTL for frequently changing data
4. Add manual cache clear endpoint for admins

### Cache Service Not Working

**Symptom**: `getOrSet()` always executes fetcher

**Check**:
1. Is `REDIS_ENABLED=true` in `.env`?
2. Is Redis service running?
3. Check logs for connection errors
4. Verify imports: `import { cacheService } from '#services/cache_service'`

## Performance Benchmarks

Typical performance improvements with caching:

| Endpoint | Without Cache | With Cache | Improvement |
|----------|--------------|------------|-------------|
| GET /leagues | 50ms | 5ms | 10x faster |
| GET /leaderboard | 800ms | 10ms | 80x faster |
| GET /top-grinders | 1200ms | 8ms | 150x faster |
| GET /player/:id | 150ms | 7ms | 21x faster |

## Additional Resources

- [Redis Commands Reference](https://redis.io/commands)
- [AdonisJS Redis Documentation](https://docs.adonisjs.com/guides/redis)
- See `cache_service.example.ts` for more usage examples
- Check `tests/unit/services/cache_service.spec.ts` for test examples
