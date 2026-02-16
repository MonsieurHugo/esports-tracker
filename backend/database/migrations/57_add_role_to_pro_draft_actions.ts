import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_draft_actions'

  async up() {
    // Check if column exists before adding
    this.schema.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pro_draft_actions' AND column_name = 'role'
        ) THEN
          ALTER TABLE pro_draft_actions ADD COLUMN role VARCHAR(20);
        END IF;
      END $$;
    `)
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('role')
    })
  }
}
