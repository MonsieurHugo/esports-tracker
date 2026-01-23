import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('stat_id').primary()
      table
        .integer('game_id')
        .unsigned()
        .notNullable()
        .references('game_id')
        .inTable('pro_games')
        .onDelete('CASCADE')
      table
        .integer('player_id')
        .unsigned()
        .notNullable()
        .references('player_id')
        .inTable('players')
        .onDelete('CASCADE')
      table
        .integer('team_id')
        .unsigned()
        .references('team_id')
        .inTable('teams')
        .onDelete('SET NULL')
      table.string('team_side', 10) // 'blue' or 'red'
      table.string('role', 20) // Top, Jungle, Mid, ADC, Support
      table.integer('champion_id').notNullable()

      // Core stats
      table.integer('kills').defaultTo(0)
      table.integer('deaths').defaultTo(0)
      table.integer('assists').defaultTo(0)
      table.integer('cs').defaultTo(0)
      table.decimal('cs_per_min', 5, 2).defaultTo(0)
      table.integer('gold_earned').defaultTo(0)
      table.integer('gold_share').defaultTo(0) // Percentage * 100
      table.integer('damage_dealt').defaultTo(0)
      table.integer('damage_share').defaultTo(0) // Percentage * 100
      table.integer('damage_taken').defaultTo(0)
      table.integer('vision_score').defaultTo(0)
      table.integer('wards_placed').defaultTo(0)
      table.integer('wards_destroyed').defaultTo(0)
      table.integer('control_wards_purchased').defaultTo(0)

      // Early game stats (at 15 min)
      table.integer('cs_at_15').defaultTo(0)
      table.integer('gold_at_15').defaultTo(0)
      table.integer('xp_at_15').defaultTo(0)
      table.integer('cs_diff_at_15').defaultTo(0)
      table.integer('gold_diff_at_15').defaultTo(0)
      table.integer('xp_diff_at_15').defaultTo(0)

      // Kill participation
      table.integer('kill_participation').defaultTo(0) // Percentage * 100
      table.boolean('first_blood_participant').defaultTo(false)
      table.boolean('first_blood_victim').defaultTo(false)

      // Misc
      table.integer('solo_kills').defaultTo(0)
      table.integer('double_kills').defaultTo(0)
      table.integer('triple_kills').defaultTo(0)
      table.integer('quadra_kills').defaultTo(0)
      table.integer('penta_kills').defaultTo(0)

      table.jsonb('items') // Final items array
      table.jsonb('runes') // Runes configuration
      table.jsonb('metadata')

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['game_id', 'player_id'])
      table.index(['game_id'])
      table.index(['player_id'])
      table.index(['team_id'])
      table.index(['champion_id'])
      table.index(['role'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
