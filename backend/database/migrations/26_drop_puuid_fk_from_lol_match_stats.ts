import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_match_stats'

  async up() {
    // Drop the foreign key constraint on puuid to allow storing all match participants
    // (not just tracked players from lol_accounts)
    // Try different possible constraint names
    const possibleNames = [
      'lol_match_stats_puuid_fkey',
      'lol_match_stats_puuid_foreign'
    ]

    for (const constraintName of possibleNames) {
      try {
        await this.db.rawQuery(`
          ALTER TABLE ${this.tableName} DROP CONSTRAINT IF EXISTS ${constraintName}
        `)
      } catch (e) {
        // Ignore errors
      }
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .foreign('puuid', 'lol_match_stats_puuid_fkey')
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
    })
  }
}
