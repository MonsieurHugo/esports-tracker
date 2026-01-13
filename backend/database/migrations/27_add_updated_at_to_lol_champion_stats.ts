import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_champion_stats'

  async up() {
    const hasColumn = await this.db.rawQuery(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lol_champion_stats' AND column_name = 'updated_at'
      )
    `)

    if (!hasColumn.rows[0].exists) {
      this.schema.alterTable(this.tableName, (table) => {
        table.timestamp('updated_at').notNullable().defaultTo(this.now())
      })
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('updated_at')
    })
  }
}
