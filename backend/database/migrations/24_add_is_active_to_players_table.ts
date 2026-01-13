import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'players'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.boolean('is_active').notNullable().defaultTo(true)
      table.index(['is_active'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['is_active'])
      table.dropColumn('is_active')
    })
  }
}
