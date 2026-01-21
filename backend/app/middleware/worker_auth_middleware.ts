import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { createHmac, timingSafeEqual } from 'node:crypto'
import env from '#start/env'

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

/**
 * In-memory nonce store for fallback when Redis is unavailable
 */
const memoryNonceStore = new Map<string, number>()
const MAX_MEMORY_NONCES = 10000
const NONCE_TTL_SEC = 120 // Keep nonces for 2x the timestamp window

/**
 * Evict oldest nonces when memory limit is reached
 */
function evictOldestNoncesIfNeeded(): void {
  if (memoryNonceStore.size < MAX_MEMORY_NONCES) return

  const now = Math.floor(Date.now() / 1000)
  let evicted = 0

  // First, remove expired nonces
  for (const [nonce, expiresAt] of memoryNonceStore.entries()) {
    if (expiresAt < now) {
      memoryNonceStore.delete(nonce)
      evicted++
    }
  }

  // If still over limit, remove oldest 20%
  if (memoryNonceStore.size >= MAX_MEMORY_NONCES) {
    const toDelete = Math.floor(MAX_MEMORY_NONCES * 0.2)
    const sorted = Array.from(memoryNonceStore.entries()).sort((a, b) => a[1] - b[1])
    sorted.slice(0, toDelete).forEach(([nonce]) => {
      memoryNonceStore.delete(nonce)
      evicted++
    })
  }

  if (evicted > 0) {
    logger.warn({ evicted, remaining: memoryNonceStore.size }, 'Worker auth nonce store cleanup')
  }
}

// Clean up expired nonces periodically (for memory fallback)
setInterval(
  () => {
    const now = Math.floor(Date.now() / 1000)
    for (const [nonce, expiresAt] of memoryNonceStore.entries()) {
      if (expiresAt < now) {
        memoryNonceStore.delete(nonce)
      }
    }
  },
  60 * 1000 // Every minute
)

/**
 * Nonce store abstraction - uses Redis with memory fallback
 */
class NonceStore {
  private prefix = 'worker_nonce:'

  /**
   * Check if a nonce has been used and mark it as used
   * Returns true if nonce was already used (replay attack)
   */
  async checkAndStore(nonce: string): Promise<boolean> {
    const redis = await getRedis()
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = now + NONCE_TTL_SEC

    if (!redis) {
      // Memory fallback
      if (memoryNonceStore.has(nonce)) {
        return true // Already used
      }
      evictOldestNoncesIfNeeded()
      memoryNonceStore.set(nonce, expiresAt)
      return false
    }

    try {
      // SETNX returns 1 if key was set, 0 if it already exists
      const result = await redis.setnx(`${this.prefix}${nonce}`, '1')
      if (result === 1) {
        // Successfully set - set expiration
        await redis.expire(`${this.prefix}${nonce}`, NONCE_TTL_SEC)
        return false // New nonce
      }
      return true // Already exists (replay)
    } catch {
      // Fallback to memory on Redis error
      if (memoryNonceStore.has(nonce)) {
        return true
      }
      evictOldestNoncesIfNeeded()
      memoryNonceStore.set(nonce, expiresAt)
      return false
    }
  }
}

const nonceStore = new NonceStore()

/**
 * UUID v4 validation regex
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Worker authentication middleware
 *
 * Validates requests from the Python worker using HMAC-SHA256 signatures
 * to prevent unauthorized access to worker-specific endpoints.
 *
 * Required headers:
 * - X-Worker-Timestamp: Unix timestamp (must be within 60 seconds)
 * - X-Worker-Nonce: UUID v4 unique per request (prevents replay attacks)
 * - X-Worker-Signature: HMAC-SHA256(secret, timestamp:nonce:method:path:body)
 *
 * Optional: IP allowlisting via WORKER_ALLOWED_IPS environment variable
 */
export default class WorkerAuthMiddleware {
  private readonly ALLOWED_IPS: string[]
  private readonly MAX_TIMESTAMP_AGE_SEC = 60 // 60 seconds (reduced from 5 minutes)

  constructor() {
    // Parse allowed IPs from environment variable
    const allowedIps = env.get('WORKER_ALLOWED_IPS', '')
    this.ALLOWED_IPS = allowedIps
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean)
  }

  /**
   * Validate worker authentication
   */
  async handle(ctx: HttpContext, next: NextFn) {
    const workerSecret = env.get('WORKER_API_SECRET')

    if (!workerSecret) {
      // Log warning in development, but don't expose in production
      if (env.get('NODE_ENV') === 'development') {
        logger.warn('WORKER_API_SECRET is not configured in development - endpoints are unprotected')
      }

      return ctx.response.internalServerError({
        error: 'Worker API not configured',
      })
    }

    // IP allowlist check (if configured)
    if (this.ALLOWED_IPS.length > 0) {
      const clientIp = ctx.request.ip()
      if (!this.ALLOWED_IPS.includes(clientIp)) {
        return ctx.response.forbidden({
          error: 'IP address not allowed',
        })
      }
    }

    // Validate required headers
    const timestamp = ctx.request.header('X-Worker-Timestamp')
    const nonce = ctx.request.header('X-Worker-Nonce')
    const signature = ctx.request.header('X-Worker-Signature')

    if (!timestamp || !nonce || !signature) {
      return ctx.response.unauthorized({
        error: 'Missing worker authentication headers',
      })
    }

    // Validate nonce format (must be UUID v4)
    if (!UUID_V4_REGEX.test(nonce)) {
      return ctx.response.unauthorized({
        error: 'Invalid nonce format (must be UUID v4)',
      })
    }

    // Validate timestamp format and age (prevent replay attacks)
    const requestTime = parseInt(timestamp, 10)
    if (isNaN(requestTime)) {
      return ctx.response.unauthorized({
        error: 'Invalid timestamp format',
      })
    }

    const now = Math.floor(Date.now() / 1000)
    const age = Math.abs(now - requestTime)

    if (age > this.MAX_TIMESTAMP_AGE_SEC) {
      return ctx.response.unauthorized({
        error: 'Request timestamp expired',
      })
    }

    // Check for nonce reuse (replay attack detection)
    const isReplay = await nonceStore.checkAndStore(nonce)
    if (isReplay) {
      const clientIp = ctx.request.ip()
      logger.warn({ ip: clientIp, path: ctx.request.url(), nonce }, 'Worker auth replay attack detected')
      return ctx.response.unauthorized({
        error: 'Nonce already used (potential replay attack)',
      })
    }

    // Generate expected signature (now includes nonce)
    const method = ctx.request.method()
    const path = ctx.request.url(true)
    const body = ctx.request.hasBody() ? JSON.stringify(ctx.request.body()) : ''

    const payload = `${timestamp}:${nonce}:${method}:${path}:${body}`
    const expectedSignature = createHmac('sha256', workerSecret).update(payload).digest('hex')

    // Timing-safe signature comparison
    try {
      const sigBuffer = Buffer.from(signature, 'hex')
      const expectedBuffer = Buffer.from(expectedSignature, 'hex')

      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        return ctx.response.unauthorized({
          error: 'Invalid worker signature',
        })
      }
    } catch {
      return ctx.response.unauthorized({
        error: 'Invalid signature format',
      })
    }

    // Authentication successful
    return next()
  }
}
