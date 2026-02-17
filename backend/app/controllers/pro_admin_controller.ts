import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { LeagueRow } from '#types/pro_monitoring'

export default class ProAdminController {
  /**
   * POST /api/v1/pro/monitoring/clean-tables
   * Clean all pro tables (for development/testing)
   *
   * DANGEROUS: Requires confirmation parameter to prevent accidental data loss.
   * Body: { confirm: "DELETE_ALL_PRO_DATA" }
   */
  async cleanTables(ctx: HttpContext) {
    const { confirm } = ctx.request.body()
    const expectedConfirmation = 'DELETE_ALL_PRO_DATA'

    if (confirm !== expectedConfirmation) {
      logger.warn(
        { path: ctx.request.url() },
        'cleanTables called without proper confirmation'
      )
      return ctx.response.badRequest({
        error: 'Confirmation required',
        message: `This is a destructive operation. Provide { "confirm": "${expectedConfirmation}" } in the request body.`,
      })
    }

    logger.warn(
      { path: ctx.request.url() },
      'DESTRUCTIVE: Truncating all pro tables'
    )

    await db.rawQuery(`
      TRUNCATE TABLE
        pro_game_events,
        pro_draft_actions,
        pro_player_stats,
        pro_games,
        pro_matches,
        pro_tournaments,
        pro_leagues
      CASCADE
    `)

    // Delete pro teams from the shared teams table (only those with external_id from GRID)
    await db.rawQuery(`DELETE FROM teams WHERE external_id IS NOT NULL`)

    logger.info('All pro tables truncated successfully')
    return ctx.response.ok({ message: 'All pro tables cleaned' })
  }

  // ==========================================
  // League Management
  // ==========================================

  /**
   * GET /api/v1/pro/monitoring/leagues
   * List all leagues
   */
  async leagues(ctx: HttpContext) {
    const leagues = await db
      .from('pro_leagues')
      .select('*')
      .orderBy('name', 'asc')

    return ctx.response.ok({
      data: leagues.map((l: LeagueRow) => ({
        id: l.league_id,
        externalId: l.external_id,
        name: l.name,
        shortName: l.short_name,
        region: l.region,
        logoUrl: l.logo_url,
        tier: l.tier,
        isFollowed: l.is_followed,
      })),
    })
  }

  /**
   * POST /api/v1/pro/monitoring/leagues
   * Create a new league
   */
  async createLeague(ctx: HttpContext) {
    const { name, shortName, region, logoUrl, tier, isFollowed } = ctx.request.body()

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return ctx.response.badRequest({ error: 'Name is required (min 2 characters)' })
    }

    // Check for duplicate name
    const existing = await db.from('pro_leagues').where('name', name.trim()).first()
    if (existing) {
      return ctx.response.conflict({ error: 'A league with this name already exists' })
    }

    const [result] = await db
      .table('pro_leagues')
      .insert({
        name: name.trim(),
        short_name: shortName?.trim() || null,
        region: region?.trim() || null,
        logo_url: logoUrl?.trim() || null,
        tier: tier || 1,
        is_followed: isFollowed || false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*')

    return ctx.response.created({
      data: {
        id: result.league_id,
        name: result.name,
        shortName: result.short_name,
        region: result.region,
        logoUrl: result.logo_url,
        tier: result.tier,
        isFollowed: result.is_followed,
      },
    })
  }

  /**
   * PATCH /api/v1/pro/monitoring/leagues/:id
   * Update a league
   */
  async updateLeague(ctx: HttpContext) {
    const leagueId = ctx.params.id
    const { name, shortName, region, logoUrl, tier, isFollowed } = ctx.request.body()

    const existing = await db.from('pro_leagues').where('league_id', leagueId).first()
    if (!existing) {
      return ctx.response.notFound({ error: 'League not found' })
    }

    // Check for duplicate name if changing
    if (name && name.trim() !== existing.name) {
      const duplicate = await db.from('pro_leagues').where('name', name.trim()).first()
      if (duplicate) {
        return ctx.response.conflict({ error: 'A league with this name already exists' })
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date() }
    if (name !== undefined) updateData.name = name.trim()
    if (shortName !== undefined) updateData.short_name = shortName?.trim() || null
    if (region !== undefined) updateData.region = region?.trim() || null
    if (logoUrl !== undefined) updateData.logo_url = logoUrl?.trim() || null
    if (tier !== undefined) updateData.tier = tier
    if (isFollowed !== undefined) updateData.is_followed = isFollowed

    const [result] = await db
      .from('pro_leagues')
      .where('league_id', leagueId)
      .update(updateData)
      .returning('*')

    return ctx.response.ok({
      data: {
        id: result.league_id,
        name: result.name,
        shortName: result.short_name,
        region: result.region,
        logoUrl: result.logo_url,
        tier: result.tier,
        isFollowed: result.is_followed,
      },
    })
  }

  /**
   * DELETE /api/v1/pro/monitoring/leagues/:id
   * Delete a league
   */
  async deleteLeague(ctx: HttpContext) {
    const leagueId = ctx.params.id

    const existing = await db.from('pro_leagues').where('league_id', leagueId).first()
    if (!existing) {
      return ctx.response.notFound({ error: 'League not found' })
    }

    // Remove FK references from tournaments first
    await db.from('pro_tournaments').where('pro_league_id', leagueId).update({ pro_league_id: null })

    await db.from('pro_leagues').where('league_id', leagueId).delete()

    return ctx.response.ok({ message: 'League deleted' })
  }

  /**
   * PATCH /api/v1/pro/monitoring/tournaments/:id/league
   * Assign a league to a tournament
   */
  async assignLeague(ctx: HttpContext) {
    const tournamentId = ctx.params.id
    const { leagueId } = ctx.request.body()

    const tournament = await db.from('pro_tournaments').where('tournament_id', tournamentId).first()
    if (!tournament) {
      return ctx.response.notFound({ error: 'Tournament not found' })
    }

    // If leagueId is null, remove the league assignment
    if (leagueId === null) {
      await db
        .from('pro_tournaments')
        .where('tournament_id', tournamentId)
        .update({ pro_league_id: null, updated_at: new Date() })

      return ctx.response.ok({ message: 'League assignment removed' })
    }

    // Verify league exists
    const league = await db.from('pro_leagues').where('league_id', leagueId).first()
    if (!league) {
      return ctx.response.badRequest({ error: 'League not found' })
    }

    await db
      .from('pro_tournaments')
      .where('tournament_id', tournamentId)
      .update({ pro_league_id: leagueId, updated_at: new Date() })

    return ctx.response.ok({
      message: 'League assigned',
      tournament: {
        id: tournamentId,
        leagueId: leagueId,
        leagueName: league.name,
      },
    })
  }
}
