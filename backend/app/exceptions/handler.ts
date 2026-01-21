import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (error, { response }) => {
      return response.status(404).json({
        error: 'Not Found',
        message: error.message,
      })
    },
    '500..599': (error, { response }) => {
      return response.status(error.status || 500).json({
        error: 'Server Error',
        message: app.inProduction ? 'Internal Server Error' : error.message,
      })
    },
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    const err = error as Error
    logger.error({ err, path: ctx.request.url(), method: ctx.request.method() }, 'Unhandled exception')
    return super.report(error, ctx)
  }

  /**
   * The method is used to convert exception to a HTTP response.
   */
  async handle(error: unknown, ctx: HttpContext) {
    // Always return JSON for API
    const err = error as Error & { status?: number; code?: string }
    const status = err.status || 500

    // In production, mask internal error details to prevent information leakage
    const isServerError = status >= 500
    const message = app.inProduction && isServerError
      ? 'Internal Server Error'
      : (err.message || 'An unexpected error occurred')

    return ctx.response.status(status).json({
      error: err.code || 'Error',
      message,
    })
  }
}
