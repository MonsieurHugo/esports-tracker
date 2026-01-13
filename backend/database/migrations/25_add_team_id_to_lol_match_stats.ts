import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_match_stats'

  async up() {
    // Check if column exists first
    const hasColumn = await this.db.rawQuery(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lol_match_stats' AND column_name = 'team_id'
      )
    `)

    if (!hasColumn.rows[0].exists) {
      this.schema.alterTable(this.tableName, (table) => {
        table.integer('team_id')
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('team_id')
    })
  }
}
