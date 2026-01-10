import type { HttpContext } from '@adonisjs/core/http'
import AuthAuditLog, { type AuditAction } from '#models/auth_audit_log'
import logger from '@adonisjs/core/services/logger'

interface AuditLogParams {
  userId?: number | null
  action: AuditAction
  success?: boolean
  reason?: string | null
  metadata?: Record<string, unknown> | null
  ctx?: HttpContext
}

class AuditService {
  /**
   * Get client IP from request context
   */
  private getClientIp(ctx?: HttpContext): string | null {
    if (!ctx) return null
    const forwarded = ctx.request.header('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return ctx.request.ip() || null
  }

  /**
   * Get user agent from request context
   */
  private getUserAgent(ctx?: HttpContext): string | null {
    if (!ctx) return null
    return ctx.request.header('user-agent') || null
  }

  /**
   * Log an authentication event
   */
  async log(params: AuditLogParams): Promise<AuthAuditLog> {
    const { userId, action, success = true, reason = null, metadata = null, ctx } = params

    try {
      const log = await AuthAuditLog.create({
        userId,
        action,
        ipAddress: this.getClientIp(ctx),
        userAgent: this.getUserAgent(ctx),
        success,
        reason,
        metadata,
      })

      // Also log to application logger for monitoring
      const logData = {
        userId,
        action,
        success,
        reason,
        ip: log.ipAddress,
      }

      if (success) {
        logger.info(logData, `[AUTH] ${action}`)
      } else {
        logger.warn(logData, `[AUTH] ${action} failed`)
      }

      return log
    } catch (error) {
      // Don't let audit logging failures break the application
      logger.error({ error, params }, '[AUDIT] Failed to create audit log')
      throw error
    }
  }

  /**
   * Log a successful login
   */
  async logLogin(userId: number, ctx: HttpContext, provider?: string): Promise<void> {
    await this.log({
      userId,
      action: provider ? 'oauth_login' : 'login',
      success: true,
      metadata: provider ? { provider } : null,
      ctx,
    })
  }

  /**
   * Log a failed login attempt
   */
  async logFailedLogin(
    email: string,
    reason: string,
    ctx: HttpContext,
    userId?: number
  ): Promise<void> {
    await this.log({
      userId: userId || null,
      action: 'failed_login',
      success: false,
      reason,
      metadata: { email },
      ctx,
    })
  }

  /**
   * Log a logout
   */
  async logLogout(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'logout',
      success: true,
      ctx,
    })
  }

  /**
   * Log a registration
   */
  async logRegister(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'register',
      success: true,
      ctx,
    })
  }

  /**
   * Log a password reset request
   */
  async logPasswordResetRequest(email: string, ctx: HttpContext, userId?: number): Promise<void> {
    await this.log({
      userId: userId || null,
      action: 'password_reset_request',
      success: true,
      metadata: { email },
      ctx,
    })
  }

  /**
   * Log a password reset
   */
  async logPasswordReset(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'password_reset',
      success: true,
      ctx,
    })
  }

  /**
   * Log a password change
   */
  async logPasswordChange(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'password_change',
      success: true,
      ctx,
    })
  }

  /**
   * Log email verification
   */
  async logEmailVerification(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'email_verification',
      success: true,
      ctx,
    })
  }

  /**
   * Log 2FA enabled
   */
  async log2FAEnabled(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: '2fa_enabled',
      success: true,
      ctx,
    })
  }

  /**
   * Log 2FA disabled
   */
  async log2FADisabled(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: '2fa_disabled',
      success: true,
      ctx,
    })
  }

  /**
   * Log 2FA verification success
   */
  async log2FAVerified(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: '2fa_verified',
      success: true,
      ctx,
    })
  }

  /**
   * Log 2FA verification failure
   */
  async log2FAFailed(userId: number, ctx: HttpContext, reason: string): Promise<void> {
    await this.log({
      userId,
      action: '2fa_failed',
      success: false,
      reason,
      ctx,
    })
  }

  /**
   * Log OAuth account linked
   */
  async logOAuthLinked(userId: number, provider: string, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'oauth_linked',
      success: true,
      metadata: { provider },
      ctx,
    })
  }

  /**
   * Log OAuth account unlinked
   */
  async logOAuthUnlinked(userId: number, provider: string, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'oauth_unlinked',
      success: true,
      metadata: { provider },
      ctx,
    })
  }

  /**
   * Log account locked
   */
  async logAccountLocked(userId: number, ctx: HttpContext, reason: string): Promise<void> {
    await this.log({
      userId,
      action: 'account_locked',
      success: true,
      reason,
      ctx,
    })
  }

  /**
   * Log account unlocked
   */
  async logAccountUnlocked(userId: number, ctx: HttpContext): Promise<void> {
    await this.log({
      userId,
      action: 'account_unlocked',
      success: true,
      ctx,
    })
  }

  /**
   * Get recent audit logs for a user
   */
  async getUserLogs(userId: number, limit: number = 50): Promise<AuthAuditLog[]> {
    return AuthAuditLog.query()
      .where('userId', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
  }

  /**
   * Get recent failed login attempts for an IP
   */
  async getFailedLoginAttempts(ip: string, minutes: number = 15): Promise<number> {
    const since = new Date(Date.now() - minutes * 60 * 1000)
    const count = await AuthAuditLog.query()
      .where('action', 'failed_login')
      .where('ipAddress', ip)
      .where('createdAt', '>=', since)
      .count('* as total')
      .first()

    return Number(count?.$extras.total || 0)
  }
}

// Export singleton instance
const auditService = new AuditService()
export default auditService
