import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Add indexes to optimize champion stats aggregation queries
    this.schema.raw(`
      -- Index for filtering drafts by champion and action type
      CREATE INDEX IF NOT EXISTS idx_pro_draft_actions_champion_type
      ON pro_draft_actions(champion_id, action_type);

      -- Index for filtering games by patch
      CREATE INDEX IF NOT EXISTS idx_pro_games_patch
      ON pro_games(patch);

      -- Index for filtering games by started_at (date range queries)
      CREATE INDEX IF NOT EXISTS idx_pro_games_started_at
      ON pro_games(started_at);

      -- Index for filtering tournaments by league
      CREATE INDEX IF NOT EXISTS idx_pro_tournaments_pro_league_id
      ON pro_tournaments(pro_league_id);

      -- Composite index for common filter combinations on games
      CREATE INDEX IF NOT EXISTS idx_pro_games_status_started_at
      ON pro_games(status, started_at);
    `)
  }

  async down() {
    this.schema.raw(`
      DROP INDEX IF EXISTS idx_pro_draft_actions_champion_type;
      DROP INDEX IF EXISTS idx_pro_games_patch;
      DROP INDEX IF EXISTS idx_pro_games_started_at;
      DROP INDEX IF EXISTS idx_pro_tournaments_pro_league_id;
      DROP INDEX IF EXISTS idx_pro_games_status_started_at;
    `)
  }
}
