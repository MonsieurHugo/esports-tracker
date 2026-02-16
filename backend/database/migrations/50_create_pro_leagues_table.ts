import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Create pro_leagues table
    this.schema.createTable('pro_leagues', (table) => {
      table.increments('league_id').primary()
      table.string('external_id', 100).unique() // GRID API ID if available
      table.string('name', 200).notNullable().unique()
      table.string('short_name', 50)
      table.string('region', 50) // EMEA, Americas, Asia, Korea, China
      table.string('logo_url', 500)
      table.boolean('is_followed').defaultTo(false) // User follows this league
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['is_followed'])
      table.index(['region'])
    })

    // Add FK from pro_tournaments to pro_leagues
    this.schema.alterTable('pro_tournaments', (table) => {
      table
        .integer('pro_league_id')
        .unsigned()
        .references('league_id')
        .inTable('pro_leagues')
        .onDelete('SET NULL')

      table.index(['pro_league_id'])
    })
  }

  async down() {
    // Remove FK from pro_tournaments
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropForeign(['pro_league_id'])
      table.dropIndex(['pro_league_id'])
      table.dropColumn('pro_league_id')
    })

    // Drop pro_leagues table
    this.schema.dropTable('pro_leagues')
  }
}
