import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Security Headers Middleware
 *
 * Adds security-related HTTP headers to all responses.
 * Follows OWASP security recommendations.
 */
export default class SecurityHeadersMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const response = ctx.response
    const isProduction = env.get('NODE_ENV') === 'production'

    // Prevent clickjacking attacks
    response.header('X-Frame-Options', 'DENY')

    // Prevent MIME type sniffing
    response.header('X-Content-Type-Options', 'nosniff')

    // Enable XSS filtering (legacy browsers)
    response.header('X-XSS-Protection', '1; mode=block')

    // Control referrer information
    response.header('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Restrict browser features/APIs
    response.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    )

    // HTTP Strict Transport Security (production only)
    if (isProduction) {
      response.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    }

    // Content Security Policy
    // Adjust these values based on your application's needs
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.clarity.ms",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://ddragon.leagueoflegends.com https://raw.communitydragon.org blob:",
      "connect-src 'self' https://www.clarity.ms",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]

    response.header('Content-Security-Policy', cspDirectives.join('; '))

    // Cross-Origin policies
    response.header('Cross-Origin-Opener-Policy', 'same-origin')
    response.header('Cross-Origin-Resource-Policy', 'same-origin')

    return next()
  }
}
