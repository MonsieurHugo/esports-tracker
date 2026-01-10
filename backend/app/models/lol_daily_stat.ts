import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolDailyStat extends BaseModel {
  static table = 'lol_daily_stats'

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
  declare soloqGames: number

  @column()
  declare flexGames: number

  @column()
  declare totalKills: number

  @column()
  declare totalDeaths: number

  @column()
  declare totalAssists: number

  @column()
  declare totalCs: number

  @column()
  declare totalDamage: number

  @column()
  declare totalGameDuration: number | null

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
