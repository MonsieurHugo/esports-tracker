import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'teams'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('team_id').primary()
      table
        .integer('org_id')
        .unsigned()
        .references('org_id')
        .inTable('organizations')
        .onDelete('SET NULL')
      table.integer('game_id').notNullable().defaultTo(1) // 1 = LoL
      table.string('slug', 100).notNullable().unique()
      table.string('current_name', 100).notNullable()
      table.string('short_name', 20).notNullable()
      table.string('region', 20)
      table.string('division', 50)
      table.boolean('is_active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['region', 'is_active'])
      table.index(['game_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
