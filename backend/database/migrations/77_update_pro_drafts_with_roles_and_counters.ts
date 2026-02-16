import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_drafts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Add role columns for each pick
      table.string('team1_role_1', 10).nullable()
      table.string('team1_role_2', 10).nullable()
      table.string('team1_role_3', 10).nullable()
      table.string('team1_role_4', 10).nullable()
      table.string('team1_role_5', 10).nullable()
      table.string('team2_role_1', 10).nullable()
      table.string('team2_role_2', 10).nullable()
      table.string('team2_role_3', 10).nullable()
      table.string('team2_role_4', 10).nullable()
      table.string('team2_role_5', 10).nullable()

      // Add counter pick flags
      table.boolean('team1_counter_1').defaultTo(false)
      table.boolean('team1_counter_2').defaultTo(false)
      table.boolean('team1_counter_3').defaultTo(false)
      table.boolean('team1_counter_4').defaultTo(false)
      table.boolean('team1_counter_5').defaultTo(false)
      table.boolean('team2_counter_1').defaultTo(false)
      table.boolean('team2_counter_2').defaultTo(false)
      table.boolean('team2_counter_3').defaultTo(false)
      table.boolean('team2_counter_4').defaultTo(false)
      table.boolean('team2_counter_5').defaultTo(false)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('team1_role_1')
      table.dropColumn('team1_role_2')
      table.dropColumn('team1_role_3')
      table.dropColumn('team1_role_4')
      table.dropColumn('team1_role_5')
      table.dropColumn('team2_role_1')
      table.dropColumn('team2_role_2')
      table.dropColumn('team2_role_3')
      table.dropColumn('team2_role_4')
      table.dropColumn('team2_role_5')
      table.dropColumn('team1_counter_1')
      table.dropColumn('team1_counter_2')
      table.dropColumn('team1_counter_3')
      table.dropColumn('team1_counter_4')
      table.dropColumn('team1_counter_5')
      table.dropColumn('team2_counter_1')
      table.dropColumn('team2_counter_2')
      table.dropColumn('team2_counter_3')
      table.dropColumn('team2_counter_4')
      table.dropColumn('team2_counter_5')
    })
  }
}
