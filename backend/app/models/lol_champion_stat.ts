import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolChampionStat extends BaseModel {
  static table = 'lol_champion_stats'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare puuid: string

  @column()
  declare championId: number

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
  declare totalCs: number

  @column()
  declare totalDamage: number

  @column()
  declare bestKda: number | null

  @column()
  declare bestKdaMatchId: string | null

  @column.dateTime()
  declare lastPlayed: DateTime | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
