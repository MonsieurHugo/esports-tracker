import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class League extends BaseModel {
  static table = 'leagues'

  @column({ isPrimary: true })
  declare leagueId: number

  @column()
  declare name: string

  @column()
  declare shortName: string

  @column()
  declare region: string

  @column()
  declare tier: number

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
