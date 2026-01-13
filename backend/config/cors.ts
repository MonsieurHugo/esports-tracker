import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

/**
 * CORS configuration
 * In production: only allow origins specified in CORS_ALLOWED_ORIGINS env variable
 * In development: allow localhost origins
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: (requestOrigin: string) => {
    // Get allowed origins from environment
    const allowedOriginsEnv = env.get('CORS_ALLOWED_ORIGINS')
    const nodeEnv = env.get('NODE_ENV')

    // In development, allow localhost and common dev ports
    if (nodeEnv === 'development') {
      const devOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
      ]
      // Also allow any configured origins in dev
      if (allowedOriginsEnv) {
        devOrigins.push(...allowedOriginsEnv.split(',').map((o) => o.trim()))
      }
      // Only allow requests from known dev origins (reject requests without Origin header)
      return devOrigins.includes(requestOrigin)
    }

    // In production, strictly check against allowed origins
    if (!allowedOriginsEnv) {
      // If no origins configured in production, deny all cross-origin requests
      return false
    }

    const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim())
    return allowedOrigins.includes(requestOrigin)
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
