import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_match_stats'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('match_id', 50)
        .notNullable()
        .references('match_id')
        .inTable('lol_matches')
        .onDelete('CASCADE')
      table
        .string('puuid', 100)
        .notNullable()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      table.integer('champion_id').notNullable()
      table.boolean('win').notNullable()
      table.integer('kills').notNullable().defaultTo(0)
      table.integer('deaths').notNullable().defaultTo(0)
      table.integer('assists').notNullable().defaultTo(0)
      table.integer('cs').notNullable().defaultTo(0)
      table.integer('vision_score').notNullable().defaultTo(0)
      table.integer('damage_dealt').notNullable().defaultTo(0)
      table.integer('gold_earned').notNullable().defaultTo(0)
      table.string('role', 20)
      table.integer('team_id')

      table.unique(['match_id', 'puuid'])
      table.index(['puuid', 'match_id'])
      table.index(['champion_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
