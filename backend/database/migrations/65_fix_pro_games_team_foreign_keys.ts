import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_games'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Drop existing foreign key constraints that reference 'teams' table
      table.dropForeign(['blue_team_id'])
      table.dropForeign(['red_team_id'])
      table.dropForeign(['winner_team_id'])

      // Add new foreign key constraints that reference 'pro_teams' table
      table
        .foreign('blue_team_id')
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('SET NULL')
      table
        .foreign('red_team_id')
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('SET NULL')
      table
        .foreign('winner_team_id')
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Drop new foreign key constraints
      table.dropForeign(['blue_team_id'])
      table.dropForeign(['red_team_id'])
      table.dropForeign(['winner_team_id'])

      // Restore original foreign key constraints to 'teams' table
      table
        .foreign('blue_team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table
        .foreign('red_team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table
        .foreign('winner_team_id')
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
    })
  }
}
