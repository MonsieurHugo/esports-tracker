import env from '#start/env'
import { defineConfig } from '@adonisjs/redis'

const redisConfig = defineConfig({
  connection: 'main',

  connections: {
    main: {
      host: env.get('REDIS_HOST') || 'localhost',
      port: Number(env.get('REDIS_PORT')) || 6379,
      password: env.get('REDIS_PASSWORD') || '',
      db: 0,
      keyPrefix: 'esports:',
      retryStrategy(times) {
        // Reconnect after
        return Math.min(times * 50, 2000)
      },
    },
  },
})

export default redisConfig

declare module '@adonisjs/redis/types' {
  export interface RedisConnections extends InferConnections<typeof redisConfig> {}
}
