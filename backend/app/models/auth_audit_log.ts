import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type AuditAction =
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'register'
  | 'password_reset_request'
  | 'password_reset'
  | 'password_change'
  | 'email_verification'
  | '2fa_enabled'
  | '2fa_disabled'
  | '2fa_verified'
  | '2fa_failed'
  | 'oauth_login'
  | 'oauth_linked'
  | 'oauth_unlinked'
  | 'account_locked'
  | 'account_unlocked'

export default class AuthAuditLog extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare action: AuditAction

  @column()
  declare ipAddress: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare success: boolean

  @column()
  declare reason: string | null

  @column({
    prepare: (value) => JSON.stringify(value),
    consume: (value) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare metadata: Record<string, unknown> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
