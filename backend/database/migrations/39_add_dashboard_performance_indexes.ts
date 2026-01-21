import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration to add strategic performance indexes for dashboard query patterns.
 *
 * Impact attendu:
 * - idx_daily_stats_date_tier: Accélère les requêtes de stats par période filtrant sur Master+
 *   (utilisé dans getTeamLeaderboard, getPlayerLeaderboard, getTopLpGainers, getTopLpLosers)
 *
 * - idx_daily_stats_puuid_date_desc: Optimise les DISTINCT ON (puuid) ORDER BY date DESC
 *   (utilisé dans latest_ranks CTE pour récupérer le dernier LP de chaque compte)
 *
 * - idx_contracts_active: Accélère les jointures sur les contrats actifs
 *   (utilisé dans presque toutes les requêtes dashboard avec WHERE end_date IS NULL)
 *
 * - idx_teams_active_league: Accélère le filtrage des équipes actives par league
 *   (utilisé dans getTeamLeaderboard, getTopGrinders avec WHERE is_active = true AND league IN)
 *
 * - idx_accounts_player_puuid: Optimise la jointure accounts -> daily_stats
 *   (utilisé pour récupérer les comptes d'un joueur et joindre leurs stats)
 *
 * Note: Utilisation de CONCURRENTLY pour ne pas bloquer les lectures en production.
 * En environnement de test, on utilise CREATE INDEX standard car CONCURRENTLY
 * ne peut pas s'exécuter dans une transaction.
 * Ces indexes sont partiels (WHERE clause) pour réduire leur taille et améliorer les performances.
 */
export default class extends BaseSchema {
  async up() {
    // CONCURRENTLY ne peut pas être utilisé dans une transaction (tests)
    // En production, on veut CONCURRENTLY pour éviter les locks
    const concurrent = process.env.NODE_ENV === 'test' ? '' : 'CONCURRENTLY'

    // 1. Index pour les requêtes de stats par période et tier (Master+)
    // Optimise: WHERE date >= ? AND date <= ? AND tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
    await this.db.rawQuery(`
      CREATE INDEX ${concurrent} IF NOT EXISTS idx_daily_stats_date_tier
      ON lol_daily_stats(date, tier)
      WHERE tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
    `)

    // 2. Index pour DISTINCT ON (puuid) ORDER BY date DESC
    // Optimise: SELECT DISTINCT ON (puuid) ... ORDER BY puuid, date DESC
    await this.db.rawQuery(`
      CREATE INDEX ${concurrent} IF NOT EXISTS idx_daily_stats_puuid_date_desc
      ON lol_daily_stats(puuid, date DESC)
    `)

    // 3. Index pour les contrats actifs
    // Optimise: WHERE end_date IS NULL (utilisé dans presque toutes les requêtes)
    await this.db.rawQuery(`
      CREATE INDEX ${concurrent} IF NOT EXISTS idx_contracts_active
      ON player_contracts(player_id, team_id)
      WHERE end_date IS NULL
    `)

    // 4. Index pour les équipes actives par league
    // Optimise: WHERE is_active = true AND league IN (...)
    await this.db.rawQuery(`
      CREATE INDEX ${concurrent} IF NOT EXISTS idx_teams_active_league
      ON teams(league)
      WHERE is_active = true
    `)

    // 5. Index pour la jointure accounts -> daily_stats via player_id
    // Optimise: JOIN lol_accounts acc ON pc.player_id = acc.player_id
    await this.db.rawQuery(`
      CREATE INDEX ${concurrent} IF NOT EXISTS idx_accounts_player_puuid
      ON lol_accounts(player_id, puuid)
    `)
  }

  async down() {
    // Suppression des indexes dans l'ordre inverse
    await this.db.rawQuery(`DROP INDEX IF EXISTS idx_accounts_player_puuid`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS idx_teams_active_league`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS idx_contracts_active`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS idx_daily_stats_puuid_date_desc`)
    await this.db.rawQuery(`DROP INDEX IF EXISTS idx_daily_stats_date_tier`)
  }
}
