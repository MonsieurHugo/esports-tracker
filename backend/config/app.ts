import env from '#start/env'
import { defineConfig } from '@adonisjs/http-server'

/*
|--------------------------------------------------------------------------
| Application name
|--------------------------------------------------------------------------
*/
export const appName = 'esports-tracker-backend'

/*
|--------------------------------------------------------------------------
| Application secret key
|--------------------------------------------------------------------------
*/
export const appKey = env.get('APP_KEY')

/*
|--------------------------------------------------------------------------
| HTTP server settings
|--------------------------------------------------------------------------
*/
export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,
  useAsyncLocalStorage: true,
  trustProxy: () => true,
  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: env.get('NODE_ENV') === 'production',
    sameSite: 'lax',
  },
})

/*
|--------------------------------------------------------------------------
| Profiler
|--------------------------------------------------------------------------
*/
export const profiler = {
  enabled: false,
}

/*
|--------------------------------------------------------------------------
| Logger
|--------------------------------------------------------------------------
*/
export const logger = {
  default: 'app',
  loggers: {
    app: {
      enabled: true,
    },
  },
}
