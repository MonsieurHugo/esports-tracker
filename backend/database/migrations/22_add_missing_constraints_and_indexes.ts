import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration to add missing FK constraints, indexes, and columns
 * Addresses issues found in code audit:
 * - Missing FK on teams.game_id
 * - Missing composite indexes for frequent joins
 * - Missing LP tracking columns in lol_daily_stats
 * - Missing FK on lol_champion_stats.best_kda_match_id
 *
 * This migration is idempotent - safe to run multiple times.
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

  /**
   * Helper to check if a foreign key constraint exists
   */
  private async fkExists(tableName: string, constraintName: string): Promise<boolean> {
    const result = await this.db.rawQuery(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = ? AND constraint_name = ? AND constraint_type = 'FOREIGN KEY'
    `, [tableName, constraintName])
    return result.rows.length > 0
  }

  /**
   * Helper to check if a unique constraint exists
   */
  private async uniqueExists(tableName: string, constraintName: string): Promise<boolean> {
    const result = await this.db.rawQuery(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = ? AND constraint_name = ? AND constraint_type = 'UNIQUE'
    `, [tableName, constraintName])
    return result.rows.length > 0
  }

  async up() {
    // 1. Create games reference table if not exists (for FK constraint)
    const hasGamesTable = await this.schema.hasTable('games')
    if (!hasGamesTable) {
      this.schema.createTable('games', (table) => {
        table.increments('game_id').primary()
        table.string('name', 50).notNullable().unique()
        table.string('short_name', 10).notNullable()
        table.boolean('is_active').notNullable().defaultTo(true)
        table.timestamp('created_at').notNullable().defaultTo(this.now())
      })

      // Insert default games
      this.defer(async (db) => {
        await db.table('games').multiInsert([
          { game_id: 1, name: 'League of Legends', short_name: 'LoL' },
          { game_id: 2, name: 'Valorant', short_name: 'VAL' },
        ])
      })
    }

    // 2. Add FK constraint to teams.game_id (if not exists)
    if (!(await this.fkExists('teams', 'teams_game_id_foreign'))) {
      this.schema.alterTable('teams', (table) => {
        table.foreign('game_id').references('game_id').inTable('games').onDelete('RESTRICT')
      })
    }

    // 3. Add composite indexes for frequent joins on lol_accounts
    if (!(await this.indexExists('lol_accounts', 'idx_lol_accounts_player_puuid'))) {
      this.schema.alterTable('lol_accounts', (table) => {
        table.index(['player_id', 'puuid'], 'idx_lol_accounts_player_puuid')
      })
    }

    // 4. Add composite indexes for lol_daily_stats
    if (!(await this.indexExists('lol_daily_stats', 'idx_lol_daily_stats_puuid_date'))) {
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.index(['puuid', 'date'], 'idx_lol_daily_stats_puuid_date')
      })
    }
    if (!(await this.indexExists('lol_daily_stats', 'idx_lol_daily_stats_date_games'))) {
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.index(['date', 'games_played'], 'idx_lol_daily_stats_date_games')
      })
    }

    // 5. Add missing LP tracking columns to lol_daily_stats
    const hasLpStart = await this.schema.hasColumn('lol_daily_stats', 'lp_start')
    if (!hasLpStart) {
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.integer('lp_start').nullable()
        table.integer('lp_end').nullable()
        table.string('tier_start', 20).nullable()
        table.string('tier_end', 20).nullable()
        table.string('rank_start', 5).nullable()
        table.string('rank_end', 5).nullable()
      })
    }

    // 6. Add composite index for player_contracts
    if (!(await this.indexExists('player_contracts', 'idx_player_contracts_team_active'))) {
      this.schema.alterTable('player_contracts', (table) => {
        table.index(['team_id', 'end_date'], 'idx_player_contracts_team_active')
      })
    }
    if (!(await this.indexExists('player_contracts', 'idx_player_contracts_player_active'))) {
      this.schema.alterTable('player_contracts', (table) => {
        table.index(['player_id', 'end_date'], 'idx_player_contracts_player_active')
      })
    }

    // 7. Add FK constraint for lol_champion_stats.best_kda_match_id
    const hasColumn = await this.schema.hasColumn('lol_champion_stats', 'best_kda_match_id')
    if (hasColumn && !(await this.fkExists('lol_champion_stats', 'lol_champion_stats_best_kda_match_id_foreign'))) {
      this.schema.alterTable('lol_champion_stats', (table) => {
        table
          .foreign('best_kda_match_id')
          .references('match_id')
          .inTable('lol_matches')
          .onDelete('SET NULL')
      })
    }

    // 8. Add index for lol_matches lookup by game_start for recent matches
    if (!(await this.indexExists('lol_matches', 'idx_lol_matches_start_queue'))) {
      this.schema.alterTable('lol_matches', (table) => {
        table.index(['game_start', 'queue_id'], 'idx_lol_matches_start_queue')
      })
    }

    // 9. Add unique constraint on teams for slug + game_id
    const hasSlugGameUnique = await this.uniqueExists('teams', 'teams_slug_game_unique')
    if (!hasSlugGameUnique) {
      // Check if slug-only unique exists and drop it
      const hasSlugUnique = await this.uniqueExists('teams', 'teams_slug_unique')
      if (hasSlugUnique) {
        this.schema.alterTable('teams', (table) => {
          table.dropUnique(['slug'])
        })
      }
      // Add compound unique constraint
      this.schema.alterTable('teams', (table) => {
        table.unique(['slug', 'game_id'], 'teams_slug_game_unique')
      })
    }
  }

  async down() {
    // Revert unique constraint on teams
    this.schema.alterTable('teams', (table) => {
      table.dropUnique(['slug', 'game_id'], 'teams_slug_game_unique')
      table.unique(['slug'])
    })

    // Remove lol_matches index
    this.schema.alterTable('lol_matches', (table) => {
      table.dropIndex(['game_start', 'queue_id'], 'idx_lol_matches_start_queue')
    })

    // Remove lol_champion_stats FK
    const hasColumn = await this.schema.hasColumn('lol_champion_stats', 'best_kda_match_id')
    if (hasColumn) {
      this.schema.alterTable('lol_champion_stats', (table) => {
        table.dropForeign(['best_kda_match_id'])
      })
    }

    // Remove player_contracts indexes
    this.schema.alterTable('player_contracts', (table) => {
      table.dropIndex(['team_id', 'end_date'], 'idx_player_contracts_team_active')
      table.dropIndex(['player_id', 'end_date'], 'idx_player_contracts_player_active')
    })

    // Remove LP tracking columns
    const hasLpStart = await this.schema.hasColumn('lol_daily_stats', 'lp_start')
    if (hasLpStart) {
      this.schema.alterTable('lol_daily_stats', (table) => {
        table.dropColumn('lp_start')
        table.dropColumn('lp_end')
        table.dropColumn('tier_start')
        table.dropColumn('tier_end')
        table.dropColumn('rank_start')
        table.dropColumn('rank_end')
      })
    }

    // Remove lol_daily_stats indexes
    this.schema.alterTable('lol_daily_stats', (table) => {
      table.dropIndex(['puuid', 'date'], 'idx_lol_daily_stats_puuid_date')
      table.dropIndex(['date', 'games_played'], 'idx_lol_daily_stats_date_games')
    })

    // Remove lol_accounts index
    this.schema.alterTable('lol_accounts', (table) => {
      table.dropIndex(['player_id', 'puuid'], 'idx_lol_accounts_player_puuid')
    })

    // Remove teams FK
    this.schema.alterTable('teams', (table) => {
      table.dropForeign(['game_id'])
    })

    // Drop games table if we created it
    this.schema.dropTableIfExists('games')
  }
}
