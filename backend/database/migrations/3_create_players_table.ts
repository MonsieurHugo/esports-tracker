import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'players'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('player_id').primary()
      table.string('slug', 100).notNullable().unique()
      table.string('current_pseudo', 50).notNullable()
      table.string('first_name', 50)
      table.string('last_name', 50)
      table.string('nationality', 50)
      table.string('twitter', 100)
      table.string('twitch', 100)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['current_pseudo'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
