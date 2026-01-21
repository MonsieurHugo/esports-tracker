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
  trustProxy: getTrustedProxyConfig(),
  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: env.get('NODE_ENV') === 'production',
    sameSite: 'lax',
  },
})

/**
 * Get proxy trust configuration
 * Returns function that validates proxy IPs, or false if no proxies configured (secure default)
 */
function getTrustedProxyConfig() {
  const trustedProxiesEnv = env.get('TRUSTED_PROXY_IPS', '')

  if (!trustedProxiesEnv) {
    // Not behind a proxy - don't trust X-Forwarded-* headers
    return () => false
  }

  // Parse comma-separated list of trusted proxy IPs
  const trustedProxies = trustedProxiesEnv
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0)

  if (trustedProxies.length === 0) {
    return () => false
  }

  // Return function that checks if IP is in trusted list
  return (address: string) => trustedProxies.includes(address)
}

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
