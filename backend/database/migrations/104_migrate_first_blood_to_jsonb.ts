import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migrate first_blood data from 2 boolean columns to a single JSONB column.
 *
 * New format: {"participant": bool, "victim": bool, "assist": bool, "time": int|null}
 * NULL if the player was not involved in first blood.
 */
export default class extends BaseSchema {
  async up() {
    // 1. Add JSONB column
    this.schema.alterTable('pro_player_stats', (table) => {
      table.jsonb('first_blood').nullable()
    })

    // 2. Backfill from existing boolean columns
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE pro_player_stats
        SET first_blood = jsonb_build_object(
          'participant', first_blood_participant,
          'victim', first_blood_victim,
          'assist', false,
          'time', null
        )
        WHERE first_blood_participant = true OR first_blood_victim = true
      `)
    })

    // 3. Drop old boolean columns
    this.schema.alterTable('pro_player_stats', (table) => {
      table.dropColumn('first_blood_participant')
      table.dropColumn('first_blood_victim')
    })
  }

  async down() {
    // 1. Re-add boolean columns
    this.schema.alterTable('pro_player_stats', (table) => {
      table.boolean('first_blood_participant').defaultTo(false)
      table.boolean('first_blood_victim').defaultTo(false)
    })

    // 2. Backfill from JSONB
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE pro_player_stats
        SET first_blood_participant = COALESCE((first_blood->>'participant')::boolean, false),
            first_blood_victim = COALESCE((first_blood->>'victim')::boolean, false)
        WHERE first_blood IS NOT NULL
      `)
    })

    // 3. Drop JSONB column
    this.schema.alterTable('pro_player_stats', (table) => {
      table.dropColumn('first_blood')
    })
  }
}
