import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_streaks'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .string('puuid', 100)
        .notNullable()
        .unique()
        .references('puuid')
        .inTable('lol_accounts')
        .onDelete('CASCADE')
      table.integer('current_streak').notNullable().defaultTo(0)
      table.timestamp('current_streak_start')
      table.integer('best_win_streak').notNullable().defaultTo(0)
      table.timestamp('best_win_streak_start')
      table.timestamp('best_win_streak_end')
      table.integer('worst_loss_streak').notNullable().defaultTo(0)
      table.timestamp('worst_loss_streak_start')
      table.timestamp('worst_loss_streak_end')
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['current_streak'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
