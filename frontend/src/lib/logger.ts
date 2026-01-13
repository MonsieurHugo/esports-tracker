/**
 * Centralized logging utility for the frontend application.
 *
 * In development: logs to console
 * In production: silences logs (or could send to monitoring service like Sentry)
 */

const isDev = process.env.NODE_ENV === 'development'

interface LogContext {
  [key: string]: unknown
}

/**
 * Logs errors with optional context.
 * In production, this could be extended to send errors to a monitoring service.
 */
export function logError(message: string, error?: unknown, context?: LogContext): void {
  if (isDev) {
    console.error(`[ERROR] ${message}`, error, context)
  }
  // In production, you could send to Sentry, LogRocket, etc.
  // if (!isDev && typeof window !== 'undefined') {
  //   Sentry.captureException(error, { extra: { message, ...context } })
  // }
}

/**
 * Logs warnings in development only.
 */
export function logWarn(message: string, context?: LogContext): void {
  if (isDev) {
    console.warn(`[WARN] ${message}`, context)
  }
}

/**
 * Logs debug information in development only.
 */
export function logDebug(message: string, context?: LogContext): void {
  if (isDev) {
    console.debug(`[DEBUG] ${message}`, context)
  }
}

/**
 * Logs info in development only.
 */
export function logInfo(message: string, context?: LogContext): void {
  if (isDev) {
    console.info(`[INFO] ${message}`, context)
  }
}

export const logger = {
  error: logError,
  warn: logWarn,
  debug: logDebug,
  info: logInfo,
}

export default logger
