import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class WorkerStatus extends BaseModel {
  static table = 'worker_status'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare isRunning: boolean

  @column.dateTime()
  declare startedAt: DateTime | null

  @column()
  declare sessionLolMatches: number

  @column()
  declare sessionValorantMatches: number

  @column()
  declare sessionLolAccounts: number

  @column()
  declare sessionValorantAccounts: number

  @column()
  declare sessionErrors: number

  @column()
  declare sessionApiRequests: number

  @column()
  declare currentAccountName: string | null

  @column()
  declare currentAccountRegion: string | null

  @column()
  declare activeAccountsCount: number

  @column()
  declare todayAccountsCount: number

  @column()
  declare inactiveAccountsCount: number

  @column.dateTime()
  declare lastActivityAt: DateTime | null

  @column.dateTime()
  declare lastErrorAt: DateTime | null

  @column()
  declare lastErrorMessage: string | null

  @column.dateTime({ autoUpdate: true })
  declare updatedAt: DateTime
}
