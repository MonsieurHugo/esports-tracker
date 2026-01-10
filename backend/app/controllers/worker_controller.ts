import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import WorkerStatus from '#models/worker_status'
import WorkerLog from '#models/worker_log'
import WorkerMetrics from '#models/worker_metrics'

export default class WorkerController {
  /**
   * GET /api/v1/worker/status
   */
  async status(ctx: HttpContext) {
    const status = await WorkerStatus.query().where('id', 1).first()

    if (!status) {
      return ctx.response.ok({
        is_running: false,
        started_at: null,
        uptime: 0,
        active_batches: {},
        session_lol_matches: 0,
        session_valorant_matches: 0,
        session_lol_accounts: 0,
        session_valorant_accounts: 0,
        session_errors: 0,
        session_api_requests: 0,
        region_stats: {},
        current_account_name: null,
        current_account_region: null,
        active_accounts_count: 0,
        today_accounts_count: 0,
        inactive_accounts_count: 0,
        last_activity_at: null,
        last_error_at: null,
        last_error_message: null,
        updated_at: null,
      })
    }

    // Get region stats
    const regionStats = await db
      .from('lol_accounts as a')
      .select('a.region')
      .count('* as accounts_total')
      .count(db.raw('CASE WHEN a.last_fetched_at >= NOW() - INTERVAL \'24 hours\' THEN 1 END as accounts_done'))
      .groupBy('a.region')

    const regionStatsMap: Record<string, { accounts_total: number; accounts_done: number; matches: number }> = {}
    for (const r of regionStats) {
      regionStatsMap[r.region] = {
        accounts_total: Number(r.accounts_total),
        accounts_done: Number(r.accounts_done || 0),
        matches: 0,
      }
    }

    const uptime = status.startedAt
      ? Math.floor(DateTime.now().diff(status.startedAt, 'seconds').seconds)
      : 0

    return ctx.response.ok({
      is_running: status.isRunning,
      started_at: status.startedAt?.toISO() || null,
      uptime,
      active_batches: {},
      session_lol_matches: status.sessionLolMatches,
      session_valorant_matches: status.sessionValorantMatches,
      session_lol_accounts: status.sessionLolAccounts,
      session_valorant_accounts: status.sessionValorantAccounts,
      session_errors: status.sessionErrors,
      session_api_requests: status.sessionApiRequests,
      region_stats: regionStatsMap,
      current_account_name: status.currentAccountName,
      current_account_region: status.currentAccountRegion,
      active_accounts_count: status.activeAccountsCount,
      today_accounts_count: status.todayAccountsCount,
      inactive_accounts_count: status.inactiveAccountsCount,
      last_activity_at: status.lastActivityAt?.toISO() || null,
      last_error_at: status.lastErrorAt?.toISO() || null,
      last_error_message: status.lastErrorMessage,
      updated_at: status.updatedAt?.toISO() || null,
    })
  }

  /**
   * GET /api/v1/worker/metrics/history
   */
  async metricsHistory(ctx: HttpContext) {
    const { hours = 24 } = ctx.request.qs()

    const since = DateTime.now().minus({ hours: Number(hours) })

    const metrics = await WorkerMetrics.query()
      .where('hour', '>=', since.toSQL()!)
      .orderBy('hour', 'asc')

    // Get totals
    const [totals] = await db
      .from('worker_metrics_hourly')
      .select(
        db.raw('COALESCE(SUM(lol_matches_added), 0)::int as lol_matches'),
        db.raw('COALESCE(SUM(valorant_matches_added), 0)::int as valorant_matches'),
        db.raw('COALESCE(SUM(lol_accounts_processed), 0)::int as lol_accounts'),
        db.raw('COALESCE(SUM(valorant_accounts_processed), 0)::int as valorant_accounts'),
        db.raw('COALESCE(SUM(api_errors), 0)::int as errors'),
        db.raw('COALESCE(SUM(api_requests_made), 0)::int as api_requests')
      )

    return ctx.response.ok({
      data: metrics.map((m) => ({
        id: m.id,
        hour: m.hour.toISO(),
        lol_matches_added: m.lolMatchesAdded,
        valorant_matches_added: m.valorantMatchesAdded,
        lol_accounts_processed: m.lolAccountsProcessed,
        valorant_accounts_processed: m.valorantAccountsProcessed,
        api_requests_made: m.apiRequestsMade,
        api_errors: m.apiErrors,
      })),
      totals: {
        lol_matches: totals?.lol_matches || 0,
        valorant_matches: totals?.valorant_matches || 0,
        lol_accounts: totals?.lol_accounts || 0,
        valorant_accounts: totals?.valorant_accounts || 0,
        errors: totals?.errors || 0,
        api_requests: totals?.api_requests || 0,
      },
    })
  }

  /**
   * GET /api/v1/worker/metrics/daily
   */
  async metricsDaily(ctx: HttpContext) {
    const { days = 7 } = ctx.request.qs()

    const since = DateTime.now().minus({ days: Number(days) })

    const daily = await db
      .from('worker_metrics_hourly')
      .where('hour', '>=', since.toSQL()!)
      .select(
        db.raw('DATE(hour) as date'),
        db.raw('COALESCE(SUM(lol_matches_added), 0)::int as lol_matches'),
        db.raw('COALESCE(SUM(valorant_matches_added), 0)::int as valorant_matches'),
        db.raw('COALESCE(SUM(lol_accounts_processed), 0)::int as lol_accounts'),
        db.raw('COALESCE(SUM(valorant_accounts_processed), 0)::int as valorant_accounts'),
        db.raw('COALESCE(SUM(api_errors), 0)::int as errors')
      )
      .groupByRaw('DATE(hour)')
      .orderBy('date', 'asc')

    return ctx.response.ok({
      data: daily.map((d) => ({
        date: d.date,
        lol_matches: d.lol_matches,
        valorant_matches: d.valorant_matches,
        lol_accounts: d.lol_accounts,
        valorant_accounts: d.valorant_accounts,
        errors: d.errors,
      })),
    })
  }

  /**
   * GET /api/v1/worker/logs
   */
  async logs(ctx: HttpContext) {
    const { type = 'all', limit = 50, severity } = ctx.request.qs()

    const query = WorkerLog.query().orderBy('timestamp', 'desc').limit(Number(limit))

    if (type !== 'all') {
      query.where('logType', type)
    }

    if (severity) {
      query.where('severity', severity)
    }

    const logs = await query

    return ctx.response.ok({
      data: logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp.toISO(),
        log_type: l.logType,
        severity: l.severity,
        message: l.message,
        account_name: l.accountName,
        account_puuid: l.accountPuuid,
        details: l.details,
      })),
    })
  }

  /**
   * GET /api/v1/worker/players/search
   */
  async searchPlayers(ctx: HttpContext) {
    const { q } = ctx.request.qs()

    if (!q || q.length < 2) {
      return ctx.response.ok({ players: [] })
    }

    const players = await db
      .from('players as p')
      .leftJoin('player_contracts as pc', (query) => {
        query.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .whereILike('p.current_pseudo', `%${q}%`)
      .select('p.player_id', 'p.current_pseudo', 'p.slug', 't.current_name as team_name', 't.region')
      .limit(10)

    // Get accounts for each player
    const playerIds = players.map((p) => p.player_id)
    const accounts = await db
      .from('lol_accounts')
      .whereIn('player_id', playerIds)
      .select('player_id', 'puuid', 'game_name', 'tag_line', 'region', 'last_fetched_at', 'last_match_at')

    const accountsByPlayer = accounts.reduce((acc, a) => {
      if (!acc[a.player_id]) acc[a.player_id] = []
      acc[a.player_id].push({
        puuid: a.puuid,
        game_name: a.game_name,
        tag_line: a.tag_line,
        region: a.region,
        last_fetched: a.last_fetched_at,
        last_match_at: a.last_match_at,
        player_name: null,
      })
      return acc
    }, {} as Record<number, unknown[]>)

    return ctx.response.ok({
      players: players.map((p) => ({
        player_id: p.player_id,
        pseudo: p.current_pseudo,
        slug: p.slug,
        team_name: p.team_name,
        team_region: p.region,
        accounts: accountsByPlayer[p.player_id] || [],
      })),
    })
  }

  /**
   * GET /api/v1/worker/daily-coverage
   */
  async dailyCoverage(ctx: HttpContext) {
    const { days = 7 } = ctx.request.qs()

    const since = DateTime.now().minus({ days: Number(days) })

    const coverage = await db
      .from('lol_daily_stats')
      .where('date', '>=', since.toSQLDate()!)
      .select(
        'date',
        db.raw('COUNT(DISTINCT puuid)::int as accounts_with_games'),
        db.raw('SUM(games_played)::int as total_games')
      )
      .groupBy('date')
      .orderBy('date', 'asc')

    // Get total accounts count
    const [{ total_accounts }] = await db.from('lol_accounts').count('* as total_accounts')

    return ctx.response.ok({
      totalAccounts: Number(total_accounts),
      data: coverage.map((c) => ({
        date: c.date,
        accountsWithGames: c.accounts_with_games,
        totalGames: c.total_games,
        coverage: Math.round((c.accounts_with_games / Number(total_accounts)) * 1000) / 10,
      })),
    })
  }

  /**
   * GET /api/v1/worker/accounts
   */
  async accounts(ctx: HttpContext) {
    const { limit = 5 } = ctx.request.qs()

    // Get recently updated accounts
    const recent = await db
      .from('lol_accounts as a')
      .leftJoin('players as p', 'a.player_id', 'p.player_id')
      .orderBy('a.last_fetched_at', 'desc')
      .limit(Number(limit))
      .select(
        'a.puuid',
        'a.game_name',
        'a.tag_line',
        'a.region',
        'a.last_fetched_at',
        'a.last_match_at',
        'p.current_pseudo as player_name'
      )

    // Get oldest (need update) accounts
    const oldest = await db
      .from('lol_accounts as a')
      .leftJoin('players as p', 'a.player_id', 'p.player_id')
      .orderByRaw('a.last_fetched_at ASC NULLS FIRST')
      .limit(Number(limit))
      .select(
        'a.puuid',
        'a.game_name',
        'a.tag_line',
        'a.region',
        'a.last_fetched_at',
        'a.last_match_at',
        'p.current_pseudo as player_name'
      )

    // Get count by region
    const byRegion = await db
      .from('lol_accounts')
      .select('region')
      .count('* as count')
      .groupBy('region')
      .orderBy('count', 'desc')

    const [{ total }] = await db.from('lol_accounts').count('* as total')

    const formatAccount = (a: any) => ({
      puuid: a.puuid,
      game_name: a.game_name,
      tag_line: a.tag_line,
      region: a.region,
      last_fetched: a.last_fetched_at,
      last_match_at: a.last_match_at,
      player_name: a.player_name,
    })

    return ctx.response.ok({
      recent: recent.map(formatAccount),
      oldest: oldest.map(formatAccount),
      total: Number(total),
      by_region: byRegion.map((r) => ({
        region: r.region,
        count: Number(r.count),
      })),
    })
  }
}
