import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Add GIN indexes to JSONB columns in pro_player_stats
 *
 * This improves query performance when filtering or aggregating on JSONB fields.
 * GIN indexes support containment (@>, <@) and existence (?, ?|, ?&) operators.
 *
 * Note: These indexes add some write overhead but significantly speed up reads.
 */
export default class extends BaseSchema {
  async up() {
    // Create GIN indexes on JSONB columns
    this.schema.raw(`
      -- Index for vision JSONB column
      CREATE INDEX IF NOT EXISTS idx_pro_player_stats_vision_gin
      ON pro_player_stats USING GIN (vision);

      -- Index for stats_at_15 JSONB column
      CREATE INDEX IF NOT EXISTS idx_pro_player_stats_stats_at_15_gin
      ON pro_player_stats USING GIN (stats_at_15);

      -- Index for max_diffs JSONB column
      CREATE INDEX IF NOT EXISTS idx_pro_player_stats_max_diffs_gin
      ON pro_player_stats USING GIN (max_diffs);

      -- Index for multi_kills JSONB column
      CREATE INDEX IF NOT EXISTS idx_pro_player_stats_multi_kills_gin
      ON pro_player_stats USING GIN (multi_kills);

      -- Index for solo_stats JSONB column
      CREATE INDEX IF NOT EXISTS idx_pro_player_stats_solo_stats_gin
      ON pro_player_stats USING GIN (solo_stats);
    `)

    // Add index for timing_data_jsonb if it exists (added in migration 67)
    this.schema.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='pro_player_stats' AND column_name='timing_data_jsonb'
        ) THEN
          CREATE INDEX IF NOT EXISTS idx_pro_player_stats_timing_data_gin
          ON pro_player_stats USING GIN (timing_data_jsonb);
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.raw(`
      DROP INDEX IF EXISTS idx_pro_player_stats_vision_gin;
      DROP INDEX IF EXISTS idx_pro_player_stats_stats_at_15_gin;
      DROP INDEX IF EXISTS idx_pro_player_stats_max_diffs_gin;
      DROP INDEX IF EXISTS idx_pro_player_stats_multi_kills_gin;
      DROP INDEX IF EXISTS idx_pro_player_stats_solo_stats_gin;
      DROP INDEX IF EXISTS idx_pro_player_stats_timing_data_gin;
    `)
  }
}
