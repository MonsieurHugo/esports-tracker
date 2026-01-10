import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import LolMatchStat from './lol_match_stat.js'

export default class LolMatch extends BaseModel {
  static table = 'lol_matches'

  @column({ isPrimary: true })
  declare matchId: string

  @column.dateTime()
  declare gameStart: DateTime

  @column()
  declare gameDuration: number

  @column()
  declare queueId: number

  @column()
  declare gameVersion: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @hasMany(() => LolMatchStat, { foreignKey: 'matchId' })
  declare stats: HasMany<typeof LolMatchStat>
}
