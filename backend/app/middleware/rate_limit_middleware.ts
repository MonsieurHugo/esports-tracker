import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { DateTime } from 'luxon'

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

// In-memory store for rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>()

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
  default: {
    maxAttempts: 100, // 100 requests
    windowMs: 60 * 1000, // 1 minute window
    blockDurationMs: 60 * 1000, // 1 minute block
  },
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.blockedUntil && entry.blockedUntil < now) {
      rateLimitStore.delete(key)
    } else if (now - entry.firstAttempt > RATE_LIMIT_CONFIGS.default.windowMs * 2) {
      rateLimitStore.delete(key)
    }
  }
}, 60 * 1000) // Clean up every minute

export default class RateLimitMiddleware {
  /**
   * Get client IP from request
   */
  private getClientIp(ctx: HttpContext): string {
    const forwarded = ctx.request.header('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return ctx.request.ip() || 'unknown'
  }

  /**
   * Handle rate limiting
   */
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options?: { type?: string }
  ) {
    const type = options?.type || 'default'
    const config = RATE_LIMIT_CONFIGS[type] || RATE_LIMIT_CONFIGS.default
    const ip = this.getClientIp(ctx)
    const key = `${type}:${ip}`
    const now = Date.now()

    let entry = rateLimitStore.get(key)

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
      rateLimitStore.set(key, entry)

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

    rateLimitStore.set(key, entry)

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
export function resetRateLimit(type: string, ip: string): void {
  const key = `${type}:${ip}`
  rateLimitStore.delete(key)
}

/**
 * Get rate limit status for monitoring
 */
export function getRateLimitStatus(): { total: number; blocked: number } {
  const now = Date.now()
  let blocked = 0
  for (const entry of rateLimitStore.values()) {
    if (entry.blockedUntil && entry.blockedUntil > now) {
      blocked++
    }
  }
  return { total: rateLimitStore.size, blocked }
}
