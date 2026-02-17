import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // All in raw SQL for transactional safety
    this.defer(async (db) => {
      // 1a. Add columns to teams
      await db.rawQuery(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS external_id VARCHAR(50) UNIQUE`)
      await db.rawQuery(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)`)
      await db.rawQuery(`ALTER TABLE teams ALTER COLUMN short_name DROP NOT NULL`)

      // 1b. Create temp mapping table
      await db.rawQuery(`
        CREATE TEMP TABLE pro_team_mapping (
          old_id INT PRIMARY KEY,
          new_id INT NOT NULL
        )
      `)

      // 1c. Match pro_teams to teams by name
      await db.rawQuery(`
        INSERT INTO pro_team_mapping (old_id, new_id)
        SELECT pt.team_id, t.team_id
        FROM pro_teams pt
        JOIN teams t ON LOWER(TRIM(pt.name)) = LOWER(TRIM(t.current_name))
          AND t.game_id = 1
      `)

      // Update matched teams with pro data
      await db.rawQuery(`
        UPDATE teams t
        SET external_id = pt.external_id,
            logo_url = COALESCE(pt.logo_url, t.logo_url),
            short_name = COALESCE(t.short_name, pt.short_name)
        FROM pro_teams pt
        JOIN pro_team_mapping m ON pt.team_id = m.old_id
        WHERE t.team_id = m.new_id
      `)

      // 1d. Insert unmatched pro_teams into teams
      await db.rawQuery(`
        INSERT INTO teams (external_id, current_name, short_name, game_id, slug, is_active, logo_url, created_at, updated_at)
        SELECT pt.external_id, pt.name, pt.short_name, 1,
               'pro-' || pt.team_id,
               false,
               pt.logo_url, pt.created_at, pt.updated_at
        FROM pro_teams pt
        WHERE pt.team_id NOT IN (SELECT old_id FROM pro_team_mapping)
      `)

      // Add new rows to mapping
      await db.rawQuery(`
        INSERT INTO pro_team_mapping (old_id, new_id)
        SELECT pt.team_id, t.team_id
        FROM pro_teams pt
        JOIN teams t ON t.external_id = pt.external_id
        WHERE pt.team_id NOT IN (SELECT old_id FROM pro_team_mapping)
      `)

      // 1e. Migrate all FK references
      await db.rawQuery(`UPDATE pro_games SET blue_team_id = m.new_id FROM pro_team_mapping m WHERE blue_team_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_games SET red_team_id = m.new_id FROM pro_team_mapping m WHERE red_team_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_games SET winner_team_id = m.new_id FROM pro_team_mapping m WHERE winner_team_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_player_stats SET team_id = m.new_id FROM pro_team_mapping m WHERE team_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_team_stats SET team_id = m.new_id FROM pro_team_mapping m WHERE team_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_entity_mappings SET entity_id = m.new_id FROM pro_team_mapping m WHERE entity_type = 'team' AND entity_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_mapping_proposals SET source_entity_id = m.new_id FROM pro_team_mapping m WHERE entity_type = 'team' AND source_entity_id = m.old_id`)
      await db.rawQuery(`UPDATE pro_mapping_proposals SET target_entity_id = m.new_id FROM pro_team_mapping m WHERE entity_type = 'team' AND target_entity_id = m.old_id`)

      // 1f. Drop old FK constraints pointing to pro_teams, recreate pointing to teams
      // pro_games
      await db.rawQuery(`ALTER TABLE pro_games DROP CONSTRAINT IF EXISTS pro_games_blue_team_id_foreign`)
      await db.rawQuery(`ALTER TABLE pro_games DROP CONSTRAINT IF EXISTS pro_games_red_team_id_foreign`)
      await db.rawQuery(`ALTER TABLE pro_games DROP CONSTRAINT IF EXISTS pro_games_winner_team_id_foreign`)
      await db.rawQuery(`ALTER TABLE pro_games ADD CONSTRAINT pro_games_blue_team_id_foreign FOREIGN KEY (blue_team_id) REFERENCES teams(team_id) ON DELETE SET NULL`)
      await db.rawQuery(`ALTER TABLE pro_games ADD CONSTRAINT pro_games_red_team_id_foreign FOREIGN KEY (red_team_id) REFERENCES teams(team_id) ON DELETE SET NULL`)
      await db.rawQuery(`ALTER TABLE pro_games ADD CONSTRAINT pro_games_winner_team_id_foreign FOREIGN KEY (winner_team_id) REFERENCES teams(team_id) ON DELETE SET NULL`)

      // pro_player_stats
      await db.rawQuery(`ALTER TABLE pro_player_stats DROP CONSTRAINT IF EXISTS pro_player_stats_team_id_foreign`)
      await db.rawQuery(`ALTER TABLE pro_player_stats ADD CONSTRAINT pro_player_stats_team_id_foreign FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE SET NULL`)

      // pro_team_stats
      await db.rawQuery(`ALTER TABLE pro_team_stats DROP CONSTRAINT IF EXISTS pro_team_stats_team_id_foreign`)
      await db.rawQuery(`ALTER TABLE pro_team_stats ADD CONSTRAINT pro_team_stats_team_id_foreign FOREIGN KEY (team_id) REFERENCES teams(team_id) ON DELETE CASCADE`)

      // 1g. Drop pro_teams table
      await db.rawQuery(`DROP TABLE pro_teams`)

      // 1h. Add indexes
      await db.rawQuery(`CREATE INDEX IF NOT EXISTS idx_teams_external_id ON teams(external_id) WHERE external_id IS NOT NULL`)
      await db.rawQuery(`CREATE INDEX IF NOT EXISTS idx_teams_name_lower ON teams(LOWER(TRIM(current_name)))`)
    })
  }

  async down() {
    // This migration is not easily reversible
    // Would need to recreate pro_teams and reverse all mappings
    this.defer(async (db) => {
      // Recreate pro_teams table
      await db.rawQuery(`
        CREATE TABLE pro_teams (
          team_id SERIAL PRIMARY KEY,
          external_id VARCHAR(50) UNIQUE,
          name VARCHAR(255) NOT NULL,
          short_name VARCHAR(50),
          logo_url VARCHAR(500),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `)

      // Drop added columns
      await db.rawQuery(`DROP INDEX IF EXISTS idx_teams_external_id`)
      await db.rawQuery(`DROP INDEX IF EXISTS idx_teams_name_lower`)
      await db.rawQuery(`ALTER TABLE teams DROP COLUMN IF EXISTS external_id`)
      await db.rawQuery(`ALTER TABLE teams DROP COLUMN IF EXISTS logo_url`)
    })
  }
}
