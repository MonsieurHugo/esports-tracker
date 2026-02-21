import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_matches'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('failure_reason').nullable()
      table.integer('failure_count').defaultTo(0)
      table.timestamp('failed_at').nullable()
    })

    // Partial index for efficient failed match queries
    this.defer(async (db) => {
      await db.rawQuery(`
        CREATE INDEX idx_pro_matches_failed
        ON pro_matches (failed_at)
        WHERE status = 'failed'
      `)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('failure_reason')
      table.dropColumn('failure_count')
      table.dropColumn('failed_at')
    })

    this.defer(async (db) => {
      await db.rawQuery('DROP INDEX IF EXISTS idx_pro_matches_failed')
    })
  }
}
