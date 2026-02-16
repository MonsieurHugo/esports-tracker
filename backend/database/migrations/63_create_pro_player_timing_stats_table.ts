import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Create table for per-minute stats during a game (idempotent)
    this.schema.raw(`
      CREATE TABLE IF NOT EXISTS pro_player_timing_stats (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES pro_games(game_id) ON DELETE CASCADE,
        player_external_id VARCHAR(100) NOT NULL,
        minute INTEGER NOT NULL,
        gold INTEGER NOT NULL,
        cs INTEGER NOT NULL,
        xp INTEGER NOT NULL,
        damage INTEGER NOT NULL,
        gold_diff INTEGER NOT NULL DEFAULT 0,
        cs_diff INTEGER NOT NULL DEFAULT 0,
        xp_diff INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(game_id, player_external_id, minute)
      );

      -- Create indexes if not exist
      CREATE INDEX IF NOT EXISTS idx_pro_player_timing_stats_game_id ON pro_player_timing_stats(game_id);
      CREATE INDEX IF NOT EXISTS idx_pro_player_timing_stats_player_external_id ON pro_player_timing_stats(player_external_id);
      CREATE INDEX IF NOT EXISTS idx_pro_player_timing_stats_minute ON pro_player_timing_stats(minute);
      CREATE INDEX IF NOT EXISTS idx_pro_player_timing_stats_player_minute ON pro_player_timing_stats(player_external_id, minute);
    `)

    // Add max diff columns to pro_player_stats (idempotent)
    this.schema.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_gold_diff') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_gold_diff INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_cs_diff') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_cs_diff INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_xp_diff') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_xp_diff INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_gold_diff_minute') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_gold_diff_minute INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_cs_diff_minute') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_cs_diff_minute INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_player_stats' AND column_name = 'max_xp_diff_minute') THEN
          ALTER TABLE pro_player_stats ADD COLUMN max_xp_diff_minute INTEGER;
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.alterTable('pro_player_stats', (table) => {
      table.dropColumn('max_gold_diff')
      table.dropColumn('max_cs_diff')
      table.dropColumn('max_xp_diff')
      table.dropColumn('max_gold_diff_minute')
      table.dropColumn('max_cs_diff_minute')
      table.dropColumn('max_xp_diff_minute')
    })

    this.schema.dropTable('pro_player_timing_stats')
  }
}
