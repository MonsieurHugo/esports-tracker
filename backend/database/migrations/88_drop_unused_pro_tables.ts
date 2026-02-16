import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Drop unused pro tables
 *
 * - pro_sync_requests: no longer used after worker GRID simplification (polling removed)
 * - pro_stages: orphaned since migration 54 (FK removed from pro_matches)
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('DROP TABLE IF EXISTS pro_sync_requests CASCADE')
    this.schema.raw('DROP TABLE IF EXISTS pro_stages CASCADE')
  }

  async down() {
    this.schema.createTable('pro_sync_requests', (table) => {
      table.increments('id').primary()
      table.string('request_type', 50).notNullable()
      table.string('target_id', 100)
      table.jsonb('filters')
      table.string('status', 20).defaultTo('pending')
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('processed_at')
      table.jsonb('result')
      table.text('error_message')

      table.index(['status'])
      table.index(['created_at'])
      table.index(['status', 'created_at'])
    })

    // pro_stages is not recreated — it was already orphaned
  }
}
