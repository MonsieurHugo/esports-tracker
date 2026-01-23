import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Team aggregated stats per tournament
    this.schema.createTable('pro_team_stats', (table) => {
      table.increments('id').primary()
      table
        .integer('team_id')
        .unsigned()
        .notNullable()
        .references('team_id')
        .inTable('teams')
        .onDelete('CASCADE')
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')

      // Match stats
      table.integer('matches_played').defaultTo(0)
      table.integer('matches_won').defaultTo(0)
      table.integer('games_played').defaultTo(0)
      table.integer('games_won').defaultTo(0)
      table.decimal('match_win_rate', 5, 2).defaultTo(0)
      table.decimal('game_win_rate', 5, 2).defaultTo(0)

      // Game averages
      table.decimal('avg_game_duration', 8, 2).defaultTo(0)
      table.decimal('avg_kills', 5, 2).defaultTo(0)
      table.decimal('avg_deaths', 5, 2).defaultTo(0)
      table.decimal('avg_towers', 5, 2).defaultTo(0)
      table.decimal('avg_dragons', 5, 2).defaultTo(0)
      table.decimal('avg_barons', 5, 2).defaultTo(0)
      table.decimal('avg_gold_at_15', 10, 2).defaultTo(0)
      table.decimal('avg_gold_diff_at_15', 8, 2).defaultTo(0)

      // First objectives rates (percentage * 100)
      table.integer('first_blood_rate').defaultTo(0)
      table.integer('first_tower_rate').defaultTo(0)
      table.integer('first_dragon_rate').defaultTo(0)
      table.integer('first_herald_rate').defaultTo(0)
      table.integer('first_baron_rate').defaultTo(0)

      // Side stats
      table.integer('blue_side_games').defaultTo(0)
      table.integer('blue_side_wins').defaultTo(0)
      table.integer('red_side_games').defaultTo(0)
      table.integer('red_side_wins').defaultTo(0)

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['team_id', 'tournament_id'])
      table.index(['team_id'])
      table.index(['tournament_id'])
    })

    // Player aggregated stats per tournament
    this.schema.createTable('pro_player_aggregated_stats', (table) => {
      table.increments('id').primary()
      table
        .integer('player_id')
        .unsigned()
        .notNullable()
        .references('player_id')
        .inTable('players')
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
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table.string('role', 20)

      // Game stats
      table.integer('games_played').defaultTo(0)
      table.integer('games_won').defaultTo(0)
      table.decimal('win_rate', 5, 2).defaultTo(0)

      // Totals
      table.integer('total_kills').defaultTo(0)
      table.integer('total_deaths').defaultTo(0)
      table.integer('total_assists').defaultTo(0)
      table.integer('total_cs').defaultTo(0)
      table.bigInteger('total_gold').defaultTo(0)
      table.bigInteger('total_damage').defaultTo(0)
      table.integer('total_vision_score').defaultTo(0)

      // Averages
      table.decimal('avg_kills', 5, 2).defaultTo(0)
      table.decimal('avg_deaths', 5, 2).defaultTo(0)
      table.decimal('avg_assists', 5, 2).defaultTo(0)
      table.decimal('avg_cs_per_min', 5, 2).defaultTo(0)
      table.decimal('avg_gold_per_min', 8, 2).defaultTo(0)
      table.decimal('avg_damage_per_min', 8, 2).defaultTo(0)
      table.decimal('avg_vision_score', 5, 2).defaultTo(0)
      table.decimal('avg_kda', 5, 2).defaultTo(0)
      table.decimal('avg_kill_participation', 5, 2).defaultTo(0)
      table.decimal('avg_gold_share', 5, 2).defaultTo(0)
      table.decimal('avg_damage_share', 5, 2).defaultTo(0)

      // Laning stats
      table.decimal('avg_cs_diff_at_15', 6, 2).defaultTo(0)
      table.decimal('avg_gold_diff_at_15', 8, 2).defaultTo(0)
      table.decimal('avg_xp_diff_at_15', 8, 2).defaultTo(0)

      // First blood
      table.integer('first_blood_participations').defaultTo(0)
      table.integer('first_blood_victims').defaultTo(0)

      // Multi-kills
      table.integer('double_kills').defaultTo(0)
      table.integer('triple_kills').defaultTo(0)
      table.integer('quadra_kills').defaultTo(0)
      table.integer('penta_kills').defaultTo(0)

      // Champions played
      table.integer('unique_champions_played').defaultTo(0)

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['player_id', 'tournament_id'])
      table.index(['player_id'])
      table.index(['tournament_id'])
      table.index(['team_id'])
      table.index(['role'])
    })

    // Champion stats per tournament (pick/ban analysis)
    this.schema.createTable('pro_champion_stats', (table) => {
      table.increments('id').primary()
      table.integer('champion_id').notNullable()
      table
        .integer('tournament_id')
        .unsigned()
        .notNullable()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')

      // Pick/ban stats
      table.integer('picks').defaultTo(0)
      table.integer('bans').defaultTo(0)
      table.integer('wins').defaultTo(0)
      table.integer('losses').defaultTo(0)
      table.decimal('presence_rate', 5, 2).defaultTo(0) // (picks + bans) / total_games
      table.decimal('pick_rate', 5, 2).defaultTo(0)
      table.decimal('ban_rate', 5, 2).defaultTo(0)
      table.decimal('win_rate', 5, 2).defaultTo(0)

      // Performance averages when picked
      table.decimal('avg_kills', 5, 2).defaultTo(0)
      table.decimal('avg_deaths', 5, 2).defaultTo(0)
      table.decimal('avg_assists', 5, 2).defaultTo(0)
      table.decimal('avg_kda', 5, 2).defaultTo(0)
      table.decimal('avg_cs_per_min', 5, 2).defaultTo(0)
      table.decimal('avg_gold_per_min', 8, 2).defaultTo(0)

      // By side
      table.integer('blue_side_picks').defaultTo(0)
      table.integer('blue_side_wins').defaultTo(0)
      table.integer('red_side_picks').defaultTo(0)
      table.integer('red_side_wins').defaultTo(0)

      // By role
      table.integer('top_picks').defaultTo(0)
      table.integer('jungle_picks').defaultTo(0)
      table.integer('mid_picks').defaultTo(0)
      table.integer('adc_picks').defaultTo(0)
      table.integer('support_picks').defaultTo(0)

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['champion_id', 'tournament_id'])
      table.index(['tournament_id'])
      table.index(['champion_id'])
      table.index(['presence_rate'])
      table.index(['win_rate'])
    })
  }

  async down() {
    this.schema.dropTable('pro_champion_stats')
    this.schema.dropTable('pro_player_aggregated_stats')
    this.schema.dropTable('pro_team_stats')
  }
}
