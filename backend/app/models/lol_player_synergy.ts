import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import LolAccount from './lol_account.js'

export default class LolPlayerSynergy extends BaseModel {
  static table = 'lol_player_synergy'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare puuid: string

  @column()
  declare allyPuuid: string

  @column()
  declare gamesTogether: number

  @column()
  declare winsTogether: number

  @column()
  declare gamesAgainst: number

  @column()
  declare winsAgainst: number

  @column.dateTime({ autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => LolAccount, { foreignKey: 'puuid' })
  declare account: BelongsTo<typeof LolAccount>
}
