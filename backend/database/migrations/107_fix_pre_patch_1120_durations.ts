import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Fix game durations for pre-patch 11.20 matches.
 *
 * Before patch 11.20 (October 2021), Riot match-v5 API returned gameDuration
 * in milliseconds instead of seconds. The Leaguepedia sync stored these raw
 * values, resulting in durations ~1000x too large (e.g. 1,800,000 instead of 1,800).
 *
 * The threshold of 100,000 seconds (~27 hours) is impossible for a LoL game,
 * so it reliably identifies ms values.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const gamesResult = await db.rawQuery(
        'UPDATE pro_games SET duration = duration / 1000 WHERE duration > 100000'
      )
      console.log(`  Fixed pro_games durations: ${gamesResult.rowCount ?? 0} rows`)

      const teamStatsResult = await db.rawQuery(
        'UPDATE pro_team_stats SET duration = duration / 1000 WHERE duration > 100000'
      )
      console.log(`  Fixed pro_team_stats durations: ${teamStatsResult.rowCount ?? 0} rows`)
    })
  }

  async down() {
    // Cannot reliably reverse: we don't know which rows were originally in ms
  }
}
