import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Add missing performance indexes for pro tables
 *
 * - pro_matches.team1_external_id / team2_external_id: used in joins with pro_teams
 * - pro_tournaments.year: used by get_pro_tournaments_by_year queries
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE INDEX IF NOT EXISTS idx_pro_matches_team1_external_id ON pro_matches (team1_external_id);
      CREATE INDEX IF NOT EXISTS idx_pro_matches_team2_external_id ON pro_matches (team2_external_id);
      CREATE INDEX IF NOT EXISTS idx_pro_tournaments_year ON pro_tournaments (year);
    `)
  }

  async down() {
    this.schema.raw(`
      DROP INDEX IF EXISTS idx_pro_matches_team1_external_id;
      DROP INDEX IF EXISTS idx_pro_matches_team2_external_id;
      DROP INDEX IF EXISTS idx_pro_tournaments_year;
    `)
  }
}
