import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'
import { randomBytes } from 'node:crypto'

/**
 * Security Headers Middleware
 *
 * Adds security-related HTTP headers to all responses.
 * Follows OWASP security recommendations.
 *
 * CSP Implementation:
 * - Uses nonce-based CSP for inline scripts (Next.js compatibility)
 * - Nonce is generated per-request and passed to frontend via header
 * - Frontend must use the nonce in Script tags (Next.js handles this automatically)
 *
 * @see https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
 */
export default class SecurityHeadersMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const response = ctx.response
    const isProduction = env.get('NODE_ENV') === 'production'

    // Generate a cryptographically secure nonce for CSP
    const nonce = randomBytes(16).toString('base64')
    ctx.nonce = nonce // Store in context for potential use in responses

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

    // Content Security Policy with nonce-based inline script protection
    // Note: 'unsafe-inline' is kept as fallback for older browsers that don't support nonces
    // Modern browsers will ignore 'unsafe-inline' when nonce is present
    const cspDirectives = [
      "default-src 'self'",
      // Script sources:
      // - 'self': Allow scripts from same origin
      // - 'nonce-{random}': Allow inline scripts with matching nonce (Next.js hydration, analytics)
      // - https://www.clarity.ms: Microsoft Clarity analytics
      // - https://www.googletagmanager.com: Google Analytics (if enabled)
      // - 'strict-dynamic': Allow dynamically loaded scripts from trusted scripts
      // - 'unsafe-inline': Fallback for older browsers (ignored by modern browsers when nonce is present)
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.clarity.ms https://www.googletagmanager.com 'unsafe-inline'`,
      // Style sources:
      // - 'unsafe-inline': Required for Tailwind CSS and dynamic styles (consider moving to nonces in future)
      // - https://fonts.googleapis.com: Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Image sources: Allow LoL assets, team logos, and data URIs
      "img-src 'self' data: https://ddragon.leagueoflegends.com https://raw.communitydragon.org blob:",
      // Connect sources: API calls and analytics
      "connect-src 'self' https://www.clarity.ms https://www.google-analytics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Upgrade insecure requests in production
      ...(isProduction ? ['upgrade-insecure-requests'] : []),
    ]

    response.header('Content-Security-Policy', cspDirectives.join('; '))

    // Cross-Origin policies
    response.header('Cross-Origin-Opener-Policy', 'same-origin')
    response.header('Cross-Origin-Resource-Policy', 'same-origin')

    return next()
  }
}
