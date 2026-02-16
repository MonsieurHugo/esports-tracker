import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='proximity') THEN
            ALTER TABLE pro_player_stats ADD COLUMN proximity jsonb DEFAULT '{}';
          END IF;
        END $$;
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('proximity')
    })
  }
}
