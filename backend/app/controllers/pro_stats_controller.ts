import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

export default class ProStatsController {
  /**
   * GET /api/v1/pro/monitoring/worker-status
   * Pro worker status from heartbeat table
   */
  async workerStatus(ctx: HttpContext) {
    const row = await db.from('pro_worker_status').where('id', 1).first()

    if (!row) {
      return ctx.response.ok({
        is_running: false,
        started_at: null,
        uptime: 0,
        current_task: null,
        current_task_started_at: null,
        last_task: null,
        last_task_completed_at: null,
        session_tournaments: 0,
        session_matches: 0,
        session_games: 0,
        session_errors: 0,
        session_api_requests: 0,
        last_activity_at: null,
        last_error_at: null,
        last_error_message: null,
        updated_at: null,
      })
    }

    const uptime =
      row.is_running && row.started_at
        ? Math.floor(DateTime.now().diff(DateTime.fromJSDate(new Date(row.started_at)), 'seconds').seconds)
        : 0

    return ctx.response.ok({
      is_running: row.is_running,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      uptime,
      current_task: row.current_task,
      current_task_started_at: row.current_task_started_at
        ? new Date(row.current_task_started_at).toISOString()
        : null,
      last_task: row.last_task,
      last_task_completed_at: row.last_task_completed_at
        ? new Date(row.last_task_completed_at).toISOString()
        : null,
      session_tournaments: row.session_tournaments,
      session_matches: row.session_matches,
      session_games: row.session_games,
      session_errors: row.session_errors,
      session_api_requests: row.session_api_requests,
      last_activity_at: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
      last_error_at: row.last_error_at ? new Date(row.last_error_at).toISOString() : null,
      last_error_message: row.last_error_message,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    })
  }

  /**
   * GET /api/v1/pro/monitoring/stats
   * Global stats for pro esports data
   */
  async stats(ctx: HttpContext) {
    // Get counts using separate queries for reliability
    const tournamentsResult = await db.from('pro_tournaments').count('* as count').first()
    const matchesResult = await db.from('pro_matches').count('* as count').first()
    const gamesResult = await db.from('pro_games').count('* as count').first()
    const playersResult = await db
      .from('pro_player_stats')
      .countDistinct('player_id as count')
      .first()
    const draftActionsResult = await db.from('pro_draft_actions').count('* as count').first()

    // Get last sync time from most recent game
    const lastGame = await db
      .from('pro_games')
      .select('updated_at')
      .orderBy('updated_at', 'desc')
      .first()

    return ctx.response.ok({
      tournaments: Number(tournamentsResult?.count) || 0,
      matches: Number(matchesResult?.count) || 0,
      games: Number(gamesResult?.count) || 0,
      players: Number(playersResult?.count) || 0,
      draftActions: Number(draftActionsResult?.count) || 0,
      lastSyncAt: lastGame?.updated_at || null,
    })
  }

  /**
   * GET /api/v1/pro/monitoring/stats/enhanced
   * Enhanced stats with trends
   */
  async statsEnhanced(ctx: HttpContext) {
    // Basic counts
    const tournamentsResult = await db.from('pro_tournaments').count('* as count').first()
    const matchesResult = await db.from('pro_matches').count('* as count').first()
    const gamesResult = await db.from('pro_games').count('* as count').first()
    const playersResult = await db
      .from('pro_player_stats')
      .countDistinct('player_id as count')
      .first()
    const teamsResult = await db.from('teams').count('* as count').first()

    // Last sync time
    const lastGame = await db
      .from('pro_games')
      .select('updated_at')
      .orderBy('updated_at', 'desc')
      .first()

    // Games synced in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentGamesResult = await db
      .from('pro_games')
      .where('created_at', '>=', oneDayAgo)
      .count('* as count')
      .first()

    // Matches synced in last 24h
    const recentMatchesResult = await db
      .from('pro_matches')
      .where('created_at', '>=', oneDayAgo)
      .count('* as count')
      .first()

    return ctx.response.ok({
      counts: {
        tournaments: Number(tournamentsResult?.count) || 0,
        matches: Number(matchesResult?.count) || 0,
        games: Number(gamesResult?.count) || 0,
        players: Number(playersResult?.count) || 0,
        teams: Number(teamsResult?.count) || 0,
      },
      recent24h: {
        games: Number(recentGamesResult?.count) || 0,
        matches: Number(recentMatchesResult?.count) || 0,
      },
      syncHealth: {
        lastSyncAt: lastGame?.updated_at || null,
      },
    })
  }

  /**
   * GET /api/v1/pro/monitoring/data-quality
   * Get data quality metrics
   */
  async dataQuality(ctx: HttpContext) {
    // Total games
    const totalGamesResult = await db.from('pro_games').count('* as count').first()
    const totalGames = Number(totalGamesResult?.count || 0)

    // Games with player stats
    const gamesWithStatsResult = await db
      .from('pro_games as g')
      .whereExists((qb) => {
        qb.select(db.raw('1'))
          .from('pro_player_stats as ps')
          .whereRaw('ps.game_id = g.game_id')
      })
      .count('* as count')
      .first()
    const gamesWithStats = Number(gamesWithStatsResult?.count || 0)

    // Games with draft data
    const gamesWithDraftResult = await db
      .from('pro_games as g')
      .whereExists((qb) => {
        qb.select(db.raw('1'))
          .from('pro_draft_actions as da')
          .whereRaw('da.game_id = g.game_id')
      })
      .count('* as count')
      .first()
    const gamesWithDraft = Number(gamesWithDraftResult?.count || 0)

    // Games with events
    const gamesWithEventsResult = await db
      .from('pro_games as g')
      .whereExists((qb) => {
        qb.select(db.raw('1'))
          .from('pro_game_events as ge')
          .whereRaw('ge.game_id = g.game_id')
      })
      .count('* as count')
      .first()
    const gamesWithEvents = Number(gamesWithEventsResult?.count || 0)

    // Games with timing data (check for non-null timing_data_jsonb)
    const gamesWithTimingResult = await db
      .from('pro_player_stats')
      .whereNotNull('timing_data_jsonb')
      .countDistinct('game_id as count')
      .first()
    const gamesWithTiming = Number(gamesWithTimingResult?.count || 0)

    // Games with complete objectives (all objective fields filled)
    const gamesWithObjectivesResult = await db
      .from('pro_games')
      .where((qb) => {
        qb.whereNotNull('blue_towers')
          .whereNotNull('red_towers')
          .whereNotNull('blue_dragons')
          .whereNotNull('red_dragons')
      })
      .count('* as count')
      .first()
    const gamesWithObjectives = Number(gamesWithObjectivesResult?.count || 0)

    // Calculate percentages
    const calcPercent = (value: number, total: number) =>
      total > 0 ? Math.round((value / total) * 100) : 0

    return ctx.response.ok({
      totalGames,
      coverage: {
        stats: {
          count: gamesWithStats,
          percent: calcPercent(gamesWithStats, totalGames),
        },
        draft: {
          count: gamesWithDraft,
          percent: calcPercent(gamesWithDraft, totalGames),
        },
        events: {
          count: gamesWithEvents,
          percent: calcPercent(gamesWithEvents, totalGames),
        },
        timing: {
          count: gamesWithTiming,
          percent: calcPercent(gamesWithTiming, totalGames),
        },
        objectives: {
          count: gamesWithObjectives,
          percent: calcPercent(gamesWithObjectives, totalGames),
        },
      },
    })
  }

  /**
   * GET /api/v1/pro/monitoring/data-quality-flags
   * List data quality flags with filtering and pagination
   */
  async dataQualityFlags(ctx: HttpContext) {
    const page = Math.max(1, Number(ctx.request.input('page', 1)))
    const perPage = Math.min(100, Math.max(1, Number(ctx.request.input('perPage', 50))))
    const flagType = ctx.request.input('flagType') as string | undefined
    const severity = ctx.request.input('severity') as string | undefined
    const resolved = ctx.request.input('resolved') as string | undefined
    const entityType = ctx.request.input('entityType') as string | undefined

    let query = db.from('data_quality_flags').orderBy('created_at', 'desc')

    if (flagType) query = query.where('flag_type', flagType)
    if (severity) query = query.where('severity', severity)
    if (resolved !== undefined && resolved !== '') query = query.where('resolved', resolved === 'true')
    if (entityType) query = query.where('entity_type', entityType)

    const results = await query.paginate(page, perPage)

    // Summary counts
    const summaryRows = await db
      .from('data_quality_flags')
      .where('resolved', false)
      .select('flag_type', 'severity')
      .count('* as count')
      .groupBy('flag_type', 'severity')
      .orderBy('count', 'desc')

    const summary = summaryRows.map((r: Record<string, unknown>) => ({
      flagType: r.flag_type,
      severity: r.severity,
      count: Number(r.count),
    }))

    return ctx.response.ok({
      data: results.all().map((row: Record<string, unknown>) => ({
        flagId: row.flag_id,
        flagType: row.flag_type,
        severity: row.severity,
        entityType: row.entity_type,
        entityId: row.entity_id,
        externalId: row.external_id,
        context: row.context,
        resolved: row.resolved,
        resolvedAt: row.resolved_at,
        resolvedBy: row.resolved_by,
        createdAt: row.created_at,
      })),
      meta: results.getMeta(),
      summary,
    })
  }

  /**
   * POST /api/v1/pro/monitoring/data-quality-flags/:id/resolve
   * Mark a flag as resolved
   */
  async resolveFlag(ctx: HttpContext) {
    const flagId = ctx.params.id
    const resolvedBy = ctx.request.input('resolvedBy', 'admin')

    await db
      .from('data_quality_flags')
      .where('flag_id', flagId)
      .update({ resolved: true, resolved_at: new Date(), resolved_by: resolvedBy })

    return ctx.response.ok({ success: true })
  }

  /**
   * POST /api/v1/pro/monitoring/data-quality-flags/resolve-bulk
   * Bulk resolve flags by type
   */
  async resolveFlagsBulk(ctx: HttpContext) {
    const flagType = ctx.request.input('flagType') as string
    const severity = ctx.request.input('severity') as string | undefined
    const resolvedBy = ctx.request.input('resolvedBy', 'admin')

    if (!flagType) {
      return ctx.response.badRequest({ error: 'flagType is required' })
    }

    let query = db.from('data_quality_flags').where('flag_type', flagType).where('resolved', false)
    if (severity) query = query.where('severity', severity)

    const result = await query.update({ resolved: true, resolved_at: new Date(), resolved_by: resolvedBy })

    return ctx.response.ok({ success: true, resolved: result[0] ?? 0 })
  }

}
