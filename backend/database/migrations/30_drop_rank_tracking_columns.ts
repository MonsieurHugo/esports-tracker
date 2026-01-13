import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_daily_stats'

  async up() {
    const columns = ['lp_start', 'lp_end', 'tier_start', 'tier_end', 'rank_start', 'rank_end']

    for (const col of columns) {
      const hasCol = await this.schema.hasColumn(this.tableName, col)
      if (hasCol) {
        this.schema.alterTable(this.tableName, (table) => {
          table.dropColumn(col)
        })
      }
    }
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('lp_start').nullable()
      table.integer('lp_end').nullable()
      table.string('tier_start', 20).nullable()
      table.string('tier_end', 20).nullable()
      table.string('rank_start', 5).nullable()
      table.string('rank_end', 5).nullable()
    })
  }
}
