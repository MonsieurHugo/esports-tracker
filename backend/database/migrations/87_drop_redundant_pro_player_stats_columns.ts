import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Drop redundant columns from pro_player_stats
 *
 * Removes:
 * - metadata: never used
 * - stats_at_15: redundant with timing_data["15"]
 * - player_name: replaced by player_id → JOIN players
 * - player_external_id: replaced by player_id resolution
 * - champion_name: replaced by champion_id (frontend resolves name)
 *
 * Also updates the unique index since it referenced player_external_id.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      DO $$
      BEGIN
        -- Drop unique index that references player_external_id
        DROP INDEX IF EXISTS idx_pro_player_stats_game_player_unique;

        -- Drop player_external_id index
        DROP INDEX IF EXISTS idx_pro_player_stats_player_external_id;

        -- Drop columns
        ALTER TABLE pro_player_stats DROP COLUMN IF EXISTS metadata;
        ALTER TABLE pro_player_stats DROP COLUMN IF EXISTS stats_at_15;
        ALTER TABLE pro_player_stats DROP COLUMN IF EXISTS player_name;
        ALTER TABLE pro_player_stats DROP COLUMN IF EXISTS player_external_id;
        ALTER TABLE pro_player_stats DROP COLUMN IF EXISTS champion_name;

        -- Create new unique index on (game_id, player_id) for rows with player_id
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_pro_player_stats_game_player_unique'
        ) THEN
          CREATE UNIQUE INDEX idx_pro_player_stats_game_player_unique
          ON pro_player_stats (game_id, player_id)
          WHERE player_id IS NOT NULL;
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.raw(`
      DO $$
      BEGIN
        -- Drop the new unique index
        DROP INDEX IF EXISTS idx_pro_player_stats_game_player_unique;

        -- Re-add columns
        ALTER TABLE pro_player_stats ADD COLUMN IF NOT EXISTS metadata JSONB;
        ALTER TABLE pro_player_stats ADD COLUMN IF NOT EXISTS stats_at_15 JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE pro_player_stats ADD COLUMN IF NOT EXISTS player_name VARCHAR(100);
        ALTER TABLE pro_player_stats ADD COLUMN IF NOT EXISTS player_external_id VARCHAR(50);
        ALTER TABLE pro_player_stats ADD COLUMN IF NOT EXISTS champion_name VARCHAR(100);

        -- Re-create old indexes
        CREATE INDEX IF NOT EXISTS idx_pro_player_stats_player_external_id
          ON pro_player_stats (player_external_id);

        CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_player_stats_game_player_unique
          ON pro_player_stats (game_id, COALESCE(player_id::text, player_external_id, ''));
      END $$;
    `)
  }
}
