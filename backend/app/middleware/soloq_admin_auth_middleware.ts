/*
|--------------------------------------------------------------------------
| SoloQ Admin Auth Middleware
|--------------------------------------------------------------------------
|
| Simple password authentication for SoloQ admin page.
| Protects admin operations with a shared password via X-Admin-Password header.
|
*/

import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Middleware to protect SoloQ admin endpoints with password authentication.
 *
 * The password must be provided via X-Admin-Password header.
 */
export default class SoloqAdminAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const expected = env.get('SOLOQ_ADMIN_PASSWORD')

    // If no password is configured, deny all access to protected endpoints
    if (!expected) {
      return ctx.response.serviceUnavailable({
        error: 'Service unavailable',
        message: 'Admin password not configured',
      })
    }

    // Extract password from request
    const provided = ctx.request.header('x-admin-password')

    if (!provided) {
      return ctx.response.unauthorized({
        error: 'Unauthorized',
        message: 'Admin password required',
      })
    }

    // Timing-safe comparison to prevent timing attacks
    if (!this.secureCompare(provided, expected)) {
      return ctx.response.forbidden({
        error: 'Forbidden',
        message: 'Invalid password',
      })
    }

    return next()
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
