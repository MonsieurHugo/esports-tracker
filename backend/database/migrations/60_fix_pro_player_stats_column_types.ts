import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    // Change columns from INTEGER to NUMERIC for decimal values (idempotent)
    this.schema.raw(`
      DO $$
      BEGIN
        -- Only alter if current type is not already numeric
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_player_stats' AND column_name = 'kill_participation'
          AND data_type = 'integer'
        ) THEN
          ALTER TABLE pro_player_stats
          ALTER COLUMN kill_participation TYPE NUMERIC(5,4) USING kill_participation::NUMERIC,
          ALTER COLUMN damage_share TYPE NUMERIC(5,4) USING damage_share::NUMERIC,
          ALTER COLUMN gold_share TYPE NUMERIC(5,4) USING gold_share::NUMERIC;
        END IF;
      END $$;
    `)
  }

  async down() {
    // Revert to INTEGER (will lose precision)
    this.schema.raw(`
      ALTER TABLE ${this.tableName}
      ALTER COLUMN kill_participation TYPE INTEGER USING kill_participation::INTEGER,
      ALTER COLUMN damage_share TYPE INTEGER USING damage_share::INTEGER,
      ALTER COLUMN gold_share TYPE INTEGER USING gold_share::INTEGER
    `)
  }
}
