import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'splits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('split_id').primary()
      table.integer('season').notNullable()
      table.integer('split_number').notNullable()
      table.string('name', 50).notNullable()
      table.date('start_date').notNullable()
      table.date('end_date').notNullable()
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['season', 'split_number'])
      table.index(['start_date', 'end_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
