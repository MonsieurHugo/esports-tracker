import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Prepare schema for Leaguepedia historical data import
 *
 * Changes:
 * 1. Make champion_id nullable in pro_player_stats (Leaguepedia only has champion names)
 * 2. Add is_complete column to pro_tournaments (skip completed tournaments on re-sync)
 * 3. Fix pro_team_stats FK: teams → pro_teams (matches controller usage)
 * 4. Fix pro_player_aggregated_stats team FK: teams → pro_teams
 */
export default class extends BaseSchema {
  async up() {
    // 1. Make champion_id nullable in pro_player_stats
    this.schema.raw(`
      ALTER TABLE pro_player_stats ALTER COLUMN champion_id DROP NOT NULL;
    `)

    // 2. Add is_complete to pro_tournaments (idempotent)
    this.schema.raw(`
      ALTER TABLE pro_tournaments ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;
    `)

    // 3. Fix pro_team_stats FK: teams → pro_teams
    this.schema.raw(`
      ALTER TABLE pro_team_stats DROP CONSTRAINT IF EXISTS pro_team_stats_team_id_foreign;
      ALTER TABLE pro_team_stats
        ADD CONSTRAINT pro_team_stats_team_id_foreign
        FOREIGN KEY (team_id) REFERENCES pro_teams(team_id) ON DELETE CASCADE;
    `)

    // 4. Fix pro_player_aggregated_stats team FK: teams → pro_teams
    this.schema.raw(`
      ALTER TABLE pro_player_aggregated_stats DROP CONSTRAINT IF EXISTS pro_player_aggregated_stats_team_id_foreign;
      ALTER TABLE pro_player_aggregated_stats
        ADD CONSTRAINT pro_player_aggregated_stats_team_id_foreign
        FOREIGN KEY (team_id) REFERENCES pro_teams(team_id) ON DELETE SET NULL;
    `)
  }

  async down() {
    // Reverse champion_id to NOT NULL (set NULLs to 0 first)
    this.schema.raw(`
      UPDATE pro_player_stats SET champion_id = 0 WHERE champion_id IS NULL;
      ALTER TABLE pro_player_stats ALTER COLUMN champion_id SET NOT NULL;
    `)

    // Remove is_complete from pro_tournaments
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropColumn('is_complete')
    })

    // Restore pro_team_stats FK to teams
    this.schema.alterTable('pro_team_stats', (table) => {
      table.dropForeign(['team_id'])
      table
        .foreign('team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('CASCADE')
    })

    // Restore pro_player_aggregated_stats FK to teams
    this.schema.alterTable('pro_player_aggregated_stats', (table) => {
      table.dropForeign(['team_id'])
      table
        .foreign('team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
    })
  }
}
