import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Drop the old functions that reference non-existent columns
    await this.db.rawQuery('DROP FUNCTION IF EXISTS refresh_player_period_stats(VARCHAR, VARCHAR, DATE, DATE)')
    await this.db.rawQuery('DROP FUNCTION IF EXISTS refresh_leaderboard_cache(VARCHAR, VARCHAR, DATE, DATE, VARCHAR, VARCHAR, INTEGER)')
    await this.db.rawQuery('DROP FUNCTION IF EXISTS refresh_all_leaderboards(DATE)')
    await this.db.rawQuery('DROP VIEW IF EXISTS v_current_leaderboard')

    // Check if lol_period_stats_cache exists and has old columns
    const hasTable = await this.schema.hasTable('lol_period_stats_cache')
    if (hasTable) {
      const hasSoloqGames = await this.schema.hasColumn('lol_period_stats_cache', 'soloq_games')
      if (hasSoloqGames) {
        // Drop old columns
        this.schema.alterTable('lol_period_stats_cache', (table) => {
          table.dropColumn('soloq_games')
          table.dropColumn('flex_games')
        })
      }

      const hasLpStart = await this.schema.hasColumn('lol_period_stats_cache', 'lp_start')
      if (hasLpStart) {
        this.schema.alterTable('lol_period_stats_cache', (table) => {
          table.dropColumn('lp_start')
          table.dropColumn('lp_end')
          table.dropColumn('lp_change')
        })
      }

      // Add new columns
      const hasTier = await this.schema.hasColumn('lol_period_stats_cache', 'tier')
      if (!hasTier) {
        this.schema.alterTable('lol_period_stats_cache', (table) => {
          table.string('tier', 20).nullable()
          table.string('rank', 5).nullable()
          table.integer('lp').defaultTo(0)
        })
      }
    }

    // Recreate functions with correct columns
    await this.db.rawQuery(`
      CREATE OR REPLACE FUNCTION refresh_player_period_stats(
        p_puuid VARCHAR(100),
        p_period_type VARCHAR(20),
        p_start DATE,
        p_end DATE
      ) RETURNS VOID AS $$
      BEGIN
        INSERT INTO lol_period_stats_cache (
          puuid, period_type, period_start, period_end,
          games_played, wins,
          total_kills, total_deaths, total_assists, total_game_duration,
          tier, rank, lp, calculated_at
        )
        SELECT
          p_puuid,
          p_period_type,
          p_start,
          p_end,
          COALESCE(SUM(games_played), 0),
          COALESCE(SUM(wins), 0),
          COALESCE(SUM(total_kills), 0),
          COALESCE(SUM(total_deaths), 0),
          COALESCE(SUM(total_assists), 0),
          COALESCE(SUM(total_game_duration), 0),
          (SELECT tier FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1),
          (SELECT rank FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1),
          COALESCE((SELECT lp FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1), 0),
          NOW()
        FROM lol_daily_stats
        WHERE puuid = p_puuid
          AND date BETWEEN p_start AND p_end
        ON CONFLICT (puuid, period_type, period_start)
        DO UPDATE SET
          games_played = EXCLUDED.games_played,
          wins = EXCLUDED.wins,
          total_kills = EXCLUDED.total_kills,
          total_deaths = EXCLUDED.total_deaths,
          total_assists = EXCLUDED.total_assists,
          total_game_duration = EXCLUDED.total_game_duration,
          tier = EXCLUDED.tier,
          rank = EXCLUDED.rank,
          lp = EXCLUDED.lp,
          calculated_at = NOW();
      END;
      $$ LANGUAGE plpgsql
    `)
  }

  async down() {
    await this.db.rawQuery('DROP FUNCTION IF EXISTS refresh_player_period_stats(VARCHAR, VARCHAR, DATE, DATE)')
  }
}
