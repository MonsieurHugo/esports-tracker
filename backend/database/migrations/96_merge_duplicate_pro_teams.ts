import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Merge duplicate pro_teams entries (GRID vs Leaguepedia).
 *
 * Some teams exist twice: once from GRID (numeric external_id) and once from
 * Leaguepedia (external_id like 'lp:TeamName'). This migration dynamically
 * detects duplicates by name, keeps the entry with the most game references,
 * re-points all FK references from the duplicate to the keeper, and deletes
 * the duplicate row.
 */
export default class extends BaseSchema {
  async up() {
    // Find duplicate team names (case-insensitive, trimmed)
    const duplicates = await this.db.rawQuery(`
      SELECT LOWER(TRIM(name)) AS norm_name
      FROM pro_teams
      GROUP BY LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    `)

    for (const row of duplicates.rows) {
      const normName: string = row.norm_name

      // Get all teams with this name, ordered by game reference count desc
      // The team with the most references becomes the keeper
      const teams = await this.db.rawQuery(
        `
        SELECT
          t.team_id,
          t.external_id,
          t.name,
          t.short_name,
          t.logo_url,
          (
            SELECT COUNT(*) FROM pro_games g
            WHERE g.blue_team_id = t.team_id
               OR g.red_team_id = t.team_id
               OR g.winner_team_id = t.team_id
          ) + (
            SELECT COUNT(*) FROM pro_player_stats ps
            WHERE ps.team_id = t.team_id
          ) AS ref_count
        FROM pro_teams t
        WHERE LOWER(TRIM(t.name)) = ?
        ORDER BY ref_count DESC
        `,
        [normName]
      )

      if (teams.rows.length < 2) continue

      const keeper = teams.rows[0]
      const keeperId: number = keeper.team_id
      const keeperExtId: string = keeper.external_id

      // Merge all duplicates into the keeper
      for (let i = 1; i < teams.rows.length; i++) {
        const dup = teams.rows[i]
        const dupId: number = dup.team_id
        const dupExtId: string = dup.external_id

        // Inherit short_name/logo_url if keeper lacks them
        if (!keeper.short_name && dup.short_name) {
          await this.db.rawQuery(
            `UPDATE pro_teams SET short_name = ? WHERE team_id = ?`,
            [dup.short_name, keeperId]
          )
        }
        if (!keeper.logo_url && dup.logo_url) {
          await this.db.rawQuery(
            `UPDATE pro_teams SET logo_url = ? WHERE team_id = ?`,
            [dup.logo_url, keeperId]
          )
        }

        // Re-point pro_matches external_id references
        await this.db.rawQuery(
          `UPDATE pro_matches SET team1_external_id = ? WHERE team1_external_id = ?`,
          [keeperExtId, dupExtId]
        )
        await this.db.rawQuery(
          `UPDATE pro_matches SET team2_external_id = ? WHERE team2_external_id = ?`,
          [keeperExtId, dupExtId]
        )

        // Re-point pro_games FK references
        await this.db.rawQuery(
          `UPDATE pro_games SET blue_team_id = ? WHERE blue_team_id = ?`,
          [keeperId, dupId]
        )
        await this.db.rawQuery(
          `UPDATE pro_games SET red_team_id = ? WHERE red_team_id = ?`,
          [keeperId, dupId]
        )
        await this.db.rawQuery(
          `UPDATE pro_games SET winner_team_id = ? WHERE winner_team_id = ?`,
          [keeperId, dupId]
        )

        // Re-point pro_player_stats FK references
        await this.db.rawQuery(
          `UPDATE pro_player_stats SET team_id = ? WHERE team_id = ?`,
          [keeperId, dupId]
        )

        // Re-point pro_player_aggregated_stats FK references
        await this.db.rawQuery(
          `UPDATE pro_player_aggregated_stats SET team_id = ? WHERE team_id = ?`,
          [keeperId, dupId]
        )

        // Re-point pro_team_stats FK references
        await this.db.rawQuery(
          `UPDATE pro_team_stats SET team_id = ? WHERE team_id = ?`,
          [keeperId, dupId]
        )

        // Delete the duplicate team
        await this.db.rawQuery(
          `DELETE FROM pro_teams WHERE team_id = ?`,
          [dupId]
        )
      }
    }
  }

  async down() {
    // Data migration — not reversible
  }
}
