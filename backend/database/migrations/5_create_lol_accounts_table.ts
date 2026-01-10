import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('puuid', 100).primary()
      table
        .integer('player_id')
        .unsigned()
        .notNullable()
        .references('player_id')
        .inTable('players')
        .onDelete('CASCADE')
      table.string('game_name', 50)
      table.string('tag_line', 10)
      table.string('region', 10).notNullable().defaultTo('EUW')
      table.boolean('is_primary').notNullable().defaultTo(false)
      table.timestamp('last_fetched_at')
      table.timestamp('last_match_at')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['player_id'])
      table.index(['region', 'last_fetched_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
