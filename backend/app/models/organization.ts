import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Team from './team.js'

export default class Organization extends BaseModel {
  static table = 'organizations'

  @column({ isPrimary: true })
  declare orgId: number

  @column()
  declare slug: string

  @column()
  declare currentName: string

  @column()
  declare currentShortName: string | null

  @column()
  declare logoUrl: string | null

  @column()
  declare country: string | null

  @column()
  declare twitter: string | null

  @column()
  declare website: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Team, { foreignKey: 'orgId' })
  declare teams: HasMany<typeof Team>
}
