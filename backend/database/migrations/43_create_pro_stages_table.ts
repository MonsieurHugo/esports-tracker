import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_stages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('stage_id').primary()
      table.string('external_id', 100).unique() // GRID API ID
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')
      table.string('name', 200).notNullable() // e.g., "Group Stage", "Playoffs"
      table.string('stage_type', 50) // group, bracket, swiss, round_robin
      table.integer('stage_order').defaultTo(0) // Order within tournament
      table.timestamp('start_date')
      table.timestamp('end_date')
      table.string('status', 20).defaultTo('upcoming') // upcoming, ongoing, completed
      table.jsonb('standings') // Current standings data
      table.jsonb('metadata')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['tournament_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
