import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolMatch from './lol_match.js'
import LolAccount from './lol_account.js'

export default class LolMatchStat extends BaseModel {
  static table = 'lol_match_stats'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare matchId: string

  @column()
  declare puuid: string

  @column()
  declare championId: number

  @column()
  declare win: boolean

  @column()
  declare kills: number

  @column()
  declare deaths: number

  @column()
  declare assists: number

  @column()
  declare cs: number

  @column()
  declare visionScore: number

  @column()
  declare damageDealt: number

  @column()
  declare goldEarned: number

  @column()
  declare role: string | null

  @column()
  declare teamId: number | null

  @belongsTo(() => LolMatch, { foreignKey: 'matchId' })
  declare match: BelongsTo<typeof LolMatch>

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
