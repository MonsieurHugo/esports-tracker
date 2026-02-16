import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_leagues', (table) => {
      table.integer('tier').unsigned().defaultTo(1) // 1 = top tier (LEC, LCK), 2 = secondary (LFL), 3 = amateur
      table.index(['tier'])
    })
  }

  async down() {
    this.schema.alterTable('pro_leagues', (table) => {
      table.dropIndex(['tier'])
      table.dropColumn('tier')
    })
  }
}
