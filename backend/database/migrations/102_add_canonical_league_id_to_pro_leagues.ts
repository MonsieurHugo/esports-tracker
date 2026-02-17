import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Add canonical_league_id to pro_leagues for league alias grouping.
 *
 * When a league is a historical alias of another (e.g. EU LCS → LEC),
 * canonical_league_id points to the current/canonical league.
 * Leagues with canonical_league_id = NULL are canonical themselves.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_leagues', (table) => {
      table
        .integer('canonical_league_id')
        .unsigned()
        .nullable()
        .references('league_id')
        .inTable('pro_leagues')
        .onDelete('SET NULL')
      table.index(['canonical_league_id'])
    })
  }

  async down() {
    this.schema.alterTable('pro_leagues', (table) => {
      table.dropForeign(['canonical_league_id'])
      table.dropColumn('canonical_league_id')
    })
  }
}
