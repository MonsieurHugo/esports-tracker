import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    // Add columns and modify constraints idempotently
    this.schema.raw(`
      DO $$
      BEGIN
        -- Add player_external_id if not exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_player_stats' AND column_name = 'player_external_id'
        ) THEN
          ALTER TABLE pro_player_stats ADD COLUMN player_external_id VARCHAR(50);
        END IF;

        -- Add player_name if not exists
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_player_stats' AND column_name = 'player_name'
        ) THEN
          ALTER TABLE pro_player_stats ADD COLUMN player_name VARCHAR(100);
        END IF;

        -- Make player_id nullable
        ALTER TABLE pro_player_stats ALTER COLUMN player_id DROP NOT NULL;

        -- Add index if not exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_pro_player_stats_player_external_id'
        ) THEN
          CREATE INDEX idx_pro_player_stats_player_external_id ON pro_player_stats (player_external_id);
        END IF;

        -- Drop old unique constraint if exists
        ALTER TABLE pro_player_stats DROP CONSTRAINT IF EXISTS pro_player_stats_game_id_player_id_unique;

        -- Create new unique index if not exists
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_pro_player_stats_game_player_unique'
        ) THEN
          CREATE UNIQUE INDEX idx_pro_player_stats_game_player_unique
          ON pro_player_stats (game_id, COALESCE(player_id::text, player_external_id, ''));
        END IF;
      END $$;
    `)
  }

  async down() {
    // Remove the new unique index
    this.schema.raw(`
      DROP INDEX IF EXISTS idx_pro_player_stats_game_player_unique
    `)

    // Restore original unique constraint
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['game_id', 'player_id'])
    })

    // Remove the index
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['player_external_id'], 'idx_pro_player_stats_player_external_id')
    })

    // Make player_id NOT NULL again (may fail if nulls exist)
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ALTER COLUMN player_id SET NOT NULL
    `)

    // Drop the new columns
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('player_external_id')
      table.dropColumn('player_name')
    })
  }
}
