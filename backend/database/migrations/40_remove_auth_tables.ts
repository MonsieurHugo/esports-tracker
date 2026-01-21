import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Drop auth-related tables in correct order (respecting foreign keys)
    this.schema.dropTableIfExists('auth_audit_logs')
    this.schema.dropTableIfExists('oauth_accounts')
    this.schema.dropTableIfExists('email_verification_tokens')
    this.schema.dropTableIfExists('password_reset_tokens')
    this.schema.dropTableIfExists('users')
  }

  async down() {
    // Recreate tables if rollback is needed
    this.schema.createTable('users', (table) => {
      table.increments('id')
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.string('full_name').nullable()
      table.enum('role', ['user', 'admin']).defaultTo('user')
      table.boolean('email_verified').defaultTo(false)
      table.boolean('two_factor_enabled').defaultTo(false)
      table.string('two_factor_secret').nullable()
      table.text('two_factor_recovery_codes').nullable()
      table.timestamp('last_login_at').nullable()
      table.timestamp('locked_until').nullable()
      table.integer('failed_login_attempts').defaultTo(0)
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })

    this.schema.createTable('password_reset_tokens', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('token').notNullable().unique()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at')
    })

    this.schema.createTable('email_verification_tokens', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('token').notNullable().unique()
      table.timestamp('expires_at').notNullable()
      table.timestamp('created_at')
    })

    this.schema.createTable('oauth_accounts', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('provider').notNullable()
      table.string('provider_user_id').notNullable()
      table.string('email').nullable()
      table.string('name').nullable()
      table.string('avatar_url').nullable()
      table.text('access_token').nullable()
      table.text('refresh_token').nullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.unique(['provider', 'provider_user_id'])
    })

    this.schema.createTable('auth_audit_logs', (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('event_type').notNullable()
      table.string('ip_address').nullable()
      table.string('user_agent').nullable()
      table.text('details').nullable()
      table.boolean('success').defaultTo(true)
      table.timestamp('created_at')
    })
  }
}
