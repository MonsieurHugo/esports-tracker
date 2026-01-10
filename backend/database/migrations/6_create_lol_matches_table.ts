import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_matches'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('match_id', 50).primary()
      table.timestamp('game_start').notNullable()
      table.integer('game_duration').notNullable()
      table.integer('queue_id').notNullable()
      table.string('game_version', 20)
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['game_start'])
      table.index(['queue_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
