import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_worker_status'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('id').primary().defaultTo(1)
      table.boolean('is_running').notNullable().defaultTo(false)
      table.timestamp('started_at')
      table.string('current_task', 100)
      table.timestamp('current_task_started_at')
      table.string('last_task', 100)
      table.timestamp('last_task_completed_at')
      table.integer('session_tournaments').notNullable().defaultTo(0)
      table.integer('session_matches').notNullable().defaultTo(0)
      table.integer('session_games').notNullable().defaultTo(0)
      table.integer('session_errors').notNullable().defaultTo(0)
      table.integer('session_api_requests').notNullable().defaultTo(0)
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
