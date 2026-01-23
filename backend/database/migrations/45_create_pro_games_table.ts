import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_games'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('game_id').primary()
      table.string('external_id', 100).unique() // GRID API ID
      table
        .integer('match_id')
        .unsigned()
        .notNullable()
        .references('match_id')
        .inTable('pro_matches')
        .onDelete('CASCADE')
      table.integer('game_number').notNullable() // 1, 2, 3, etc.
      table
        .integer('blue_team_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table
        .integer('red_team_id')
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
      table.integer('duration') // Duration in seconds
      table.string('status', 20).defaultTo('upcoming') // upcoming, live, completed
      table.string('patch', 20) // Game patch version

      // Objectives
      table.integer('blue_towers').defaultTo(0)
      table.integer('red_towers').defaultTo(0)
      table.integer('blue_dragons').defaultTo(0)
      table.integer('red_dragons').defaultTo(0)
      table.integer('blue_barons').defaultTo(0)
      table.integer('red_barons').defaultTo(0)
      table.integer('blue_heralds').defaultTo(0)
      table.integer('red_heralds').defaultTo(0)
      table.integer('blue_grubs').defaultTo(0)
      table.integer('red_grubs').defaultTo(0)

      // First objectives
      table.string('first_blood_team', 10) // 'blue' or 'red'
      table.string('first_tower_team', 10)
      table.string('first_dragon_team', 10)
      table.string('first_baron_team', 10)
      table.string('first_herald_team', 10)

      // Gold/kills at different timestamps
      table.integer('blue_gold_at_15')
      table.integer('red_gold_at_15')
      table.integer('blue_kills_at_15')
      table.integer('red_kills_at_15')

      table.jsonb('timeline_data') // Detailed timeline events
      table.jsonb('metadata')
      table.timestamp('started_at')
      table.timestamp('ended_at')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['match_id', 'game_number'])
      table.index(['match_id'])
      table.index(['blue_team_id'])
      table.index(['red_team_id'])
      table.index(['winner_team_id'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
