import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'leagues'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('league_id').primary()
      table.string('name', 100).notNullable()
      table.string('short_name', 20).notNullable().unique()
      table.string('region', 20).notNullable()
      table.integer('tier').notNullable().defaultTo(1)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['region', 'is_active'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
