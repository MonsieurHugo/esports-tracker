import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // 1. Cascade delete: matches → games → stats → drafts → events
      await db.rawQuery('TRUNCATE TABLE pro_matches CASCADE')

      // 2. Clean up derived aggregated data (depends on games that were just deleted)
      await db.rawQuery('TRUNCATE TABLE pro_champion_stats')
      await db.rawQuery('TRUNCATE TABLE pro_champion_daily_stats')

      // 3. Clean up metadata
      await db.rawQuery("DELETE FROM pro_entity_mappings WHERE entity_type = 'match'")
      await db.rawQuery('DELETE FROM data_quality_flags')
    })
  }

  async down() {
    // No rollback possible for TRUNCATE — data is unrecoverable
  }
}
