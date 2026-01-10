import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_champion_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('puuid', 100)
        .notNullable()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      table.integer('champion_id').notNullable()
      table.integer('games_played').notNullable().defaultTo(0)
      table.integer('wins').notNullable().defaultTo(0)
      table.integer('total_kills').notNullable().defaultTo(0)
      table.integer('total_deaths').notNullable().defaultTo(0)
      table.integer('total_assists').notNullable().defaultTo(0)
      table.integer('total_cs').notNullable().defaultTo(0)
      table.bigInteger('total_damage').notNullable().defaultTo(0)
      table.float('best_kda')
      table.string('best_kda_match_id', 50)
      table.timestamp('last_played')
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['puuid', 'champion_id'])
      table.index(['champion_id', 'games_played'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
