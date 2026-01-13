import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_daily_stats'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Drop unused columns
      table.dropColumn('soloq_games')
      table.dropColumn('flex_games')
      table.dropColumn('total_cs')
      table.dropColumn('total_damage')

      // Add rank columns
      table.string('tier', 20).nullable()
      table.string('rank', 5).nullable()
      table.integer('lp').defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Remove rank columns
      table.dropColumn('tier')
      table.dropColumn('rank')
      table.dropColumn('lp')

      // Restore dropped columns
      table.integer('soloq_games').notNullable().defaultTo(0)
      table.integer('flex_games').notNullable().defaultTo(0)
      table.integer('total_cs').notNullable().defaultTo(0)
      table.bigInteger('total_damage').notNullable().defaultTo(0)
    })
  }
}
