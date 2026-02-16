import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Enrich pro_tournaments with Leaguepedia metadata
 *
 * Adds split, tournament level, playoff/qualifier/official flags, and region
 * from the Leaguepedia Tournaments Cargo table.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.string('split', 50).nullable()
      table.integer('split_number').unsigned().nullable()
      table.string('tournament_level', 50).nullable()
      table.boolean('is_playoffs').defaultTo(false)
      table.boolean('is_qualifier').defaultTo(false)
      table.boolean('is_official').defaultTo(true)
      table.string('region', 50).nullable()

      table.index(['split'])
      table.index(['tournament_level'])
      table.index(['is_playoffs'])
    })
  }

  async down() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropIndex(['split'])
      table.dropIndex(['tournament_level'])
      table.dropIndex(['is_playoffs'])

      table.dropColumn('split')
      table.dropColumn('split_number')
      table.dropColumn('tournament_level')
      table.dropColumn('is_playoffs')
      table.dropColumn('is_qualifier')
      table.dropColumn('is_official')
      table.dropColumn('region')
    })
  }
}
