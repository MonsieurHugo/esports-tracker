# Cache Service Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│                    (Next.js + React)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP Requests
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
│                  (AdonisJS Controllers)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  LolDashboardController                                │  │
│  │  LeaguesController                                     │  │
│  │  PlayersController                                     │  │
│  │  AdminController                                       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           CacheService (cache_service.ts)             │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  • getOrSet()    ← Primary method                │  │  │
│  │  │  • get() / set() ← Manual control                │  │  │
│  │  │  • delete()      ← Single key                    │  │  │
│  │  │  • deletePattern() ← Bulk invalidation           │  │  │
│  │  │  • flush()       ← Nuclear option                │  │  │
│  │  │  • invalidate*() ← Convenience methods           │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │           DashboardService                              │  │
│  │           EmailService                                  │  │
│  │           AuditService                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────┬───────────────────────┘
                   │                  │
        Cache Hit? │                  │ Cache Miss?
                   │                  │
         ┌─────────▼─────────┐       │
         │                   │       │
         │      Redis        │       │
         │   (In-Memory)     │       │
         │                   │       │
         │  Key-Value Store  │       │
         │  with TTL         │       │
         │                   │       │
         └───────────────────┘       │
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│                   (Persistent Store)                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  leagues, splits, teams, players                       │  │
│  │  soloq_accounts, match_history                         │  │
│  │  player_stats, rankings                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Request Flow

### 1. Cache Hit (Fast Path)

```
Client Request
    │
    ▼
Controller
    │
    ├─→ cacheService.getOrSet()
    │       │
    │       ├─→ Redis GET
    │       │       │
    │       │       └─→ Key exists! ✓
    │       │
    │       └─→ Deserialize JSON
    │
    └─→ Return to client (5-10ms)
```

### 2. Cache Miss (Slow Path)

```
Client Request
    │
    ▼
Controller
    │
    ├─→ cacheService.getOrSet()
    │       │
    │       ├─→ Redis GET
    │       │       │
    │       │       └─→ Key not found ✗
    │       │
    │       ├─→ Execute fetcher()
    │       │       │
    │       │       └─→ PostgreSQL Query (50-1200ms)
    │       │
    │       ├─→ Redis SET (async, non-blocking)
    │       │
    │       └─→ Return data
    │
    └─→ Return to client
```

### 3. Cache Invalidation (Mutation Path)

```
Client Request (PUT/DELETE)
    │
    ▼
Controller
    │
    ├─→ Update PostgreSQL
    │       │
    │       └─→ Transaction committed ✓
    │
    ├─→ cacheService.invalidate()
    │       │
    │       └─→ Redis DEL/SCAN+DEL
    │
    └─→ Return to client
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Cache Key Strategy                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Static Keys:                                               │
│    esports:leagues:all                                      │
│    esports:splits:all                                       │
│                                                              │
│  Dynamic Keys (with parameters):                            │
│    esports:leaderboard:team:{leagueId}:{period}            │
│    esports:leaderboard:player:{leagueId}:{period}          │
│    esports:grinders:{leagueId}:{period}                    │
│    esports:lp:gainers:{leagueId}:{period}                  │
│    esports:lp:losers:{leagueId}:{period}                   │
│    esports:streaks:{leagueId}                              │
│    esports:summary:{leagueId}:{period}                     │
│    esports:player:profile:{playerId}                       │
│    esports:team:profile:{teamId}                           │
│                                                              │
│  Pattern-based invalidation:                                │
│    esports:leaderboard:*        → All leaderboards         │
│    esports:*:{leagueId}:*       → Specific league          │
│    esports:player:profile:*     → All player profiles      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Cache Hierarchy

```
                    ┌──────────────────┐
                    │   Application    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │   L1 Cache   │ │   L2 Cache   │ │  Persistent  │
     │              │ │              │ │              │
     │  Node.js     │ │    Redis     │ │  PostgreSQL  │
     │   Memory     │ │  (In-Memory) │ │   (Disk)     │
     │              │ │              │ │              │
     │  Not impl.   │ │  ACTIVE ✓    │ │  ACTIVE ✓    │
     │              │ │              │ │              │
     │  <1ms        │ │  5-10ms      │ │  50-1200ms   │
     └──────────────┘ └──────────────┘ └──────────────┘
           ↑                ↑                 ↑
           │                │                 │
     Could add in      Current solution   Source of
     future for        with Redis         truth
     hot paths
```

## TTL Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      TTL Timeline                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  0s ─────────────────────────────────────────────────→ 1hr  │
│  │                                                       │   │
│  │   LP Changes (60s)                                   │   │
│  ├───────┤                                              │   │
│  │                                                       │   │
│  │       Player History (180s)                          │   │
│  │       ├───────────────┤                              │   │
│  │                                                       │   │
│  │              Leaderboards (300s)                     │   │
│  │              ├─────────────────────┤                 │   │
│  │                                                       │   │
│  │                     Player/Team Profiles (600s)      │   │
│  │                     ├─────────────────────────────┤  │   │
│  │                                                       │   │
│  │                                 Leagues/Splits (3600s)│  │
│  │                                 ├─────────────────────┤  │
│  │                                                       │   │
│  ▼                                                       ▼   │
│  Most volatile                              Most stable     │
│  (real-time data)                          (static data)    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Memory Management

```
┌────────────────────────────────────────────────────────┐
│              Redis Memory Strategy                     │
├────────────────────────────────────────────────────────┤
│                                                         │
│  Key Expiration (TTL):                                 │
│    • Automatic eviction after TTL                      │
│    • No manual cleanup needed                          │
│    • Prevents memory leaks                             │
│                                                         │
│  Pattern-based Deletion:                               │
│    • SCAN + DEL for bulk operations                    │
│    • Memory-efficient iteration                        │
│    • No blocking on large datasets                     │
│                                                         │
│  Key Prefixing:                                        │
│    • Namespace: "esports:"                             │
│    • Prevents key collisions                           │
│    • Enables pattern matching                          │
│                                                         │
│  Recommended Limits:                                   │
│    • Max keys: 10,000 - 50,000                         │
│    • Max memory: 512MB - 2GB                           │
│    • Eviction policy: allkeys-lru                      │
│                                                         │
└────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────┐
│           Graceful Degradation Strategy                  │
└──────────────────────────────────────────────────────────┘

Redis Available:
  Request → Cache Check → Hit? → Return (fast) ✓
                       → Miss? → DB Query → Cache → Return

Redis Unavailable:
  Request → Cache Check (fails) → Log warning
         → DB Query (fallback) → Return
         → No cache operation

Redis Timeout:
  Request → Cache Check (timeout after 100ms)
         → Log warning
         → DB Query (fallback) → Return

Redis Connection Lost:
  Automatic reconnection (exponential backoff)
  All requests fallback to DB
  Service continues operating
  Logs connection errors
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────┐
│                   Performance Metrics                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Operation              Latency        Throughput            │
│  ─────────────────────────────────────────────────────────  │
│  Redis GET             1-5ms          50,000 ops/sec        │
│  Redis SET             1-5ms          40,000 ops/sec        │
│  Redis SCAN+DEL        10-100ms       1,000 patterns/sec    │
│  PostgreSQL Simple     20-50ms        1,000 queries/sec     │
│  PostgreSQL Complex    200-1200ms     50 queries/sec        │
│                                                              │
│  Cache Hit Rate Target: >85%                                │
│  Cache Miss Penalty: 10-200x slower                         │
│  Memory Overhead: ~1KB per cached object                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring & Observability

```
┌─────────────────────────────────────────────────────────────┐
│                     Logging Strategy                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Cache Operations:                                          │
│    ✓ Cache hit:  logger.debug({ key }, 'Cache hit')        │
│    ✓ Cache miss: logger.debug({ key }, 'Cache miss')       │
│    ✓ Cache set:  logger.debug({ key, ttl }, 'Cached')      │
│                                                              │
│  Errors:                                                     │
│    ⚠ Connection:  logger.warn({ err }, 'Redis failed')     │
│    ⚠ Timeout:     logger.warn({ key }, 'Redis timeout')    │
│    ⚠ Fallback:    logger.warn('Using DB fallback')         │
│                                                              │
│  Admin Operations:                                           │
│    ℹ Invalidate:  logger.info({ pattern }, 'Cleared')      │
│    ⚠ Flush:       logger.warn('Flushed entire cache')      │
│                                                              │
│  Metrics Endpoint:                                           │
│    GET /api/admin/cache/stats                               │
│      → { hits, misses, hitRate, keys, memory }             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Security Considerations

```
┌─────────────────────────────────────────────────────────────┐
│                   Security Best Practices                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Network Security:                                       │
│     • Redis listens only on localhost (127.0.0.1)          │
│     • No public exposure                                    │
│     • Optional: Redis password (REDIS_PASSWORD)            │
│                                                              │
│  2. Data Security:                                          │
│     • Never cache sensitive data (passwords, tokens)       │
│     • Never cache user sessions                            │
│     • Cache only public/semi-public data                   │
│                                                              │
│  3. Key Namespacing:                                        │
│     • Prefix: "esports:"                                   │
│     • Prevents collisions with other apps                  │
│     • Enables pattern-based access control                 │
│                                                              │
│  4. Admin Operations:                                       │
│     • Flush operation requires admin auth                  │
│     • Pattern deletion requires validation                 │
│     • Rate limiting on cache operations                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Scalability Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│                  Scaling Strategy                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1 (Current):                                         │
│    Single Redis instance                                    │
│    Single AdonisJS server                                   │
│    ~10,000 keys                                             │
│    ~100 req/sec                                             │
│                                                              │
│  Phase 2 (Growth):                                          │
│    Redis with persistence (RDB + AOF)                       │
│    Multiple AdonisJS servers                                │
│    ~50,000 keys                                             │
│    ~1,000 req/sec                                           │
│                                                              │
│  Phase 3 (Scale):                                           │
│    Redis Sentinel (HA)                                      │
│    Load balancer                                            │
│    ~100,000 keys                                            │
│    ~5,000 req/sec                                           │
│                                                              │
│  Phase 4 (Enterprise):                                      │
│    Redis Cluster (sharding)                                 │
│    CDN for static data                                      │
│    Multi-region deployment                                  │
│    ~1M keys                                                 │
│    ~50,000 req/sec                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│              Component Technologies                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Redis:                                                      │
│    • Version: 7.x                                           │
│    • Driver: ioredis (via @adonisjs/redis)                 │
│    • Protocol: RESP3                                        │
│    • Data Structure: Strings (JSON serialized)             │
│                                                              │
│  AdonisJS:                                                   │
│    • Version: 6.x                                           │
│    • Runtime: Node.js 20.x                                 │
│    • Language: TypeScript 5.6                              │
│    • DI: @adonisjs/core (inject decorator)                 │
│                                                              │
│  Serialization:                                              │
│    • Format: JSON                                           │
│    • Method: JSON.stringify / JSON.parse                   │
│    • Encoding: UTF-8                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## References

- [Redis Documentation](https://redis.io/docs/)
- [AdonisJS Redis Package](https://docs.adonisjs.com/guides/redis)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [Cache-Aside Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)
