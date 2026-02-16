import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    // Use raw SQL for idempotent column additions
    this.defer(async (db) => {
      await db.rawQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='kills_at_15') THEN
            ALTER TABLE pro_player_stats ADD COLUMN kills_at_15 integer DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='deaths_at_15') THEN
            ALTER TABLE pro_player_stats ADD COLUMN deaths_at_15 integer DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='assists_at_15') THEN
            ALTER TABLE pro_player_stats ADD COLUMN assists_at_15 integer DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='kill_participation_at_15') THEN
            ALTER TABLE pro_player_stats ADD COLUMN kill_participation_at_15 decimal(5,4) DEFAULT 0;
          END IF;
        END $$;
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('kills_at_15')
      table.dropColumn('deaths_at_15')
      table.dropColumn('assists_at_15')
      table.dropColumn('kill_participation_at_15')
    })
  }
}
