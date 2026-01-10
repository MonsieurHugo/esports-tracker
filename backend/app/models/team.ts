import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Organization from './organization.js'
import PlayerContract from './player_contract.js'

export default class Team extends BaseModel {
  static table = 'teams'

  @column({ isPrimary: true })
  declare teamId: number

  @column()
  declare orgId: number

  @column()
  declare gameId: number

  @column()
  declare slug: string

  @column()
  declare currentName: string

  @column()
  declare shortName: string

  @column()
  declare region: string | null

  @column()
  declare division: string | null

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Organization, { foreignKey: 'orgId' })
  declare organization: BelongsTo<typeof Organization>

  @hasMany(() => PlayerContract, { foreignKey: 'teamId' })
  declare contracts: HasMany<typeof PlayerContract>
}
