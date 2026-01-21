import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import WorkerStatus from '#models/worker_status'
import WorkerLog from '#models/worker_log'
import WorkerMetrics from '#models/worker_metrics'
import { sanitizeLikeInput } from '#utils/validation'
import { getRateLimiterStats } from '#middleware/rate_limit_middleware'

interface AccountRow {
  puuid: string
  game_name: string
  tag_line: string
  region: string
  last_fetched_at: Date | null
  last_match_at: Date | null
  player_name: string
  health_status: string
}

interface TierStatsRow {
  activity_tier: string
  count: number
  avg_score: string | null
  avg_staleness_sec: string | null
  ready_now: number
}

interface ScoreDistributionRow {
  score_range: string
  count: number
}

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

    // SECURITY: No user input - static query safe for rawQuery
    // Get region stats (only active players)
    const regionStats = await db.rawQuery(`
      SELECT
        a.region,
        COUNT(*) as accounts_total,
        COUNT(CASE WHEN a.last_fetched_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as accounts_done
      FROM lol_accounts a
      JOIN players p ON a.player_id = p.player_id
      WHERE p.is_active = true
      GROUP BY a.region
    `)

    const regionStatsMap: Record<string, { accounts_total: number; accounts_done: number; matches: number }> = {}
    for (const r of regionStats.rows) {
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
   * GET /api/v1/worker/accounts/list
   * Paginated, filterable account list with health status
   */
  async accountsList(ctx: HttpContext) {
    const {
      page = 1,
      perPage = 20,
      sortBy = 'last_fetched_at',
      sortDir = 'desc',
      region,
      status,
      search,
    } = ctx.request.qs()

    // Validate sort column against whitelist to prevent SQL injection
    const validSortColumns = ['last_fetched_at', 'game_name', 'region']
    if (sortBy && !validSortColumns.includes(sortBy)) {
      return ctx.response.badRequest({ error: 'Invalid sort column' })
    }
    const sortColumn = sortBy && validSortColumns.includes(sortBy) ? sortBy : 'last_fetched_at'

    // Validate sort direction
    const normalizedSortDir = sortDir?.toLowerCase()
    if (sortDir && !['asc', 'desc'].includes(normalizedSortDir)) {
      return ctx.response.badRequest({ error: 'Invalid sort direction' })
    }
    const sortDirection = normalizedSortDir === 'asc' ? 'ASC' : 'DESC'

    let query = db
      .from('lol_accounts as a')
      .join('players as p', 'a.player_id', 'p.player_id')
      .where('p.is_active', true)
      .select(
        'a.puuid',
        'a.game_name',
        'a.tag_line',
        'a.region',
        'a.last_fetched_at',
        'a.last_match_at',
        'p.current_pseudo as player_name',
        db.raw(`
          CASE
            WHEN a.last_fetched_at IS NULL THEN 'critical'
            WHEN a.last_fetched_at >= NOW() - INTERVAL '6 hours' THEN 'fresh'
            WHEN a.last_fetched_at >= NOW() - INTERVAL '24 hours' THEN 'normal'
            WHEN a.last_fetched_at >= NOW() - INTERVAL '72 hours' THEN 'stale'
            ELSE 'critical'
          END as health_status
        `)
      )

    // Filters
    if (region) {
      query = query.where('a.region', region)
    }

    if (search && typeof search === 'string' && search.trim().length >= 2) {
      // Sanitize input to escape LIKE wildcards
      const sanitizedSearch = sanitizeLikeInput(search, 100)
      query = query.where((qb) => {
        qb.whereILike('a.game_name', `%${sanitizedSearch}%`)
          .orWhereILike('a.tag_line', `%${sanitizedSearch}%`)
          .orWhereILike('p.current_pseudo', `%${sanitizedSearch}%`)
      })
    }

    if (status) {
      switch (status) {
        case 'fresh':
          query = query.whereRaw("a.last_fetched_at >= NOW() - INTERVAL '6 hours'")
          break
        case 'normal':
          query = query
            .whereRaw("a.last_fetched_at < NOW() - INTERVAL '6 hours'")
            .whereRaw("a.last_fetched_at >= NOW() - INTERVAL '24 hours'")
          break
        case 'stale':
          query = query
            .whereRaw("a.last_fetched_at < NOW() - INTERVAL '24 hours'")
            .whereRaw("a.last_fetched_at >= NOW() - INTERVAL '72 hours'")
          break
        case 'critical':
          query = query.where((qb) => {
            qb.whereNull('a.last_fetched_at').orWhereRaw(
              "a.last_fetched_at < NOW() - INTERVAL '72 hours'"
            )
          })
          break
      }
    }

    // Sorting - use safe orderBy method with validated column
    // Handle NULLS LAST for nullable timestamp columns
    if (sortColumn === 'last_fetched_at') {
      query = query
        .orderByRaw('CASE WHEN a.last_fetched_at IS NULL THEN 1 ELSE 0 END')
        .orderBy('a.last_fetched_at', sortDirection.toLowerCase() as 'asc' | 'desc')
    } else {
      // For other columns (game_name, region, etc.), standard ordering
      query = query.orderBy(`a.${sortColumn}`, sortDirection.toLowerCase() as 'asc' | 'desc')
    }

    // Pagination
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first()
    const dataQuery = query.offset((pageNum - 1) * perPageNum).limit(perPageNum)

    const [countResult, accounts] = await Promise.all([countQuery, dataQuery])
    const total = Number(countResult?.total || 0)
    const lastPage = Math.ceil(total / perPageNum)

    // Summary counts (only active players)
    const summary = await db
      .from('lol_accounts as a')
      .join('players as p', 'a.player_id', 'p.player_id')
      .where('p.is_active', true)
      .select(
        db.raw(
          "COUNT(CASE WHEN a.last_fetched_at >= NOW() - INTERVAL '6 hours' THEN 1 END)::int as fresh"
        ),
        db.raw(
          "COUNT(CASE WHEN a.last_fetched_at < NOW() - INTERVAL '6 hours' AND a.last_fetched_at >= NOW() - INTERVAL '24 hours' THEN 1 END)::int as normal"
        ),
        db.raw(
          "COUNT(CASE WHEN a.last_fetched_at < NOW() - INTERVAL '24 hours' AND a.last_fetched_at >= NOW() - INTERVAL '72 hours' THEN 1 END)::int as stale"
        ),
        db.raw(
          "COUNT(CASE WHEN a.last_fetched_at < NOW() - INTERVAL '72 hours' OR a.last_fetched_at IS NULL THEN 1 END)::int as critical"
        )
      )
      .first()

    return ctx.response.ok({
      data: accounts.map((a: AccountRow) => ({
        puuid: a.puuid,
        game_name: a.game_name,
        tag_line: a.tag_line,
        region: a.region,
        last_fetched: a.last_fetched_at,
        last_match_at: a.last_match_at,
        player_name: a.player_name,
        health_status: a.health_status,
      })),
      meta: {
        total,
        perPage: perPageNum,
        currentPage: pageNum,
        lastPage,
      },
      summary: {
        fresh: summary?.fresh || 0,
        normal: summary?.normal || 0,
        stale: summary?.stale || 0,
        critical: summary?.critical || 0,
      },
    })
  }

  /**
   * GET /api/v1/worker/coverage-stats
   * Aggregated coverage statistics
   */
  async coverageStats(ctx: HttpContext) {
    const today = DateTime.now().toSQLDate()!
    const yesterday = DateTime.now().minus({ days: 1 }).toSQLDate()!
    const weekAgo = DateTime.now().minus({ days: 7 }).toSQLDate()!

    // Get total tracked accounts (linked to active players)
    const [{ total }] = await db
      .from('lol_accounts as a')
      .innerJoin('players as p', 'a.player_id', 'p.player_id')
      .where('p.is_active', true)
      .count('* as total')
    const totalAccounts = Number(total)

    if (totalAccounts === 0) {
      return ctx.response.ok({
        todayCoverage: 0,
        weeklyAvgCoverage: 0,
        accountsWithActivityToday: 0,
        totalAccounts: 0,
        trend: 'stable',
        trendValue: 0,
        dailyUpdateCoverage: 0,
        accountsUpdatedToday: 0,
        dailyCoverage: [],
      })
    }

    // Get accounts that have a daily_stats row for today (daily update coverage)
    const [dailyUpdateStats] = await db
      .from('lol_daily_stats as ds')
      .innerJoin('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .innerJoin('players as p', 'a.player_id', 'p.player_id')
      .where('ds.date', today)
      .where('p.is_active', true)
      .select(db.raw('COUNT(DISTINCT ds.puuid)::int as accounts_updated'))

    const accountsUpdatedToday = Number(dailyUpdateStats?.accounts_updated || 0)

    // Get today's coverage (accounts with games today)
    const [todayStats] = await db
      .from('lol_daily_stats as ds')
      .innerJoin('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .innerJoin('players as p', 'a.player_id', 'p.player_id')
      .where('ds.date', today)
      .where('p.is_active', true)
      .where('ds.games_played', '>', 0)
      .select(db.raw('COUNT(DISTINCT ds.puuid)::int as accounts_with_activity'))

    const accountsWithActivityToday = Number(todayStats?.accounts_with_activity || 0)

    // Get yesterday's coverage for trend
    const [yesterdayStats] = await db
      .from('lol_daily_stats')
      .where('date', yesterday)
      .select(db.raw('COUNT(DISTINCT puuid)::int as accounts'))

    const yesterdayAccounts = Number(yesterdayStats?.accounts || 0)

    // Get weekly data for average
    const weeklyData = await db
      .from('lol_daily_stats')
      .where('date', '>=', weekAgo)
      .where('date', '<', today)
      .select('date', db.raw('COUNT(DISTINCT puuid)::int as accounts'))
      .groupBy('date')

    const weeklyAvg =
      weeklyData.length > 0
        ? weeklyData.reduce((sum, d) => sum + Number(d.accounts), 0) / weeklyData.length
        : 0

    // Calculate trend
    let trend: 'up' | 'down' | 'stable' = 'stable'
    let trendValue = 0

    if (yesterdayAccounts > 0) {
      const diff = accountsWithActivityToday - yesterdayAccounts
      trendValue = Math.round((diff / yesterdayAccounts) * 100)
      trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable'
    }

    // Get daily update coverage history for the past 7 days
    const dailyCoverageHistory = await db
      .from('lol_daily_stats as ds')
      .innerJoin('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .innerJoin('players as p', 'a.player_id', 'p.player_id')
      .where('ds.date', '>=', weekAgo)
      .where('ds.date', '<=', today)
      .where('p.is_active', true)
      .select('ds.date', db.raw('COUNT(DISTINCT ds.puuid)::int as accounts_updated'))
      .groupBy('ds.date')
      .orderBy('ds.date', 'asc')

    const dailyCoverage = dailyCoverageHistory.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      accountsUpdated: Number(row.accounts_updated),
      coverage: Math.round((Number(row.accounts_updated) / totalAccounts) * 1000) / 10,
    }))

    return ctx.response.ok({
      todayCoverage: Math.round((accountsWithActivityToday / totalAccounts) * 1000) / 10,
      weeklyAvgCoverage: Math.round((weeklyAvg / totalAccounts) * 1000) / 10,
      accountsWithActivityToday,
      totalAccounts,
      trend,
      trendValue,
      dailyUpdateCoverage: Math.round((accountsUpdatedToday / totalAccounts) * 1000) / 10,
      accountsUpdatedToday,
      dailyCoverage,
    })
  }

  /**
   * GET /api/v1/worker/priority-stats
   * Priority queue statistics for V2 worker
   */
  async priorityStats(ctx: HttpContext) {
    // SECURITY: No user input - static query safe for rawQuery
    // Get tier statistics
    const tierStats = await db.rawQuery(`
      SELECT
        activity_tier,
        COUNT(*)::int as count,
        ROUND(AVG(activity_score)::numeric, 2) as avg_score,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - last_fetched_at)))::numeric, 0) as avg_staleness_sec,
        COUNT(*) FILTER (WHERE next_fetch_at <= NOW())::int as ready_now
      FROM lol_accounts a
      JOIN players p ON a.player_id = p.player_id
      WHERE p.is_active = true AND activity_tier IS NOT NULL
      GROUP BY activity_tier
      ORDER BY CASE activity_tier
        WHEN 'very_active' THEN 1
        WHEN 'active' THEN 2
        WHEN 'moderate' THEN 3
        WHEN 'inactive' THEN 4
      END
    `)

    // SECURITY: No user input - static query safe for rawQuery
    // Get score distribution
    const scoreDistribution = await db.rawQuery(`
      SELECT
        CASE
          WHEN activity_score >= 70 THEN '70-100 (very_active)'
          WHEN activity_score >= 40 THEN '40-69 (active)'
          WHEN activity_score >= 20 THEN '20-39 (moderate)'
          ELSE '0-19 (inactive)'
        END as score_range,
        COUNT(*)::int as count
      FROM lol_accounts a
      JOIN players p ON a.player_id = p.player_id
      WHERE p.is_active = true
      GROUP BY 1
      ORDER BY 1 DESC
    `)

    // Get totals
    const [totals] = await db
      .from('lol_accounts as a')
      .join('players as p', 'a.player_id', 'p.player_id')
      .where('p.is_active', true)
      .select(
        db.raw('COUNT(*)::int as total_accounts'),
        db.raw('ROUND(AVG(activity_score)::numeric, 2) as overall_avg_score'),
        db.raw('COUNT(*) FILTER (WHERE next_fetch_at <= NOW())::int as total_ready'),
        db.raw('COUNT(*) FILTER (WHERE activity_tier IS NULL)::int as unscored')
      )

    return ctx.response.ok({
      by_tier: tierStats.rows.map((r: TierStatsRow) => ({
        tier: r.activity_tier,
        count: r.count,
        avg_score: parseFloat(r.avg_score ?? '0') || 0,
        avg_staleness_sec: parseInt(r.avg_staleness_sec ?? '0') || 0,
        ready_now: r.ready_now,
      })),
      score_distribution: scoreDistribution.rows.map((r: ScoreDistributionRow) => ({
        range: r.score_range,
        count: r.count,
      })),
      totals: {
        total_accounts: totals?.total_accounts || 0,
        overall_avg_score: parseFloat(totals?.overall_avg_score) || 0,
        total_ready: totals?.total_ready || 0,
        unscored: totals?.unscored || 0,
      },
      generated_at: new Date().toISOString(),
    })
  }

  /**
   * GET /api/v1/worker/rate-limiter-stats
   * Rate limiter memory management statistics
   */
  async rateLimiterStats(ctx: HttpContext) {
    const stats = await getRateLimiterStats()
    return ctx.response.ok(stats)
  }
}
