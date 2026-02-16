import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_champion_daily_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('champion_id').notNullable()
      table.date('date').notNullable()
      table
        .integer('tournament_id')
        .unsigned()
        .references('tournament_id')
        .inTable('pro_tournaments')
        .onDelete('CASCADE')

      // Core stats
      table.integer('picks').defaultTo(0)
      table.integer('bans').defaultTo(0)
      table.integer('fearless_bans').defaultTo(0)
      table.integer('wins').defaultTo(0)
      table.integer('total_games').defaultTo(0)

      // By side
      table.integer('blue_picks').defaultTo(0)
      table.integer('blue_wins').defaultTo(0)
      table.integer('red_picks').defaultTo(0)
      table.integer('red_wins').defaultTo(0)

      // By role
      table.integer('top_picks').defaultTo(0)
      table.integer('top_wins').defaultTo(0)
      table.integer('jungle_picks').defaultTo(0)
      table.integer('jungle_wins').defaultTo(0)
      table.integer('mid_picks').defaultTo(0)
      table.integer('mid_wins').defaultTo(0)
      table.integer('adc_picks').defaultTo(0)
      table.integer('adc_wins').defaultTo(0)
      table.integer('support_picks').defaultTo(0)
      table.integer('support_wins').defaultTo(0)

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      // Unique constraint: one row per champion per day per tournament
      table.unique(['champion_id', 'date', 'tournament_id'])

      // Indexes for common queries
      table.index(['date'])
      table.index(['champion_id'])
      table.index(['tournament_id'])
      table.index(['champion_id', 'date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
