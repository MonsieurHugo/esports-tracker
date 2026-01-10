import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Split extends BaseModel {
  static table = 'splits'

  @column({ isPrimary: true })
  declare splitId: number

  @column()
  declare season: number

  @column()
  declare splitNumber: number

  @column()
  declare name: string

  @column.date()
  declare startDate: DateTime

  @column.date()
  declare endDate: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
