/**
 * Redis connection event handlers
 *
 * This preload attaches error handlers to prevent ioredis "Unhandled error event" spam
 * when Redis is unavailable. The cache service handles fallback logic; this file
 * just ensures clean logging.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

// Track connection state to prevent log spam
let hasLoggedError = false
let hasLoggedReconnect = false

/**
 * Setup Redis event handlers for graceful degradation
 * Only runs when REDIS_ENABLED=true
 */
async function setupRedisHandlers() {
  if (!env.get('REDIS_ENABLED', false)) {
    return
  }

  try {
    const { default: redis } = await import('@adonisjs/redis/services/main')
    const connection = redis.connection()

    // Handle connection errors - log once, not every retry
    connection.on('error', ({ error }) => {
      if (!hasLoggedError) {
        hasLoggedError = true
        logger.warn({ err: error?.message || error }, 'Redis connection error - cache will use fallback')
      }
    })

    // Handle connection end (after retries exhausted)
    connection.on('end', () => {
      if (!hasLoggedError) {
        logger.info('Redis connection ended - cache disabled')
      }
    })

    // Handle successful reconnection
    connection.on('ready', () => {
      if (hasLoggedError && !hasLoggedReconnect) {
        hasLoggedReconnect = true
        logger.info('Redis connection restored - cache enabled')
        // Reset error flag so we log again if it disconnects
        hasLoggedError = false
        hasLoggedReconnect = false
      }
    })

    // Handle connection close
    connection.on('close', () => {
      logger.debug('Redis connection closed')
    })
  } catch (error) {
    // Redis module not available (provider not loaded)
    logger.debug('Redis handlers not setup - provider not loaded')
  }
}

// Run setup
setupRedisHandlers()
