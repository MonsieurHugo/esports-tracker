import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

export type OAuthProvider = 'google' | 'github' | 'discord'

export default class OAuthAccount extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare provider: OAuthProvider

  @column()
  declare providerUserId: string

  @column()
  declare providerEmail: string | null

  @column({ serializeAs: null })
  declare accessToken: string | null

  @column({ serializeAs: null })
  declare refreshToken: string | null

  @column.dateTime()
  declare tokenExpiresAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
