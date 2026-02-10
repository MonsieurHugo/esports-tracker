import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Create player_aliases table
 *
 * Tracks all known pseudonyms for a player (from Leaguepedia, GRID, or manual).
 * Enables searching players by any of their historical names.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('player_aliases', (table) => {
      table.increments('id').primary()
      table
        .integer('player_id')
        .notNullable()
        .references('player_id')
        .inTable('players')
        .onDelete('CASCADE')
      table.string('alias', 100).notNullable()
      table.string('source', 20).defaultTo('leaguepedia')
      table.timestamp('created_at').defaultTo(this.now())

      table.unique(['player_id', 'alias'])
    })

    // Index on LOWER(alias) for fast case-insensitive search
    this.schema.raw(
      `CREATE INDEX idx_player_aliases_alias ON player_aliases (LOWER(alias))`
    )

    // Index on player_id for joins
    this.schema.raw(
      `CREATE INDEX idx_player_aliases_player ON player_aliases (player_id)`
    )
  }

  async down() {
    this.schema.dropTable('player_aliases')
  }
}
