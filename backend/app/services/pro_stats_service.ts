import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { setTimeout as setTimeoutPromise } from 'node:timers/promises'
import { cacheService, CACHE_TTL } from './cache_service.js'

/**
 * Query timeout for pro stats queries
 */
const QUERY_TIMEOUT_MS = 8000

/**
 * Custom error class for query timeouts
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
 * Service for pro stats data queries
 */
export default class ProStatsService {
  /**
   * Execute a query with timeout protection
   */
  private async executeWithTimeout<T>(
    operationName: string,
    queryFn: () => Promise<T>,
    timeoutMs: number = QUERY_TIMEOUT_MS
  ): Promise<T> {
    const startTime = Date.now()

    const timeoutPromise = setTimeoutPromise(timeoutMs).then(() => {
      throw new QueryTimeoutError(operationName, timeoutMs)
    })

    try {
      const result = await Promise.race([queryFn(), timeoutPromise])
      const elapsed = Date.now() - startTime

      if (elapsed > timeoutMs * 0.5) {
        logger.warn(`Slow query: ${operationName} took ${elapsed}ms`)
      }

      return result as T
    } catch (error) {
      if (error instanceof QueryTimeoutError) {
        logger.error(`Query timeout: ${operationName} exceeded ${timeoutMs}ms`)
      }
      throw error
    }
  }

  // ============================================================================
  // TOURNAMENTS
  // ============================================================================

  /**
   * Get list of tournaments with pagination
   */
  async getTournaments(params: {
    status?: string
    region?: string
    limit?: number
    page?: number
  }) {
    const { status, region, limit = 20, page = 1 } = params
    const cacheKey = `pro:tournaments:${status || 'all'}:${region || 'all'}:${page}:${limit}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getTournaments', async () => {
      let query = db.from('pro_tournaments').orderBy('start_date', 'desc')

      if (status) {
        query = query.where('status', status)
      }

      if (region) {
        query = query.where('region', region)
      }

      const tournaments = await query.paginate(page, limit)

      return {
        data: tournaments.all().map((t) => ({
          tournamentId: t.tournament_id,
          externalId: t.external_id,
          name: t.name,
          slug: t.slug,
          region: t.region,
          season: t.season,
          split: t.split,
          tier: t.tier,
          status: t.status,
          startDate: t.start_date,
          endDate: t.end_date,
          logoUrl: t.logo_url,
        })),
        meta: {
          total: tournaments.total,
          perPage: tournaments.perPage,
          currentPage: tournaments.currentPage,
          lastPage: tournaments.lastPage,
        },
      }
    })

    await cacheService.set(cacheKey, result, CACHE_TTL.SHORT)
    return result
  }

  /**
   * Get tournament details by slug
   */
  async getTournamentBySlug(slug: string) {
    const cacheKey = `pro:tournament:${slug}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getTournamentBySlug', async () => {
      const tournament = await db
        .from('pro_tournaments')
        .where('slug', slug)
        .first()

      if (!tournament) return null

      // Get stages
      const stages = await db
        .from('pro_stages')
        .where('tournament_id', tournament.tournament_id)
        .orderBy('stage_order', 'asc')

      // Get team stats for standings
      const teamStats = await db
        .from('pro_team_stats as pts')
        .join('teams as t', 't.team_id', 'pts.team_id')
        .where('pts.tournament_id', tournament.tournament_id)
        .orderBy('pts.match_win_rate', 'desc')
        .select([
          'pts.*',
          't.current_name as team_name',
          't.short_name',
          't.slug as team_slug',
        ])

      return {
        tournament: {
          tournamentId: tournament.tournament_id,
          externalId: tournament.external_id,
          name: tournament.name,
          slug: tournament.slug,
          region: tournament.region,
          season: tournament.season,
          split: tournament.split,
          tier: tournament.tier,
          status: tournament.status,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
          logoUrl: tournament.logo_url,
        },
        stages: stages.map((s) => ({
          stageId: s.stage_id,
          name: s.name,
          stageType: s.stage_type,
          stageOrder: s.stage_order,
          status: s.status,
          standings: s.standings,
        })),
        standings: teamStats.map((ts) => ({
          teamId: ts.team_id,
          teamName: ts.team_name,
          shortName: ts.short_name,
          teamSlug: ts.team_slug,
          matchesPlayed: ts.matches_played,
          matchesWon: ts.matches_won,
          gamesPlayed: ts.games_played,
          gamesWon: ts.games_won,
          matchWinRate: parseFloat(ts.match_win_rate),
          gameWinRate: parseFloat(ts.game_win_rate),
        })),
      }
    })

    if (result) {
      await cacheService.set(cacheKey, result, CACHE_TTL.MEDIUM)
    }

    return result
  }

  // ============================================================================
  // MATCHES
  // ============================================================================

  /**
   * Get matches with filters
   */
  async getMatches(params: {
    tournamentId?: number
    teamId?: number
    status?: string
    startDate?: string
    endDate?: string
    limit?: number
    page?: number
  }) {
    const { tournamentId, teamId, status, startDate, endDate, limit = 20, page = 1 } = params
    const cacheKey = `pro:matches:${tournamentId || 'all'}:${teamId || 'all'}:${status || 'all'}:${page}:${limit}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getMatches', async () => {
      let query = db
        .from('pro_matches as m')
        .leftJoin('teams as t1', 't1.team_id', 'm.team1_id')
        .leftJoin('teams as t2', 't2.team_id', 'm.team2_id')
        .leftJoin('pro_tournaments as pt', 'pt.tournament_id', 'm.tournament_id')
        .orderBy('m.scheduled_at', 'desc')
        .select([
          'm.*',
          't1.current_name as team1_name',
          't1.short_name as team1_short',
          't1.slug as team1_slug',
          't2.current_name as team2_name',
          't2.short_name as team2_short',
          't2.slug as team2_slug',
          'pt.name as tournament_name',
          'pt.slug as tournament_slug',
        ])

      if (tournamentId) {
        query = query.where('m.tournament_id', tournamentId)
      }

      if (teamId) {
        query = query.where((q) => {
          q.where('m.team1_id', teamId).orWhere('m.team2_id', teamId)
        })
      }

      if (status) {
        query = query.where('m.status', status)
      }

      if (startDate) {
        query = query.where('m.scheduled_at', '>=', startDate)
      }

      if (endDate) {
        query = query.where('m.scheduled_at', '<=', endDate)
      }

      const matches = await query.paginate(page, limit)

      return {
        data: matches.all().map((m) => ({
          matchId: m.match_id,
          externalId: m.external_id,
          tournamentId: m.tournament_id,
          tournamentName: m.tournament_name,
          tournamentSlug: m.tournament_slug,
          team1: {
            teamId: m.team1_id,
            name: m.team1_name,
            shortName: m.team1_short,
            slug: m.team1_slug,
          },
          team2: {
            teamId: m.team2_id,
            name: m.team2_name,
            shortName: m.team2_short,
            slug: m.team2_slug,
          },
          team1Score: m.team1_score,
          team2Score: m.team2_score,
          winnerTeamId: m.winner_team_id,
          format: m.format,
          status: m.status,
          scheduledAt: m.scheduled_at,
          startedAt: m.started_at,
          endedAt: m.ended_at,
          streamUrl: m.stream_url,
        })),
        meta: {
          total: matches.total,
          perPage: matches.perPage,
          currentPage: matches.currentPage,
          lastPage: matches.lastPage,
        },
      }
    })

    await cacheService.set(cacheKey, result, CACHE_TTL.SHORT)
    return result
  }

  /**
   * Get live matches
   */
  async getLiveMatches() {
    const cacheKey = 'pro:matches:live'

    // Very short cache for live data
    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.getMatches({ status: 'live', limit: 20 })

    await cacheService.set(cacheKey, result, 30) // 30 seconds
    return result
  }

  /**
   * Get upcoming matches
   */
  async getUpcomingMatches(limit: number = 10) {
    const cacheKey = `pro:matches:upcoming:${limit}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const now = DateTime.now().toISO()
    const result = await this.getMatches({
      status: 'upcoming',
      startDate: now,
      limit,
    })

    await cacheService.set(cacheKey, result, CACHE_TTL.SHORT)
    return result
  }

  /**
   * Get match details with games
   */
  async getMatchById(matchId: number) {
    const cacheKey = `pro:match:${matchId}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getMatchById', async () => {
      const match = await db
        .from('pro_matches as m')
        .leftJoin('teams as t1', 't1.team_id', 'm.team1_id')
        .leftJoin('teams as t2', 't2.team_id', 'm.team2_id')
        .leftJoin('pro_tournaments as pt', 'pt.tournament_id', 'm.tournament_id')
        .where('m.match_id', matchId)
        .select([
          'm.*',
          't1.current_name as team1_name',
          't1.short_name as team1_short',
          't1.slug as team1_slug',
          't2.current_name as team2_name',
          't2.short_name as team2_short',
          't2.slug as team2_slug',
          'pt.name as tournament_name',
          'pt.slug as tournament_slug',
        ])
        .first()

      if (!match) return null

      // Get games
      const games = await db
        .from('pro_games as g')
        .leftJoin('teams as bt', 'bt.team_id', 'g.blue_team_id')
        .leftJoin('teams as rt', 'rt.team_id', 'g.red_team_id')
        .where('g.match_id', matchId)
        .orderBy('g.game_number', 'asc')
        .select([
          'g.*',
          'bt.current_name as blue_team_name',
          'bt.short_name as blue_team_short',
          'rt.current_name as red_team_name',
          'rt.short_name as red_team_short',
        ])

      return {
        match: {
          matchId: match.match_id,
          externalId: match.external_id,
          tournamentId: match.tournament_id,
          tournamentName: match.tournament_name,
          tournamentSlug: match.tournament_slug,
          team1: {
            teamId: match.team1_id,
            name: match.team1_name,
            shortName: match.team1_short,
            slug: match.team1_slug,
          },
          team2: {
            teamId: match.team2_id,
            name: match.team2_name,
            shortName: match.team2_short,
            slug: match.team2_slug,
          },
          team1Score: match.team1_score,
          team2Score: match.team2_score,
          winnerTeamId: match.winner_team_id,
          format: match.format,
          status: match.status,
          scheduledAt: match.scheduled_at,
          startedAt: match.started_at,
          endedAt: match.ended_at,
          streamUrl: match.stream_url,
        },
        games: games.map((g) => ({
          gameId: g.game_id,
          gameNumber: g.game_number,
          blueTeam: {
            teamId: g.blue_team_id,
            name: g.blue_team_name,
            shortName: g.blue_team_short,
          },
          redTeam: {
            teamId: g.red_team_id,
            name: g.red_team_name,
            shortName: g.red_team_short,
          },
          winnerTeamId: g.winner_team_id,
          duration: g.duration,
          status: g.status,
          patch: g.patch,
          objectives: {
            blueTowers: g.blue_towers,
            redTowers: g.red_towers,
            blueDragons: g.blue_dragons,
            redDragons: g.red_dragons,
            blueBarons: g.blue_barons,
            redBarons: g.red_barons,
          },
          firstObjectives: {
            blood: g.first_blood_team,
            tower: g.first_tower_team,
            dragon: g.first_dragon_team,
            herald: g.first_herald_team,
            baron: g.first_baron_team,
          },
        })),
      }
    })

    if (result) {
      const ttl = result.match.status === 'live' ? 30 : CACHE_TTL.MEDIUM
      await cacheService.set(cacheKey, result, ttl)
    }

    return result
  }

  // ============================================================================
  // GAMES
  // ============================================================================

  /**
   * Get game details with draft and stats
   */
  async getGameById(gameId: number) {
    const cacheKey = `pro:game:${gameId}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getGameById', async () => {
      const game = await db
        .from('pro_games as g')
        .leftJoin('teams as bt', 'bt.team_id', 'g.blue_team_id')
        .leftJoin('teams as rt', 'rt.team_id', 'g.red_team_id')
        .where('g.game_id', gameId)
        .select([
          'g.*',
          'bt.current_name as blue_team_name',
          'bt.short_name as blue_team_short',
          'rt.current_name as red_team_name',
          'rt.short_name as red_team_short',
        ])
        .first()

      if (!game) return null

      // Get draft
      const draft = await db
        .from('pro_drafts')
        .where('game_id', gameId)
        .first()

      // Get player stats
      const playerStats = await db
        .from('pro_player_stats as ps')
        .leftJoin('players as p', 'p.player_id', 'ps.player_id')
        .leftJoin('teams as t', 't.team_id', 'ps.team_id')
        .where('ps.game_id', gameId)
        .orderBy('ps.team_side')
        .orderBy('ps.role')
        .select([
          'ps.*',
          'p.current_pseudo as player_name',
          'p.slug as player_slug',
          't.current_name as team_name',
          't.short_name as team_short',
        ])

      return {
        game: {
          gameId: game.game_id,
          matchId: game.match_id,
          gameNumber: game.game_number,
          blueTeam: {
            teamId: game.blue_team_id,
            name: game.blue_team_name,
            shortName: game.blue_team_short,
          },
          redTeam: {
            teamId: game.red_team_id,
            name: game.red_team_name,
            shortName: game.red_team_short,
          },
          winnerTeamId: game.winner_team_id,
          duration: game.duration,
          status: game.status,
          patch: game.patch,
          objectives: {
            blueTowers: game.blue_towers,
            redTowers: game.red_towers,
            blueDragons: game.blue_dragons,
            redDragons: game.red_dragons,
            blueBarons: game.blue_barons,
            redBarons: game.red_barons,
            blueHeralds: game.blue_heralds,
            redHeralds: game.red_heralds,
            blueGrubs: game.blue_grubs,
            redGrubs: game.red_grubs,
          },
          goldAt15: {
            blue: game.blue_gold_at_15,
            red: game.red_gold_at_15,
          },
          firstObjectives: {
            blood: game.first_blood_team,
            tower: game.first_tower_team,
            dragon: game.first_dragon_team,
            herald: game.first_herald_team,
            baron: game.first_baron_team,
          },
        },
        draft: draft
          ? {
              bluePicks: [
                draft.blue_pick_1,
                draft.blue_pick_2,
                draft.blue_pick_3,
                draft.blue_pick_4,
                draft.blue_pick_5,
              ].filter(Boolean),
              redPicks: [
                draft.red_pick_1,
                draft.red_pick_2,
                draft.red_pick_3,
                draft.red_pick_4,
                draft.red_pick_5,
              ].filter(Boolean),
              blueBans: [
                draft.blue_ban_1,
                draft.blue_ban_2,
                draft.blue_ban_3,
                draft.blue_ban_4,
                draft.blue_ban_5,
              ].filter(Boolean),
              redBans: [
                draft.red_ban_1,
                draft.red_ban_2,
                draft.red_ban_3,
                draft.red_ban_4,
                draft.red_ban_5,
              ].filter(Boolean),
            }
          : null,
        players: playerStats.map((ps) => ({
          playerId: ps.player_id,
          playerName: ps.player_name,
          playerSlug: ps.player_slug,
          teamId: ps.team_id,
          teamName: ps.team_name,
          teamShort: ps.team_short,
          side: ps.team_side,
          role: ps.role,
          championId: ps.champion_id,
          kills: ps.kills,
          deaths: ps.deaths,
          assists: ps.assists,
          cs: ps.cs,
          csPerMin: parseFloat(ps.cs_per_min),
          goldEarned: ps.gold_earned,
          goldShare: ps.gold_share,
          damageDealt: ps.damage_dealt,
          damageShare: ps.damage_share,
          visionScore: ps.vision_score,
          killParticipation: ps.kill_participation,
          csAt15: ps.cs_at_15,
          goldAt15: ps.gold_at_15,
          goldDiffAt15: ps.gold_diff_at_15,
          csDiffAt15: ps.cs_diff_at_15,
        })),
      }
    })

    if (result) {
      const ttl = result.game.status === 'live' ? 30 : CACHE_TTL.LONG
      await cacheService.set(cacheKey, result, ttl)
    }

    return result
  }

  // ============================================================================
  // TEAM STATS
  // ============================================================================

  /**
   * Get team pro stats
   */
  async getTeamStats(teamSlug: string, tournamentId?: number) {
    const cacheKey = `pro:team:${teamSlug}:${tournamentId || 'all'}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getTeamStats', async () => {
      const team = await db.from('teams').where('slug', teamSlug).first()

      if (!team) return null

      let query = db
        .from('pro_team_stats as pts')
        .leftJoin('pro_tournaments as pt', 'pt.tournament_id', 'pts.tournament_id')
        .where('pts.team_id', team.team_id)
        .orderBy('pt.start_date', 'desc')
        .select(['pts.*', 'pt.name as tournament_name', 'pt.slug as tournament_slug'])

      if (tournamentId) {
        query = query.where('pts.tournament_id', tournamentId)
      }

      const stats = await query

      return {
        team: {
          teamId: team.team_id,
          name: team.current_name,
          shortName: team.short_name,
          slug: team.slug,
        },
        stats: stats.map((s) => ({
          tournamentId: s.tournament_id,
          tournamentName: s.tournament_name,
          tournamentSlug: s.tournament_slug,
          matchesPlayed: s.matches_played,
          matchesWon: s.matches_won,
          gamesPlayed: s.games_played,
          gamesWon: s.games_won,
          matchWinRate: parseFloat(s.match_win_rate),
          gameWinRate: parseFloat(s.game_win_rate),
          avgGameDuration: parseFloat(s.avg_game_duration),
          avgKills: parseFloat(s.avg_kills),
          avgDeaths: parseFloat(s.avg_deaths),
          avgTowers: parseFloat(s.avg_towers),
          avgDragons: parseFloat(s.avg_dragons),
          avgBarons: parseFloat(s.avg_barons),
          avgGoldAt15: parseFloat(s.avg_gold_at_15),
          avgGoldDiffAt15: parseFloat(s.avg_gold_diff_at_15),
          firstBloodRate: s.first_blood_rate,
          firstTowerRate: s.first_tower_rate,
          firstDragonRate: s.first_dragon_rate,
          firstHeraldRate: s.first_herald_rate,
          blueSideGames: s.blue_side_games,
          blueSideWins: s.blue_side_wins,
          redSideGames: s.red_side_games,
          redSideWins: s.red_side_wins,
        })),
      }
    })

    if (result) {
      await cacheService.set(cacheKey, result, CACHE_TTL.MEDIUM)
    }

    return result
  }

  // ============================================================================
  // PLAYER STATS
  // ============================================================================

  /**
   * Get player pro stats
   */
  async getPlayerStats(playerSlug: string, tournamentId?: number) {
    const cacheKey = `pro:player:${playerSlug}:${tournamentId || 'all'}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getPlayerStats', async () => {
      const player = await db.from('players').where('slug', playerSlug).first()

      if (!player) return null

      let query = db
        .from('pro_player_aggregated_stats as pps')
        .leftJoin('pro_tournaments as pt', 'pt.tournament_id', 'pps.tournament_id')
        .leftJoin('teams as t', 't.team_id', 'pps.team_id')
        .where('pps.player_id', player.player_id)
        .orderBy('pt.start_date', 'desc')
        .select([
          'pps.*',
          'pt.name as tournament_name',
          'pt.slug as tournament_slug',
          't.current_name as team_name',
          't.short_name as team_short',
          't.slug as team_slug',
        ])

      if (tournamentId) {
        query = query.where('pps.tournament_id', tournamentId)
      }

      const stats = await query

      return {
        player: {
          playerId: player.player_id,
          name: player.current_pseudo,
          slug: player.slug,
          nationality: player.nationality,
        },
        stats: stats.map((s) => ({
          tournamentId: s.tournament_id,
          tournamentName: s.tournament_name,
          tournamentSlug: s.tournament_slug,
          team: {
            teamId: s.team_id,
            name: s.team_name,
            shortName: s.team_short,
            slug: s.team_slug,
          },
          role: s.role,
          gamesPlayed: s.games_played,
          gamesWon: s.games_won,
          winRate: parseFloat(s.win_rate),
          avgKills: parseFloat(s.avg_kills),
          avgDeaths: parseFloat(s.avg_deaths),
          avgAssists: parseFloat(s.avg_assists),
          avgKda: parseFloat(s.avg_kda),
          avgCsPerMin: parseFloat(s.avg_cs_per_min),
          avgGoldPerMin: parseFloat(s.avg_gold_per_min),
          avgDamagePerMin: parseFloat(s.avg_damage_per_min),
          avgVisionScore: parseFloat(s.avg_vision_score),
          avgKillParticipation: parseFloat(s.avg_kill_participation),
          avgGoldShare: parseFloat(s.avg_gold_share),
          avgDamageShare: parseFloat(s.avg_damage_share),
          avgCsDiffAt15: parseFloat(s.avg_cs_diff_at_15),
          avgGoldDiffAt15: parseFloat(s.avg_gold_diff_at_15),
          uniqueChampionsPlayed: s.unique_champions_played,
        })),
      }
    })

    if (result) {
      await cacheService.set(cacheKey, result, CACHE_TTL.MEDIUM)
    }

    return result
  }

  // ============================================================================
  // DRAFTS ANALYSIS
  // ============================================================================

  /**
   * Get champion presence and stats for a tournament
   */
  async getChampionStats(tournamentId: number) {
    const cacheKey = `pro:champions:${tournamentId}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getChampionStats', async () => {
      const champions = await db
        .from('pro_champion_stats')
        .where('tournament_id', tournamentId)
        .orderBy('presence_rate', 'desc')

      return {
        data: champions.map((c) => ({
          championId: c.champion_id,
          picks: c.picks,
          bans: c.bans,
          wins: c.wins,
          losses: c.losses,
          presenceRate: parseFloat(c.presence_rate),
          pickRate: parseFloat(c.pick_rate),
          banRate: parseFloat(c.ban_rate),
          winRate: parseFloat(c.win_rate),
          avgKda: parseFloat(c.avg_kda),
          avgCsPerMin: parseFloat(c.avg_cs_per_min),
          blueSidePicks: c.blue_side_picks,
          blueSideWins: c.blue_side_wins,
          redSidePicks: c.red_side_picks,
          redSideWins: c.red_side_wins,
          roleDistribution: {
            top: c.top_picks,
            jungle: c.jungle_picks,
            mid: c.mid_picks,
            adc: c.adc_picks,
            support: c.support_picks,
          },
        })),
      }
    })

    await cacheService.set(cacheKey, result, CACHE_TTL.MEDIUM)
    return result
  }

  // ============================================================================
  // HEAD TO HEAD
  // ============================================================================

  /**
   * Get head-to-head stats between two teams
   */
  async getHeadToHead(team1Slug: string, team2Slug: string) {
    const cacheKey = `pro:h2h:${team1Slug}:${team2Slug}`

    const cached = await cacheService.get(cacheKey)
    if (cached) return cached

    const result = await this.executeWithTimeout('getHeadToHead', async () => {
      const team1 = await db.from('teams').where('slug', team1Slug).first()
      const team2 = await db.from('teams').where('slug', team2Slug).first()

      if (!team1 || !team2) return null

      // Get matches between these teams
      const matches = await db
        .from('pro_matches as m')
        .leftJoin('pro_tournaments as pt', 'pt.tournament_id', 'm.tournament_id')
        .where((q) => {
          q.where((q2) => {
            q2.where('m.team1_id', team1.team_id).where('m.team2_id', team2.team_id)
          }).orWhere((q2) => {
            q2.where('m.team1_id', team2.team_id).where('m.team2_id', team1.team_id)
          })
        })
        .where('m.status', 'completed')
        .orderBy('m.ended_at', 'desc')
        .limit(20)
        .select(['m.*', 'pt.name as tournament_name', 'pt.slug as tournament_slug'])

      // Calculate stats
      let team1Wins = 0
      let team2Wins = 0

      for (const match of matches) {
        if (match.winner_team_id === team1.team_id) {
          team1Wins++
        } else if (match.winner_team_id === team2.team_id) {
          team2Wins++
        }
      }

      return {
        team1: {
          teamId: team1.team_id,
          name: team1.current_name,
          shortName: team1.short_name,
          slug: team1.slug,
          wins: team1Wins,
        },
        team2: {
          teamId: team2.team_id,
          name: team2.current_name,
          shortName: team2.short_name,
          slug: team2.slug,
          wins: team2Wins,
        },
        totalMatches: matches.length,
        recentMatches: matches.slice(0, 10).map((m) => ({
          matchId: m.match_id,
          tournamentName: m.tournament_name,
          tournamentSlug: m.tournament_slug,
          team1Score: m.team1_id === team1.team_id ? m.team1_score : m.team2_score,
          team2Score: m.team1_id === team1.team_id ? m.team2_score : m.team1_score,
          winnerId: m.winner_team_id,
          endedAt: m.ended_at,
        })),
      }
    })

    if (result) {
      await cacheService.set(cacheKey, result, CACHE_TTL.MEDIUM)
    }

    return result
  }
}
