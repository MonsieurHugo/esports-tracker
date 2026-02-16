import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Add detailed objectives data to pro_team_stats.
 *
 * Adds:
 * - First objective timings (seconds)
 * - first_grubs boolean
 * - Dragon type breakdown (per game counts)
 * - Elder dragon count
 * - Dragon soul (boolean + type)
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_team_stats', (table) => {
      // First objective timings (seconds, NULL if team didn't get first)
      table.integer('first_blood_time').nullable()
      table.integer('first_tower_time').nullable()
      table.integer('first_dragon_time').nullable()
      table.integer('first_herald_time').nullable()
      table.integer('first_baron_time').nullable()
      table.integer('first_grubs_time').nullable()

      // First grubs (missing from migration 91)
      table.boolean('first_grubs').defaultTo(false)

      // Dragon type breakdown (count per game)
      table.integer('fire_dragons').defaultTo(0)
      table.integer('ocean_dragons').defaultTo(0)
      table.integer('mountain_dragons').defaultTo(0)
      table.integer('air_dragons').defaultTo(0)
      table.integer('hextech_dragons').defaultTo(0)
      table.integer('chemtech_dragons').defaultTo(0)
      table.integer('elder_dragons').defaultTo(0)

      // Dragon soul
      table.boolean('dragon_soul').defaultTo(false)
      table.string('dragon_soul_type', 20).nullable()
    })
  }

  async down() {
    this.schema.alterTable('pro_team_stats', (table) => {
      table.dropColumn('first_blood_time')
      table.dropColumn('first_tower_time')
      table.dropColumn('first_dragon_time')
      table.dropColumn('first_herald_time')
      table.dropColumn('first_baron_time')
      table.dropColumn('first_grubs_time')
      table.dropColumn('first_grubs')
      table.dropColumn('fire_dragons')
      table.dropColumn('ocean_dragons')
      table.dropColumn('mountain_dragons')
      table.dropColumn('air_dragons')
      table.dropColumn('hextech_dragons')
      table.dropColumn('chemtech_dragons')
      table.dropColumn('elder_dragons')
      table.dropColumn('dragon_soul')
      table.dropColumn('dragon_soul_type')
    })
  }
}
