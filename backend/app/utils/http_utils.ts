import type { HttpContext } from '@adonisjs/core/http'

/**
 * Get client IP from request
 * Uses AdonisJS's built-in proxy trust configuration from config/app.ts
 * The request.ip() method automatically handles X-Forwarded-For based on trustProxy setting
 */
export function getClientIp(ctx: HttpContext): string {
  return ctx.request.ip() || 'unknown'
}
