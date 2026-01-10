import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'organizations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('org_id').primary()
      table.string('slug', 100).notNullable().unique()
      table.string('current_name', 100).notNullable()
      table.string('current_short_name', 20)
      table.string('logo_url', 500)
      table.string('country', 50)
      table.string('twitter', 100)
      table.string('website', 200)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
