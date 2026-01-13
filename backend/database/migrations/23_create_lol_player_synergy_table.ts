import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_player_synergy'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('puuid', 100)
        .notNullable()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      // ally_puuid is NOT a foreign key because the other player might not be tracked
      table.string('ally_puuid', 100).notNullable()
      table.integer('games_together').notNullable().defaultTo(0)
      table.integer('wins_together').notNullable().defaultTo(0)
      table.integer('games_against').notNullable().defaultTo(0)
      table.integer('wins_against').notNullable().defaultTo(0)
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['puuid', 'ally_puuid'])
      table.index(['puuid', 'games_together'])
      table.index(['puuid', 'games_against'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
