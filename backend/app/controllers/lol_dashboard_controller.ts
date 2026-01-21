import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { validatePagination, validateLimit, sanitizeLikeInput } from '#utils/validation'
import DashboardService from '#services/dashboard_service'
import League from '#models/league'
import {
  leaderboardQueryValidator,
  batchQueryValidator,
  historyBatchQueryValidator,
  transformRolesToDb,
  type ValidRole,
} from '#validators/dashboard_validators'

interface DateRangeResult {
  start: DateTime
  end: DateTime
  period: string
  error?: string
}

export default class LolDashboardController {
  /**
   * Maximum allowed date range in days for custom periods
   * Prevents excessively large queries that could cause performance issues
   */
  private static readonly MAX_DAYS_RANGE = 365

  private dashboardService = new DashboardService()

  /**
   * Helper to preprocess query params for validation
   * Converts comma-separated strings to arrays for leagues and roles
   */
  private preprocessQueryParams(qs: Record<string, unknown>): Record<string, unknown> {
    const MAX_ARRAY_ELEMENTS = 50
    const result = { ...qs }

    // Handle leagues: convert comma-separated string to array if needed
    if (result.leagues && typeof result.leagues === 'string') {
      const leagues = result.leagues.split(',').map((s) => s.trim()).filter(Boolean)
      result.leagues = leagues.slice(0, MAX_ARRAY_ELEMENTS)
    }

    // Handle roles: convert comma-separated string to array if needed
    if (result.roles && typeof result.roles === 'string') {
      const roles = result.roles.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      result.roles = roles.slice(0, MAX_ARRAY_ELEMENTS)
    }

    // Convert numeric string params to numbers for validation
    if (result.page) result.page = Number(result.page)
    if (result.perPage) result.perPage = Number(result.perPage)
    if (result.limit) result.limit = Number(result.limit)
    if (result.minGames) result.minGames = Number(result.minGames)

    // Convert boolean string params to booleans
    if (result.includeUnranked !== undefined) {
      result.includeUnranked = result.includeUnranked === 'true' || result.includeUnranked === true
    }

    return result
  }

  /**
   * Helper to get date range from request
   * Simplified: Frontend always sends startDate/endDate, backend just validates
   */
  private getDateRange(ctx: HttpContext): DateRangeResult {
    const { startDate, endDate, period = '7d', date } = ctx.request.qs()

    // Primary path: Use explicit startDate/endDate if provided
    if (startDate && endDate) {
      const start = DateTime.fromISO(startDate)
      if (!start.isValid) {
        return {
          start: DateTime.now(),
          end: DateTime.now(),
          period,
          error: 'Invalid startDate format. Use ISO 8601 (e.g., 2024-01-15).',
        }
      }

      const end = DateTime.fromISO(endDate)
      if (!end.isValid) {
        return {
          start: DateTime.now(),
          end: DateTime.now(),
          period,
          error: 'Invalid endDate format. Use ISO 8601 (e.g., 2024-01-15).',
        }
      }

      // Validate logical order
      if (start > end) {
        return {
          start: DateTime.now(),
          end: DateTime.now(),
          period,
          error: 'startDate must be before endDate.',
        }
      }

      // Validate maximum date range
      const daysDiff = end.diff(start, 'days').days
      if (daysDiff > LolDashboardController.MAX_DAYS_RANGE) {
        return {
          start: DateTime.now(),
          end: DateTime.now(),
          period,
          error: `Date range cannot exceed ${LolDashboardController.MAX_DAYS_RANGE} days. Requested: ${Math.round(daysDiff)} days.`,
        }
      }

      return { start: start.startOf('day'), end: end.endOf('day'), period }
    }

    // Fallback path: Calculate from period + reference date (backward compatibility)
    let refDate: DateTime = date ? DateTime.fromISO(date) : DateTime.now()
    if (date && !refDate.isValid) {
      return {
        start: DateTime.now(),
        end: DateTime.now(),
        period,
        error: 'Invalid date format. Use ISO 8601 (e.g., 2024-01-15).',
      }
    }

    let start: DateTime
    let end: DateTime = refDate.endOf('day')

    // Period days mapping
    const periodDays: Record<string, number> = {
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
    }

    const days = periodDays[period] ?? 7
    start = refDate.minus({ days: days - 1 }).startOf('day')

    return { start, end, period }
  }

  /**
   * GET /api/v1/lol/dashboard/teams
   * Team leaderboard
   */
  async teams(ctx: HttpContext) {
    // Preprocess and validate query params
    const preprocessed = this.preprocessQueryParams(ctx.request.qs())
    const validated = await leaderboardQueryValidator.validate(preprocessed)

    const dateRange = this.getDateRange(ctx)
    if (dateRange.error) {
      return ctx.response.badRequest({ error: dateRange.error })
    }

    const { start, end } = dateRange

    const { page, perPage } = validatePagination(validated.page, validated.perPage, { defaultPerPage: 20 })
    const leagueFilter = validated.leagues && validated.leagues.length > 0 ? validated.leagues : null
    const roleFilter = transformRolesToDb(validated.roles as ValidRole[] | undefined)
    const minGamesVal = validated.minGames ?? 0
    const sanitizedSearch = validated.search ? sanitizeLikeInput(validated.search, 100) : null

    const startDate = start.toSQLDate()
    const endDate = end.toSQLDate()

    if (!startDate || !endDate) {
      return ctx.response.badRequest({ error: 'Invalid date range computed' })
    }

    const result = await this.dashboardService.getTeamLeaderboard({
      startDate,
      endDate,
      leagues: leagueFilter,
      roles: roleFilter,
      minGames: minGamesVal,
      page,
      perPage,
      sort: validated.sort ?? 'games',
      search: sanitizedSearch,
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/lol/dashboard/players
   * Player leaderboard
   */
  async players(ctx: HttpContext) {
    // Preprocess and validate query params
    const preprocessed = this.preprocessQueryParams(ctx.request.qs())
    const validated = await leaderboardQueryValidator.validate(preprocessed)

    const dateRange = this.getDateRange(ctx)
    if (dateRange.error) {
      return ctx.response.badRequest({ error: dateRange.error })
    }

    const { start, end } = dateRange

    const { page, perPage } = validatePagination(validated.page, validated.perPage, { defaultPerPage: 20 })
    const leagueFilter = validated.leagues && validated.leagues.length > 0 ? validated.leagues : null
    const roleFilter = transformRolesToDb(validated.roles as ValidRole[] | undefined)
    const minGamesVal = validated.minGames ?? 0
    const sanitizedSearch = validated.search ? sanitizeLikeInput(validated.search, 100) : null

    const startDate = start.toSQLDate()
    const endDate = end.toSQLDate()

    if (!startDate || !endDate) {
      return ctx.response.badRequest({ error: 'Invalid date range computed' })
    }

    const result = await this.dashboardService.getPlayerLeaderboard({
      startDate,
      endDate,
      leagues: leagueFilter,
      roles: roleFilter,
      minGames: minGamesVal,
      page,
      perPage,
      sort: validated.sort ?? 'games',
      search: sanitizedSearch,
      includeUnranked: validated.includeUnranked ?? false,
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/lol/dashboard/team-history-batch
   * Batch team history
   */
  async teamHistoryBatch(ctx: HttpContext) {
    // Validate query params
    const validated = await historyBatchQueryValidator.validate(ctx.request.qs())

    const dateRange = this.getDateRange(ctx)
    if (dateRange.error) {
      return ctx.response.badRequest({ error: dateRange.error })
    }

    const { start, end, period } = dateRange

    const startDate = start.toSQLDate()
    const endDate = end.toSQLDate()

    if (!startDate || !endDate) {
      return ctx.response.badRequest({ error: 'Invalid date range computed' })
    }

    const result = await this.dashboardService.getBatchTeamHistory({
      startDate,
      endDate,
      period,
      entityIds: validated.entityIds,
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/lol/dashboard/player-history-batch
   * Batch player history
   */
  async playerHistoryBatch(ctx: HttpContext) {
    // Validate query params
    const validated = await historyBatchQueryValidator.validate(ctx.request.qs())

    const dateRange = this.getDateRange(ctx)
    if (dateRange.error) {
      return ctx.response.badRequest({ error: dateRange.error })
    }

    const { start, end, period } = dateRange

    const startDate = start.toSQLDate()
    const endDate = end.toSQLDate()

    if (!startDate || !endDate) {
      return ctx.response.badRequest({ error: 'Invalid date range computed' })
    }

    const result = await this.dashboardService.getBatchPlayerHistory({
      startDate,
      endDate,
      period,
      entityIds: validated.entityIds,
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/lol/dashboard/batch
   * Batch fetch grinders, LP gainers and LP losers
   */
  async batch(ctx: HttpContext) {
    // Preprocess and validate query params
    const preprocessed = this.preprocessQueryParams(ctx.request.qs())
    const validated = await batchQueryValidator.validate(preprocessed)

    const dateRange = this.getDateRange(ctx)
    if (dateRange.error) {
      return ctx.response.badRequest({ error: dateRange.error })
    }

    const { start, end } = dateRange

    const limit = validateLimit(validated.limit, { defaultLimit: 10, maxLimit: 100 })
    const leagueFilter = validated.leagues && validated.leagues.length > 0 ? validated.leagues : null
    const roleFilter = transformRolesToDb(validated.roles as ValidRole[] | undefined)
    const minGamesVal = validated.minGames ?? 0
    const validViewMode = validated.viewMode ?? 'players'

    const startDate = start.toSQLDate()
    const endDate = end.toSQLDate()

    if (!startDate || !endDate) {
      return ctx.response.badRequest({ error: 'Invalid date range computed' })
    }

    // Fetch all data in parallel
    const [grinders, gainers, losers] = await Promise.all([
      this.dashboardService.getTopGrinders({
        startDate,
        endDate,
        leagues: leagueFilter,
        roles: roleFilter,
        minGames: minGamesVal,
        limit,
        sort: 'desc',
        viewMode: validViewMode,
      }),
      this.dashboardService.getTopLpGainers({
        startDate,
        endDate,
        leagues: leagueFilter,
        roles: roleFilter,
        minGames: minGamesVal,
        limit,
        sort: 'desc',
        viewMode: validViewMode,
      }),
      this.dashboardService.getTopLpLosers({
        startDate,
        endDate,
        leagues: leagueFilter,
        roles: roleFilter,
        minGames: minGamesVal,
        limit,
        sort: 'desc',
        viewMode: validViewMode,
      }),
    ])

    return ctx.response.ok({
      grinders: { data: grinders },
      gainers: { data: gainers },
      losers: { data: losers },
    })
  }

  /**
   * GET /api/v1/lol/dashboard/leagues
   * List all active leagues
   */
  async leagues(ctx: HttpContext) {
    const leagues = await League.query()
      .where('isActive', true)
      .orderBy('tier', 'asc')
      .orderBy('name', 'asc')
      .select(['leagueId', 'name', 'shortName', 'region', 'color'])

    return ctx.response.ok({ data: leagues })
  }
}
