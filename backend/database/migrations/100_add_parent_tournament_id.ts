import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Add parent_tournament_id to pro_tournaments.
 *
 * Self-referential FK allowing tournament phases (Regular Season, Playoffs, etc.)
 * to be linked to a parent tournament entry.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table
        .integer('parent_tournament_id')
        .unsigned()
        .nullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('SET NULL')

      table.index(['parent_tournament_id'], 'idx_pro_tournaments_parent')
    })
  }

  async down() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropIndex(['parent_tournament_id'], 'idx_pro_tournaments_parent')
      table.dropColumn('parent_tournament_id')
    })
  }
}
