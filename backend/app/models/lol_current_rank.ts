import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolCurrentRank extends BaseModel {
  static table = 'lol_current_ranks'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare puuid: string

  @column()
  declare queueType: string

  @column()
  declare tier: string | null

  @column()
  declare rank: string | null

  @column()
  declare leaguePoints: number

  @column()
  declare wins: number

  @column()
  declare losses: number

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
