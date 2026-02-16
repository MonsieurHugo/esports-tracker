import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_games'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('blue_kills').defaultTo(0)
      table.integer('red_kills').defaultTo(0)
      table.integer('blue_plates').defaultTo(0)
      table.integer('red_plates').defaultTo(0)
      table.jsonb('plates_detail')
      table.jsonb('objectives_timeline')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('blue_kills')
      table.dropColumn('red_kills')
      table.dropColumn('blue_plates')
      table.dropColumn('red_plates')
      table.dropColumn('plates_detail')
      table.dropColumn('objectives_timeline')
    })
  }
}
