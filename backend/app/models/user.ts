import { DateTime } from 'luxon'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import OAuthAccount from './oauth_account.js'
import AuthAuditLog from './auth_audit_log.js'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string | null

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare role: 'user' | 'admin'

  // Email verification
  @column()
  declare emailVerified: boolean

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  // 2FA
  @column()
  declare twoFactorEnabled: boolean

  @column({ serializeAs: null })
  declare twoFactorSecret: string | null

  @column({ serializeAs: null })
  declare twoFactorRecoveryCodes: string | null // JSON string of recovery codes

  // Security
  @column()
  declare failedLoginAttempts: number

  @column.dateTime()
  declare lockedUntil: DateTime | null

  @column.dateTime()
  declare lastLoginAt: DateTime | null

  @column()
  declare lastLoginIp: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  // Relationships
  @hasMany(() => OAuthAccount)
  declare oauthAccounts: HasMany<typeof OAuthAccount>

  @hasMany(() => AuthAuditLog)
  declare auditLogs: HasMany<typeof AuthAuditLog>

  // Password hashing is handled automatically by the withAuthFinder mixin

  /**
   * Check if the account is locked
   */
  get isLocked(): boolean {
    if (!this.lockedUntil) return false
    return this.lockedUntil > DateTime.now()
  }

  /**
   * Get parsed 2FA recovery codes
   */
  get recoveryCodes(): string[] {
    if (!this.twoFactorRecoveryCodes) return []
    try {
      return JSON.parse(this.twoFactorRecoveryCodes)
    } catch {
      return []
    }
  }

  /**
   * Serialize user data for API responses
   */
  serializeForAuth() {
    return {
      id: this.id,
      email: this.email,
      fullName: this.fullName,
      role: this.role,
      emailVerified: this.emailVerified,
      twoFactorEnabled: this.twoFactorEnabled,
    }
  }
}
