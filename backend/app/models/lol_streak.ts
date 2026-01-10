import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolStreak extends BaseModel {
  static table = 'lol_streaks'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare puuid: string

  @column()
  declare currentStreak: number

  @column.dateTime()
  declare currentStreakStart: DateTime | null

  @column()
  declare bestWinStreak: number

  @column.dateTime()
  declare bestWinStreakStart: DateTime | null

  @column.dateTime()
  declare bestWinStreakEnd: DateTime | null

  @column()
  declare worstLossStreak: number

  @column.dateTime()
  declare worstLossStreakStart: DateTime | null

  @column.dateTime()
  declare worstLossStreakEnd: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
