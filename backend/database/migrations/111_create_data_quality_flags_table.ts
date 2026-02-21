import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'data_quality_flags'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('flag_id').primary()
      table.string('flag_type', 50).notNullable() // format_inferred, side_defaulted, etc.
      table.string('severity', 20).notNullable().defaultTo('warning') // info, warning, error
      table.string('entity_type', 30) // match, game, player, team, account
      table.integer('entity_id') // match_id, game_id, etc.
      table.string('external_id', 200) // GRID / Leaguepedia ID
      table.jsonb('context').defaultTo('{}') // all relevant details
      table.boolean('resolved').defaultTo(false)
      table.timestamp('resolved_at')
      table.string('resolved_by', 100)
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.index(['flag_type'])
      table.index(['severity'])
      table.index(['resolved'])
      table.index(['entity_type', 'entity_id'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
