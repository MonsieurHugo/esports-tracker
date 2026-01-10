import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'player_contracts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('contract_id').primary()
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
        .notNullable()
        .references('team_id')
        .inTable('teams')
        .onDelete('CASCADE')
      table.string('role', 20)
      table.boolean('is_starter').notNullable().defaultTo(true)
      table.date('start_date')
      table.date('end_date')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['player_id', 'end_date'])
      table.index(['team_id', 'is_starter'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
