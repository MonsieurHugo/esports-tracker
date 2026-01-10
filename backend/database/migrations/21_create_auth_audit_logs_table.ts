import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable()
      table.string('action', 50).notNullable() // 'login', 'logout', 'failed_login', 'password_reset', '2fa_enabled', etc.
      table.string('ip_address', 45).nullable()
      table.text('user_agent').nullable()
      table.boolean('success').defaultTo(true).notNullable()
      table.string('reason', 255).nullable() // Failure reason
      table.json('metadata').nullable() // Additional context data
      table.timestamp('created_at').notNullable()

      // Index for querying by user and action
      table.index(['user_id', 'action'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
