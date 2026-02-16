import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_matches'

  async up() {
    // First drop the name columns
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('team1_name')
      table.dropColumn('team2_name')
    })

    // Add external_id columns for GRID team IDs
    this.schema.alterTable(this.tableName, (table) => {
      table.string('team1_external_id', 50)
      table.string('team2_external_id', 50)

      // Index for searching by team
      table.index(['team1_external_id'], 'idx_pro_matches_team1_external_id')
      table.index(['team2_external_id'], 'idx_pro_matches_team2_external_id')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['team1_external_id'], 'idx_pro_matches_team1_external_id')
      table.dropIndex(['team2_external_id'], 'idx_pro_matches_team2_external_id')

      table.dropColumn('team1_external_id')
      table.dropColumn('team2_external_id')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.string('team1_name', 100)
      table.string('team2_name', 100)
    })
  }
}
