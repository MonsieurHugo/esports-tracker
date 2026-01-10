import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'worker_metrics_hourly'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.timestamp('hour').notNullable().unique()
      table.integer('lol_matches_added').notNullable().defaultTo(0)
      table.integer('valorant_matches_added').notNullable().defaultTo(0)
      table.integer('lol_accounts_processed').notNullable().defaultTo(0)
      table.integer('valorant_accounts_processed').notNullable().defaultTo(0)
      table.integer('api_requests_made').notNullable().defaultTo(0)
      table.integer('api_errors').notNullable().defaultTo(0)

      table.index(['hour'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
