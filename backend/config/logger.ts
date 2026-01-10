import env from '#start/env'
import { defineConfig } from '@adonisjs/core/logger'

const loggerConfig = defineConfig({
  default: 'app',
  loggers: {
    app: {
      enabled: true,
      name: env.get('APP_NAME', 'esports-tracker'),
      level: env.get('LOG_LEVEL', 'info'),
      transport:
        env.get('NODE_ENV') === 'development'
          ? {
              targets: [
                {
                  target: 'pino-pretty',
                  level: 'info',
                  options: { colorize: true },
                },
              ],
            }
          : undefined,
    },
  },
})

export default loggerConfig
