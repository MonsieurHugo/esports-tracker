import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_teams'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('team_id').primary()
      table.string('external_id', 50).notNullable().unique()
      table.string('name', 100).notNullable()
      table.string('short_name', 20)
      table.string('logo_url', 500)
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
    })

    // Index for name search
    this.schema.alterTable(this.tableName, (table) => {
      table.index(['name'], 'idx_pro_teams_name')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
