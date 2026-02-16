import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Drop the pro_player_aggregated_stats table.
 *
 * This table duplicated data that can be computed on the fly from pro_player_stats.
 * All reads have been replaced with live aggregation queries.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('pro_player_aggregated_stats')
  }

  async down() {
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
        .inTable('pro_teams')
        .onDelete('SET NULL')
      table.string('role', 20)

      table.integer('games_played').defaultTo(0)
      table.integer('games_won').defaultTo(0)
      table.decimal('win_rate', 5, 2).defaultTo(0)

      table.integer('total_kills').defaultTo(0)
      table.integer('total_deaths').defaultTo(0)
      table.integer('total_assists').defaultTo(0)
      table.integer('total_cs').defaultTo(0)
      table.bigInteger('total_gold').defaultTo(0)
      table.bigInteger('total_damage').defaultTo(0)
      table.integer('total_vision_score').defaultTo(0)

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

      table.decimal('avg_cs_diff_at_15', 6, 2).defaultTo(0)
      table.decimal('avg_gold_diff_at_15', 8, 2).defaultTo(0)
      table.decimal('avg_xp_diff_at_15', 8, 2).defaultTo(0)

      table.integer('first_blood_participations').defaultTo(0)
      table.integer('first_blood_victims').defaultTo(0)

      table.integer('double_kills').defaultTo(0)
      table.integer('triple_kills').defaultTo(0)
      table.integer('quadra_kills').defaultTo(0)
      table.integer('penta_kills').defaultTo(0)

      table.integer('unique_champions_played').defaultTo(0)

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['player_id', 'tournament_id'])
      table.index(['player_id'])
      table.index(['tournament_id'])
      table.index(['team_id'])
      table.index(['role'])
    })
  }
}
