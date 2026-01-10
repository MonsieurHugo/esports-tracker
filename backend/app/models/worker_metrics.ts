import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WorkerMetrics extends BaseModel {
  static table = 'worker_metrics_hourly'

  @column({ isPrimary: true })
  declare id: number

  @column.dateTime()
  declare hour: DateTime

  @column()
  declare lolMatchesAdded: number

  @column()
  declare valorantMatchesAdded: number

  @column()
  declare lolAccountsProcessed: number

  @column()
  declare valorantAccountsProcessed: number

  @column()
  declare apiRequestsMade: number

  @column()
  declare apiErrors: number
}
