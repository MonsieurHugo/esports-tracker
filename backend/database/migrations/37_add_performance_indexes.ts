import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration to add strategic performance indexes for common query patterns.
 * All indexes use IF NOT EXISTS to ensure idempotency.
 */
export default class extends BaseSchema {
  /**
   * Helper to check if an index exists
   */
  private async indexExists(tableName: string, indexName: string): Promise<boolean> {
    const result = await this.db.rawQuery(`
      SELECT 1 FROM pg_indexes
      WHERE tablename = ? AND indexname = ?
    `, [tableName, indexName])
    return result.rows.length > 0
  }

  async up() {
    // 1. lol_accounts - Active accounts by player (for player profile queries)
    // Note: lol_accounts has is_primary but not is_active, using is_primary instead
    if (!(await this.indexExists('lol_accounts', 'idx_lol_accounts_player_primary'))) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.index(['player_id', 'is_primary'], 'idx_lol_accounts_player_primary')
      })
    }

    // 2. lol_match_stats - Stats by puuid for history queries
    // The date is on lol_matches table via join, but we can optimize match_id lookups
    if (!(await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_match'))) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.index(['puuid', 'match_id'], 'idx_lol_match_stats_puuid_match')
      })
    }

    // 3. lol_match_stats - Champion performance queries
    if (!(await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_champion'))) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.index(['puuid', 'champion_id'], 'idx_lol_match_stats_puuid_champion')
      })
    }

    // 4. lol_match_stats - Role analysis queries
    if (!(await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_role'))) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.index(['puuid', 'role'], 'idx_lol_match_stats_puuid_role')
      })
    }

    // 5. lol_matches - Date-based queries for match history
    if (!(await this.indexExists('lol_matches', 'idx_lol_matches_game_start_desc'))) {
      // Using raw query for DESC index which Knex doesn't support natively
      await this.db.rawQuery(`
        CREATE INDEX IF NOT EXISTS idx_lol_matches_game_start_desc
        ON lol_matches (game_start DESC)
      `)
    }

    // 6. teams - League-based lookups (league is a string column)
    if (!(await this.indexExists('teams', 'idx_teams_league_active'))) {
      this.schema.alterTable('teams', (table) => {
        table.index(['league', 'is_active'], 'idx_teams_league_active')
      })
    }

    // 7. lol_streaks - Current streak lookups (using current_streak value)
    if (!(await this.indexExists('lol_streaks', 'idx_lol_streaks_current_value'))) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.index(['current_streak'], 'idx_lol_streaks_current_value')
      })
    }

    // 8. lol_streaks - Best/worst streak leaderboards
    if (!(await this.indexExists('lol_streaks', 'idx_lol_streaks_best_win'))) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.index(['best_win_streak'], 'idx_lol_streaks_best_win')
      })
    }
    if (!(await this.indexExists('lol_streaks', 'idx_lol_streaks_worst_loss'))) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.index(['worst_loss_streak'], 'idx_lol_streaks_worst_loss')
      })
    }

    // 9. lol_current_ranks - Tier/rank leaderboard queries
    if (!(await this.indexExists('lol_current_ranks', 'idx_lol_current_ranks_tier_lp'))) {
      this.schema.alterTable('lol_current_ranks', (table) => {
        table.index(['queue_type', 'tier', 'rank', 'league_points'], 'idx_lol_current_ranks_tier_lp')
      })
    }

    // 10. players - Slug lookups are already indexed, add composite for active players
    if (!(await this.indexExists('players', 'idx_players_active_pseudo'))) {
      this.schema.alterTable('players', (table) => {
        table.index(['is_active', 'current_pseudo'], 'idx_players_active_pseudo')
      })
    }

    // 11. lol_daily_stats - Date range queries for leaderboards
    if (!(await this.indexExists('lol_daily_stats', 'idx_lol_daily_stats_date_games'))) {
      // Already checked in migration 22, but ensuring it exists
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.index(['date', 'games_played'], 'idx_lol_daily_stats_date_games')
      })
    }

    // 12. lol_accounts - Last fetched optimization for worker
    if (!(await this.indexExists('lol_accounts', 'idx_lol_accounts_last_fetched'))) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.index(['last_fetched_at'], 'idx_lol_accounts_last_fetched')
      })
    }

    // 13. lol_accounts - Last match optimization for activity detection
    if (!(await this.indexExists('lol_accounts', 'idx_lol_accounts_last_match'))) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.index(['last_match_at'], 'idx_lol_accounts_last_match')
      })
    }
  }

  async down() {
    // Drop indexes in reverse order

    // 13. lol_accounts - last_match_at
    if (await this.indexExists('lol_accounts', 'idx_lol_accounts_last_match')) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.dropIndex(['last_match_at'], 'idx_lol_accounts_last_match')
      })
    }

    // 12. lol_accounts - last_fetched_at
    if (await this.indexExists('lol_accounts', 'idx_lol_accounts_last_fetched')) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.dropIndex(['last_fetched_at'], 'idx_lol_accounts_last_fetched')
      })
    }

    // 11. lol_daily_stats - date_games (only drop if we created it)
    if (await this.indexExists('lol_daily_stats', 'idx_lol_daily_stats_date_games')) {
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.dropIndex(['date', 'games_played'], 'idx_lol_daily_stats_date_games')
      })
    }

    // 10. players - active_pseudo
    if (await this.indexExists('players', 'idx_players_active_pseudo')) {
      this.schema.alterTable('players', (table) => {
        table.dropIndex(['is_active', 'current_pseudo'], 'idx_players_active_pseudo')
      })
    }

    // 9. lol_current_ranks - tier_lp
    if (await this.indexExists('lol_current_ranks', 'idx_lol_current_ranks_tier_lp')) {
      this.schema.alterTable('lol_current_ranks', (table) => {
        table.dropIndex(['queue_type', 'tier', 'rank', 'league_points'], 'idx_lol_current_ranks_tier_lp')
      })
    }

    // 8. lol_streaks - worst_loss
    if (await this.indexExists('lol_streaks', 'idx_lol_streaks_worst_loss')) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.dropIndex(['worst_loss_streak'], 'idx_lol_streaks_worst_loss')
      })
    }

    // 8. lol_streaks - best_win
    if (await this.indexExists('lol_streaks', 'idx_lol_streaks_best_win')) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.dropIndex(['best_win_streak'], 'idx_lol_streaks_best_win')
      })
    }

    // 7. lol_streaks - current_value
    if (await this.indexExists('lol_streaks', 'idx_lol_streaks_current_value')) {
      this.schema.alterTable('lol_streaks', (table) => {
        table.dropIndex(['current_streak'], 'idx_lol_streaks_current_value')
      })
    }

    // 6. teams - league_active
    if (await this.indexExists('teams', 'idx_teams_league_active')) {
      this.schema.alterTable('teams', (table) => {
        table.dropIndex(['league', 'is_active'], 'idx_teams_league_active')
      })
    }

    // 5. lol_matches - game_start_desc
    if (await this.indexExists('lol_matches', 'idx_lol_matches_game_start_desc')) {
      await this.db.rawQuery(`DROP INDEX IF EXISTS idx_lol_matches_game_start_desc`)
    }

    // 4. lol_match_stats - puuid_role
    if (await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_role')) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.dropIndex(['puuid', 'role'], 'idx_lol_match_stats_puuid_role')
      })
    }

    // 3. lol_match_stats - puuid_champion
    if (await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_champion')) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.dropIndex(['puuid', 'champion_id'], 'idx_lol_match_stats_puuid_champion')
      })
    }

    // 2. lol_match_stats - puuid_match
    if (await this.indexExists('lol_match_stats', 'idx_lol_match_stats_puuid_match')) {
      this.schema.alterTable('lol_match_stats', (table) => {
        table.dropIndex(['puuid', 'match_id'], 'idx_lol_match_stats_puuid_match')
      })
    }

    // 1. lol_accounts - player_primary
    if (await this.indexExists('lol_accounts', 'idx_lol_accounts_player_primary')) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.dropIndex(['player_id', 'is_primary'], 'idx_lol_accounts_player_primary')
      })
    }
  }
}
