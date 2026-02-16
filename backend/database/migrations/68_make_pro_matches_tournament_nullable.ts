import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_matches'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Make tournament_id nullable to allow syncing series without tournament context
      table.integer('tournament_id').unsigned().nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('tournament_id').unsigned().notNullable().alter()
    })
  }
}
