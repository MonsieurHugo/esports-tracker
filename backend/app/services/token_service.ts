import { randomBytes, createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import PasswordResetToken from '#models/password_reset_token'
import EmailVerificationToken from '#models/email_verification_token'
import User from '#models/user'

class TokenService {
  /**
   * Generate a secure random token
   */
  generateToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Hash a token for secure storage
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  // ==================== Password Reset Tokens ====================

  /**
   * Create a password reset token for a user
   * Invalidates any existing tokens for the user
   */
  async createPasswordResetToken(user: User): Promise<string> {
    // Delete any existing tokens for this user
    await PasswordResetToken.query().where('userId', user.id).delete()

    // Generate new token
    const token = this.generateToken()
    const hashedToken = this.hashToken(token)

    // Create token record (expires in 1 hour)
    await PasswordResetToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt: DateTime.now().plus({ hours: 1 }),
    })

    return token
  }

  /**
   * Verify and consume a password reset token
   * Returns the user if valid, null otherwise
   */
  async verifyPasswordResetToken(token: string): Promise<User | null> {
    const hashedToken = this.hashToken(token)

    const tokenRecord = await PasswordResetToken.query()
      .where('token', hashedToken)
      .preload('user')
      .first()

    if (!tokenRecord) {
      return null
    }

    // Check if expired
    if (tokenRecord.isExpired) {
      await tokenRecord.delete()
      return null
    }

    // Delete the token (single use)
    await tokenRecord.delete()

    return tokenRecord.user
  }

  /**
   * Clean up expired password reset tokens
   */
  async cleanupPasswordResetTokens(): Promise<number> {
    const result = await PasswordResetToken.query()
      .where('expiresAt', '<', DateTime.now().toSQL())
      .delete()

    return Array.isArray(result) ? result.length : 0
  }

  // ==================== Email Verification Tokens ====================

  /**
   * Create an email verification token for a user
   * Invalidates any existing tokens for the user
   */
  async createEmailVerificationToken(user: User): Promise<string> {
    // Delete any existing tokens for this user
    await EmailVerificationToken.query().where('userId', user.id).delete()

    // Generate new token
    const token = this.generateToken()
    const hashedToken = this.hashToken(token)

    // Create token record (expires in 24 hours)
    await EmailVerificationToken.create({
      userId: user.id,
      token: hashedToken,
      expiresAt: DateTime.now().plus({ hours: 24 }),
    })

    return token
  }

  /**
   * Verify and consume an email verification token
   * Returns the user if valid, null otherwise
   */
  async verifyEmailVerificationToken(token: string): Promise<User | null> {
    const hashedToken = this.hashToken(token)

    const tokenRecord = await EmailVerificationToken.query()
      .where('token', hashedToken)
      .preload('user')
      .first()

    if (!tokenRecord) {
      return null
    }

    // Check if expired
    if (tokenRecord.isExpired) {
      await tokenRecord.delete()
      return null
    }

    // Delete the token (single use)
    await tokenRecord.delete()

    return tokenRecord.user
  }

  /**
   * Clean up expired email verification tokens
   */
  async cleanupEmailVerificationTokens(): Promise<number> {
    const result = await EmailVerificationToken.query()
      .where('expiresAt', '<', DateTime.now().toSQL())
      .delete()

    return Array.isArray(result) ? result.length : 0
  }

  /**
   * Clean up all expired tokens
   */
  async cleanupAllExpiredTokens(): Promise<{ passwordReset: number; emailVerification: number }> {
    const [passwordReset, emailVerification] = await Promise.all([
      this.cleanupPasswordResetTokens(),
      this.cleanupEmailVerificationTokens(),
    ])

    return { passwordReset, emailVerification }
  }
}

// Export singleton instance
const tokenService = new TokenService()
export default tokenService
