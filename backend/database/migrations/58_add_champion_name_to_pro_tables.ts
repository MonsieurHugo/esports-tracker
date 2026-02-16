import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Add champion_name to tables if not exists
    this.schema.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_draft_actions' AND column_name = 'champion_name'
        ) THEN
          ALTER TABLE pro_draft_actions ADD COLUMN champion_name VARCHAR(50);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_player_stats' AND column_name = 'champion_name'
        ) THEN
          ALTER TABLE pro_player_stats ADD COLUMN champion_name VARCHAR(50);
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.alterTable('pro_draft_actions', (table) => {
      table.dropColumn('champion_name')
    })

    this.schema.alterTable('pro_player_stats', (table) => {
      table.dropColumn('champion_name')
    })
  }
}
