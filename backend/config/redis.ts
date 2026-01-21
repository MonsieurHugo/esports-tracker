import env from '#start/env'
import { defineConfig } from '@adonisjs/redis'

/**
 * Track if we've already logged the Redis unavailable warning
 * to prevent log spam during connection retries
 */
let hasLoggedUnavailable = false

const redisConfig = defineConfig({
  connection: 'main',

  connections: {
    main: {
      host: env.get('REDIS_HOST') || 'localhost',
      port: Number(env.get('REDIS_PORT')) || 6379,
      password: env.get('REDIS_PASSWORD') || '',
      db: 0,
      keyPrefix: 'esports:',

      /**
       * Graceful degradation configuration
       * When Redis is unavailable, fail fast instead of blocking requests
       */

      // Fail fast after 3 retries per request (default is 20)
      maxRetriesPerRequest: 3,

      // Don't queue commands when disconnected - fail immediately
      enableOfflineQueue: false,

      // Delay connection until first command (allows app to start without Redis)
      lazyConnect: true,

      // Connection retry strategy with limited attempts
      retryStrategy(times: number) {
        // Stop retrying after 3 attempts
        if (times > 3) {
          if (!hasLoggedUnavailable) {
            hasLoggedUnavailable = true
            console.warn('[Redis] Unavailable after 3 retries - cache disabled, using fallback')
          }
          return null // Stop retrying, connection will be marked as ended
        }
        // Exponential backoff: 200ms, 400ms, 600ms
        return Math.min(times * 200, 2000)
      },

      // Don't auto-reconnect on ECONNREFUSED - let retryStrategy handle it
      reconnectOnError(err: Error) {
        const targetErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT']
        const shouldReconnect = !targetErrors.some((e) => err.message.includes(e))
        return shouldReconnect
      },
    },
  },
})

export default redisConfig

declare module '@adonisjs/redis/types' {
  export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
