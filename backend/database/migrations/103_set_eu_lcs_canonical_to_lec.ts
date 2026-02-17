import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Seed the canonical_league_id for EU LCS → LEC.
 *
 * "EU League Championship Series" is the historical name for what is now
 * "LoL EMEA Championship" (LEC). This migration links them so that
 * filtering by LEC automatically includes EU LCS data.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const lecRow = await db
        .from('pro_leagues')
        .where('name', 'League of Legends EMEA Championship')
        .select('league_id')
        .first()

      if (!lecRow) return

      await db
        .from('pro_leagues')
        .whereIn('name', [
          'EU League Championship Series',
          'Europe League Championship Series',
        ])
        .update({ canonical_league_id: lecRow.league_id })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from('pro_leagues')
        .where('name', 'EU League Championship Series')
        .update({ canonical_league_id: null })
    })
  }
}
