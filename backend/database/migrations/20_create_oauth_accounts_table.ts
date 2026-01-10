import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'oauth_accounts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('provider', 50).notNullable() // 'google', 'github', 'discord'
      table.string('provider_user_id', 255).notNullable()
      table.string('provider_email', 254).nullable()
      table.text('access_token').nullable()
      table.text('refresh_token').nullable()
      table.timestamp('token_expires_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      // Unique constraint: one provider account per user
      table.unique(['user_id', 'provider'])
      // Unique constraint: one user per provider account
      table.unique(['provider', 'provider_user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
