/*
|--------------------------------------------------------------------------
| Pro Admin Auth Middleware
|--------------------------------------------------------------------------
|
| API key authentication for pro monitoring write endpoints.
| Protects destructive operations like cleanTables, createSyncRequest, etc.
|
*/

import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

/**
 * Middleware to protect pro monitoring write endpoints with API key authentication.
 *
 * The API key can be provided via:
 * - Authorization header: "Bearer <api-key>" or "ApiKey <api-key>"
 * - X-API-Key header: "<api-key>"
 */
export default class ProAdminAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const expectedKey = env.get('PRO_ADMIN_API_KEY')

    // If no API key is configured, deny all access to protected endpoints
    if (!expectedKey) {
      logger.error(
        { path: ctx.request.url(), method: ctx.request.method() },
        'PRO_ADMIN_API_KEY not configured - access denied'
      )
      return ctx.response.serviceUnavailable({
        error: 'Service unavailable',
        message: 'Admin authentication not configured',
      })
    }

    // Extract API key from request
    const providedKey = this.extractApiKey(ctx)

    if (!providedKey) {
      logger.warn(
        { path: ctx.request.url(), method: ctx.request.method() },
        'Missing API key for protected endpoint'
      )
      return ctx.response.unauthorized({
        error: 'Unauthorized',
        message: 'API key required',
      })
    }

    // Timing-safe comparison to prevent timing attacks
    if (!this.secureCompare(providedKey, expectedKey)) {
      logger.warn(
        { path: ctx.request.url(), method: ctx.request.method() },
        'Invalid API key provided for protected endpoint'
      )
      return ctx.response.forbidden({
        error: 'Forbidden',
        message: 'Invalid API key',
      })
    }

    // Log successful authentication (without exposing the key)
    logger.info(
      { path: ctx.request.url(), method: ctx.request.method() },
      'Pro admin auth successful'
    )

    return next()
  }

  /**
   * Extract API key from request headers.
   */
  private extractApiKey(ctx: HttpContext): string | null {
    // Check X-API-Key header first
    const xApiKey = ctx.request.header('x-api-key')
    if (xApiKey) {
      return xApiKey
    }

    // Check Authorization header
    const authHeader = ctx.request.header('authorization')
    if (authHeader) {
      // Support "Bearer <key>" format
      if (authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7)
      }
      // Support "ApiKey <key>" format
      if (authHeader.toLowerCase().startsWith('apikey ')) {
        return authHeader.slice(7)
      }
    }

    return null
  }

  /**
   * Timing-safe string comparison to prevent timing attacks.
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }
}
