import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Email verification
      table.boolean('email_verified').defaultTo(false).notNullable()
      table.timestamp('email_verified_at').nullable()

      // 2FA
      table.boolean('two_factor_enabled').defaultTo(false).notNullable()
      table.string('two_factor_secret', 64).nullable()
      table.text('two_factor_recovery_codes').nullable() // JSON array of codes

      // Account security
      table.integer('failed_login_attempts').defaultTo(0).notNullable()
      table.timestamp('locked_until').nullable()
      table.timestamp('last_login_at').nullable()
      table.string('last_login_ip', 45).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('email_verified')
      table.dropColumn('email_verified_at')
      table.dropColumn('two_factor_enabled')
      table.dropColumn('two_factor_secret')
      table.dropColumn('two_factor_recovery_codes')
      table.dropColumn('failed_login_attempts')
      table.dropColumn('locked_until')
      table.dropColumn('last_login_at')
      table.dropColumn('last_login_ip')
    })
  }
}
