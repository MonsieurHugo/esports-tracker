import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'worker_status'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.boolean('is_running').notNullable().defaultTo(false)
      table.timestamp('started_at')
      table.integer('session_lol_matches').notNullable().defaultTo(0)
      table.integer('session_valorant_matches').notNullable().defaultTo(0)
      table.integer('session_lol_accounts').notNullable().defaultTo(0)
      table.integer('session_valorant_accounts').notNullable().defaultTo(0)
      table.integer('session_errors').notNullable().defaultTo(0)
      table.integer('session_api_requests').notNullable().defaultTo(0)
      table.string('current_account_name', 100)
      table.string('current_account_region', 10)
      table.integer('active_accounts_count').notNullable().defaultTo(0)
      table.integer('today_accounts_count').notNullable().defaultTo(0)
      table.integer('inactive_accounts_count').notNullable().defaultTo(0)
      table.timestamp('last_activity_at')
      table.timestamp('last_error_at')
      table.text('last_error_message')
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
    })

    // Insert default row
    this.defer(async (db) => {
      await db.table(this.tableName).insert({ id: 1 })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
