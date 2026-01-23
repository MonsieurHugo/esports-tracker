import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_tournaments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('tournament_id').primary()
      table.string('external_id', 100).unique() // GRID API ID
      table.string('name', 200).notNullable()
      table.string('slug', 200).notNullable().unique()
      table
        .integer('league_id')
        .unsigned()
        .references('league_id')
        .inTable('leagues')
        .onDelete('SET NULL')
      table.string('season', 50) // e.g., "2024"
      table.string('split', 50) // e.g., "Spring", "Summer"
      table.string('region', 50) // e.g., "EMEA", "Korea", "China"
      table.integer('tier').defaultTo(1) // 1=major, 2=minor, 3=qualifier
      table.timestamp('start_date')
      table.timestamp('end_date')
      table.string('status', 20).defaultTo('upcoming') // upcoming, ongoing, completed
      table.string('logo_url', 500)
      table.jsonb('metadata') // Additional data from GRID
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['status'])
      table.index(['region'])
      table.index(['start_date'])
      table.index(['league_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
