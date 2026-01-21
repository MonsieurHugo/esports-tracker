import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import { getClientIp } from '#utils/http_utils'

// Lazy-load Redis - will be null if Redis provider is not loaded
let redisService: Awaited<typeof import('@adonisjs/redis/services/main')>['default'] | null = null
let redisInitialized = false

async function getRedis() {
  if (!redisInitialized) {
    redisInitialized = true
    try {
      const module = await import('@adonisjs/redis/services/main')
      redisService = module.default
    } catch {
      // Redis provider not loaded - use memory fallback
      redisService = null
    }
  }
  return redisService
}

interface RateLimitConfig {
  maxAttempts: number
  windowMs: number
  blockDurationMs: number
}

interface RateLimitEntry {
  attempts: number
  firstAttempt: number
  blockedUntil?: number
}

// Default configurations for different endpoints
const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  login: {
    maxAttempts: 5, // 5 attempts
    windowMs: 15 * 60 * 1000, // 15 minutes window
    blockDurationMs: 15 * 60 * 1000, // 15 minute block
  },
  register: {
    maxAttempts: 3, // 3 registrations
    windowMs: 60 * 60 * 1000, // 1 hour window
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  passwordReset: {
    maxAttempts: 3, // 3 requests
    windowMs: 60 * 60 * 1000, // 1 hour window
    blockDurationMs: 60 * 60 * 1000, // 1 hour block
  },
  twoFactor: {
    maxAttempts: 5, // 5 attempts
    windowMs: 10 * 60 * 1000, // 10 minutes window
    blockDurationMs: 30 * 60 * 1000, // 30 minute block
  },
  api: {
    maxAttempts: 500, // 500 requests per minute - allows active dashboard usage
    windowMs: 60 * 1000, // 1 minute window
    blockDurationMs: 60 * 1000, // 1 minute block
  },
  worker: {
    maxAttempts: 200, // 200 requests per minute - worker metrics/logs
    windowMs: 60 * 1000, // 1 minute window
    blockDurationMs: 60 * 1000, // 1 minute block
  },
  default: {
    maxAttempts: 100, // 100 requests
    windowMs: 60 * 1000, // 1 minute window
    blockDurationMs: 60 * 1000, // 1 minute block
  },
}

// Fallback in-memory store when Redis is unavailable
const memoryStore = new Map<string, RateLimitEntry>()
const MAX_MEMORY_ENTRIES = 10000

// Eviction percentages for memory management
const EVICTION_PERCENTAGE = 0.2 // Evict 20% of entries when limit reached
const EMERGENCY_EVICTION_PERCENTAGE = 0.3 // Evict 30% during emergency cleanup

interface CleanupStats {
  lastSize: number
  lastDeleted: number
  lastCleanupAt: number
  emergencyCleanups: number
}

const cleanupStats: CleanupStats = {
  lastSize: 0,
  lastDeleted: 0,
  lastCleanupAt: Date.now(),
  emergencyCleanups: 0,
}

/**
 * Evict oldest entries when memory limit is reached
 * Removes 20% of entries based on firstAttempt timestamp
 */
function evictOldestEntriesIfNeeded(): void {
  if (memoryStore.size < MAX_MEMORY_ENTRIES) return

  const entriesToDelete = Math.floor(MAX_MEMORY_ENTRIES * EVICTION_PERCENTAGE)
  const sorted = Array.from(memoryStore.entries()).sort(
    (a, b) => a[1].firstAttempt - b[1].firstAttempt
  )

  sorted.slice(0, entriesToDelete).forEach(([key]) => {
    memoryStore.delete(key)
  })

  logger.warn({ evicted: entriesToDelete, remaining: memoryStore.size }, 'Rate limiter memory limit reached, evicting oldest entries')
}

/**
 * Emergency cleanup when approaching memory limit
 * Removes 30% of oldest entries
 */
function performEmergencyCleanup(): void {
  logger.error(
    {
      component: 'rate-limiter',
      size: memoryStore.size,
    },
    'Emergency cleanup triggered'
  )

  cleanupStats.emergencyCleanups++

  // Sort by age and delete oldest entries
  const entries = [...memoryStore.entries()].sort((a, b) => a[1].firstAttempt - b[1].firstAttempt)

  const toDelete = Math.floor(entries.length * EMERGENCY_EVICTION_PERCENTAGE)
  for (let i = 0; i < toDelete; i++) {
    memoryStore.delete(entries[i][0])
  }

  logger.info(
    {
      component: 'rate-limiter',
      deleted: toDelete,
      remaining: memoryStore.size,
    },
    'Emergency cleanup completed'
  )
}

/**
 * Cleanup manager for rate limiter memory store
 */
class CleanupManager {
  private cleanupInterval: NodeJS.Timeout | null = null
  private shutdownHandler: (() => void) | null = null

  /**
   * Start cleanup interval - idempotent, only creates one interval
   */
  startCleanup() {
    // Prevent duplicate intervals
    if (this.cleanupInterval) {
      return
    }

    // Clean up old entries periodically (for memory fallback) - 30s interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 30 * 1000)

    // Handle graceful shutdown
    if (!this.shutdownHandler) {
      this.shutdownHandler = () => {
        this.stopCleanup()
      }
      process.once('SIGTERM', this.shutdownHandler)
      process.once('SIGINT', this.shutdownHandler)
    }

    logger.debug({ component: 'rate-limiter' }, 'Cleanup interval started')
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      logger.debug({ component: 'rate-limiter' }, 'Cleanup interval stopped')
    }
  }

  /**
   * Perform cleanup of expired entries
   */
  private cleanup() {
    const now = Date.now()
    let deleted = 0

    for (const [key, entry] of memoryStore.entries()) {
      const isExpired = entry.blockedUntil
        ? entry.blockedUntil < now
        : now - entry.firstAttempt > RATE_LIMIT_CONFIGS.default.windowMs * 2

      if (isExpired) {
        memoryStore.delete(key)
        deleted++
      }
    }

    cleanupStats.lastSize = memoryStore.size
    cleanupStats.lastDeleted = deleted
    cleanupStats.lastCleanupAt = now

    // Warning if usage is high
    if (memoryStore.size > 5000) {
      logger.warn(
        {
          component: 'rate-limiter',
          memoryStoreSize: memoryStore.size,
          deleted,
          maxEntries: MAX_MEMORY_ENTRIES,
        },
        'Rate limiter memory fallback high usage - possible attack'
      )
    }

    // Emergency cleanup if approaching limit
    if (memoryStore.size > MAX_MEMORY_ENTRIES * 0.9) {
      performEmergencyCleanup()
    }
  }
}

const cleanupManager = new CleanupManager()
// Start cleanup on module load
cleanupManager.startCleanup()

/**
 * Rate limit store abstraction - uses Redis with memory fallback
 */
class RateLimitStore {
  private prefix = 'ratelimit:'

  async get(key: string): Promise<RateLimitEntry | null> {
    const redis = await getRedis()
    if (!redis) {
      return memoryStore.get(key) || null
    }
    try {
      const data = await redis.get(`${this.prefix}${key}`)
      return data ? JSON.parse(data) : null
    } catch {
      // Fallback to memory on Redis error
      return memoryStore.get(key) || null
    }
  }

  async set(key: string, entry: RateLimitEntry, ttlMs: number): Promise<void> {
    const redis = await getRedis()
    if (!redis) {
      evictOldestEntriesIfNeeded()
      memoryStore.set(key, entry)
      return
    }
    try {
      await redis.set(`${this.prefix}${key}`, JSON.stringify(entry), 'PX', ttlMs)
    } catch {
      // Fallback to memory on Redis error
      evictOldestEntriesIfNeeded()
      memoryStore.set(key, entry)
    }
  }

  async delete(key: string): Promise<void> {
    const redis = await getRedis()
    if (!redis) {
      memoryStore.delete(key)
      return
    }
    try {
      await redis.del(`${this.prefix}${key}`)
    } catch {
      // Fallback to memory on Redis error
      memoryStore.delete(key)
    }
  }

  async getStats(): Promise<{ total: number; blocked: number }> {
    const redis = await getRedis()
    if (!redis) {
      const now = Date.now()
      let blocked = 0
      for (const entry of memoryStore.values()) {
        if (entry.blockedUntil && entry.blockedUntil > now) {
          blocked++
        }
      }
      return { total: memoryStore.size, blocked }
    }
    try {
      // Use SCAN instead of KEYS to avoid blocking Redis
      const keys: string[] = []
      let cursor = '0'

      do {
        const result = await redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 100)
        cursor = result[0]
        keys.push(...result[1])
      } while (cursor !== '0')

      let blocked = 0
      const now = Date.now()

      for (const key of keys) {
        const data = await redis.get(key)
        if (data) {
          const entry: RateLimitEntry = JSON.parse(data)
          if (entry.blockedUntil && entry.blockedUntil > now) {
            blocked++
          }
        }
      }
      return { total: keys.length, blocked }
    } catch {
      // Fallback to memory on Redis error
      const now = Date.now()
      let blocked = 0
      for (const entry of memoryStore.values()) {
        if (entry.blockedUntil && entry.blockedUntil > now) {
          blocked++
        }
      }
      return { total: memoryStore.size, blocked }
    }
  }
}

const store = new RateLimitStore()

export default class RateLimitMiddleware {
  /**
   * Handle rate limiting
   */
  async handle(ctx: HttpContext, next: NextFn, options?: { type?: string }) {
    const type = options?.type || 'default'
    const config = RATE_LIMIT_CONFIGS[type] || RATE_LIMIT_CONFIGS.default
    const ip = getClientIp(ctx)
    const key = `${type}:${ip}`
    const now = Date.now()

    let entry = await store.get(key)

    // Check if currently blocked
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000)
      const blockedUntilDate = DateTime.fromMillis(entry.blockedUntil)

      return ctx.response
        .header('X-RateLimit-Limit', String(config.maxAttempts))
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', String(Math.ceil(entry.blockedUntil / 1000)))
        .header('Retry-After', String(retryAfter))
        .status(429)
        .json({
          error: 'Trop de tentatives. Veuillez réessayer plus tard.',
          retryAfter,
          blockedUntil: blockedUntilDate.toISO(),
        })
    }

    // Initialize or update entry
    if (!entry || now - entry.firstAttempt > config.windowMs) {
      entry = { attempts: 1, firstAttempt: now }
    } else {
      entry.attempts++
    }

    // Check if should be blocked
    if (entry.attempts > config.maxAttempts) {
      entry.blockedUntil = now + config.blockDurationMs
      await store.set(key, entry, config.blockDurationMs + config.windowMs)

      const retryAfter = Math.ceil(config.blockDurationMs / 1000)
      const blockedUntilDate = DateTime.fromMillis(entry.blockedUntil)

      return ctx.response
        .header('X-RateLimit-Limit', String(config.maxAttempts))
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', String(Math.ceil(entry.blockedUntil / 1000)))
        .header('Retry-After', String(retryAfter))
        .status(429)
        .json({
          error: 'Trop de tentatives. Veuillez réessayer plus tard.',
          retryAfter,
          blockedUntil: blockedUntilDate.toISO(),
        })
    }

    await store.set(key, entry, config.windowMs * 2)

    // Set rate limit headers
    const remaining = Math.max(0, config.maxAttempts - entry.attempts)
    const reset = Math.ceil((entry.firstAttempt + config.windowMs) / 1000)

    ctx.response
      .header('X-RateLimit-Limit', String(config.maxAttempts))
      .header('X-RateLimit-Remaining', String(remaining))
      .header('X-RateLimit-Reset', String(reset))

    return next()
  }
}

/**
 * Reset rate limit for a specific key (useful after successful auth)
 */
export async function resetRateLimit(type: string, ip: string): Promise<void> {
  const key = `${type}:${ip}`
  await store.delete(key)
}

/**
 * Get rate limit status for monitoring
 */
export async function getRateLimitStatus(): Promise<{ total: number; blocked: number }> {
  return store.getStats()
}

/**
 * Get rate limiter stats including cleanup metrics
 */
export async function getRateLimiterStats(): Promise<
  CleanupStats & { currentSize: number; usingRedis: boolean }
> {
  const redis = await getRedis()
  return {
    ...cleanupStats,
    currentSize: memoryStore.size,
    usingRedis: redis !== null,
  }
}
