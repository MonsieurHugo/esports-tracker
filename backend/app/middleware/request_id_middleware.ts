import { HttpContext } from '@adonisjs/core/http'
import { NextFn } from '@adonisjs/core/types/http'
import { randomUUID } from 'node:crypto'

/**
 * Middleware that adds a unique request ID to each request.
 *
 * - Uses X-Request-ID header from client/load balancer if provided
 * - Generates a new UUID if not provided
 * - Adds the ID to response headers for client-side debugging
 * - Makes the ID available in ctx.requestId for logging
 */
export default class RequestIdMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Use existing ID from upstream (load balancer, API gateway) or generate new
    const requestId = ctx.request.header('x-request-id') || randomUUID()

    // Validate format if provided externally (prevent injection)
    const validId = this.isValidRequestId(requestId) ? requestId : randomUUID()

    // Store in context for use in controllers and services
    ctx.requestId = validId

    // Return in response for client debugging
    ctx.response.header('x-request-id', validId)

    return next()
  }

  /**
   * Validates that a request ID is safe to use.
   * Accepts UUIDs and alphanumeric strings up to 64 chars.
   */
  private isValidRequestId(id: string): boolean {
    // UUID format or alphanumeric with dashes/underscores, max 64 chars
    return /^[a-zA-Z0-9\-_]{1,64}$/.test(id)
  }
}

// Extend HttpContext type to include requestId
declare module '@adonisjs/core/http' {
  interface HttpContext {
    requestId: string
  }
}
