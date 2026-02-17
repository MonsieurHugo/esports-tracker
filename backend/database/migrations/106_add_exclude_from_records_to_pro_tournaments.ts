import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.boolean('exclude_from_records').defaultTo(false).notNullable()
    })

    this.schema.raw(`
      CREATE INDEX idx_pro_tournaments_exclude_from_records
      ON pro_tournaments (exclude_from_records)
      WHERE exclude_from_records = true
    `)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS idx_pro_tournaments_exclude_from_records')

    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropColumn('exclude_from_records')
    })
  }
}
