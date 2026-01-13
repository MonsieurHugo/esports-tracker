import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import auditService from '#services/audit_service'
import tokenService from '#services/token_service'
import totpService from '#services/totp_service'
import emailService from '#services/email_service'
import { resetRateLimit } from '#middleware/rate_limit_middleware'
import {
  loginValidator,
  registerValidator,
  adminCreateUserValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  setupTwoFactorValidator,
  verifyTwoFactorValidator,
  disableTwoFactorValidator,
  updateProfileValidator,
} from '#validators/auth_validators'

// Configuration
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 30

export default class AuthController {
  /**
   * Get client IP from request
   */
  private getClientIp(ctx: HttpContext): string {
    const forwarded = ctx.request.header('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return ctx.request.ip() || 'unknown'
  }

  /**
   * Login user and create session
   * POST /api/auth/login
   */
  async login({ request, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const payload = await loginValidator.validate(request.all())

    // Find user by email
    const user = await User.findBy('email', payload.email)

    if (!user) {
      await auditService.logFailedLogin(payload.email, 'User not found', ctx)
      return response.unauthorized({ error: 'Email ou mot de passe incorrect' })
    }

    // Check if account is locked
    if (user.isLocked) {
      await auditService.logFailedLogin(payload.email, 'Account locked', ctx, user.id)
      const unlockTime = user.lockedUntil?.toFormat('HH:mm') || ''
      return response.status(423).json({
        error: `Compte verrouillé suite à trop de tentatives. Réessayez après ${unlockTime}.`,
        lockedUntil: user.lockedUntil?.toISO(),
      })
    }

    // Verify password
    const isPasswordValid = await hash.verify(user.password, payload.password)

    if (!isPasswordValid) {
      // Increment failed attempts
      user.failedLoginAttempts++

      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = DateTime.now().plus({ minutes: LOCKOUT_DURATION_MINUTES })
        await user.save()
        await auditService.logAccountLocked(user.id, ctx, 'Too many failed login attempts')
        return response.status(423).json({
          error: `Compte verrouillé suite à trop de tentatives. Réessayez dans ${LOCKOUT_DURATION_MINUTES} minutes.`,
          lockedUntil: user.lockedUntil.toISO(),
        })
      }

      await user.save()
      await auditService.logFailedLogin(payload.email, 'Invalid password', ctx, user.id)

      const attemptsRemaining = MAX_FAILED_ATTEMPTS - user.failedLoginAttempts
      return response.unauthorized({
        error: 'Email ou mot de passe incorrect',
        attemptsRemaining,
      })
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      // Check for recovery code first
      if (payload.recoveryCode) {
        const recoveryCodes = user.recoveryCodes
        const remainingCodes = totpService.verifyRecoveryCode(payload.recoveryCode, recoveryCodes)

        if (!remainingCodes) {
          await auditService.log2FAFailed(user.id, ctx, 'Invalid recovery code')
          return response.unauthorized({ error: 'Code de récupération invalide' })
        }

        // Update remaining recovery codes
        user.twoFactorRecoveryCodes = JSON.stringify(remainingCodes)
        await user.save()
      } else if (payload.twoFactorCode) {
        // Verify TOTP code
        if (!user.twoFactorSecret) {
          return response.internalServerError({ error: '2FA mal configurée' })
        }

        if (!totpService.verify(user.twoFactorSecret, payload.twoFactorCode)) {
          await auditService.log2FAFailed(user.id, ctx, 'Invalid TOTP code')
          return response.unauthorized({ error: 'Code 2FA invalide' })
        }

        await auditService.log2FAVerified(user.id, ctx)
      } else {
        // 2FA required but no code provided
        return response.status(403).json({
          error: 'Code 2FA requis',
          requires2FA: true,
          userId: user.id,
        })
      }
    }

    // Successful login - reset failed attempts and update login info
    user.failedLoginAttempts = 0
    user.lockedUntil = null
    user.lastLoginAt = DateTime.now()
    user.lastLoginIp = this.getClientIp(ctx)
    await user.save()

    // Reset rate limit for this IP
    await resetRateLimit('login', this.getClientIp(ctx))

    // Create session
    await auth.use('web').login(user)

    // Log successful login
    await auditService.logLogin(user.id, ctx)

    return response.ok({
      success: true,
      user: user.serializeForAuth(),
    })
  }

  /**
   * Register a new user (public)
   * POST /api/auth/register
   */
  async register({ request, response }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const payload = await registerValidator.validate(request.all())

    // Check if email already exists
    const existingUser = await User.findBy('email', payload.email)
    if (existingUser) {
      return response.conflict({ error: 'Cet email est déjà utilisé' })
    }

    // Create user
    const user = await User.create({
      email: payload.email,
      password: payload.password,
      fullName: payload.fullName || null,
      role: 'user',
      emailVerified: false,
    })

    // Create email verification token
    const verificationToken = await tokenService.createEmailVerificationToken(user)

    // Log registration
    await auditService.logRegister(user.id, ctx)

    // Reset rate limit for this IP
    await resetRateLimit('register', this.getClientIp(ctx))

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationToken, user.fullName || undefined)

    // In development, also return the token for testing
    const isDev = process.env.NODE_ENV === 'development'

    return response.created({
      success: true,
      message: 'Compte créé. Veuillez vérifier votre email.',
      user: user.serializeForAuth(),
      ...(isDev && { verificationToken }), // Only include in development
    })
  }

  /**
   * Logout user and destroy session
   * POST /api/auth/logout
   */
  async logout({ response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const user = auth.user

    if (user) {
      await auditService.logLogout(user.id, ctx)
    }

    await auth.use('web').logout()
    return response.ok({ success: true })
  }

  /**
   * Get current authenticated user
   * GET /api/auth/me
   */
  async me({ response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    return response.ok(user.serializeForAuth())
  }

  /**
   * Change password for current user
   * POST /api/auth/change-password
   */
  async changePassword({ request, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await changePasswordValidator.validate(request.all())

    // Verify current password
    const isValid = await hash.verify(user.password, payload.currentPassword)
    if (!isValid) {
      return response.badRequest({ error: 'Mot de passe actuel incorrect' })
    }

    // Update password
    user.password = payload.newPassword
    await user.save()

    // Log password change
    await auditService.logPasswordChange(user.id, ctx)

    return response.ok({ success: true, message: 'Mot de passe mis à jour' })
  }

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  async forgotPassword({ request, response }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const payload = await forgotPasswordValidator.validate(request.all())

    const user = await User.findBy('email', payload.email)

    // Always return success to prevent email enumeration
    const successMessage = 'Si cet email existe, un lien de réinitialisation a été envoyé.'

    if (!user) {
      return response.ok({ success: true, message: successMessage })
    }

    // Create password reset token
    const resetToken = await tokenService.createPasswordResetToken(user)

    // Log password reset request
    await auditService.logPasswordResetRequest(payload.email, ctx, user.id)

    // Reset rate limit for this IP
    await resetRateLimit('passwordReset', this.getClientIp(ctx))

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.email, resetToken, user.fullName || undefined)

    // In development, also return the token for testing
    const isDev = process.env.NODE_ENV === 'development'

    return response.ok({
      success: true,
      message: successMessage,
      ...(isDev && { resetToken }), // Only include in development
    })
  }

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  async resetPassword({ request, response }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const payload = await resetPasswordValidator.validate(request.all())

    // Verify token and get user
    const user = await tokenService.verifyPasswordResetToken(payload.token)

    if (!user) {
      return response.badRequest({ error: 'Token invalide ou expiré' })
    }

    // Update password and unlock account
    user.password = payload.password
    user.failedLoginAttempts = 0
    user.lockedUntil = null
    await user.save()

    // Log password reset
    await auditService.logPasswordReset(user.id, ctx)

    return response.ok({ success: true, message: 'Mot de passe réinitialisé' })
  }

  /**
   * Verify email with token
   * POST /api/auth/verify-email
   */
  async verifyEmail({ request, response }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const payload = await verifyEmailValidator.validate(request.all())

    // Verify token and get user
    const user = await tokenService.verifyEmailVerificationToken(payload.token)

    if (!user) {
      return response.badRequest({ error: 'Token invalide ou expiré' })
    }

    // Mark email as verified
    user.emailVerified = true
    user.emailVerifiedAt = DateTime.now()
    await user.save()

    // Log email verification
    await auditService.logEmailVerification(user.id, ctx)

    return response.ok({ success: true, message: 'Email vérifié' })
  }

  /**
   * Resend email verification
   * POST /api/auth/resend-verification
   */
  async resendVerification({ response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    if (user.emailVerified) {
      return response.badRequest({ error: 'Email déjà vérifié' })
    }

    // Create new verification token
    const verificationToken = await tokenService.createEmailVerificationToken(user)

    // Send verification email
    await emailService.sendVerificationEmail(user.email, verificationToken, user.fullName || undefined)

    // In development, also return the token for testing
    const isDev = process.env.NODE_ENV === 'development'

    return response.ok({
      success: true,
      message: 'Email de vérification envoyé',
      ...(isDev && { verificationToken }),
    })
  }

  // ==================== 2FA Methods ====================

  /**
   * Setup 2FA - generate secret and QR code
   * POST /api/auth/2fa/setup
   */
  async setup2FA({ request, response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await setupTwoFactorValidator.validate(request.all())

    // Verify password
    const isValid = await hash.verify(user.password, payload.password)
    if (!isValid) {
      return response.badRequest({ error: 'Mot de passe incorrect' })
    }

    if (user.twoFactorEnabled) {
      return response.badRequest({ error: '2FA déjà activée' })
    }

    // Generate secret
    const secret = totpService.generateSecret()
    const qrCodeUri = totpService.generateQRCodeUri(secret, user.email)

    // Store secret temporarily (not enabled yet)
    user.twoFactorSecret = secret
    await user.save()

    return response.ok({
      success: true,
      secret,
      qrCodeUri,
      message: 'Scannez le QR code avec votre application authenticator, puis vérifiez avec un code.',
    })
  }

  /**
   * Verify and enable 2FA
   * POST /api/auth/2fa/verify
   */
  async verify2FA({ request, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await verifyTwoFactorValidator.validate(request.all())

    if (user.twoFactorEnabled) {
      return response.badRequest({ error: '2FA déjà activée' })
    }

    if (!user.twoFactorSecret) {
      return response.badRequest({ error: 'Initialisez d\'abord la 2FA' })
    }

    // Verify code
    if (!totpService.verify(user.twoFactorSecret, payload.code)) {
      await auditService.log2FAFailed(user.id, ctx, 'Invalid verification code')
      return response.badRequest({ error: 'Code invalide' })
    }

    // Generate recovery codes
    const recoveryCodes = totpService.generateRecoveryCodes()

    // Enable 2FA
    user.twoFactorEnabled = true
    user.twoFactorRecoveryCodes = JSON.stringify(recoveryCodes)
    await user.save()

    // Log 2FA enabled
    await auditService.log2FAEnabled(user.id, ctx)

    return response.ok({
      success: true,
      message: '2FA activée',
      recoveryCodes,
      warning: 'Sauvegardez ces codes de récupération. Ils ne seront plus affichés.',
    })
  }

  /**
   * Disable 2FA
   * POST /api/auth/2fa/disable
   */
  async disable2FA({ request, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await disableTwoFactorValidator.validate(request.all())

    if (!user.twoFactorEnabled) {
      return response.badRequest({ error: '2FA non activée' })
    }

    // Verify password
    const isPasswordValid = await hash.verify(user.password, payload.password)
    if (!isPasswordValid) {
      return response.badRequest({ error: 'Mot de passe incorrect' })
    }

    // Verify 2FA code
    if (!user.twoFactorSecret || !totpService.verify(user.twoFactorSecret, payload.code)) {
      await auditService.log2FAFailed(user.id, ctx, 'Invalid code for disable')
      return response.badRequest({ error: 'Code 2FA invalide' })
    }

    // Disable 2FA
    user.twoFactorEnabled = false
    user.twoFactorSecret = null
    user.twoFactorRecoveryCodes = null
    await user.save()

    // Log 2FA disabled
    await auditService.log2FADisabled(user.id, ctx)

    return response.ok({ success: true, message: '2FA désactivée' })
  }

  /**
   * Get new recovery codes (regenerate)
   * POST /api/auth/2fa/recovery-codes
   */
  async regenerateRecoveryCodes({ request, response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await setupTwoFactorValidator.validate(request.all())

    // Verify password
    const isValid = await hash.verify(user.password, payload.password)
    if (!isValid) {
      return response.badRequest({ error: 'Mot de passe incorrect' })
    }

    if (!user.twoFactorEnabled) {
      return response.badRequest({ error: '2FA non activée' })
    }

    // Generate new recovery codes
    const recoveryCodes = totpService.generateRecoveryCodes()
    user.twoFactorRecoveryCodes = JSON.stringify(recoveryCodes)
    await user.save()

    return response.ok({
      success: true,
      recoveryCodes,
      warning: 'Sauvegardez ces nouveaux codes de récupération. Les anciens codes sont invalidés.',
    })
  }

  // ==================== Profile Methods ====================

  /**
   * Update user profile
   * PATCH /api/auth/profile
   */
  async updateProfile({ request, response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const payload = await updateProfileValidator.validate(request.all())

    if (payload.fullName !== undefined) {
      user.fullName = payload.fullName
    }

    await user.save()

    return response.ok({
      success: true,
      user: user.serializeForAuth(),
    })
  }

  /**
   * Get user's audit logs
   * GET /api/auth/audit-logs
   */
  async auditLogs({ response, auth }: HttpContext) {
    const user = auth.user

    if (!user) {
      return response.unauthorized({ error: 'Non authentifié' })
    }

    const logs = await auditService.getUserLogs(user.id, 50)

    return response.ok(logs)
  }

  // ==================== Admin Methods ====================

  /**
   * List all users (admin only)
   * GET /api/auth/users
   */
  async listUsers({ response, auth }: HttpContext) {
    const currentUser = auth.user
    if (!currentUser || currentUser.role !== 'admin') {
      return response.forbidden({ error: 'Accès refusé' })
    }

    const users = await User.query()
      .select('id', 'email', 'fullName', 'role', 'emailVerified', 'twoFactorEnabled', 'createdAt', 'lastLoginAt')
      .orderBy('createdAt', 'desc')

    return response.ok(users)
  }

  /**
   * Create a user (admin only)
   * POST /api/auth/users
   */
  async createUser({ request, response, auth }: HttpContext) {
    const currentUser = auth.user
    if (!currentUser || currentUser.role !== 'admin') {
      return response.forbidden({ error: 'Accès refusé' })
    }

    const payload = await adminCreateUserValidator.validate(request.all())

    // Check if user already exists
    const existingUser = await User.findBy('email', payload.email)
    if (existingUser) {
      return response.conflict({ error: 'Cet email est déjà utilisé' })
    }

    const user = await User.create({
      email: payload.email,
      password: payload.password,
      fullName: payload.fullName || null,
      role: payload.role || 'user',
      emailVerified: true, // Admin-created users are pre-verified
    })

    return response.created({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    })
  }

  /**
   * Delete a user (admin only)
   * DELETE /api/auth/users/:id
   */
  async deleteUser({ params, response, auth }: HttpContext) {
    const currentUser = auth.user
    if (!currentUser || currentUser.role !== 'admin') {
      return response.forbidden({ error: 'Accès refusé' })
    }

    // Prevent self-deletion
    if (currentUser.id === Number(params.id)) {
      return response.badRequest({ error: 'Vous ne pouvez pas supprimer votre propre compte' })
    }

    const user = await User.find(params.id)
    if (!user) {
      return response.notFound({ error: 'Utilisateur non trouvé' })
    }

    await user.delete()
    return response.ok({ success: true })
  }

  /**
   * Unlock a user account (admin only)
   * POST /api/auth/users/:id/unlock
   */
  async unlockUser({ params, response, auth }: HttpContext) {
    const ctx = arguments[0] as HttpContext
    const currentUser = auth.user
    if (!currentUser || currentUser.role !== 'admin') {
      return response.forbidden({ error: 'Accès refusé' })
    }

    const user = await User.find(params.id)
    if (!user) {
      return response.notFound({ error: 'Utilisateur non trouvé' })
    }

    user.failedLoginAttempts = 0
    user.lockedUntil = null
    await user.save()

    await auditService.logAccountUnlocked(user.id, ctx)

    return response.ok({ success: true, message: 'Compte déverrouillé' })
  }
}
