import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'
import { metricsCollector } from '#utils/metrics'
import { getClientIp } from '#utils/http_utils'

/**
 * Request Logger Middleware
 *
 * Logs all HTTP requests with correlation IDs for observability.
 * Tracks response times, status codes, and other metrics.
 *
 * Note: Expects ctx.requestId to be set by RequestIdMiddleware
 */
export default class RequestLoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const startTime = Date.now()
    const method = ctx.request.method()
    const path = ctx.request.url(true) // Include query string
    const ip = getClientIp(ctx)
    const userAgent = ctx.request.header('user-agent') || 'unknown'

    // Log incoming request
    logger.info(
      {
        requestId: ctx.requestId,
        method,
        path,
        ip,
        userAgent,
      },
      'Incoming request'
    )

    try {
      await next()
    } finally {
      const duration = Date.now() - startTime
      const statusCode = ctx.response.response.statusCode || 500

      // Build log payload
      const logPayload = {
        requestId: ctx.requestId,
        method,
        path,
        statusCode,
        duration,
        userAgent,
        ip,
      }

      // Collect metrics
      metricsCollector.record(path, duration, statusCode)

      // Log based on status code and duration
      if (statusCode >= 500) {
        logger.error(logPayload, 'Request completed with server error')
      } else if (statusCode >= 400) {
        logger.warn(logPayload, 'Request completed with client error')
      } else if (duration > 1000) {
        logger.warn(logPayload, 'Slow request detected')
      } else {
        logger.info(logPayload, 'Request completed')
      }
    }
  }
}
