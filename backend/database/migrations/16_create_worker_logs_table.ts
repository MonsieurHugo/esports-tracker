import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'worker_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.timestamp('timestamp').notNullable().defaultTo(this.now())
      table.string('log_type', 20).notNullable()
      table.string('severity', 10).notNullable().defaultTo('info')
      table.text('message').notNullable()
      table.string('account_name', 100)
      table.string('account_puuid', 100)
      table.jsonb('details')

      table.index(['timestamp'])
      table.index(['log_type', 'severity'])
      table.index(['account_puuid'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
