import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_matches'

  async up() {
    // First add new columns
    this.schema.alterTable(this.tableName, (table) => {
      table.string('team1_name', 100)
      table.string('team2_name', 100)
    })

    // Then drop unused columns and FK constraints
    this.schema.alterTable(this.tableName, (table) => {
      // Drop foreign key columns
      table.dropForeign(['stage_id'])
      table.dropForeign(['team1_id'])
      table.dropForeign(['team2_id'])
      table.dropForeign(['winner_team_id'])

      table.dropColumn('stage_id')
      table.dropColumn('team1_id')
      table.dropColumn('team2_id')
      table.dropColumn('winner_team_id')
      table.dropColumn('stream_url')
      table.dropColumn('metadata')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Re-add foreign key columns
      table
        .integer('stage_id')
        .unsigned()
        .references('stage_id')
        .inTable('pro_stages')
        .onDelete('SET NULL')
      table
        .integer('team1_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table
        .integer('team2_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table
        .integer('winner_team_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table.string('stream_url', 500)
      table.jsonb('metadata')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('team1_name')
      table.dropColumn('team2_name')
    })
  }
}
