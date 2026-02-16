import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Add early game objectives (@15min), vision and gold columns to pro_team_stats.
 *
 * New columns:
 * - dragons_at_15, towers_at_15: objectives taken before 15:00
 * - total_gold: sum of all players' gold_earned
 * - wards_placed, wards_destroyed, control_wards, vision_score: team vision aggregates
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_team_stats', (table) => {
      // Early game objectives (before 15:00 / 900s)
      table.integer('dragons_at_15').defaultTo(0)
      table.integer('towers_at_15').defaultTo(0)

      // Team total gold
      table.integer('total_gold').defaultTo(0)

      // Team vision aggregates
      table.integer('wards_placed').defaultTo(0)
      table.integer('wards_destroyed').defaultTo(0)
      table.integer('control_wards').defaultTo(0)
      table.integer('vision_score').defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable('pro_team_stats', (table) => {
      table.dropColumn('dragons_at_15')
      table.dropColumn('towers_at_15')
      table.dropColumn('total_gold')
      table.dropColumn('wards_placed')
      table.dropColumn('wards_destroyed')
      table.dropColumn('control_wards')
      table.dropColumn('vision_score')
    })
  }
}
