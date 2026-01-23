import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import { sanitizeLikeInput } from '#utils/validation'
import { cacheService, CACHE_TTL } from './cache_service.js'
import { VALID_SORT_OPTIONS, type ValidSortOption } from '#validators/dashboard_validators'

// ============================================================================
// SQL INJECTION PREVENTION SYSTEM
// ============================================================================

/**
 * Whitelist of allowed SQL filter condition patterns.
 * Each pattern must match the EXACT format of conditions we generate.
 * This prevents SQL injection even if code is modified incorrectly.
 * @security CRITICAL - Any modification to this list requires security review
 */
const ALLOWED_FILTER_PATTERNS: RegExp[] = [
  // Team filters
  /^t\.league IN \(\?(?:,\?)*\)$/, // t.league IN (?,?,?)
  /^t\.is_active = true$/, // t.is_active = true
  /^t\.team_id IN \(\?(?:,\?)*\)$/, // t.team_id IN (?,?)

  // Player filters
  /^p\.player_id IN \(\?(?:,\?)*\)$/, // p.player_id IN (?,?)
  /^p\.current_pseudo ILIKE \?$/, // p.current_pseudo ILIKE ?
  /^p\.is_active = true$/, // p.is_active = true

  // Search filters (combined conditions)
  /^\(t\.current_name ILIKE \? OR t\.short_name ILIKE \?\)$/, // (t.current_name ILIKE ? OR t.short_name ILIKE ?)

  // Role/contract filters
  /^rp\.role IN \(\?(?:,\?)*\)$/, // rp.role IN (?,?,?)
  /^pc\.role IN \(\?(?:,\?)*\)$/, // pc.role IN (?,?,?)
  /^pc\.end_date IS NULL$/, // pc.end_date IS NULL

  // Account filters
  /^a\.puuid IN \(\?(?:,\?)*\)$/, // a.puuid IN (?,?)
  /^a\.account_id IN \(\?(?:,\?)*\)$/, // a.account_id IN (?,?)

  // Date filters
  /^ds\.date >= \?$/, // ds.date >= ?
  /^ds\.date <= \?$/, // ds.date <= ?
  /^ds\.date BETWEEN \? AND \?$/, // ds.date BETWEEN ? AND ?

  // LP change filters (for gainers/losers queries - no table alias)
  /^lp_change > 0$/, // lp_change > 0
  /^lp_change < 0$/, // lp_change < 0
  /^SUM\(lp_change\) > 0$/, // SUM(lp_change) > 0 (HAVING clause for team gainers)
  /^SUM\(lp_change\) < 0$/, // SUM(lp_change) < 0 (HAVING clause for team losers)
  /^league IN \(\?(?:,\?)*\)$/, // league IN (?,?,?)
  /^role IN \(\?(?:,\?)*\)$/, // role IN (?,?,?)
  /^games >= \?$/, // games >= ?

  // Aggregation/HAVING conditions
  /^SUM\(ds\.games_played\) >= \?$/, // SUM(ds.games_played) >= ?
  /^COUNT\(\*\) >= \?$/, // COUNT(*) >= ?
  /^COALESCE\(SUM\(ds\.games_played\), 0\) >= \?$/, // COALESCE(SUM(ds.games_played), 0) >= ?
  /^SUM\(games\) >= \?$/, // SUM(games) >= ?
]

// ============================================================================
// QUERY TIMEOUT PROTECTION
// ============================================================================

/**
 * Default timeout for dashboard queries in milliseconds.
 * Should be less than any upstream timeout (load balancer, etc.)
 */
const QUERY_TIMEOUT_MS = 8000 // 8 seconds

/**
 * Timeout for batch operations (multiple queries)
 */
const BATCH_QUERY_TIMEOUT_MS = 15000 // 15 seconds

/**
 * Threshold for logging slow queries (percentage of timeout)
 */
const SLOW_QUERY_THRESHOLD = 0.5 // 50%

/**
 * Custom error class for query timeouts.
 * Used to distinguish timeout errors from other database errors.
 */
class QueryTimeoutError extends Error {
  public readonly operationName: string
  public readonly timeoutMs: number

  constructor(operationName: string, timeoutMs: number) {
    super(`Query timeout: ${operationName} exceeded ${timeoutMs}ms`)
    this.name = 'QueryTimeoutError'
    this.operationName = operationName
    this.timeoutMs = timeoutMs
  }
}

/**
 * Executes a database operation with a timeout.
 * Logs slow queries and throws user-friendly error on timeout.
 *
 * @param operationName - Name for logging purposes
 * @param operation - Async function to execute
 * @param timeoutMs - Timeout in milliseconds (default: QUERY_TIMEOUT_MS)
 * @returns Result of the operation
 * @throws Error with user-friendly message if operation exceeds timeout
 */
async function executeWithTimeout<T>(
  operationName: string,
  operation: () => Promise<T>,
  timeoutMs: number = QUERY_TIMEOUT_MS
): Promise<T> {
  const startTime = Date.now()

  // Create a promise that rejects after the timeout
  const timeoutPromise = setTimeoutPromise(timeoutMs).then(() => {
    throw new QueryTimeoutError(operationName, timeoutMs)
  })

  try {
    // Race between the operation and the timeout
    const result = await Promise.race([operation(), timeoutPromise])

    const duration = Date.now() - startTime

    // Log slow queries (> configured threshold)
    if (duration > timeoutMs * SLOW_QUERY_THRESHOLD) {
      logger.warn({
        component: 'dashboard-service',
        operation: operationName,
        duration,
        timeoutMs,
        threshold: `${SLOW_QUERY_THRESHOLD * 100}%`,
      }, 'Slow query detected - approaching timeout threshold')
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime

    if (error instanceof QueryTimeoutError) {
      logger.error({
        component: 'dashboard-service',
        operation: operationName,
        duration,
        timeoutMs,
      }, 'Query timeout exceeded')

      // User-friendly message in French
      throw new Error(
        'La requête a pris trop de temps. ' +
        'Essayez de réduire la plage de dates ou le nombre de filtres.'
      )
    }

    // Re-throw other errors as-is
    throw error
  }
}

// ============================================================================
// END QUERY TIMEOUT PROTECTION
// ============================================================================

/**
 * Validates that a SQL filter condition matches our whitelist.
 * Throws an error if the condition is not recognized.
 *
 * @param condition - The SQL condition string to validate
 * @throws Error if condition doesn't match any allowed pattern
 * @security This is a critical security function - logs rejected conditions for audit
 */
function validateFilterCondition(condition: string): void {
  // Normalize spaces for comparison (collapse multiple spaces to single)
  const normalized = condition.trim().replace(/\s+/g, ' ')

  const isValid = ALLOWED_FILTER_PATTERNS.some((pattern) => pattern.test(normalized))

  if (!isValid) {
    // Log for security monitoring but don't expose details to client
    logger.error(
      {
        component: 'dashboard-service',
        condition: condition.slice(0, 100), // Truncate for safety
      },
      'Rejected invalid SQL filter condition - potential injection attempt'
    )

    throw new Error('Invalid filter condition detected')
  }
}

/**
 * Validates all conditions in an array before building the WHERE clause.
 *
 * @param conditions - Array of SQL condition strings
 * @throws Error if any condition is invalid
 * @security Validates entire condition set to ensure no injection can occur
 */
function validateAllConditions(conditions: string[]): void {
  for (const condition of conditions) {
    validateFilterCondition(condition)
  }
}

/**
 * Allowed column names for IN clause construction.
 * Only these column references can be used with buildInClause.
 * @security Prevents arbitrary column names from being used in queries
 */
type AllowedInColumn =
  | 't.league'
  | 't.team_id'
  | 'p.player_id'
  | 'rp.role'
  | 'pc.role'
  | 'a.puuid'
  | 'a.account_id'
  | 'league'
  | 'role'

/**
 * Safely builds an IN clause with the correct number of placeholders.
 * Uses TypeScript type safety to ensure only whitelisted columns are used.
 *
 * @param column - The column name (must be from AllowedInColumn whitelist)
 * @param values - The values array
 * @returns Tuple of [condition string, values array]
 * @throws Error if values array is empty
 * @security Type-safe column selection prevents SQL injection
 */
function buildInClause(
  column: AllowedInColumn,
  values: (string | number)[]
): [string, (string | number)[]] {
  if (values.length === 0) {
    throw new Error('IN clause requires at least one value')
  }

  const placeholders = values.map(() => '?').join(',')
  return [`${column} IN (${placeholders})`, values]
}

// ============================================================================
// END SQL INJECTION PREVENTION SYSTEM
// ============================================================================

/**
 * SQL ORDER BY clause mappings for team leaderboard
 * Maps validated sort options to their corresponding SQL expressions
 * @security This whitelist prevents SQL injection via dynamic ORDER BY
 */
const TEAM_SORT_CLAUSE_MAP: Record<ValidSortOption, string> = {
  games: 'games DESC',
  winrate: 'winrate_calc DESC',
  lp: 'total_lp DESC',
} as const

/**
 * SQL column mappings for player leaderboard ORDER BY
 * Maps validated sort options to column names (direction added separately)
 * @security This whitelist prevents SQL injection via dynamic ORDER BY
 */
const PLAYER_SORT_COLUMN_MAP: Record<ValidSortOption, string> = {
  games: 'games',
  winrate: 'winrate_calc',
  lp: 'total_lp',
} as const

/**
 * SQL direction mapping for sort direction
 * @security This whitelist ensures only valid SQL directions are used
 */
const SORT_DIRECTION_MAP: Record<'asc' | 'desc', string> = {
  asc: 'ASC',
  desc: 'DESC',
} as const

/**
 * Get the ORDER BY clause for team leaderboard queries
 * @param sort - Validated sort option from VineJS
 * @returns SQL ORDER BY clause
 * @throws Error if sort option is not in whitelist (should never happen with proper validation)
 * @security Runtime assertion ensures only whitelisted values reach SQL
 */
function getTeamSortClause(sort: string): string {
  const clause = TEAM_SORT_CLAUSE_MAP[sort as ValidSortOption]
  if (!clause) {
    throw new Error(`Invalid sort option: ${sort}. Valid options: ${VALID_SORT_OPTIONS.join(', ')}`)
  }
  return clause
}

/**
 * Get the column name for player leaderboard ORDER BY
 * @param sort - Validated sort option from VineJS
 * @returns SQL column name for ORDER BY
 * @throws Error if sort option is not in whitelist
 * @security Runtime assertion ensures only whitelisted values reach SQL
 */
function getPlayerSortColumn(sort: string): string {
  const column = PLAYER_SORT_COLUMN_MAP[sort as ValidSortOption]
  if (!column) {
    throw new Error(`Invalid sort option: ${sort}. Valid options: ${VALID_SORT_OPTIONS.join(', ')}`)
  }
  return column
}

/**
 * Get the SQL direction keyword for ORDER BY
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns SQL direction keyword ('ASC' or 'DESC')
 * @throws Error if direction is not valid
 * @security Runtime assertion ensures only 'ASC' or 'DESC' reach SQL
 */
function getSortDirection(direction: string): string {
  const sqlDirection = SORT_DIRECTION_MAP[direction as 'asc' | 'desc']
  if (!sqlDirection) {
    throw new Error(`Invalid sort direction: ${direction}. Valid options: asc, desc`)
  }
  return sqlDirection
}

/**
 * Filter interfaces for dashboard queries
 */
export interface DashboardFilters {
  startDate: string
  endDate: string
  leagues?: string[] | null
}

export interface LeaderboardFilters extends DashboardFilters {
  roles?: string[] | null
  minGames?: number
  page: number
  perPage: number
  sort?: string
  search?: string | null
  includeUnranked?: boolean
}

export interface TopFilters extends DashboardFilters {
  leagues?: string[] | null
  roles?: string[] | null
  minGames?: number
  limit: number
  sort?: 'asc' | 'desc'
  viewMode?: 'players' | 'teams'
}

export interface BatchHistoryFilters {
  startDate: string
  endDate: string
  period: string
  entityIds: number[]
}

/**
 * Return type interfaces
 */
export interface TeamInfo {
  teamId: number
  slug: string
  currentName: string
  shortName: string
  logoUrl: string | null
  region: string
  league: string
}

export interface PlayerInfo {
  playerId: number
  slug: string
  pseudo: string
  role: string
  games: number
  winrate: number
  tier: string | null
  rank: string | null
  lp: number
  totalLp: number
}

export interface TeamLeaderboardEntry {
  rank: number
  team: TeamInfo
  games: number
  gamesChange: number
  winrate: number
  winrateChange: number
  totalMinutes: number
  totalMinutesChange: number
  totalLp: number
  totalLpChange: number
  players: PlayerInfo[]
}

export interface TeamLeaderboardResult {
  period: string
  startDate: string | null
  endDate: string | null
  data: TeamLeaderboardEntry[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface PlayerLeaderboardEntry {
  rank: number
  player: {
    playerId: number
    slug: string
    pseudo: string
  }
  team: {
    teamId: number
    slug: string | null
    shortName: string | null
    logoUrl: string | null
    region: string | null
    league: string | null
  } | null
  role: string
  games: number
  gamesChange: number
  winrate: number
  winrateChange: number
  totalMinutes: number
  totalMinutesChange: number
  tier: string | null
  rank_division: string | null
  lp: number
  totalLp: number
  totalLpChange: number
  accounts: Array<{
    puuid: string
    gameName: string | null
    tagLine: string | null
    region: string
    tier: string | null
    rank: string | null
    lp: number
    totalLp: number
    games: number
    wins: number
    winrate: number
  }>
}

export interface PlayerLeaderboardResult {
  data: PlayerLeaderboardEntry[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface GrinderResult {
  rank: number
  entity: {
    id: number
    slug: string
    name: string
    shortName?: string
    logoUrl?: string | null
  }
  entityType: 'player' | 'team'
  team?: {
    slug: string
    shortName: string
  }
  role?: string
  games: number
}

export interface LpChangeResult {
  rank: number
  entity: {
    id: number
    slug: string
    name: string
    shortName?: string
    logoUrl?: string | null
  }
  entityType: 'player' | 'team'
  team?: {
    slug: string
    shortName: string | null
  }
  lpChange: number
  games: number
}

export interface HistoryDataPoint {
  date: string | null
  label: string
  games: number
  wins: number
  winrate: number
  totalLp: number
}

export interface BatchTeamHistoryResult {
  data: Array<{
    teamId: number
    teamName: string
    shortName: string
    data: HistoryDataPoint[]
  }>
}

export interface BatchPlayerHistoryResult {
  data: Array<{
    playerId: number
    playerName: string
    data: HistoryDataPoint[]
  }>
}

/**
 * Raw database row interfaces
 */
interface TeamLpChangeRow {
  team_id: number
  slug: string
  current_name: string
  short_name: string
  logo_url: string | null
  lp_change: string
  games: string | null
}

interface PlayerLpChangeRow {
  player_id: number
  slug: string
  current_pseudo: string
  team_slug: string | null
  team_short_name: string | null
  lp_change: string
  games: string | null
}

interface TeamWithLpRow {
  team_id: number
  slug: string
  current_name: string
  short_name: string
  logo_url: string | null
  region: string
  league: string
  games: number
  wins: number
  total_duration: number
  winrate_calc: number
  total_lp: number
  total_count: number
  // Period change fields
  games_change: number
  winrate_change: number
  total_lp_change: number
}

interface PlayerWithLpRow {
  player_id: number
  slug: string
  current_pseudo: string
  team_id: number | null
  team_slug: string | null
  short_name: string | null
  logo_url: string | null
  region: string | null
  league: string | null
  role: string | null
  games: number
  wins: number
  total_duration: number
  winrate_calc: number
  total_lp: number
  total_count?: number
  // Period change fields
  games_change?: number
  winrate_change?: number
  total_lp_change?: number
}

interface AccountWithStatsRow {
  puuid: string
  player_id: number
  game_name: string | null
  tag_line: string | null
  region: string
  games: number
  wins: number
  tier: string | null
  rank: string | null
  lp: number
}

/**
 * Player account details embedded in team response (from JSON aggregation)
 */
interface EmbeddedAccountDetail {
  accountId: number
  gameName: string
  tagLine: string
  region: string
  tier: string | null
  rank: string | null
  lp: number | null
}

/**
 * Player details embedded in team response (from JSON aggregation)
 */
interface EmbeddedPlayerDetail {
  playerId: number
  slug: string
  currentPseudo: string
  role: string | null
  isStarter: boolean
  games: number
  wins: number
  accounts: EmbeddedAccountDetail[]
}

/**
 * Extended team row with embedded players from JSON aggregation
 */
interface TeamWithPlayersRow extends TeamWithLpRow {
  players_json: EmbeddedPlayerDetail[] | null
}

/**
 * Dashboard Service
 * Handles all business logic for dashboard operations
 */
@inject()
export default class DashboardService {
  constructor() {}

  /**
   * Generates a deterministic cache key for the given parameters.
   *
   * Uses SHA256 for better collision resistance than MD5.
   * Normalizes parameters to ensure consistent keys regardless of property order.
   *
   * @param prefix - Cache key prefix (e.g., 'teams', 'players', 'history')
   * @param params - Parameters to include in the hash
   * @returns Cache key in format: dashboard:{prefix}:{hash}
   *
   * @example
   * buildCacheKey('teams', { leagues: ['LEC', 'LFL'], page: 1 })
   * // Returns: 'dashboard:teams:a1b2c3d4e5f6g7h8'
   *
   * CHANGELOG:
   * - 2025-01-21: Changed from MD5 (12 chars) to SHA256 (16 chars)
   *   This invalidates existing cache but entries rebuild automatically.
   */
  private buildCacheKey(prefix: string, params: object): string {
    const normalized = this.normalizeParamsForCache(params as Record<string, unknown>)

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 16)

    return `dashboard:${prefix}:${hash}`
  }

  /**
   * Normalizes parameters for consistent cache key generation.
   *
   * - Sorts object keys alphabetically
   * - Sorts arrays for order-independent comparison
   * - Removes undefined and null values
   * - Removes empty strings and empty arrays
   * - Recursively normalizes nested objects
   *
   * This ensures that { a: 1, b: 2 } and { b: 2, a: 1 } produce the same key.
   *
   * @param params - Raw parameters object
   * @returns Normalized parameters object
   */
  private normalizeParamsForCache(params: Record<string, unknown>): Record<string, unknown> {
    const normalized: Record<string, unknown> = {}

    // Sort keys alphabetically for consistency
    const sortedKeys = Object.keys(params).sort()

    for (const key of sortedKeys) {
      const value = params[key]

      // Skip undefined/null values
      if (value === undefined || value === null) {
        continue
      }

      // Skip empty strings
      if (typeof value === 'string' && value.trim() === '') {
        continue
      }

      // Skip empty arrays
      if (Array.isArray(value) && value.length === 0) {
        continue
      }

      if (Array.isArray(value)) {
        // Sort arrays so that ['LEC', 'LFL'] === ['LFL', 'LEC']
        // Use a copy to avoid mutating the original
        const sortedArray = [...value].sort((a, b) => {
          // Handle mixed types by converting to string
          return String(a).localeCompare(String(b))
        })
        normalized[key] = sortedArray
      } else if (typeof value === 'object' && value !== null) {
        // Recursively normalize nested objects
        normalized[key] = this.normalizeParamsForCache(value as Record<string, unknown>)
      } else {
        // Primitive values (string, number, boolean)
        normalized[key] = value
      }
    }

    return normalized
  }

  /**
   * Format label based on period type
   */
  private formatLabelForPeriod(date: Date, period: string): string {
    const dt = DateTime.fromJSDate(date)
    switch (period) {
      case 'day':
        return dt.toFormat('d MMM')
      case 'month':
        return dt.toFormat('d')
      case 'year':
        return dt.toFormat('MMM')
      default:
        return dt.toFormat('d MMM')
    }
  }

  /**
   * Calculate previous period dates based on current period
   * Example: Jan 10-16 (7 days) -> Jan 3-9 (previous 7 days)
   */
  private calculatePreviousPeriod(
    startDate: string,
    endDate: string
  ): { prevStartDate: string; prevEndDate: string } {
    const start = DateTime.fromISO(startDate)
    const end = DateTime.fromISO(endDate)
    const daysDiff = Math.ceil(end.diff(start, 'days').days) + 1

    const prevEnd = start.minus({ days: 1 })
    const prevStart = prevEnd.minus({ days: daysDiff - 1 })

    return {
      prevStartDate: prevStart.toISODate()!,
      prevEndDate: prevEnd.toISODate()!,
    }
  }

  /**
   * Get team leaderboard with players and stats.
   *
   * ## Algorithm Overview
   * 1. For each player, selects their BEST account (highest tier, then highest LP)
   * 2. Calculates team LP = sum of LP from top 5 players' best accounts
   * 3. Compares with previous period to calculate deltas (games, winrate, LP)
   *
   * ## CTE Pipeline (10 CTEs)
   *
   * ### Previous Period CTEs (for delta calculation):
   * - `prev_latest_ranks`: Latest rank for each account in previous period (DISTINCT ON puuid)
   * - `prev_player_best_account`: Best account per player using ROW_NUMBER (tier priority, then LP)
   * - `prev_player_lp`: Filters to only rn=1 (best account per player)
   * - `prev_ranked_players`: Ranks players within team by LP (for top 5 selection)
   * - `prev_team_lp`: Sum of LP for top 5 players per team
   * - `prev_team_stats`: Games/wins aggregation for previous period
   *
   * ### Current Period CTEs:
   * - `latest_ranks`: Latest rank for each account in current period
   * - `player_best_account`: Best account per player (same logic as prev)
   * - `player_lp`: Filters to best account only
   * - `ranked_players`: Ranks players by LP within team
   * - `team_lp`: Sum of top 5 players' LP
   * - `team_stats`: Main aggregation with joins to teams, orgs, and daily stats
   * - `teams_with_lp`: Joins stats with LP totals
   * - `teams_with_changes`: Calculates period-over-period deltas
   *
   * ## Business Rules
   * - Only Master+ tiers (MASTER, GRANDMASTER, CHALLENGER) count for LP
   * - Only active teams (is_active = true) are included
   * - Only players with active contracts (end_date IS NULL) count
   * - Team LP = sum of top 5 highest LP players (not all players)
   *
   * ## Performance Notes
   * - Uses DISTINCT ON for efficient "latest row per group" queries
   * - Uses ROW_NUMBER() for best account selection (allows ties to be broken)
   * - COUNT(*) OVER() for total count without separate query
   *
   * @param filters - Period dates, leagues, roles, pagination, sort, search
   * @returns Paginated team leaderboard with stats and player details
   *
   * @example
   * ```sql
   * -- EXPLAIN ANALYZE for production monitoring:
   * EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
   * WITH prev_latest_ranks AS (...) -- full query
   * ```
   */
  async getTeamLeaderboard(filters: LeaderboardFilters): Promise<TeamLeaderboardResult> {
    return executeWithTimeout('getTeamLeaderboard', async () => {
      const cacheKey = this.buildCacheKey('leaderboard:team', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.LEADERBOARD, async () => {
      const {
        startDate,
        endDate,
        leagues,
        roles,
        minGames = 0,
        page,
        perPage,
        sort = 'games',
        search,
      } = filters

      const leagueFilter = leagues && leagues.length > 0 ? leagues : null
    const roleFilter = roles && roles.length > 0 ? roles : null
    const sanitizedSearch = search ? sanitizeLikeInput(search, 100) : null
    const offset = (page - 1) * perPage

    // Calculate previous period for comparison
    const { prevStartDate, prevEndDate } = this.calculatePreviousPeriod(startDate, endDate)

    // Determine sort column using secure whitelist mapping
    const orderByClause = getTeamSortClause(sort)

    // Build dynamic filter conditions
    const filterConditions: string[] = ['t.is_active = true']
    // Params order: prevStartDate, prevEndDate (for prev LP), startDate, endDate (for current LP),
    // prevStartDate, prevEndDate (for prev stats), startDate, endDate (for current stats),
    // then filters (in team_stats WHERE), then player_details dates, then pagination
    const params: (string | number)[] = [
      prevStartDate, prevEndDate, // prev_player_lp
      startDate, endDate,         // player_lp
      prevStartDate, prevEndDate, // prev_team_stats
      startDate, endDate,         // team_stats
    ]

    if (leagueFilter?.length) {
      const [condition, vals] = buildInClause('t.league', leagueFilter)
      filterConditions.push(condition)
      params.push(...vals)
    }
    if (roleFilter?.length) {
      const [condition, vals] = buildInClause('rp.role', roleFilter)
      filterConditions.push(condition)
      params.push(...vals)
    }
    if (sanitizedSearch) {
      filterConditions.push(`(t.current_name ILIKE ? OR t.short_name ILIKE ?)`)
      params.push(`%${sanitizedSearch}%`, `%${sanitizedSearch}%`)
    }

    // Note: PostgreSQL HAVING clause cannot reference SELECT aliases, must use full aggregate expression
    const havingConditions: string[] = []
    if (minGames > 0) {
      havingConditions.push('COALESCE(SUM(ds.games_played), 0) >= ?')
      params.push(minGames)
    }

    // Add player_period_stats params (after filters, before pagination)
    params.push(startDate, endDate)  // player_period_stats CTE

    // Add pagination params
    params.push(perPage, offset)

    // SECURITY: Validate all conditions before building query
    validateAllConditions(filterConditions)
    if (havingConditions.length > 0) {
      validateAllConditions(havingConditions)
    }

    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : ''

    // ============================================================================
    // MAIN TEAM LEADERBOARD QUERY
    // Uses 12 CTEs to calculate team rankings with period-over-period comparisons.
    // Best account selection: highest tier (CHALLENGER > GM > MASTER), then highest LP
    // Team LP calculation: sum of top 5 players' best accounts
    // ============================================================================
    const result = await db.rawQuery<{ rows: TeamWithLpRow[] }>(`
      -- ============================================================================
      -- CTE 1: prev_latest_ranks
      -- Purpose: Get the most recent rank data for each account in the PREVIOUS period
      -- Technique: DISTINCT ON efficiently selects one row per puuid, ordered by date DESC
      -- This gives us the "snapshot" of where each account ended the previous period
      -- ============================================================================
      WITH prev_latest_ranks AS (
        SELECT DISTINCT ON (puuid) puuid, tier, lp
        FROM lol_daily_stats
        WHERE date >= ? AND date <= ?
        ORDER BY puuid, date DESC
      ),

      -- ============================================================================
      -- CTE 2: prev_player_best_account
      -- Purpose: Select the BEST account for each player in previous period
      -- Logic: ROW_NUMBER partitioned by player, ordered by tier priority then LP
      -- Tier priority: CHALLENGER=1 (best) > GRANDMASTER=2 > MASTER=3 > others=4
      -- Only Master+ accounts are considered for LP calculations
      -- ============================================================================
      prev_player_best_account AS (
        SELECT
          pc.team_id,
          pc.player_id,
          pc.role,
          acc.puuid,
          lr.tier,
          lr.lp,
          ROW_NUMBER() OVER (
            PARTITION BY pc.player_id
            ORDER BY
              CASE lr.tier
                WHEN 'CHALLENGER' THEN 1
                WHEN 'GRANDMASTER' THEN 2
                WHEN 'MASTER' THEN 3
                ELSE 4
              END,
              lr.lp DESC
          ) as account_rn
        FROM player_contracts pc
        JOIN lol_accounts acc ON pc.player_id = acc.player_id
        JOIN prev_latest_ranks lr ON acc.puuid = lr.puuid
        WHERE pc.end_date IS NULL  -- Only active contracts
          AND lr.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')  -- Master+ only
      ),

      -- ============================================================================
      -- CTE 3: prev_player_lp
      -- Purpose: Filter to keep only the single best account per player
      -- The account_rn = 1 filter selects the winner from the ROW_NUMBER ranking
      -- ============================================================================
      prev_player_lp AS (
        SELECT team_id, player_id, role, puuid as best_puuid, tier, lp as player_lp
        FROM prev_player_best_account
        WHERE account_rn = 1
      ),

      -- ============================================================================
      -- CTE 4: prev_ranked_players
      -- Purpose: Rank players WITHIN each team by their LP (for top 5 selection)
      -- This determines which players contribute to the team's total LP
      -- ============================================================================
      prev_ranked_players AS (
        SELECT
          team_id,
          player_id,
          role,
          best_puuid,
          player_lp,
          ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY player_lp DESC) as rn
        FROM prev_player_lp
      ),

      -- ============================================================================
      -- CTE 5: prev_team_lp
      -- Purpose: Calculate previous period total LP per team
      -- Business rule: Only top 5 players (rn <= 5) contribute to team LP
      -- This prevents teams with many players from having inflated totals
      -- ============================================================================
      prev_team_lp AS (
        SELECT
          team_id,
          SUM(player_lp)::int as total_lp
        FROM prev_ranked_players
        WHERE rn <= 5
        GROUP BY team_id
      ),

      -- ============================================================================
      -- CTE 6: latest_ranks
      -- Purpose: Same as prev_latest_ranks but for CURRENT period
      -- Gets the most recent rank snapshot for delta calculations
      -- ============================================================================
      latest_ranks AS (
        SELECT DISTINCT ON (puuid) puuid, tier, lp
        FROM lol_daily_stats
        WHERE date >= ? AND date <= ?
        ORDER BY puuid, date DESC
      ),

      -- ============================================================================
      -- CTE 7: player_best_account
      -- Purpose: Same logic as prev_player_best_account but for current period
      -- Selects best account per player for current rankings
      -- ============================================================================
      player_best_account AS (
        SELECT
          pc.team_id,
          pc.player_id,
          pc.role,
          acc.puuid,
          lr.tier,
          lr.lp,
          ROW_NUMBER() OVER (
            PARTITION BY pc.player_id
            ORDER BY
              CASE lr.tier
                WHEN 'CHALLENGER' THEN 1
                WHEN 'GRANDMASTER' THEN 2
                WHEN 'MASTER' THEN 3
                ELSE 4
              END,
              lr.lp DESC
          ) as account_rn
        FROM player_contracts pc
        JOIN lol_accounts acc ON pc.player_id = acc.player_id
        JOIN latest_ranks lr ON acc.puuid = lr.puuid
        WHERE pc.end_date IS NULL
          AND lr.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
      ),

      -- ============================================================================
      -- CTE 8: player_lp
      -- Purpose: Filter to best account only for current period
      -- ============================================================================
      player_lp AS (
        SELECT team_id, player_id, role, puuid as best_puuid, tier, lp as player_lp
        FROM player_best_account
        WHERE account_rn = 1
      ),

      -- ============================================================================
      -- CTE 9: ranked_players
      -- Purpose: Rank current period players within teams for top 5 selection
      -- ============================================================================
      ranked_players AS (
        SELECT
          team_id,
          player_id,
          role,
          best_puuid,
          player_lp,
          ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY player_lp DESC) as rn
        FROM player_lp
      ),

      -- ============================================================================
      -- CTE 10: team_lp
      -- Purpose: Current period total LP (top 5 players per team)
      -- ============================================================================
      team_lp AS (
        SELECT
          team_id,
          SUM(player_lp)::int as total_lp
        FROM ranked_players
        WHERE rn <= 5
        GROUP BY team_id
      ),

      -- ============================================================================
      -- CTE 11: prev_team_stats
      -- Purpose: Aggregate games/wins for previous period (for delta calculation)
      -- Uses top 5 players' best accounts only (consistent with LP calc)
      -- Winrate calculated as wins/games with 0 fallback for no games
      -- ============================================================================
      prev_team_stats AS (
        SELECT
          t.team_id,
          COALESCE(SUM(ds.games_played), 0)::int as games,
          COALESCE(SUM(ds.wins), 0)::int as wins,
          CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
               THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
               ELSE 0 END as winrate_calc
        FROM teams t
        JOIN prev_ranked_players prp ON prp.team_id = t.team_id AND prp.rn <= 5
        LEFT JOIN lol_daily_stats ds ON ds.puuid = prp.best_puuid AND ds.date >= ? AND ds.date <= ?
        WHERE t.is_active = true
        GROUP BY t.team_id
      ),

      -- ============================================================================
      -- CTE 12: team_stats
      -- Purpose: Main current period aggregation with all team metadata
      -- Joins: teams -> organizations (for logo), ranked_players, daily_stats
      -- Applies user filters (league, role, search) and minGames HAVING clause
      -- ============================================================================
      team_stats AS (
        SELECT
          t.team_id,
          t.slug,
          t.current_name,
          t.short_name,
          o.logo_url,
          t.region,
          t.league,
          COALESCE(SUM(ds.games_played), 0)::int as games,
          COALESCE(SUM(ds.wins), 0)::int as wins,
          COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration,
          CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
               THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
               ELSE 0 END as winrate_calc
        FROM teams t
        LEFT JOIN organizations o ON t.org_id = o.org_id
        JOIN ranked_players rp ON rp.team_id = t.team_id AND rp.rn <= 5
        JOIN lol_daily_stats ds ON ds.puuid = rp.best_puuid AND ds.date >= ? AND ds.date <= ?
        WHERE ${filterConditions.join(' AND ')}
        GROUP BY t.team_id, o.org_id
        ${havingClause}
      ),

      -- ============================================================================
      -- CTE 13: teams_with_lp
      -- Purpose: Combine stats with total LP calculation
      -- LEFT JOIN ensures teams without LP data still appear (with 0 LP)
      -- ============================================================================
      teams_with_lp AS (
        SELECT
          ts.*,
          COALESCE(tl.total_lp, 0) as total_lp
        FROM team_stats ts
        LEFT JOIN team_lp tl ON tl.team_id = ts.team_id
      ),

      -- ============================================================================
      -- CTE 14: teams_with_changes
      -- Purpose: Calculate period-over-period deltas for all metrics
      -- - games_change: current games - previous games
      -- - winrate_change: scaled to percentage points (x1000 / 10 for precision)
      -- - total_lp_change: current LP - previous LP
      -- LEFT JOINs handle teams without previous period data (new teams)
      -- ============================================================================
      teams_with_changes AS (
        SELECT
          c.*,
          (c.games - COALESCE(p.games, 0))::int as games_change,
          ROUND((c.winrate_calc - COALESCE(p.winrate_calc, 0)) * 1000) / 10 as winrate_change,
          (c.total_lp - COALESCE(pl.total_lp, 0))::int as total_lp_change
        FROM teams_with_lp c
        LEFT JOIN prev_team_stats p ON c.team_id = p.team_id
        LEFT JOIN prev_team_lp pl ON c.team_id = pl.team_id
      ),

      -- ============================================================================
      -- CTE 15: player_stats_agg
      -- Purpose: Aggregate games/wins per player using ranked_players best_puuid
      -- Same source as team_stats for consistency
      -- ============================================================================
      player_stats_agg AS (
        SELECT
          rp.player_id,
          rp.team_id,
          COALESCE(SUM(ds.games_played), 0)::int as games,
          COALESCE(SUM(ds.wins), 0)::int as wins
        FROM ranked_players rp
        JOIN lol_daily_stats ds ON ds.puuid = rp.best_puuid
          AND ds.date >= ? AND ds.date <= ?
        GROUP BY rp.player_id, rp.team_id
      ),

      -- ============================================================================
      -- CTE 16: player_details
      -- Purpose: Aggregate all players and their accounts for each team as JSON
      -- This eliminates the N+1 query problem by embedding player data directly
      -- Players are ordered by role (Top > Jungle > Mid > ADC > Support)
      -- Accounts are ordered by LP descending (best account first)
      -- ============================================================================
      player_details AS (
        SELECT
          pc.team_id,
          COALESCE(
            json_agg(
              json_build_object(
                'playerId', p.player_id,
                'slug', p.slug,
                'currentPseudo', p.current_pseudo,
                'role', pc.role,
                'isStarter', COALESCE(pc.is_starter, true),
                'games', COALESCE(psa.games, 0),
                'wins', COALESCE(psa.wins, 0),
                'accounts', COALESCE(
                  (
                    SELECT json_agg(
                      json_build_object(
                        'accountId', a.account_id,
                        'gameName', a.game_name,
                        'tagLine', a.tag_line,
                        'region', a.region,
                        'tier', lr.tier,
                        'rank', NULL,
                        'lp', lr.lp
                      ) ORDER BY lr.lp DESC NULLS LAST
                    )
                    FROM lol_accounts a
                    LEFT JOIN latest_ranks lr ON a.puuid = lr.puuid
                    WHERE a.player_id = p.player_id
                  ),
                  '[]'::json
                )
              ) ORDER BY
                CASE pc.role
                  WHEN 'Top' THEN 1
                  WHEN 'TOP' THEN 1
                  WHEN 'Jungle' THEN 2
                  WHEN 'JGL' THEN 2
                  WHEN 'Mid' THEN 3
                  WHEN 'MID' THEN 3
                  WHEN 'ADC' THEN 4
                  WHEN 'Bot' THEN 4
                  WHEN 'BOT' THEN 4
                  WHEN 'Support' THEN 5
                  WHEN 'SUP' THEN 5
                  ELSE 6
                END,
                p.current_pseudo
            ) FILTER (WHERE p.player_id IS NOT NULL),
            '[]'::json
          ) as players_json
        FROM player_contracts pc
        INNER JOIN players p ON pc.player_id = p.player_id
        LEFT JOIN player_stats_agg psa ON psa.player_id = p.player_id AND psa.team_id = pc.team_id
        WHERE pc.end_date IS NULL
        GROUP BY pc.team_id
      )

      -- ============================================================================
      -- FINAL SELECT
      -- COUNT(*) OVER() provides total count for pagination without extra query
      -- LEFT JOIN player_details to include teams without players (empty array)
      -- Dynamic ORDER BY based on user's sort preference
      -- ============================================================================
      SELECT t.*, COALESCE(pd.players_json, '[]'::json) as players_json, COUNT(*) OVER() as total_count
      FROM teams_with_changes t
      LEFT JOIN player_details pd ON t.team_id = pd.team_id
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `, params)

    // Cast to TeamWithPlayersRow since we now include players_json
    const teamsWithPlayers = result.rows as TeamWithPlayersRow[]
    const total = teamsWithPlayers.length > 0 ? Number(teamsWithPlayers[0].total_count) : 0

    // Tier priority for finding best account (lower index = better tier)
    const tierOrder = [
      'CHALLENGER',
      'GRANDMASTER',
      'MASTER',
      'DIAMOND',
      'EMERALD',
      'PLATINUM',
      'GOLD',
      'SILVER',
      'BRONZE',
      'IRON',
    ]
    const masterPlusTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER']

    // Transform results using embedded players_json (no N+1 queries!)
    const data = teamsWithPlayers.map((team, index) => {
      // Parse players_json - PostgreSQL returns it already parsed with node-pg
      const playersJson: EmbeddedPlayerDetail[] =
        typeof team.players_json === 'string'
          ? JSON.parse(team.players_json)
          : team.players_json || []

      return {
        rank: offset + index + 1,
        team: {
          teamId: team.team_id,
          slug: team.slug,
          currentName: team.current_name,
          shortName: team.short_name,
          logoUrl: team.logo_url,
          region: team.region,
          league: team.league,
        },
        games: team.games,
        gamesChange: team.games_change || 0,
        winrate: team.games > 0 ? Math.round((team.wins / team.games) * 1000) / 10 : 0,
        winrateChange: team.winrate_change || 0,
        totalMinutes: Math.round(team.total_duration / 60),
        totalMinutesChange: 0,
        totalLp: team.total_lp,
        totalLpChange: team.total_lp_change || 0,
        players: playersJson.map((p) => {
          // Find best account: highest tier (lowest index), then highest LP
          let bestTier: string | null = null
          let bestRank: string | null = null
          let bestLp = 0

          for (const acc of p.accounts || []) {
            if (!acc.tier) continue

            const accTierIndex = tierOrder.indexOf(acc.tier.toUpperCase())
            const currentTierIndex = bestTier ? tierOrder.indexOf(bestTier.toUpperCase()) : 999
            const isMasterPlus = masterPlusTiers.includes(acc.tier.toUpperCase())
            const accLp = isMasterPlus ? acc.lp ?? 0 : 0

            if (
              accTierIndex < currentTierIndex ||
              (accTierIndex === currentTierIndex && accLp > bestLp)
            ) {
              bestTier = acc.tier
              bestRank = acc.rank
              bestLp = accLp
            }
          }

          return {
            playerId: p.playerId,
            slug: p.slug,
            pseudo: p.currentPseudo,
            role: p.role || 'Unknown',
            games: p.games || 0,
            winrate: p.games > 0 ? Math.round((p.wins / p.games) * 1000) / 10 : -1,
            tier: bestTier,
            rank: bestRank,
            lp: bestLp,
            totalLp: bestLp,
          }
        }),
      }
    })

    const start = DateTime.fromISO(startDate)
    const end = DateTime.fromISO(endDate)

    return {
      period: 'custom',
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      data,
      meta: {
        total: Number(total),
        perPage,
        currentPage: page,
        lastPage: Math.ceil(Number(total) / perPage),
      },
    }
      }) // end getOrSet
    }) // end executeWithTimeout
  }

  /**
   * Get player leaderboard with accounts and stats.
   *
   * ## Algorithm Overview
   * 1. Selects each player's BEST account (highest tier, then highest LP)
   * 2. Calculates stats from the best account only (games, wins, LP)
   * 3. Compares with previous period for delta calculations
   * 4. Returns all accounts for display (but stats are from best only)
   *
   * ## Query Strategy
   * Two different query paths based on sort mode:
   * - **LP Sort**: Uses CTEs to calculate LP in database for accurate sorting
   * - **Games/Winrate Sort**: Simpler query since LP is secondary
   *
   * ## CTE Pipeline (LP Sort Mode - 5 CTEs):
   * - `latest_ranks`: Latest rank for each account (DISTINCT ON puuid)
   * - `player_best_account`: Best account per player (ROW_NUMBER by tier/LP)
   * - `player_lp`: Filters to rn=1 (single best account)
   * - `player_stats`: Main aggregation with team info
   * - `players_with_lp`: Joins stats with LP
   *
   * ## Business Rules
   * - Only Master+ accounts (MASTER, GRANDMASTER, CHALLENGER) have LP
   * - Players can have multiple accounts, but only best account determines ranking
   * - Players without active contracts still appear (freelancers)
   *
   * ## Edge Cases Handled
   * - Players with no Master+ accounts: LP = 0
   * - Players with no team: team fields are null
   * - New players (no previous period data): changes default to 0
   *
   * @param filters - Period dates, leagues, roles, pagination, sort, search
   * @returns Paginated player leaderboard with account details
   */
  async getPlayerLeaderboard(filters: LeaderboardFilters): Promise<PlayerLeaderboardResult> {
    return executeWithTimeout('getPlayerLeaderboard', async () => {
      const cacheKey = this.buildCacheKey('leaderboard:player', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.LEADERBOARD, async () => {
      const {
        startDate,
        endDate,
        leagues,
        roles,
        minGames = 0,
        page,
      perPage,
      sort = 'games',
      search,
      includeUnranked = false,
    } = filters

    const leagueFilter = leagues && leagues.length > 0 ? leagues : null
    const roleFilter = roles && roles.length > 0 ? roles : null
    const sanitizedSearch = search ? sanitizeLikeInput(search, 100) : null
    const offset = (page - 1) * perPage

    // Calculate previous period for comparison
    const { prevStartDate, prevEndDate } = this.calculatePreviousPeriod(startDate, endDate)

    // Determine sort column using secure whitelist mapping
    const playerSortColumn = getPlayerSortColumn(sort)

    let total: number = 0
    let playersWithLp: PlayerWithLpRow[]

    // ============================================================================
    // INCLUDE UNRANKED MODE
    // Returns all players with active contracts, regardless of rank
    // Players without LP data are sorted at the end
    // ============================================================================
    if (includeUnranked) {
      const filterConditions: string[] = []
      const havingConditions: string[] = []
      // Build params in order of appearance in SQL:
      // 1. WHERE clause filters (league, role, search)
      // 2. Date params for latest_ranks and player_stats CTEs
      // 3. HAVING clause params
      // 4. LIMIT/OFFSET
      const filterParams: (string | number)[] = []

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('t.league', leagueFilter)
        filterConditions.push(condition)
        filterParams.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('pc.role', roleFilter)
        filterConditions.push(condition)
        filterParams.push(...vals)
      }
      if (sanitizedSearch) {
        filterConditions.push(`p.current_pseudo ILIKE ?`)
        filterParams.push(`%${sanitizedSearch}%`)
      }

      const havingParams: number[] = []
      if (minGames > 0) {
        havingConditions.push('COALESCE(SUM(ds.games_played), 0) >= ?')
        havingParams.push(minGames)
      }

      // Assemble params in correct order: filters, dates (x2), having, limit/offset
      const params: (string | number)[] = [
        ...filterParams,
        startDate, endDate,  // for latest_ranks CTE
        startDate, endDate,  // for player_stats CTE
        ...havingParams,
        perPage, offset,
      ]

      // SECURITY: Validate all conditions before building query
      if (filterConditions.length > 0) {
        validateAllConditions(filterConditions)
      }
      if (havingConditions.length > 0) {
        validateAllConditions(havingConditions)
      }

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''
      const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : ''

      const result = await db.rawQuery<{ rows: PlayerWithLpRow[] }>(`
        -- ============================================================================
        -- CTE 1: active_players
        -- Purpose: Get all players with active contracts (end_date IS NULL)
        -- ============================================================================
        WITH active_players AS (
          SELECT
            p.player_id,
            p.slug,
            p.current_pseudo,
            t.team_id,
            t.slug as team_slug,
            t.short_name,
            o.logo_url,
            t.region,
            t.league,
            pc.role
          FROM players p
          JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN organizations o ON t.org_id = o.org_id
          ${whereClause}
        ),

        -- ============================================================================
        -- CTE 2: latest_ranks
        -- Purpose: Get most recent rank for each account in the period
        -- ============================================================================
        latest_ranks AS (
          SELECT DISTINCT ON (puuid) puuid, tier, lp
          FROM lol_daily_stats
          WHERE date >= ? AND date <= ?
          ORDER BY puuid, date DESC
        ),

        -- ============================================================================
        -- CTE 3: player_best_account
        -- Purpose: Identify the best account for each player (all tiers)
        -- LEFT JOIN to include players without any ranked data
        -- ============================================================================
        player_best_account AS (
          SELECT
            acc.player_id,
            acc.puuid,
            lr.tier,
            lr.lp,
            ROW_NUMBER() OVER (
              PARTITION BY acc.player_id
              ORDER BY
                CASE lr.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  WHEN 'DIAMOND' THEN 4
                  WHEN 'EMERALD' THEN 5
                  WHEN 'PLATINUM' THEN 6
                  WHEN 'GOLD' THEN 7
                  WHEN 'SILVER' THEN 8
                  WHEN 'BRONZE' THEN 9
                  WHEN 'IRON' THEN 10
                  ELSE 11
                END,
                lr.lp DESC NULLS LAST
            ) as rn
          FROM lol_accounts acc
          LEFT JOIN latest_ranks lr ON acc.puuid = lr.puuid
          WHERE acc.player_id IN (SELECT player_id FROM active_players)
        ),

        -- ============================================================================
        -- CTE 4: player_best
        -- Purpose: Filter to single best account per player
        -- ============================================================================
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp
          FROM player_best_account
          WHERE rn = 1
        ),

        -- ============================================================================
        -- CTE 5: player_stats
        -- Purpose: Aggregate game stats, LEFT JOIN to include players without games
        -- ============================================================================
        player_stats AS (
          SELECT
            ap.player_id,
            ap.slug,
            ap.current_pseudo,
            ap.team_id,
            ap.team_slug,
            ap.short_name,
            ap.logo_url,
            ap.region,
            ap.league,
            ap.role,
            COALESCE(SUM(ds.games_played), 0)::int as games,
            COALESCE(SUM(ds.wins), 0)::int as wins,
            COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration,
            CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
                 THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
                 ELSE 0 END as winrate_calc,
            -- LP only for Master+ (business rule)
            CASE WHEN pb.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
                 THEN COALESCE(pb.lp, 0) ELSE 0 END as total_lp
          FROM active_players ap
          LEFT JOIN player_best pb ON ap.player_id = pb.player_id
          LEFT JOIN lol_daily_stats ds ON ds.puuid = pb.best_puuid
            AND ds.date >= ? AND ds.date <= ?
          GROUP BY ap.player_id, ap.slug, ap.current_pseudo, ap.team_id, ap.team_slug,
                   ap.short_name, ap.logo_url, ap.region, ap.league, ap.role, pb.tier, pb.lp
          ${havingClause}
        )

        -- ============================================================================
        -- FINAL SELECT
        -- Sort by LP DESC with NULLS LAST to put unranked players at the end
        -- Secondary sort by pseudo for consistent ordering
        -- ============================================================================
        SELECT *, COUNT(*) OVER() as total_count
        FROM player_stats
        ORDER BY total_lp DESC NULLS LAST, current_pseudo ASC
        LIMIT ? OFFSET ?
      `, params)

      playersWithLp = result.rows
      total = playersWithLp.length > 0 ? Number(playersWithLp[0].total_count) : 0
    } else if (sort === 'lp') {
      // For LP sorting, use CTE to calculate LP in database
      const filterConditions: string[] = []
      const havingConditions: string[] = []
      const params: (string | number)[] = [startDate, endDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('t.league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('pc.role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (sanitizedSearch) {
        filterConditions.push(`p.current_pseudo ILIKE ?`)
        params.push(`%${sanitizedSearch}%`)
      }

      if (minGames > 0) {
        havingConditions.push('COALESCE(SUM(ds.games_played), 0) >= ?')
        params.push(minGames)
      }

      params.push(perPage, offset)

      // SECURITY: Validate all conditions before building query
      if (filterConditions.length > 0) {
        validateAllConditions(filterConditions)
      }
      if (havingConditions.length > 0) {
        validateAllConditions(havingConditions)
      }

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''
      const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : ''

      // ============================================================================
      // PLAYER LEADERBOARD QUERY (LP SORT MODE)
      // Uses best account per player for LP-based ranking.
      // 5 CTEs: latest_ranks -> player_best_account -> player_lp -> player_stats -> players_with_lp
      // ============================================================================
      const result = await db.rawQuery<{ rows: PlayerWithLpRow[] }>(`
        -- ============================================================================
        -- CTE 1: latest_ranks
        -- Purpose: Get most recent rank for each account in the period
        -- DISTINCT ON efficiently selects one row per puuid (latest by date)
        -- ============================================================================
        WITH latest_ranks AS (
          SELECT DISTINCT ON (puuid) puuid, tier, lp
          FROM lol_daily_stats
          WHERE date >= ? AND date <= ?
          ORDER BY puuid, date DESC
        ),

        -- ============================================================================
        -- CTE 2: player_best_account
        -- Purpose: Identify the best account for each player
        -- Uses ROW_NUMBER with tier priority (Challenger > GM > Master)
        -- Then LP as tiebreaker within same tier
        -- Only Master+ accounts considered (others filtered out)
        -- ============================================================================
        player_best_account AS (
          SELECT
            acc.player_id,
            acc.puuid,
            lr.tier,
            lr.lp,
            ROW_NUMBER() OVER (
              PARTITION BY acc.player_id
              ORDER BY
                CASE lr.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                lr.lp DESC
            ) as rn
          FROM lol_accounts acc
          JOIN latest_ranks lr ON acc.puuid = lr.puuid
          WHERE lr.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
        ),

        -- ============================================================================
        -- CTE 3: player_lp
        -- Purpose: Filter to single best account per player
        -- rn = 1 selects the winner from ROW_NUMBER ranking
        -- ============================================================================
        player_lp AS (
          SELECT player_id, puuid as best_puuid, tier, lp as total_lp
          FROM player_best_account
          WHERE rn = 1
        ),

        -- ============================================================================
        -- CTE 4: player_stats
        -- Purpose: Aggregate game stats from best account, join with team info
        -- LEFT JOINs handle players without teams (freelancers)
        -- Stats calculated only from best_puuid games (not all accounts)
        -- ============================================================================
        player_stats AS (
          SELECT
            p.player_id,
            p.slug,
            p.current_pseudo,
            t.team_id,
            t.slug as team_slug,
            t.short_name,
            o.logo_url,
            t.region,
            t.league,
            pc.role,
            COALESCE(SUM(ds.games_played), 0)::int as games,
            COALESCE(SUM(ds.wins), 0)::int as wins,
            COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration,
            CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
                 THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
                 ELSE 0 END as winrate_calc
          FROM players p
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN organizations o ON t.org_id = o.org_id
          JOIN player_lp pl ON p.player_id = pl.player_id
          JOIN lol_daily_stats ds ON ds.puuid = pl.best_puuid AND ds.date >= ? AND ds.date <= ?
          ${whereClause}
          GROUP BY p.player_id, t.team_id, o.org_id, pc.role
          ${havingClause}
        ),

        -- ============================================================================
        -- CTE 5: players_with_lp
        -- Purpose: Final combination of stats with LP for sorting
        -- ============================================================================
        players_with_lp AS (
          SELECT
            ps.*,
            COALESCE(pl.total_lp, 0) as total_lp
          FROM player_stats ps
          JOIN player_lp pl ON pl.player_id = ps.player_id
        )

        -- ============================================================================
        -- FINAL SELECT
        -- COUNT(*) OVER() for pagination total without extra query
        -- ORDER BY total_lp DESC for LP-based ranking
        -- ============================================================================
        SELECT *, COUNT(*) OVER() as total_count
        FROM players_with_lp
        ORDER BY total_lp DESC
        LIMIT ? OFFSET ?
      `, params)

      playersWithLp = result.rows
      total = playersWithLp.length > 0 ? Number(playersWithLp[0].total_count) : 0
    } else {
      // For non-LP sorting (games, winrate), use best account only
      const filterConditions: string[] = []
      const havingConditions: string[] = []
      const params: (string | number)[] = [startDate, endDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('t.league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('pc.role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (sanitizedSearch) {
        filterConditions.push(`p.current_pseudo ILIKE ?`)
        params.push(`%${sanitizedSearch}%`)
      }

      if (minGames > 0) {
        havingConditions.push('COALESCE(SUM(ds.games_played), 0) >= ?')
        params.push(minGames)
      }

      params.push(perPage, offset)

      // SECURITY: Validate all conditions before building query
      if (filterConditions.length > 0) {
        validateAllConditions(filterConditions)
      }
      if (havingConditions.length > 0) {
        validateAllConditions(havingConditions)
      }

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''
      const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : ''

      // ============================================================================
      // PLAYER LEADERBOARD QUERY (GAMES/WINRATE SORT MODE)
      // Simpler than LP sort - includes all tiers for best account selection
      // LP is still calculated but only for Master+ accounts
      // ============================================================================
      const result = await db.rawQuery<{ rows: PlayerWithLpRow[] }>(`
        -- ============================================================================
        -- CTE 1: latest_ranks
        -- Purpose: Get most recent rank for each account (all tiers)
        -- Unlike LP sort, this includes all tiers for games/winrate sorting
        -- ============================================================================
        WITH latest_ranks AS (
          SELECT DISTINCT ON (puuid) puuid, tier, lp
          FROM lol_daily_stats
          WHERE date >= ? AND date <= ?
          ORDER BY puuid, date DESC
        ),

        -- ============================================================================
        -- CTE 2: player_best_account
        -- Purpose: Select best account per player (ALL tiers, not just Master+)
        -- Full tier hierarchy: Challenger > GM > Master > Diamond > ... > Iron
        -- LP used as tiebreaker, NULLS LAST handles accounts without LP
        -- ============================================================================
        player_best_account AS (
          SELECT
            acc.player_id,
            acc.puuid,
            lr.tier,
            lr.lp,
            ROW_NUMBER() OVER (
              PARTITION BY acc.player_id
              ORDER BY
                CASE lr.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  WHEN 'DIAMOND' THEN 4
                  WHEN 'EMERALD' THEN 5
                  WHEN 'PLATINUM' THEN 6
                  WHEN 'GOLD' THEN 7
                  WHEN 'SILVER' THEN 8
                  WHEN 'BRONZE' THEN 9
                  WHEN 'IRON' THEN 10
                  ELSE 11
                END,
                lr.lp DESC NULLS LAST
            ) as rn
          FROM lol_accounts acc
          JOIN latest_ranks lr ON acc.puuid = lr.puuid
        ),

        -- ============================================================================
        -- CTE 3: player_best
        -- Purpose: Filter to single best account per player
        -- ============================================================================
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp
          FROM player_best_account
          WHERE rn = 1
        ),

        -- ============================================================================
        -- CTE 4: player_stats
        -- Purpose: Aggregate stats with conditional LP calculation
        -- LP only included for Master+ tiers (others get 0)
        -- GROUP BY includes tier and lp since they're used in SELECT
        -- ============================================================================
        player_stats AS (
          SELECT
            p.player_id,
            p.slug,
            p.current_pseudo,
            t.team_id,
            t.slug as team_slug,
            t.short_name,
            o.logo_url,
            t.region,
            t.league,
            pc.role,
            COALESCE(SUM(ds.games_played), 0)::int as games,
            COALESCE(SUM(ds.wins), 0)::int as wins,
            COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration,
            CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
                 THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
                 ELSE 0 END as winrate_calc,
            -- LP only for Master+ (business rule: sub-Master accounts don't have meaningful LP)
            CASE WHEN pb.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
                 THEN pb.lp ELSE 0 END as total_lp
          FROM players p
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN organizations o ON t.org_id = o.org_id
          JOIN player_best pb ON p.player_id = pb.player_id
          JOIN lol_daily_stats ds ON ds.puuid = pb.best_puuid AND ds.date >= ? AND ds.date <= ?
          ${whereClause}
          GROUP BY p.player_id, t.team_id, o.org_id, pc.role, pb.tier, pb.lp
          ${havingClause}
        )

        -- ============================================================================
        -- FINAL SELECT
        -- Dynamic ORDER BY based on sort preference (games or winrate_calc)
        -- ============================================================================
        SELECT *, COUNT(*) OVER() as total_count
        FROM player_stats
        ORDER BY ${playerSortColumn} DESC
        LIMIT ? OFFSET ?
      `, params)

      playersWithLp = result.rows
      total = playersWithLp.length > 0 ? Number(playersWithLp[0].total_count) : 0
    }

    // Fetch previous period stats for all players
    const playerIds = playersWithLp.map((p) => p.player_id)
    const prevStatsMap = new Map<
      number,
      { games: number; winrate: number; total_lp: number }
    >()

    if (playerIds.length > 0) {
      // Fetch previous period stats using best account only
      const prevStatsResult = await db
        .connection()
        .getWriteClient()
        .raw<{
          rows: {
            player_id: number
            games: number
            wins: number
            winrate_calc: number
            total_lp: number
          }[]
        }>(
          `
          WITH prev_latest_ranks AS (
            -- Get latest rank for each account in previous period
            SELECT DISTINCT ON (puuid) puuid, tier, lp
            FROM lol_daily_stats
            WHERE date >= ? AND date <= ?
            ORDER BY puuid, date DESC
          ),
          prev_player_best_account AS (
            -- Select best account per player for previous period
            SELECT
              acc.player_id,
              acc.puuid,
              lr.tier,
              lr.lp,
              ROW_NUMBER() OVER (
                PARTITION BY acc.player_id
                ORDER BY
                  CASE lr.tier
                    WHEN 'CHALLENGER' THEN 1
                    WHEN 'GRANDMASTER' THEN 2
                    WHEN 'MASTER' THEN 3
                    WHEN 'DIAMOND' THEN 4
                    WHEN 'EMERALD' THEN 5
                    WHEN 'PLATINUM' THEN 6
                    WHEN 'GOLD' THEN 7
                    WHEN 'SILVER' THEN 8
                    WHEN 'BRONZE' THEN 9
                    WHEN 'IRON' THEN 10
                    ELSE 11
                  END,
                  lr.lp DESC NULLS LAST
              ) as rn
            FROM lol_accounts acc
            JOIN prev_latest_ranks lr ON acc.puuid = lr.puuid
            WHERE acc.player_id = ANY(?::int[])
          ),
          prev_player_best AS (
            -- Keep only the best account per player
            SELECT player_id, puuid as best_puuid, tier, lp
            FROM prev_player_best_account
            WHERE rn = 1
          ),
          prev_player_stats AS (
            -- Stats from best account only
            SELECT
              pb.player_id,
              COALESCE(SUM(ds.games_played), 0)::int as games,
              COALESCE(SUM(ds.wins), 0)::int as wins,
              CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0
                   THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played)
                   ELSE 0 END as winrate_calc,
              CASE WHEN pb.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
                   THEN pb.lp ELSE 0 END as total_lp
            FROM prev_player_best pb
            LEFT JOIN lol_daily_stats ds ON ds.puuid = pb.best_puuid
              AND ds.date >= ? AND ds.date <= ?
            GROUP BY pb.player_id, pb.tier, pb.lp
          )
          SELECT
            player_id,
            games,
            wins,
            winrate_calc,
            total_lp
          FROM prev_player_stats
        `,
          [prevStartDate, prevEndDate, playerIds, prevStartDate, prevEndDate]
        )

      for (const row of prevStatsResult.rows) {
        prevStatsMap.set(row.player_id, {
          games: row.games,
          winrate: row.winrate_calc > 0 ? Math.round(row.winrate_calc * 1000) / 10 : 0,
          total_lp: row.total_lp,
        })
      }

      // Update playersWithLp with change data
      playersWithLp = playersWithLp.map((p) => {
        const prevStats = prevStatsMap.get(p.player_id)
        const currentWinrate = p.games > 0 ? Math.round((p.wins / p.games) * 1000) / 10 : 0
        return {
          ...p,
          games_change: p.games - (prevStats?.games || 0),
          winrate_change:
            Math.round((currentWinrate - (prevStats?.winrate || 0)) * 10) / 10,
          total_lp_change: p.total_lp - (prevStats?.total_lp || 0),
        }
      })
    }

    // Fetch accounts for all players

    const accountsWithStats: AccountWithStatsRow[] =
      playerIds.length > 0
        ? ((
            await db.connection().getWriteClient().raw(
              `
          WITH player_accounts AS (
            SELECT
              a.puuid,
              a.player_id,
              a.game_name,
              a.tag_line,
              a.region
            FROM lol_accounts a
            WHERE a.player_id = ANY(?::int[])
          ),
          account_stats AS (
            SELECT
              pa.puuid,
              COALESCE(SUM(ds.games_played), 0)::int as games,
              COALESCE(SUM(ds.wins), 0)::int as wins
            FROM player_accounts pa
            LEFT JOIN lol_daily_stats ds ON ds.puuid = pa.puuid
              AND ds.date >= ? AND ds.date <= ?
            GROUP BY pa.puuid
          ),
          latest_ranks AS (
            SELECT DISTINCT ON (pa.puuid)
              pa.puuid,
              ds.tier,
              ds.rank,
              ds.lp
            FROM player_accounts pa
            JOIN lol_daily_stats ds ON ds.puuid = pa.puuid
            WHERE ds.date >= ? AND ds.date <= ?
            ORDER BY pa.puuid, ds.date DESC
          )
          SELECT
            pa.puuid,
            pa.player_id,
            pa.game_name,
            pa.tag_line,
            pa.region,
            COALESCE(ast.games, 0)::int as games,
            COALESCE(ast.wins, 0)::int as wins,
            lr.tier,
            lr.rank,
            COALESCE(lr.lp, 0)::int as lp
          FROM player_accounts pa
          LEFT JOIN account_stats ast ON ast.puuid = pa.puuid
          LEFT JOIN latest_ranks lr ON lr.puuid = pa.puuid
          ORDER BY ast.games DESC NULLS LAST
        `,
              [playerIds, startDate, endDate, startDate, endDate]
            )
          ).rows as AccountWithStatsRow[])
        : []

    // Build accountsData and ranksByPuuid
    const accountsData = accountsWithStats.map((r) => ({
      puuid: r.puuid,
      player_id: r.player_id,
      game_name: r.game_name,
      tag_line: r.tag_line,
      region: r.region,
      games: r.games,
      wins: r.wins,
    }))

    const ranksByPuuid = new Map(
      accountsWithStats
        .filter((r) => r.tier || r.rank || r.lp)
        .map((r) => [r.puuid, { tier: r.tier, rank: r.rank, lp: r.lp }])
    )

    // Group accounts by player_id
    const accountsByPlayer = new Map<number, typeof accountsData>()
    for (const account of accountsData) {
      const playerAccounts = accountsByPlayer.get(account.player_id) || []
      playerAccounts.push(account)
      accountsByPlayer.set(account.player_id, playerAccounts)
    }

    // Calculate total LP and best tier for each player
    const masterPlusTiers = ['CHALLENGER', 'GRANDMASTER', 'MASTER']
    const playerStats = new Map<
      number,
      { totalLp: number; bestTier: string | null; bestRank: string | null; bestLp: number }
    >()
    for (const [playerId, accounts] of accountsByPlayer) {
      let totalLp = 0
      let bestTier: string | null = null
      let bestRank: string | null = null
      let bestLp = 0
      const tierOrder = [
        'CHALLENGER',
        'GRANDMASTER',
        'MASTER',
        'DIAMOND',
        'EMERALD',
        'PLATINUM',
        'GOLD',
        'SILVER',
        'BRONZE',
        'IRON',
      ]

      for (const acc of accounts) {
        const rankData = ranksByPuuid.get(acc.puuid)
        const accTier = rankData?.tier || null
        const accRank = rankData?.rank || null
        const accLpRaw = rankData?.lp || 0

        const isMasterPlus = accTier && masterPlusTiers.includes(accTier.toUpperCase())
        const accLp = isMasterPlus ? accLpRaw : 0
        totalLp += accLp
        if (accTier) {
          const accTierIndex = tierOrder.indexOf(accTier.toUpperCase())
          const bestTierIndex = bestTier ? tierOrder.indexOf(bestTier.toUpperCase()) : 999
          if (
            accTierIndex < bestTierIndex ||
            (accTierIndex === bestTierIndex && accLp > bestLp)
          ) {
            bestTier = accTier
            bestRank = accRank
            bestLp = accLp
          }
        }
      }
      playerStats.set(playerId, { totalLp, bestTier, bestRank, bestLp })
    }

    const data = playersWithLp.map((player, index) => {
      const stats = playerStats.get(player.player_id)
      return {
        rank: offset + index + 1,
        player: {
          playerId: player.player_id,
          slug: player.slug,
          pseudo: player.current_pseudo,
        },
        team: player.team_id
          ? {
              teamId: player.team_id,
              slug: player.team_slug,
              shortName: player.short_name,
              logoUrl: player.logo_url,
              region: player.region,
              league: player.league,
            }
          : null,
        role: player.role || 'Unknown',
        games: player.games,
        gamesChange: player.games_change || 0,
        winrate: player.games > 0 ? Math.round((player.wins / player.games) * 1000) / 10 : 0,
        winrateChange: player.winrate_change || 0,
        totalMinutes: Math.round(player.total_duration / 60),
        totalMinutesChange: 0,
        tier: stats?.bestTier || null,
        rank_division: stats?.bestRank || null,
        lp: stats?.bestLp || 0,
        totalLp: player.total_lp,
        totalLpChange: player.total_lp_change || 0,
        accounts: (accountsByPlayer.get(player.player_id) || []).map((acc) => {
          const rankData = ranksByPuuid.get(acc.puuid)
          const accTier = rankData?.tier || null
          const accRank = rankData?.rank || null
          const accLpRaw = rankData?.lp || 0

          const isMasterPlus = accTier && masterPlusTiers.includes(accTier.toUpperCase())
          const accountLp = isMasterPlus ? accLpRaw : 0
          return {
            puuid: acc.puuid,
            gameName: acc.game_name,
            tagLine: acc.tag_line,
            region: acc.region,
            tier: accTier,
            rank: accRank,
            lp: accountLp,
            totalLp: accountLp,
            games: acc.games,
            wins: acc.wins,
            winrate: acc.games > 0 ? Math.round((acc.wins / acc.games) * 1000) / 10 : 0,
          }
        }),
      }
    })

    return {
      data,
      meta: {
        total: Number(total),
        perPage,
        currentPage: page,
        lastPage: Math.ceil(Number(total) / perPage),
      },
    }
      }) // end getOrSet
    }) // end executeWithTimeout
  }

  /**
   * Get top grinders (most games played)
   */
  async getTopGrinders(filters: TopFilters): Promise<GrinderResult[]> {
    return executeWithTimeout('getTopGrinders', async () => {
      const cacheKey = this.buildCacheKey('grinders', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.GRINDERS, async () => {
      const {
        startDate,
        endDate,
        leagues,
        roles,
        minGames = 0,
        limit,
        sort = 'desc',
        viewMode = 'players',
      } = filters

      const leagueFilter = leagues && leagues.length > 0 ? leagues : null
    const roleFilter = roles && roles.length > 0 ? roles : null
    const sortDir = sort === 'asc' ? 'asc' : 'desc'

    if (viewMode === 'teams') {
      // Team mode
      const query = db
        .from('teams as t')
        .leftJoin('organizations as o', 't.org_id', 'o.org_id')
        .join('player_contracts as pc', (q) => {
          q.on('pc.team_id', 't.team_id').andOnNull('pc.end_date')
        })
        .join('lol_accounts as a', 'pc.player_id', 'a.player_id')
        .joinRaw(`JOIN lol_daily_stats as ds ON ds.puuid = a.puuid AND ds.date BETWEEN ? AND ?`, [
          startDate,
          endDate,
        ])
        .where('t.is_active', true)
        .groupBy('t.team_id', 't.slug', 't.current_name', 't.short_name', 'o.logo_url')

      if (leagueFilter) {
        query.whereIn('t.league', leagueFilter)
      }

      if (roleFilter) {
        query.whereIn('pc.role', roleFilter)
      }

      if (minGames > 0) {
        query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGames])
      }

      const teams = await query
        .select(
          't.team_id',
          't.slug',
          't.current_name',
          't.short_name',
          'o.logo_url',
          db.raw('COALESCE(SUM(ds.games_played), 0)::int as games')
        )
        .orderBy('games', sortDir)
        .limit(limit)

      return teams.map((t, index) => ({
        rank: index + 1,
        entity: {
          id: t.team_id,
          slug: t.slug,
          name: t.current_name,
          shortName: t.short_name,
          logoUrl: t.logo_url,
        },
        entityType: 'team' as const,
        games: t.games,
      }))
    } else {
      // Player mode
      const query = db
        .from('players as p')
        .leftJoin('player_contracts as pc', (q) => {
          q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
        })
        .leftJoin('teams as t', 'pc.team_id', 't.team_id')
        .join('lol_accounts as a', 'p.player_id', 'a.player_id')
        .joinRaw(`JOIN lol_daily_stats as ds ON ds.puuid = a.puuid AND ds.date BETWEEN ? AND ?`, [
          startDate,
          endDate,
        ])
        .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
        .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))

      if (minGames > 0) {
        query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGames])
      }

      const players = await query
        .groupBy('p.player_id', 't.slug', 't.short_name', 'pc.role')
        .select(
          'p.player_id',
          'p.slug',
          'p.current_pseudo',
          't.slug as team_slug',
          't.short_name',
          'pc.role',
          db.raw('COALESCE(SUM(ds.games_played), 0)::int as games')
        )
        .orderBy('games', sortDir)
        .limit(limit)

      return players.map((p, index) => ({
        rank: index + 1,
        entity: {
          id: p.player_id,
          slug: p.slug,
          name: p.current_pseudo,
        },
        entityType: 'player' as const,
        team: p.team_slug
          ? {
              slug: p.team_slug,
              shortName: p.short_name || 'N/A',
            }
          : undefined,
        role: p.role || 'Unknown',
        games: p.games,
      }))
    }
      }) // end getOrSet
    }) // end executeWithTimeout
  }

  /**
   * Get top LP gainers (players/teams who gained the most LP in period).
   *
   * ## Algorithm Overview
   * 1. Determine best account per player at END of period (highest tier, then LP)
   * 2. Calculate LP change = LP at end of period - LP at start of period
   * 3. Only positive LP changes are returned (gainers)
   *
   * ## CTE Pipeline (9 CTEs for player mode, similar for team mode):
   * - `last_lp`: Latest LP for each Master+ account at end of period
   * - `player_best_account`: Best account per player (at period end)
   * - `player_best`: Filters to rn=1
   * - `first_day_lp`: LP at start of period for best accounts
   * - `player_lp_change`: Calculates LP delta (end - start)
   * - `player_games`: Games played in period (for minGames filter)
   * - For teams: `team_lp` aggregates player LP changes
   *
   * ## Key Design Decision
   * Best account is determined at END of period, not start.
   * This means if a player's "best" account changed during the period,
   * we use their current best for the calculation.
   *
   * ## Business Rules
   * - Only Master+ accounts have LP
   * - LP change = 0 if no start-of-period data (new accounts)
   * - Team LP change = sum of all contracted players' LP changes
   *
   * @param filters - Period dates, leagues, roles, limit, sort direction, viewMode
   * @returns List of top LP gainers with entity info and change amount
   *
   * @example
   * // Player who climbed from 200 LP Master to 500 LP GM
   * // LP change = 500 - 200 = +300
   */
  async getTopLpGainers(filters: TopFilters): Promise<LpChangeResult[]> {
    return executeWithTimeout('getTopLpGainers', async () => {
      const cacheKey = this.buildCacheKey('lp:gainers', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.LP_CHANGES, async () => {
      const {
        startDate,
        endDate,
        leagues,
        roles,
        minGames = 0,
        limit,
        sort = 'desc',
        viewMode = 'players',
      } = filters

      const leagueFilter = leagues && leagues.length > 0 ? leagues : null
    const roleFilter = roles && roles.length > 0 ? roles : null
    const sortDir = sort === 'asc' ? 'asc' : 'desc'

    if (viewMode === 'teams') {
      // Team mode - uses best account per player, sums across team
      // Filter conditions for intermediate CTE (league/role filters)
      const filterConditions: string[] = []
      // Having conditions for final aggregation (LP filter + minGames)
      const havingConditions: string[] = ['SUM(lp_change) > 0']
      const params: (string | number | null)[] = [startDate, endDate, startDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (minGames > 0) {
        havingConditions.push('SUM(games) >= ?')
        params.push(minGames)
      }
      params.push(limit)

      // SECURITY: Validate all conditions before building query
      if (filterConditions.length > 0) {
        validateAllConditions(filterConditions)
      }
      validateAllConditions(havingConditions)

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''
      const havingClause = `HAVING ${havingConditions.join(' AND ')}`

      const result = await db.rawQuery(`
        WITH last_lp AS (
          -- Get latest LP for each account at end of period
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_end, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date >= ? AND ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        player_best_account AS (
          -- Select best account per player (highest tier, then highest LP at end of period)
          SELECT
            a.player_id,
            a.puuid,
            l.tier,
            l.lp_end,
            ROW_NUMBER() OVER (
              PARTITION BY a.player_id
              ORDER BY
                CASE l.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                l.lp_end DESC
            ) as rn
          FROM lol_accounts a
          JOIN last_lp l ON a.puuid = l.puuid
        ),
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp_end
          FROM player_best_account
          WHERE rn = 1
        ),
        first_day_lp AS (
          -- Get LP at start of period for best accounts only (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (pb.player_id) pb.player_id, ds.lp as lp_start
          FROM player_best pb
          JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
          WHERE ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY pb.player_id, ds.date DESC
        ),
        player_lp_change AS (
          -- Calculate LP change for each player's best account
          SELECT
            pb.player_id,
            pb.lp_end - COALESCE(f.lp_start, 0) as lp_change
          FROM player_best pb
          LEFT JOIN first_day_lp f ON pb.player_id = f.player_id
        ),
        player_games AS (
          -- Games from best account only
          SELECT pb.player_id, SUM(ds.games_played) as games
          FROM player_best pb
          JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
          WHERE ds.date >= ? AND ds.date <= ?
          GROUP BY pb.player_id
        ),
        team_lp AS (
          SELECT t.team_id, t.slug, t.current_name, t.short_name, t.league, pc.role, o.logo_url,
            plc.lp_change, pg.games
          FROM teams t
          LEFT JOIN organizations o ON t.org_id = o.org_id
          JOIN player_contracts pc ON t.team_id = pc.team_id AND pc.end_date IS NULL
          JOIN player_lp_change plc ON pc.player_id = plc.player_id
          LEFT JOIN player_games pg ON pc.player_id = pg.player_id
          WHERE t.is_active = true
        )
        SELECT team_id, slug, current_name, short_name, logo_url, SUM(lp_change) as lp_change, SUM(games) as games
        FROM team_lp ${whereClause}
        GROUP BY team_id, slug, current_name, short_name, logo_url
        ${havingClause}
        ORDER BY lp_change ${getSortDirection(sortDir)}
        LIMIT ?
      `, params)

      return (result.rows as TeamLpChangeRow[]).map((row, index) => ({
        rank: index + 1,
        entity: {
          id: row.team_id,
          slug: row.slug,
          name: row.current_name,
          shortName: row.short_name,
          logoUrl: row.logo_url,
        },
        entityType: 'team' as const,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))
    } else {
      // Player mode - uses best account only
      const filterConditions: string[] = ['lp_change > 0']
      const params: (string | number | null)[] = [startDate, endDate, startDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (minGames > 0) {
        filterConditions.push('games >= ?')
        params.push(minGames)
      }
      params.push(limit)

      // SECURITY: Validate all conditions before building query
      validateAllConditions(filterConditions)

      const result = await db.rawQuery(`
        WITH last_lp AS (
          -- Get latest LP for each account at end of period
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_end, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date >= ? AND ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        player_best_account AS (
          -- Select best account per player (highest tier, then highest LP at end of period)
          SELECT
            a.player_id,
            a.puuid,
            l.tier,
            l.lp_end,
            ROW_NUMBER() OVER (
              PARTITION BY a.player_id
              ORDER BY
                CASE l.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                l.lp_end DESC
            ) as rn
          FROM lol_accounts a
          JOIN last_lp l ON a.puuid = l.puuid
        ),
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp_end
          FROM player_best_account
          WHERE rn = 1
        ),
        first_day_lp AS (
          -- Get LP at start of period for best accounts only (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (pb.player_id) pb.player_id, ds.lp as lp_start
          FROM player_best pb
          JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
          WHERE ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY pb.player_id, ds.date DESC
        ),
        player_lp AS (
          SELECT
            p.player_id, p.slug, p.current_pseudo, t.slug as team_slug, t.short_name as team_short_name, t.league, pc.role,
            pb.lp_end - COALESCE(f.lp_start, 0) as lp_change,
            COALESCE(ds_games.games, 0) as games
          FROM players p
          JOIN player_best pb ON p.player_id = pb.player_id
          LEFT JOIN first_day_lp f ON p.player_id = f.player_id
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN (
            SELECT pb2.player_id, SUM(ds.games_played) as games
            FROM player_best pb2
            JOIN lol_daily_stats ds ON pb2.best_puuid = ds.puuid
            WHERE ds.date >= ? AND ds.date <= ?
            GROUP BY pb2.player_id
          ) ds_games ON p.player_id = ds_games.player_id
        )
        SELECT player_id, slug, current_pseudo, team_slug, team_short_name, lp_change, games
        FROM player_lp WHERE ${filterConditions.join(' AND ')}
        ORDER BY lp_change ${getSortDirection(sortDir)}
        LIMIT ?
      `, params)

      return (result.rows as PlayerLpChangeRow[]).map((row, index) => ({
        rank: index + 1,
        entity: {
          id: row.player_id,
          slug: row.slug,
          name: row.current_pseudo,
        },
        entityType: 'player' as const,
        team: row.team_slug
          ? {
              slug: row.team_slug,
              shortName: row.team_short_name,
            }
          : undefined,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))
    }
      }) // end getOrSet
    }) // end executeWithTimeout
  }

  /**
   * Get top LP losers (players/teams who lost the most LP in period).
   *
   * ## Algorithm Overview
   * 1. Determine best account per player at START of period (highest tier, then LP)
   * 2. Calculate LP change = LP at end of period - LP at start of period
   * 3. Only negative LP changes are returned (losers)
   *
   * ## Key Design Decision - Different from Gainers!
   * Best account is determined at START of period, not end.
   * This captures players who fell from their previous rank.
   * Example: A Challenger player who dropped to Diamond is counted
   * based on their Challenger LP at period start.
   *
   * ## CTE Pipeline (9 CTEs for player mode):
   * - `first_day_lp`: LP at START of period for Master+ accounts
   * - `player_best_account`: Best account per player at START
   * - `player_best`: Filters to rn=1
   * - `last_day_lp`: LP at END of period (may be 0 if dropped out of Master+)
   * - `player_lp_change`: Calculates LP delta (end - start)
   * - `player_games`: Games played in period
   * - For teams: aggregates across contracted players
   *
   * ## Edge Cases
   * - Player drops from Master to Diamond: end LP = 0, shows full loss
   * - Player demotes then climbs back: only final position counts
   * - Account decay: captured as LP loss
   *
   * @param filters - Period dates, leagues, roles, limit, sort direction, viewMode
   * @returns List of top LP losers (negative changes) with entity info
   */
  async getTopLpLosers(filters: TopFilters): Promise<LpChangeResult[]> {
    return executeWithTimeout('getTopLpLosers', async () => {
      const cacheKey = this.buildCacheKey('lp:losers', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.LP_CHANGES, async () => {
      const {
        startDate,
        endDate,
        leagues,
        roles,
        minGames = 0,
        limit,
        sort = 'desc',
        viewMode = 'players',
      } = filters

      const leagueFilter = leagues && leagues.length > 0 ? leagues : null
    const roleFilter = roles && roles.length > 0 ? roles : null
    // For losers: desc = most losses first (most negative), asc = least losses
    const sortDir = sort === 'asc' ? 'desc' : 'asc'

    if (viewMode === 'teams') {
      // Team mode - uses best account per player (at start), sums across team
      // Filter conditions for intermediate CTE (league/role filters)
      const filterConditions: string[] = []
      // Having conditions for final aggregation (LP filter + minGames)
      const havingConditions: string[] = ['SUM(lp_change) < 0']
      const params: (string | number | null)[] = [startDate, endDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (minGames > 0) {
        havingConditions.push('SUM(games) >= ?')
        params.push(minGames)
      }
      params.push(limit)

      // SECURITY: Validate all conditions before building query
      if (filterConditions.length > 0) {
        validateAllConditions(filterConditions)
      }
      validateAllConditions(havingConditions)

      const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''
      const havingClause = `HAVING ${havingConditions.join(' AND ')}`

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- Get LP at start of period for Master+ accounts (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_start, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        player_best_account AS (
          -- Select best account per player at START of period (highest tier, then highest LP)
          SELECT
            a.player_id,
            a.puuid,
            f.tier,
            f.lp_start,
            ROW_NUMBER() OVER (
              PARTITION BY a.player_id
              ORDER BY
                CASE f.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                f.lp_start DESC
            ) as rn
          FROM lol_accounts a
          JOIN first_day_lp f ON a.puuid = f.puuid
        ),
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp_start
          FROM player_best_account
          WHERE rn = 1
        ),
        last_day_lp AS (
          -- Get LP at end of period for best accounts (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (pb.player_id) pb.player_id, COALESCE(ds.lp, 0) as lp_end
          FROM player_best pb
          LEFT JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
            AND ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY pb.player_id, ds.date DESC
        ),
        player_lp_change AS (
          -- Calculate LP change for each player's best account
          SELECT
            pb.player_id,
            COALESCE(l.lp_end, 0) - pb.lp_start as lp_change
          FROM player_best pb
          LEFT JOIN last_day_lp l ON pb.player_id = l.player_id
        ),
        player_games AS (
          -- Games from best account only
          SELECT pb.player_id, SUM(ds.games_played) as games
          FROM player_best pb
          JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
          WHERE ds.date >= ? AND ds.date <= ?
          GROUP BY pb.player_id
        ),
        team_lp AS (
          SELECT t.team_id, t.slug, t.current_name, t.short_name, t.league, pc.role, o.logo_url,
            plc.lp_change, pg.games
          FROM teams t
          LEFT JOIN organizations o ON t.org_id = o.org_id
          JOIN player_contracts pc ON t.team_id = pc.team_id AND pc.end_date IS NULL
          JOIN player_lp_change plc ON pc.player_id = plc.player_id
          LEFT JOIN player_games pg ON pc.player_id = pg.player_id
          WHERE t.is_active = true
        )
        SELECT team_id, slug, current_name, short_name, logo_url, SUM(lp_change) as lp_change, SUM(games) as games
        FROM team_lp ${whereClause}
        GROUP BY team_id, slug, current_name, short_name, logo_url
        ${havingClause}
        ORDER BY lp_change ${getSortDirection(sortDir)}
        LIMIT ?
      `, params)

      return (result.rows as TeamLpChangeRow[]).map((row, index) => ({
        rank: index + 1,
        entity: {
          id: row.team_id,
          slug: row.slug,
          name: row.current_name,
          shortName: row.short_name,
          logoUrl: row.logo_url,
        },
        entityType: 'team' as const,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))
    } else {
      // Player mode - uses best account at start of period
      const filterConditions: string[] = ['lp_change < 0']
      const params: (string | number | null)[] = [startDate, endDate, startDate, endDate]

      if (leagueFilter?.length) {
        const [condition, vals] = buildInClause('league', leagueFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (roleFilter?.length) {
        const [condition, vals] = buildInClause('role', roleFilter)
        filterConditions.push(condition)
        params.push(...vals)
      }
      if (minGames > 0) {
        filterConditions.push('games >= ?')
        params.push(minGames)
      }
      params.push(limit)

      // SECURITY: Validate all conditions before building query
      validateAllConditions(filterConditions)

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- Get LP at start of period for Master+ accounts (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_start, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        player_best_account AS (
          -- Select best account per player at START of period
          SELECT
            a.player_id,
            a.puuid,
            f.tier,
            f.lp_start,
            ROW_NUMBER() OVER (
              PARTITION BY a.player_id
              ORDER BY
                CASE f.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                f.lp_start DESC
            ) as rn
          FROM lol_accounts a
          JOIN first_day_lp f ON a.puuid = f.puuid
        ),
        player_best AS (
          SELECT player_id, puuid as best_puuid, tier, lp_start
          FROM player_best_account
          WHERE rn = 1
        ),
        last_day_lp AS (
          -- Get LP at end of period for best accounts (fallback to most recent if no data for exact date)
          SELECT DISTINCT ON (pb.player_id) pb.player_id, COALESCE(ds.lp, 0) as lp_end
          FROM player_best pb
          LEFT JOIN lol_daily_stats ds ON pb.best_puuid = ds.puuid
            AND ds.date <= ? AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY pb.player_id, ds.date DESC
        ),
        player_lp AS (
          SELECT
            p.player_id, p.slug, p.current_pseudo, t.slug as team_slug, t.short_name as team_short_name, t.league, pc.role,
            COALESCE(l.lp_end, 0) - pb.lp_start as lp_change,
            COALESCE(ds_games.games, 0) as games
          FROM players p
          JOIN player_best pb ON p.player_id = pb.player_id
          LEFT JOIN last_day_lp l ON p.player_id = l.player_id
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN (
            SELECT pb2.player_id, SUM(ds.games_played) as games
            FROM player_best pb2
            JOIN lol_daily_stats ds ON pb2.best_puuid = ds.puuid
            WHERE ds.date >= ? AND ds.date <= ?
            GROUP BY pb2.player_id
          ) ds_games ON p.player_id = ds_games.player_id
        )
        SELECT player_id, slug, current_pseudo, team_slug, team_short_name, lp_change, games
        FROM player_lp WHERE ${filterConditions.join(' AND ')}
        ORDER BY lp_change ${getSortDirection(sortDir)}
        LIMIT ?
      `, params)

      return (result.rows as PlayerLpChangeRow[]).map((row, index) => ({
        rank: index + 1,
        entity: {
          id: row.player_id,
          slug: row.slug,
          name: row.current_pseudo,
        },
        entityType: 'player' as const,
        team: row.team_slug
          ? {
              slug: row.team_slug,
              shortName: row.team_short_name,
            }
          : undefined,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))
    }
      }) // end getOrSet
    }) // end executeWithTimeout
  }

  /**
   * Get batch team history data
   *
   * Uses the SAME LP calculation logic as getTeamLeaderboard():
   * 1. For each player, selects their BEST account (highest tier, then highest LP)
   * 2. Ranks players within team by LP, keeps top 5
   * 3. Team LP = sum of top 5 players' best accounts
   *
   * This ensures consistency between leaderboard and history views.
   */
  async getBatchTeamHistory(filters: BatchHistoryFilters): Promise<BatchTeamHistoryResult> {
    const { startDate, endDate, period, entityIds } = filters

    if (entityIds.length === 0) {
      return { data: [] }
    }

    return executeWithTimeout('getBatchTeamHistory', async () => {
      const cacheKey = this.buildCacheKey('history:team', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.PLAYER_HISTORY, async () => {
      // Fetch team names
      const teams = await db
        .from('teams')
        .whereIn('team_id', entityIds)
        .select('team_id', 'current_name', 'short_name')

      const teamMap = new Map(
        teams.map((t) => [t.team_id, { name: t.current_name, shortName: t.short_name }])
      )

      // Build team IDs array for SQL
      const teamIdsArray = `{${entityIds.join(',')}}`

      // Use CTEs to get team history data
      // Includes all accounts with data, not just Master+ (for games/wins display)
      // LP is only counted for Master+ accounts
      const result = await db.rawQuery<{
        rows: Array<{
          team_id: number
          date: Date
          total_lp: number | null
          games: number
          wins: number
        }>
      }>(
        `
        WITH
        -- Generate date series for the range
        date_series AS (
          SELECT generate_series(?::date, ?::date, '1 day'::interval)::date AS calc_date
        ),

        -- Get all daily stats for accounts (no tier filter)
        -- This ensures we capture games even without rank data
        daily_stats_all AS (
          SELECT DISTINCT ON (d.calc_date, ds.puuid)
            d.calc_date,
            ds.puuid,
            ds.tier,
            ds.lp,
            ds.games_played,
            ds.wins
          FROM date_series d
          JOIN lol_daily_stats ds ON ds.date = d.calc_date
          ORDER BY d.calc_date, ds.puuid, ds.date DESC
        ),

        -- Select best account per player per date
        -- Priority: Master+ tiers first (by tier then LP), then others (by games played)
        player_best_account AS (
          SELECT
            dsa.calc_date,
            pc.team_id,
            pc.player_id,
            acc.puuid,
            dsa.tier,
            dsa.lp,
            dsa.games_played,
            dsa.wins,
            ROW_NUMBER() OVER (
              PARTITION BY pc.player_id, dsa.calc_date
              ORDER BY
                CASE
                  WHEN dsa.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN 0
                  ELSE 1
                END,
                CASE dsa.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                COALESCE(dsa.lp, 0) DESC,
                COALESCE(dsa.games_played, 0) DESC
            ) as account_rn
          FROM player_contracts pc
          JOIN lol_accounts acc ON pc.player_id = acc.player_id
          JOIN daily_stats_all dsa ON acc.puuid = dsa.puuid
          WHERE pc.end_date IS NULL
            AND pc.team_id = ANY(?::int[])
        ),

        -- Filter to best account only
        player_data AS (
          SELECT
            calc_date,
            team_id,
            player_id,
            puuid as best_puuid,
            tier,
            -- LP only for Master+ accounts
            CASE
              WHEN tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN lp
              ELSE NULL
            END as player_lp,
            COALESCE(games_played, 0) as games_played,
            COALESCE(wins, 0) as wins
          FROM player_best_account
          WHERE account_rn = 1
        ),

        -- Rank players within team per date (by LP for Master+, then by games)
        ranked_players AS (
          SELECT
            calc_date,
            team_id,
            player_id,
            best_puuid,
            player_lp,
            games_played,
            wins,
            ROW_NUMBER() OVER (
              PARTITION BY team_id, calc_date
              ORDER BY COALESCE(player_lp, 0) DESC, games_played DESC
            ) as rn
          FROM player_data
        ),

        -- Aggregate team stats from top 5 players
        team_stats AS (
          SELECT
            calc_date as date,
            team_id,
            -- Sum LP only for players with Master+ LP
            NULLIF(SUM(COALESCE(player_lp, 0)), 0)::int as total_lp,
            SUM(games_played)::int as games,
            SUM(wins)::int as wins
          FROM ranked_players
          WHERE rn <= 5
          GROUP BY team_id, calc_date
        )

        SELECT * FROM team_stats
        ORDER BY team_id, date
        `,
        [startDate, endDate, teamIdsArray]
      )

      const dailyStats = result.rows

      // Group by team_id
      const byTeam: Record<
        number,
        Array<{
          date: string | null
          label: string
          games: number
          wins: number
          winrate: number
          totalLp: number
        }>
      > = {}
      for (const id of entityIds) {
        byTeam[id] = []
      }

      for (const d of dailyStats) {
        const teamId = d.team_id
        if (!byTeam[teamId]) byTeam[teamId] = []
        byTeam[teamId].push({
          date: DateTime.fromJSDate(d.date).toISODate(),
          label: this.formatLabelForPeriod(d.date, period),
          games: d.games,
          wins: d.wins,
          winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
          totalLp: d.total_lp ?? 0,
        })
      }

      const data = entityIds.map((id) => ({
        teamId: id,
        teamName: teamMap.get(id)?.name || 'Unknown',
        shortName: teamMap.get(id)?.shortName || 'N/A',
        data: byTeam[id] || [],
      }))

        return { data }
      }) // end getOrSet
    }, BATCH_QUERY_TIMEOUT_MS) // end executeWithTimeout
  }

  /**
   * Get batch player history data
   *
   * Uses the SAME LP calculation logic as getPlayerLeaderboard():
   * 1. For each player, selects their BEST account (highest tier, then highest LP)
   * 2. LP = best account's LP only (not sum of all accounts)
   *
   * This ensures consistency between leaderboard and history views.
   */
  async getBatchPlayerHistory(filters: BatchHistoryFilters): Promise<BatchPlayerHistoryResult> {
    const { startDate, endDate, period, entityIds } = filters

    if (entityIds.length === 0) {
      return { data: [] }
    }

    return executeWithTimeout('getBatchPlayerHistory', async () => {
      const cacheKey = this.buildCacheKey('history:player', filters)

      return cacheService.getOrSet(cacheKey, CACHE_TTL.PLAYER_HISTORY, async () => {
      // Fetch player names
      const players = await db
        .from('players')
        .whereIn('player_id', entityIds)
        .select('player_id', 'current_pseudo')

      const playerMap = new Map(players.map((p) => [p.player_id, p.current_pseudo]))

      // Build player IDs array for SQL
      const playerIdsArray = `{${entityIds.join(',')}}`

      // Use CTEs to get player history data
      // Includes all accounts with data, not just Master+ (for games/wins display)
      // LP is only shown for Master+ accounts
      const result = await db.rawQuery<{
        rows: Array<{
          player_id: number
          date: Date
          total_lp: number | null
          games: number
          wins: number
        }>
      }>(
        `
        WITH
        -- Generate date series for the range
        date_series AS (
          SELECT generate_series(?::date, ?::date, '1 day'::interval)::date AS calc_date
        ),

        -- Get all daily stats for accounts (no tier filter)
        -- This ensures we capture games even without rank data
        daily_stats_all AS (
          SELECT DISTINCT ON (d.calc_date, ds.puuid)
            d.calc_date,
            ds.puuid,
            ds.tier,
            ds.lp,
            ds.games_played,
            ds.wins
          FROM date_series d
          JOIN lol_daily_stats ds ON ds.date = d.calc_date
          ORDER BY d.calc_date, ds.puuid, ds.date DESC
        ),

        -- Select best account per player per date
        -- Priority: Master+ tiers first (by tier then LP), then others (by games played)
        player_best_account AS (
          SELECT
            dsa.calc_date,
            acc.player_id,
            acc.puuid,
            dsa.tier,
            dsa.lp,
            dsa.games_played,
            dsa.wins,
            ROW_NUMBER() OVER (
              PARTITION BY acc.player_id, dsa.calc_date
              ORDER BY
                CASE
                  WHEN dsa.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN 0
                  ELSE 1
                END,
                CASE dsa.tier
                  WHEN 'CHALLENGER' THEN 1
                  WHEN 'GRANDMASTER' THEN 2
                  WHEN 'MASTER' THEN 3
                  ELSE 4
                END,
                COALESCE(dsa.lp, 0) DESC,
                COALESCE(dsa.games_played, 0) DESC
            ) as account_rn
          FROM lol_accounts acc
          JOIN daily_stats_all dsa ON acc.puuid = dsa.puuid
          WHERE acc.player_id = ANY(?::int[])
        ),

        -- Filter to best account only and compute final stats
        player_stats AS (
          SELECT
            calc_date as date,
            player_id,
            -- LP only for Master+ accounts
            CASE
              WHEN tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN lp
              ELSE NULL
            END as total_lp,
            COALESCE(games_played, 0)::int as games,
            COALESCE(wins, 0)::int as wins
          FROM player_best_account
          WHERE account_rn = 1
        )

        SELECT * FROM player_stats
        ORDER BY player_id, date
        `,
        [startDate, endDate, playerIdsArray]
      )

      const dailyStats = result.rows

      // Group by player_id
      const byPlayer: Record<
        number,
        Array<{
          date: string | null
          label: string
          games: number
          wins: number
          winrate: number
          totalLp: number
        }>
      > = {}
      for (const id of entityIds) {
        byPlayer[id] = []
      }

      for (const d of dailyStats) {
        const playerId = d.player_id
        if (!byPlayer[playerId]) byPlayer[playerId] = []
        byPlayer[playerId].push({
          date: DateTime.fromJSDate(d.date).toISODate(),
          label: this.formatLabelForPeriod(d.date, period),
          games: d.games,
          wins: d.wins,
          winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
          totalLp: d.total_lp ?? 0,
        })
      }

      const data = entityIds.map((id) => ({
        playerId: id,
        playerName: playerMap.get(id) || 'Unknown',
        data: byPlayer[id] || [],
      }))

        return { data }
      }) // end getOrSet
    }, BATCH_QUERY_TIMEOUT_MS) // end executeWithTimeout
  }
}

// ============================================================================
// EXPORTS FOR SECURITY TESTING
// These functions are exported to allow unit testing of the SQL injection
// prevention system. They should not be used outside of DashboardService
// and test files.
// ============================================================================
export {
  validateFilterCondition,
  validateAllConditions,
  buildInClause,
  type AllowedInColumn,
  ALLOWED_FILTER_PATTERNS,
  QueryTimeoutError,
}
