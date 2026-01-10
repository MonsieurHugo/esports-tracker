import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import PlayerContract from './player_contract.js'
import LolAccount from './lol_account.js'

export default class Player extends BaseModel {
  static table = 'players'

  @column({ isPrimary: true })
  declare playerId: number

  @column()
  declare slug: string

  @column()
  declare currentPseudo: string

  @column()
  declare firstName: string | null

  @column()
  declare lastName: string | null

  @column()
  declare nationality: string | null

  @column()
  declare twitter: string | null

  @column()
  declare twitch: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => PlayerContract, { foreignKey: 'playerId' })
  declare contracts: HasMany<typeof PlayerContract>

  @hasMany(() => LolAccount, { foreignKey: 'playerId' })
  declare lolAccounts: HasMany<typeof LolAccount>
}
