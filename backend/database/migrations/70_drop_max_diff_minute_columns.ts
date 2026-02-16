import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='max_gold_diff_minute') THEN
            ALTER TABLE pro_player_stats DROP COLUMN max_gold_diff_minute;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='max_cs_diff_minute') THEN
            ALTER TABLE pro_player_stats DROP COLUMN max_cs_diff_minute;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='max_xp_diff_minute') THEN
            ALTER TABLE pro_player_stats DROP COLUMN max_xp_diff_minute;
          END IF;
        END $$;
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('max_gold_diff_minute')
      table.integer('max_cs_diff_minute')
      table.integer('max_xp_diff_minute')
    })
  }
}
