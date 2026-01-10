import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WorkerLog extends BaseModel {
  static table = 'worker_logs'

  @column({ isPrimary: true })
  declare id: number

  @column.dateTime()
  declare timestamp: DateTime

  @column()
  declare logType: 'lol' | 'valorant' | 'error' | 'info'

  @column()
  declare severity: 'info' | 'warning' | 'error'

  @column()
  declare message: string

  @column()
  declare accountName: string | null

  @column()
  declare accountPuuid: string | null

  @column()
  declare details: Record<string, unknown> | null
}
