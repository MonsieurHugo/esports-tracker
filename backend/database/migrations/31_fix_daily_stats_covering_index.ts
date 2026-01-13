import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Drop the old index that references non-existent columns
    await this.db.rawQuery('DROP INDEX IF EXISTS idx_daily_stats_period_covering')

    // Recreate with correct columns (no soloq_games, no lp_start/lp_end)
    await this.db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_daily_stats_period_covering
      ON lol_daily_stats(puuid, date DESC)
      INCLUDE (games_played, wins, total_kills, total_deaths, total_assists, total_game_duration, tier, rank, lp)
    `)
  }

  async down() {
    await this.db.rawQuery('DROP INDEX IF EXISTS idx_daily_stats_period_covering')
  }
}
