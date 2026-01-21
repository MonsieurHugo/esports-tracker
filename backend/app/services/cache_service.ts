import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import type { RedisService } from '@adonisjs/redis/types'

/**
 * Cache key prefixes for different data types
 */
export const CACHE_KEYS = {
  LEAGUES: 'leagues:all',
  SPLITS: 'splits:all',
  TEAM_LEADERBOARD: (leagueId: string, period: string) =>
    `leaderboard:team:${leagueId}:${period}`,
  PLAYER_LEADERBOARD: (leagueId: string, period: string) =>
    `leaderboard:player:${leagueId}:${period}`,
  TOP_GRINDERS: (leagueId: string, period: string) => `grinders:${leagueId}:${period}`,
  TOP_LP_GAINERS: (leagueId: string, period: string) => `lp:gainers:${leagueId}:${period}`,
  TOP_LP_LOSERS: (leagueId: string, period: string) => `lp:losers:${leagueId}:${period}`,
  STREAKS: (leagueId: string) => `streaks:${leagueId}`,
  SUMMARY_STATS: (leagueId: string, period: string) => `summary:${leagueId}:${period}`,
  PLAYER_PROFILE: (playerId: string) => `player:profile:${playerId}`,
  TEAM_PROFILE: (teamId: string) => `team:profile:${teamId}`,
  PLAYER_HISTORY: (accountId: string, days: number) => `player:history:${accountId}:${days}`,
} as const

/**
 * TTL (Time To Live) in seconds for different cache types
 */
export const CACHE_TTL = {
  LEAGUES: 3600, // 1 hour - rarely changes
  SPLITS: 3600, // 1 hour
  LEADERBOARD: 300, // 5 minutes
  GRINDERS: 300, // 5 minutes
  LP_CHANGES: 60, // 1 minute - changes frequently
  STREAKS: 300, // 5 minutes
  SUMMARY: 300, // 5 minutes
  PLAYER_PROFILE: 600, // 10 minutes
  TEAM_PROFILE: 600, // 10 minutes
  PLAYER_HISTORY: 180, // 3 minutes
} as const

/**
 * Redis caching service with graceful fallback
 *
 * Provides methods for getting, setting, and invalidating cached data.
 * If Redis is unavailable, logs warnings and falls back to executing the fetcher function directly.
 *
 * Note: Redis is dynamically imported only when REDIS_ENABLED=true to avoid
 * binding resolution errors when Redis provider is not loaded.
 */
class CacheService {
  private isRedisEnabled: boolean
  private redisInstance: RedisService | null = null
  private redisPromise: Promise<RedisService | null> | null = null
  private connectionFailed: boolean = false
  private hasLoggedDisabled: boolean = false

  constructor() {
    this.isRedisEnabled = env.get('REDIS_ENABLED', false)
  }

  /**
   * Lazily get Redis instance (only imported when needed)
   * Returns null if Redis is disabled or connection has failed
   */
  private async getRedis(): Promise<RedisService | null> {
    if (!this.isRedisEnabled || this.connectionFailed) {
      return null
    }

    if (this.redisInstance) {
      return this.redisInstance
    }

    if (!this.redisPromise) {
      this.redisPromise = (async () => {
        try {
          const { default: redis } = await import('@adonisjs/redis/services/main')
          this.redisInstance = redis
          return redis
        } catch (error) {
          logger.warn({ err: error }, 'Failed to load Redis module')
          this.isRedisEnabled = false
          this.redisPromise = null
          return null
        }
      })()
    }

    return this.redisPromise
  }

  /**
   * Check if an error indicates Redis connection failure
   */
  private isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const message = error.message.toLowerCase()
    const name = error.name || ''
    return (
      message.includes('econnrefused') ||
      message.includes('connection is closed') ||
      message.includes('stream isn\'t writeable') ||
      message.includes('maxretriesperrequest') ||
      name === 'MaxRetriesPerRequestError'
    )
  }

  /**
   * Handle Redis connection failure - disable and log once
   */
  private handleConnectionFailure(): void {
    if (!this.connectionFailed) {
      this.connectionFailed = true
      if (!this.hasLoggedDisabled) {
        this.hasLoggedDisabled = true
        logger.warn('Redis connection failed - cache disabled, using database fallback')
      }
    }
  }

  /**
   * Get a value from cache
   *
   * @param key - Cache key
   * @returns The cached value or null if not found/Redis unavailable
   *
   * @example
   * const leagues = await cacheService.get<League[]>(CACHE_KEYS.LEAGUES)
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = await this.getRedis()
    if (!redis) {
      return null
    }

    try {
      const value = await redis.get(key)

      if (!value) {
        return null
      }

      return JSON.parse(value) as T
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error, key }, 'Failed to get value from Redis cache')
      }
      return null
    }
  }

  /**
   * Set a value in cache
   *
   * @param key - Cache key
   * @param value - Value to cache (will be JSON serialized)
   * @param ttlSeconds - Optional TTL in seconds
   *
   * @example
   * await cacheService.set(CACHE_KEYS.LEAGUES, leagues, CACHE_TTL.LEAGUES)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) {
      return
    }

    try {
      const serialized = JSON.stringify(value)

      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, serialized)
      } else {
        await redis.set(key, serialized)
      }

      logger.debug({ key, ttl: ttlSeconds }, 'Cached value in Redis')
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error, key }, 'Failed to set value in Redis cache')
      }
    }
  }

  /**
   * Get a cached value or execute fetcher function and cache the result
   *
   * This is the recommended method for most caching use cases.
   * If the value exists in cache, returns it immediately.
   * Otherwise, executes the fetcher, caches the result, and returns it.
   *
   * @param key - Cache key
   * @param ttlSeconds - TTL in seconds for cached value
   * @param fetcher - Function to execute if cache miss (or Redis unavailable)
   * @returns The cached or fetched value
   *
   * @example
   * const leagues = await cacheService.getOrSet(
   *   CACHE_KEYS.LEAGUES,
   *   CACHE_TTL.LEAGUES,
   *   async () => await League.query().orderBy('priority', 'asc')
   * )
   */
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const redis = await this.getRedis()
    if (!redis) {
      logger.debug({ key }, 'Redis not available, executing fetcher directly')
      return await fetcher()
    }

    try {
      // Try to get from cache
      const cached = await this.get<T>(key)

      if (cached !== null) {
        logger.debug({ key }, 'Cache hit')
        return cached
      }

      // Cache miss - execute fetcher
      logger.debug({ key }, 'Cache miss, executing fetcher')
      const value = await fetcher()

      // Cache the result (don't await to avoid blocking)
      this.set(key, value, ttlSeconds).catch((error) => {
        logger.warn({ err: error, key }, 'Failed to cache fetched value')
      })

      return value
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error, key }, 'Cache operation failed')
      }
      return await fetcher()
    }
  }

  /**
   * Delete a single cache key
   *
   * @param key - Cache key to delete
   *
   * @example
   * await cacheService.delete(CACHE_KEYS.LEAGUES)
   */
  async delete(key: string): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) {
      return
    }

    try {
      await redis.del(key)
      logger.debug({ key }, 'Deleted cache key')
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error, key }, 'Failed to delete cache key')
      }
    }
  }

  /**
   * Delete all keys matching a pattern
   *
   * Useful for invalidating related cache entries.
   * Uses SCAN for memory-efficient iteration.
   *
   * @param pattern - Redis key pattern (e.g., "leaderboard:*" or "player:*")
   *
   * @example
   * // Invalidate all leaderboard caches
   * await cacheService.deletePattern('leaderboard:*')
   *
   * // Invalidate all caches for a specific league
   * await cacheService.deletePattern(`*:${leagueId}:*`)
   */
  async deletePattern(pattern: string): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) {
      return
    }

    try {
      const connection = redis.connection()
      let cursor = '0'
      let deletedCount = 0

      // Key prefix must match redis config (backend/config/redis.ts keyPrefix).
      // Not imported because redis config uses defineConfig() which doesn't export the prefix separately.
      const keyPrefix = 'esports:'

      do {
        // SCAN is more efficient than KEYS for large datasets
        const [newCursor, keys] = await connection.scan(
          cursor,
          'MATCH',
          `${keyPrefix}${pattern}`,
          'COUNT',
          100
        )

        cursor = newCursor

        if (keys.length > 0) {
          // Remove prefix from keys before passing to DEL
          const keysWithoutPrefix = keys.map((key) => key.replace(keyPrefix, ''))
          await redis.del(...keysWithoutPrefix)
          deletedCount += keys.length
        }
      } while (cursor !== '0')

      logger.info({ pattern, count: deletedCount }, 'Deleted cache keys matching pattern')
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error, pattern }, 'Failed to delete cache keys by pattern')
      }
    }
  }

  /**
   * Flush all cache entries
   *
   * WARNING: This deletes ALL keys in the Redis database (db: 0).
   * Use with caution!
   *
   * @example
   * await cacheService.flush()
   */
  async flush(): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) {
      return
    }

    try {
      await redis.flushdb()
      logger.warn('Flushed entire Redis cache database')
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.error({ err: error }, 'Failed to flush Redis cache')
      }
      throw error
    }
  }

  /**
   * Invalidate all leaderboard caches
   *
   * Convenience method for common invalidation scenario
   */
  async invalidateLeaderboards(): Promise<void> {
    await Promise.all([
      this.deletePattern('leaderboard:*'),
      this.deletePattern('grinders:*'),
      this.deletePattern('lp:*'),
      this.deletePattern('streaks:*'),
      this.deletePattern('summary:*'),
    ])
  }

  /**
   * Invalidate all caches for a specific league
   *
   * @param leagueId - League ID to invalidate
   */
  async invalidateLeague(leagueId: string): Promise<void> {
    await this.deletePattern(`*:${leagueId}:*`)
  }

  /**
   * Invalidate all caches for a specific player
   *
   * @param playerId - Player ID to invalidate
   */
  async invalidatePlayer(playerId: string): Promise<void> {
    await Promise.all([
      this.deletePattern(`player:profile:${playerId}`),
      this.deletePattern(`player:history:${playerId}:*`),
      this.deletePattern(`leaderboard:player:*`), // Player might appear in any leaderboard
    ])
  }

  /**
   * Invalidate all caches for a specific team
   *
   * @param teamId - Team ID to invalidate
   */
  async invalidateTeam(teamId: string): Promise<void> {
    await Promise.all([
      this.deletePattern(`team:profile:${teamId}`),
      this.deletePattern(`leaderboard:team:*`), // Team might appear in any leaderboard
    ])
  }

  /**
   * Get cache statistics (requires Redis INFO command)
   *
   * @returns Basic cache statistics or null if unavailable
   */
  async getStats(): Promise<{
    hits: number
    misses: number
    keys: number
    memory: string
  } | null> {
    const redis = await this.getRedis()
    if (!redis) {
      return null
    }

    try {
      const connection = redis.connection()
      const info = await connection.info('stats')
      const dbInfo = await connection.info('keyspace')

      // Parse info string (format: "key:value\r\n")
      const stats = info.split('\r\n').reduce(
        (acc, line) => {
          const [key, value] = line.split(':')
          if (key && value) acc[key] = value
          return acc
        },
        {} as Record<string, string>
      )

      // Parse keyspace info to get key count
      const keyspaceMatch = dbInfo.match(/db0:keys=(\d+)/)
      const keyCount = keyspaceMatch ? parseInt(keyspaceMatch[1], 10) : 0

      return {
        hits: parseInt(stats['keyspace_hits'] || '0', 10),
        misses: parseInt(stats['keyspace_misses'] || '0', 10),
        keys: keyCount,
        memory: stats['used_memory_human'] || '0B',
      }
    } catch (error) {
      if (this.isConnectionError(error)) {
        this.handleConnectionFailure()
      } else {
        logger.warn({ err: error }, 'Failed to get cache statistics')
      }
      return null
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService()

// Export type for dependency injection if needed
export default cacheService
