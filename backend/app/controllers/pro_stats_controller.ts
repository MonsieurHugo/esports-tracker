import type { HttpContext } from '@adonisjs/core/http'
import ProStatsService from '#services/pro_stats_service'
import { validatePagination, validateLimit } from '#utils/validation'

export default class ProStatsController {
  private proStatsService = new ProStatsService()

  // ============================================================================
  // TOURNAMENTS
  // ============================================================================

  /**
   * GET /api/v1/pro/tournaments
   * List tournaments with optional filters
   */
  async tournaments({ request, response }: HttpContext) {
    const { status, region, page = 1, perPage = 20 } = request.qs()

    const validatedPage = validatePagination(page, perPage)

    const result = await this.proStatsService.getTournaments({
      status,
      region,
      page: validatedPage.page,
      limit: validatedPage.perPage,
    })

    return response.ok(result)
  }

  /**
   * GET /api/v1/pro/tournaments/:slug
   * Get tournament details with standings
   */
  async tournamentBySlug({ params, response }: HttpContext) {
    const { slug } = params

    if (!slug || typeof slug !== 'string') {
      return response.badRequest({ error: 'Invalid tournament slug' })
    }

    const result = await this.proStatsService.getTournamentBySlug(slug)

    if (!result) {
      return response.notFound({ error: 'Tournament not found' })
    }

    return response.ok(result)
  }

  // ============================================================================
  // MATCHES
  // ============================================================================

  /**
   * GET /api/v1/pro/matches
   * List matches with optional filters
   */
  async matches({ request, response }: HttpContext) {
    const {
      tournamentId,
      teamId,
      status,
      startDate,
      endDate,
      page = 1,
      perPage = 20,
    } = request.qs()

    const validatedPage = validatePagination(page, perPage)

    const result = await this.proStatsService.getMatches({
      tournamentId: tournamentId ? Number(tournamentId) : undefined,
      teamId: teamId ? Number(teamId) : undefined,
      status,
      startDate,
      endDate,
      page: validatedPage.page,
      limit: validatedPage.perPage,
    })

    return response.ok(result)
  }

  /**
   * GET /api/v1/pro/matches/upcoming
   * Get upcoming matches
   */
  async upcomingMatches({ request, response }: HttpContext) {
    const { limit = 10 } = request.qs()

    const validatedLimit = validateLimit(limit, 50)

    const result = await this.proStatsService.getUpcomingMatches(validatedLimit)

    return response.ok(result)
  }

  /**
   * GET /api/v1/pro/matches/live
   * Get currently live matches
   */
  async liveMatches({ response }: HttpContext) {
    const result = await this.proStatsService.getLiveMatches()

    return response.ok(result)
  }

  /**
   * GET /api/v1/pro/matches/:id
   * Get match details with games
   */
  async matchById({ params, response }: HttpContext) {
    const { id } = params

    const matchId = Number(id)
    if (isNaN(matchId)) {
      return response.badRequest({ error: 'Invalid match ID' })
    }

    const result = await this.proStatsService.getMatchById(matchId)

    if (!result) {
      return response.notFound({ error: 'Match not found' })
    }

    return response.ok(result)
  }

  // ============================================================================
  // GAMES
  // ============================================================================

  /**
   * GET /api/v1/pro/games/:id
   * Get game details with draft and stats
   */
  async gameById({ params, response }: HttpContext) {
    const { id } = params

    const gameId = Number(id)
    if (isNaN(gameId)) {
      return response.badRequest({ error: 'Invalid game ID' })
    }

    const result = await this.proStatsService.getGameById(gameId)

    if (!result) {
      return response.notFound({ error: 'Game not found' })
    }

    return response.ok(result)
  }

  // ============================================================================
  // TEAM STATS
  // ============================================================================

  /**
   * GET /api/v1/pro/teams/:slug/stats
   * Get team pro stats
   */
  async teamStats({ params, request, response }: HttpContext) {
    const { slug } = params
    const { tournamentId } = request.qs()

    if (!slug || typeof slug !== 'string') {
      return response.badRequest({ error: 'Invalid team slug' })
    }

    const result = await this.proStatsService.getTeamStats(
      slug,
      tournamentId ? Number(tournamentId) : undefined
    )

    if (!result) {
      return response.notFound({ error: 'Team not found' })
    }

    return response.ok(result)
  }

  // ============================================================================
  // PLAYER STATS
  // ============================================================================

  /**
   * GET /api/v1/pro/players/:slug/stats
   * Get player pro stats
   */
  async playerStats({ params, request, response }: HttpContext) {
    const { slug } = params
    const { tournamentId } = request.qs()

    if (!slug || typeof slug !== 'string') {
      return response.badRequest({ error: 'Invalid player slug' })
    }

    const result = await this.proStatsService.getPlayerStats(
      slug,
      tournamentId ? Number(tournamentId) : undefined
    )

    if (!result) {
      return response.notFound({ error: 'Player not found' })
    }

    return response.ok(result)
  }

  // ============================================================================
  // DRAFTS ANALYSIS
  // ============================================================================

  /**
   * GET /api/v1/pro/drafts/analysis
   * Get champion presence and stats for a tournament
   */
  async draftsAnalysis({ request, response }: HttpContext) {
    const { tournamentId } = request.qs()

    if (!tournamentId) {
      return response.badRequest({ error: 'tournamentId is required' })
    }

    const result = await this.proStatsService.getChampionStats(Number(tournamentId))

    return response.ok(result)
  }

  // ============================================================================
  // HEAD TO HEAD
  // ============================================================================

  /**
   * GET /api/v1/pro/head-to-head
   * Get head-to-head stats between two teams
   */
  async headToHead({ request, response }: HttpContext) {
    const { team1, team2 } = request.qs()

    if (!team1 || !team2) {
      return response.badRequest({ error: 'team1 and team2 slugs are required' })
    }

    const result = await this.proStatsService.getHeadToHead(team1, team2)

    if (!result) {
      return response.notFound({ error: 'One or both teams not found' })
    }

    return response.ok(result)
  }
}
