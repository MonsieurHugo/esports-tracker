import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropColumn('league_id')
      table.dropColumn('season')
      table.dropColumn('split')
      table.dropColumn('region')
      table.dropColumn('tier')
      table.dropColumn('logo_url')
      table.dropColumn('metadata')
    })
  }

  async down() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.integer('league_id').unsigned()
      table.string('season', 50)
      table.string('split', 50)
      table.string('region', 50)
      table.integer('tier').unsigned().defaultTo(1)
      table.string('logo_url', 500)
      table.jsonb('metadata')
    })
  }
}
