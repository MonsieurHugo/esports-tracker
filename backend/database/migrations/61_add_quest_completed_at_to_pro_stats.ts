import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.schema.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_player_stats' AND column_name = 'quest_completed_at'
        ) THEN
          ALTER TABLE pro_player_stats ADD COLUMN quest_completed_at INTEGER;
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('quest_completed_at')
    })
  }
}
