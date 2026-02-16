import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Refactor pro_team_stats from pre-aggregated (1 row per team per tournament)
 * to denormalized per-game (2 rows per game, one per team).
 *
 * This enables simple AVG/COUNT FILTER aggregations instead of AVG-of-AVG hacks.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTable('pro_team_stats')

    this.schema.createTable('pro_team_stats', (table) => {
      table.increments('id').primary()
      table
        .integer('game_id')
        .unsigned()
        .notNullable()
        .references('game_id')
        .inTable('pro_games')
        .onDelete('CASCADE')
      table
        .integer('match_id')
        .unsigned()
        .notNullable()
        .references('match_id')
        .inTable('pro_matches')
        .onDelete('CASCADE')
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')
      table
        .integer('team_id')
        .unsigned()
        .notNullable()
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('CASCADE')

      // Context
      table.string('side', 5).notNullable() // 'blue' or 'red'
      table.boolean('win').notNullable()
      table.integer('duration') // seconds

      // Performance
      table.integer('kills').defaultTo(0)
      table.integer('deaths').defaultTo(0) // opponent kills
      table.integer('towers').defaultTo(0)
      table.integer('dragons').defaultTo(0)
      table.integer('barons').defaultTo(0)
      table.integer('heralds').defaultTo(0)
      table.integer('grubs').defaultTo(0)
      table.integer('plates').defaultTo(0)

      // 15-min
      table.integer('gold_at_15')
      table.integer('kills_at_15')
      table.integer('gold_diff_at_15') // own - opponent

      // First objectives
      table.boolean('first_blood').defaultTo(false)
      table.boolean('first_tower').defaultTo(false)
      table.boolean('first_dragon').defaultTo(false)
      table.boolean('first_baron').defaultTo(false)
      table.boolean('first_herald').defaultTo(false)

      table.timestamp('created_at').defaultTo(this.now())

      table.unique(['game_id', 'team_id'])
      table.index(['team_id'])
      table.index(['tournament_id'])
      table.index(['match_id'])
    })
  }

  async down() {
    this.schema.dropTable('pro_team_stats')

    // Recreate old pre-aggregated schema (from migration 48)
    this.schema.createTable('pro_team_stats', (table) => {
      table.increments('id').primary()
      table
        .integer('team_id')
        .unsigned()
        .notNullable()
        .references('team_id')
        .inTable('pro_teams')
        .onDelete('CASCADE')
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')

      table.integer('matches_played').defaultTo(0)
      table.integer('matches_won').defaultTo(0)
      table.integer('games_played').defaultTo(0)
      table.integer('games_won').defaultTo(0)
      table.decimal('match_win_rate', 5, 2).defaultTo(0)
      table.decimal('game_win_rate', 5, 2).defaultTo(0)

      table.integer('avg_game_duration')
      table.decimal('avg_kills', 5, 2)
      table.decimal('avg_deaths', 5, 2)
      table.decimal('avg_towers', 5, 2)
      table.decimal('avg_dragons', 5, 2)
      table.decimal('avg_barons', 5, 2)
      table.integer('avg_gold_at_15')
      table.integer('avg_gold_diff_at_15')

      table.integer('first_blood_rate').defaultTo(0)
      table.integer('first_tower_rate').defaultTo(0)
      table.integer('first_dragon_rate').defaultTo(0)
      table.integer('first_herald_rate').defaultTo(0)
      table.integer('first_baron_rate').defaultTo(0)

      table.integer('blue_side_games').defaultTo(0)
      table.integer('blue_side_wins').defaultTo(0)
      table.integer('red_side_games').defaultTo(0)
      table.integer('red_side_wins').defaultTo(0)

      table.timestamp('created_at').defaultTo(this.now())
      table.timestamp('updated_at').defaultTo(this.now())

      table.unique(['team_id', 'tournament_id'])
      table.index(['team_id'])
      table.index(['tournament_id'])
    })
  }
}
