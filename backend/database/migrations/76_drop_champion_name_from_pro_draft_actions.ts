import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_draft_actions'

  async up() {
    this.defer(async (db) => {
      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_draft_actions' AND column_name='champion_name') THEN
            ALTER TABLE pro_draft_actions DROP COLUMN champion_name;
          END IF;
        END $$;
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('champion_name', 50).nullable()
    })
  }
}
