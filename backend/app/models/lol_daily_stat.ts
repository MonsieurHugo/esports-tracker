import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolDailyStat extends BaseModel {
  static table = 'lol_daily_stats'
  static selfAssignPrimaryKey = false

  /**
   * Disable automatic timestamps since the table doesn't have created_at/updated_at columns
   */
  static get createdAtColumn() {
    return null
  }

  static get updatedAtColumn() {
    return null
  }

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare puuid: string

  @column.date()
  declare date: DateTime

  @column()
  declare gamesPlayed: number

  @column()
  declare wins: number

  @column()
  declare totalKills: number

  @column()
  declare totalDeaths: number

  @column()
  declare totalAssists: number

  @column()
  declare totalGameDuration: number | null

  @column()
  declare tier: string | null

  @column()
  declare rank: string | null

  @column()
  declare lp: number

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
