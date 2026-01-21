import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_accounts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.float('activity_score').defaultTo(50.0)
      table.string('activity_tier', 20).defaultTo('moderate')
      table.timestamp('next_fetch_at').nullable()
      table.integer('consecutive_empty_fetches').defaultTo(0)
    })

    // Add index for priority queue queries (region + next_fetch_at)
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['region', 'next_fetch_at'], 'idx_lol_accounts_priority')
      table.index(['activity_tier'], 'idx_lol_accounts_tier')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['region', 'next_fetch_at'], 'idx_lol_accounts_priority')
      table.dropIndex(['activity_tier'], 'idx_lol_accounts_tier')
    })

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('activity_score')
      table.dropColumn('activity_tier')
      table.dropColumn('next_fetch_at')
      table.dropColumn('consecutive_empty_fetches')
    })
  }
}
