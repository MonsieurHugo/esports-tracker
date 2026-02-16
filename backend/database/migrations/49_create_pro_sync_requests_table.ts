import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_sync_requests'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('request_type', 50).notNullable() // 'full_sync', 'tournament_sync', 'match_sync'
      table.string('target_id', 100) // tournament_id, match_id (optional)
      table.jsonb('filters') // {"region": "EMEA", "league": "LEC"}
      table.string('status', 20).defaultTo('pending') // pending, processing, completed, failed
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at')
      table.jsonb('result') // {"matches_synced": 10, "errors": []}
      table.text('error_message')

      table.index(['status'])
      table.index(['created_at'])
      table.index(['status', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
