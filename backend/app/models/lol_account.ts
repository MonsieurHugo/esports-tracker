import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import Player from './player.js'
import LolMatchStat from './lol_match_stat.js'
import LolDailyStat from './lol_daily_stat.js'
import LolCurrentRank from './lol_current_rank.js'
import LolStreak from './lol_streak.js'

export default class LolAccount extends BaseModel {
  static table = 'lol_accounts'

  @column({ isPrimary: true })
  declare accountId: number

  @column()
  declare puuid: string | null

  @column()
  declare playerId: number

  @column()
  declare gameName: string | null

  @column()
  declare tagLine: string | null

  @column()
  declare region: string

  @column()
  declare isPrimary: boolean

  @column.dateTime()
  declare lastFetchedAt: DateTime | null

  @column.dateTime()
  declare lastMatchAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Player, { foreignKey: 'playerId' })
  declare player: BelongsTo<typeof Player>

  @hasMany(() => LolMatchStat, { foreignKey: 'puuid', localKey: 'puuid' })
  declare matchStats: HasMany<typeof LolMatchStat>

  @hasMany(() => LolDailyStat, { foreignKey: 'puuid', localKey: 'puuid' })
  declare dailyStats: HasMany<typeof LolDailyStat>

  @hasOne(() => LolCurrentRank, { foreignKey: 'puuid', localKey: 'puuid' })
  declare currentRank: HasOne<typeof LolCurrentRank>

  @hasOne(() => LolStreak, { foreignKey: 'puuid', localKey: 'puuid' })
  declare streak: HasOne<typeof LolStreak>
}
