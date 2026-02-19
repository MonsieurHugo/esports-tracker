import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.string('split_name', 200).nullable()
      table.string('phase', 100).nullable()
    })

    this.defer(async (db) => {
      await db.rawQuery(`CREATE INDEX IF NOT EXISTS idx_pro_tournaments_phase ON pro_tournaments (phase)`)
    })
  }

  async down() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropColumn('split_name')
      table.dropColumn('phase')
    })
  }
}
