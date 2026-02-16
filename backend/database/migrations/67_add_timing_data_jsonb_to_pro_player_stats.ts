import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Add timing_data JSONB column to pro_player_stats
    this.schema.alterTable('pro_player_stats', (table) => {
      table.jsonb('timing_data').nullable() // Per-minute stats: {"1": {cs, gold, xp, ...}, "2": {...}, ...}
    })

    // Drop the normalized timing stats table (no longer needed)
    this.schema.dropTableIfExists('pro_player_timing_stats')
  }

  async down() {
    // Recreate the timing stats table
    this.schema.createTable('pro_player_timing_stats', (table) => {
      table.increments('id').primary()
      table
        .integer('game_id')
        .unsigned()
        .notNullable()
        .references('game_id')
        .inTable('pro_games')
        .onDelete('CASCADE')
      table.string('player_name', 100).notNullable()
      table.integer('minute').notNullable()
      table.integer('cs').defaultTo(0)
      table.integer('gold').defaultTo(0)
      table.integer('xp').defaultTo(0)
      table.integer('kills').defaultTo(0)
      table.integer('deaths').defaultTo(0)
      table.integer('assists').defaultTo(0)
      table.integer('cs_diff').defaultTo(0)
      table.integer('gold_diff').defaultTo(0)
      table.integer('xp_diff').defaultTo(0)
      table.timestamp('created_at').defaultTo(this.now())
      table.unique(['game_id', 'player_name', 'minute'])
      table.index(['game_id'])
      table.index(['minute'])
    })

    // Remove timing_data column
    this.schema.alterTable('pro_player_stats', (table) => {
      table.dropColumn('timing_data')
    })
  }
}
