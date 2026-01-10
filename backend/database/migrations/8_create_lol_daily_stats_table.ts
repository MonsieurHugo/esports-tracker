import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_daily_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('puuid', 100)
        .notNullable()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      table.date('date').notNullable()
      table.integer('games_played').notNullable().defaultTo(0)
      table.integer('wins').notNullable().defaultTo(0)
      table.integer('soloq_games').notNullable().defaultTo(0)
      table.integer('flex_games').notNullable().defaultTo(0)
      table.integer('total_kills').notNullable().defaultTo(0)
      table.integer('total_deaths').notNullable().defaultTo(0)
      table.integer('total_assists').notNullable().defaultTo(0)
      table.integer('total_cs').notNullable().defaultTo(0)
      table.bigInteger('total_damage').notNullable().defaultTo(0)
      table.integer('total_game_duration')

      table.unique(['puuid', 'date'])
      table.index(['date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
