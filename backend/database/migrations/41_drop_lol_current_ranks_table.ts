import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_current_ranks'

  async up() {
    this.schema.dropTableIfExists(this.tableName)
  }

  async down() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('puuid', 100)
        .notNullable()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      table.string('queue_type', 30).notNullable()
      table.string('tier', 20)
      table.string('rank', 5)
      table.integer('league_points').notNullable().defaultTo(0)
      table.integer('wins').notNullable().defaultTo(0)
      table.integer('losses').notNullable().defaultTo(0)
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.unique(['puuid', 'queue_type'])
      table.index(['tier', 'rank'])
    })
  }
}
