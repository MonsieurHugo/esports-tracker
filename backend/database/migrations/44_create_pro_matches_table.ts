import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_matches'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('match_id').primary()
      table.string('external_id', 100).unique() // GRID API ID
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')
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
      table.integer('team1_score').defaultTo(0)
      table.integer('team2_score').defaultTo(0)
      table
        .integer('winner_team_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table.string('format', 20).defaultTo('bo3') // bo1, bo3, bo5
      table.string('status', 20).defaultTo('upcoming') // upcoming, live, completed, postponed
      table.timestamp('scheduled_at')
      table.timestamp('started_at')
      table.timestamp('ended_at')
      table.string('stream_url', 500)
      table.jsonb('metadata') // Additional data from GRID
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['tournament_id'])
      table.index(['status'])
      table.index(['scheduled_at'])
      table.index(['team1_id'])
      table.index(['team2_id'])
      table.index(['winner_team_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
