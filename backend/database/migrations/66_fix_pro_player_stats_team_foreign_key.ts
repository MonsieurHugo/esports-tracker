import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Drop existing foreign key constraint that references 'teams' table
      table.dropForeign(['team_id'])

      // Add new foreign key constraint that references 'pro_teams' table
      table
        .foreign('team_id')
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Drop new foreign key constraint
      table.dropForeign(['team_id'])

      // Restore original foreign key constraint to 'teams' table
      table
        .foreign('team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
    })
  }
}
