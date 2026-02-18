import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_match_stats'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.smallint('summoner1_id').nullable()
      table.smallint('summoner2_id').nullable()
      table.integer('summoner1_casts').nullable().defaultTo(0)
      table.integer('summoner2_casts').nullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('summoner1_id')
      table.dropColumn('summoner2_id')
      table.dropColumn('summoner1_casts')
      table.dropColumn('summoner2_casts')
    })
  }
}
