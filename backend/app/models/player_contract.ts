import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Player from './player.js'
import Team from './team.js'

export default class PlayerContract extends BaseModel {
  static table = 'player_contracts'

  @column({ isPrimary: true })
  declare contractId: number

  @column()
  declare playerId: number

  @column()
  declare teamId: number

  @column()
  declare role: string | null

  @column()
  declare isStarter: boolean

  @column.date()
  declare startDate: DateTime | null

  @column.date()
  declare endDate: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Player, { foreignKey: 'playerId' })
  declare player: BelongsTo<typeof Player>

  @belongsTo(() => Team, { foreignKey: 'teamId' })
  declare team: BelongsTo<typeof Team>
}
