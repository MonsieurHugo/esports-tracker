import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('plates').defaultTo('{}')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('plates')
    })
  }
}
