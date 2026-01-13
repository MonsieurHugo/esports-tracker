import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Split from '#models/split'
import League from '#models/league'

export default class LolDashboardController {
  /**
   * Helper to get date range based on period
   */
  private getDateRange(ctx: HttpContext) {
    const { period = 'day', startDate, endDate, offset = 0 } = ctx.request.qs()

    let start: DateTime
    let end: DateTime = DateTime.now()

    switch (period) {
      case 'day':
        // 7 derniers jours, navigation par semaines
        end = end.minus({ weeks: Number(offset) }).endOf('day')
        start = end.minus({ days: 6 }).startOf('day')
        break
      case 'month':
        start = end.minus({ months: Number(offset) }).startOf('month')
        end = start.endOf('month')
        break
      case 'year':
        start = end.minus({ years: Number(offset) }).startOf('year')
        end = start.endOf('year')
        break
      case 'custom':
        start = startDate ? DateTime.fromISO(startDate) : end.minus({ days: 7 })
        end = endDate ? DateTime.fromISO(endDate) : DateTime.now()
        break
      default:
        start = end.startOf('day')
    }

    return { start, end, period }
  }

  /**
   * Format label based on period type
   */
  private formatLabelForPeriod(date: Date, period: string): string {
    const dt = DateTime.fromJSDate(date)
    switch (period) {
      case 'day':
        return dt.toFormat('d MMM') // 13 Jan, 14 Jan...
      case 'month':
        return dt.toFormat('d') // 1, 2, 3... 31
      case 'year':
        return dt.toFormat('MMM') // Jan, Fév, Mar...
      default:
        return dt.toFormat('d MMM')
    }
  }

  /**
   * GET /api/v1/lol/dashboard/summary
   * Dashboard summary stats
   */
  async summary(ctx: HttpContext) {
    const { start, end } = this.getDateRange(ctx)
    const { leagues } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : [leagues]) : null

    // Get total games and change
    const gamesQuery = db
      .from('lol_daily_stats as ds')
      .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .join('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])

    if (leagueFilter) {
      gamesQuery.whereIn('t.league', leagueFilter)
    }

    const [{ total_games = 0, total_wins = 0, total_duration = 0 }] = await gamesQuery
      .select(
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as total_games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as total_wins'),
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration')
      )

    // Get previous period for comparison
    const periodDuration = end.diff(start, 'days').days
    const prevStart = start.minus({ days: periodDuration })
    const prevEnd = start.minus({ days: 1 })

    const prevGamesQuery = db
      .from('lol_daily_stats as ds')
      .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .join('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .whereBetween('ds.date', [prevStart.toSQLDate()!, prevEnd.toSQLDate()!])

    if (leagueFilter) {
      prevGamesQuery.whereIn('t.league', leagueFilter)
    }

    const [{ prev_games = 0, prev_wins = 0 }] = await prevGamesQuery.select(
      db.raw('COALESCE(SUM(ds.games_played), 0)::int as prev_games'),
      db.raw('COALESCE(SUM(ds.wins), 0)::int as prev_wins')
    )

    // Calculate LP total from current ranks (Master+ only)
    const [{ total_lp = 0 }] = await db
      .from('lol_current_ranks as r')
      .join('lol_accounts as a', 'r.puuid', 'a.puuid')
      .join('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .where('r.queue_type', 'RANKED_SOLO_5x5')
      .whereIn('r.tier', ['MASTER', 'GRANDMASTER', 'CHALLENGER'])
      .if(leagueFilter, (q) => q.whereIn('t.region', leagueFilter!))
      .select(db.raw('COALESCE(SUM(r.league_points), 0)::int as total_lp'))

    const avgWinrate = total_games > 0 ? (total_wins / total_games) * 100 : 0
    const prevWinrate = prev_games > 0 ? (prev_wins / prev_games) * 100 : 0

    return ctx.response.ok({
      totalGames: total_games,
      totalGamesChange: total_games - prev_games,
      avgWinrate: Math.round(avgWinrate * 10) / 10,
      avgWinrateChange: Math.round((avgWinrate - prevWinrate) * 10) / 10,
      totalMinutes: Math.round(total_duration / 60),
      totalMinutesChange: 0,
      totalLp: total_lp,
      lastUpdated: DateTime.now().toISO(),
    })
  }

  /**
   * GET /api/v1/lol/dashboard/teams
   * Team leaderboard
   */
  async teams(ctx: HttpContext) {
    const { start, end, period } = this.getDateRange(ctx)
    const { leagues, roles, minGames, page = 1, perPage = 20, sort = 'games', search } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0

    const query = db
      .from('teams as t')
      .join('organizations as o', 't.org_id', 'o.org_id')
      .join('player_contracts as pc', (q) => {
        q.on('pc.team_id', 't.team_id').andOnNull('pc.end_date')
      })
      .join('lol_accounts as a', 'pc.player_id', 'a.player_id')
      .join('lol_daily_stats as ds', (q) => {
        q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      })
      .where('t.is_active', true)
      .groupBy('t.team_id', 'o.org_id')

    if (leagueFilter) {
      query.whereIn('t.league', leagueFilter)
    }

    if (roleFilter) {
      query.whereIn('pc.role', roleFilter)
    }

    if (search) {
      query.where((q) => {
        q.whereILike('t.current_name', `%${search}%`).orWhereILike('t.short_name', `%${search}%`)
      })
    }

    if (minGamesVal > 0) {
      query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
    }

    // Get count first (separate query with same filters)
    // For minGames filter, we need a subquery approach
    let countResult: { count: number }[]
    if (minGamesVal > 0) {
      // Use subquery to filter by minGames
      const teamsWithMinGames = await db
        .from('teams as t')
        .join('player_contracts as pc', (q) => {
          q.on('pc.team_id', 't.team_id').andOnNull('pc.end_date')
        })
        .join('lol_accounts as a', 'pc.player_id', 'a.player_id')
        .join('lol_daily_stats as ds', (q) => {
          q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
        })
        .where('t.is_active', true)
        .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
        .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))
        .if(search, (q) => q.where((sub) => {
          sub.whereILike('t.current_name', `%${search}%`).orWhereILike('t.short_name', `%${search}%`)
        }))
        .groupBy('t.team_id')
        .havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
        .select('t.team_id')

      countResult = [{ count: teamsWithMinGames.length }]
    } else {
      countResult = await db
        .from('teams as t')
        .join('player_contracts as pc', (q) => {
          q.on('pc.team_id', 't.team_id').andOnNull('pc.end_date')
        })
        .join('lol_accounts as a', 'pc.player_id', 'a.player_id')
        .join('lol_daily_stats as ds', (q) => {
          q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
        })
        .where('t.is_active', true)
        .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
        .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))
        .if(search, (q) => q.where((sub) => {
          sub.whereILike('t.current_name', `%${search}%`).orWhereILike('t.short_name', `%${search}%`)
        }))
        .countDistinct('t.team_id as count')
    }

    const total = countResult[0]?.count || 0

    // Get paginated data
    const offset = (Number(page) - 1) * Number(perPage)

    const teams = await query
      .select(
        't.team_id',
        't.slug',
        't.current_name',
        't.short_name',
        'o.logo_url',
        't.region',
        't.league',
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration')
      )
      .orderBy(sort === 'winrate' ? 'wins' : 'games', 'desc')
      .limit(Number(perPage))
      .offset(offset)

    // Fetch players for all teams in one query
    const teamIds = teams.map((t) => t.team_id)

    const playersData = teamIds.length > 0
      ? await db
          .from('players as p')
          .join('player_contracts as pc', (q) => {
            q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
          })
          .join('lol_accounts as a', 'p.player_id', 'a.player_id')
          .leftJoin('lol_daily_stats as ds', (q) => {
            q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
          })
          .leftJoin('lol_current_ranks as r', (q) => {
            q.on('r.puuid', 'a.puuid').andOnVal('r.queue_type', '=', 'RANKED_SOLO_5x5')
          })
          .whereIn('pc.team_id', teamIds)
          .groupBy('p.player_id', 'pc.team_id', 'pc.role', 'r.tier', 'r.rank', 'r.league_points')
          .select(
            'p.player_id',
            'p.slug',
            'p.current_pseudo',
            'pc.team_id',
            'pc.role',
            'r.tier',
            'r.rank',
            'r.league_points as lp',
            db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
            db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
          )
          .orderByRaw("CASE pc.role WHEN 'TOP' THEN 1 WHEN 'JGL' THEN 2 WHEN 'MID' THEN 3 WHEN 'ADC' THEN 4 WHEN 'SUP' THEN 5 ELSE 6 END")
      : []

    // Group players by team_id
    const playersByTeam = new Map<number, typeof playersData>()
    for (const player of playersData) {
      const teamPlayers = playersByTeam.get(player.team_id) || []
      teamPlayers.push(player)
      playersByTeam.set(player.team_id, teamPlayers)
    }

    // Tiers Master+ qui ont des LP significatifs
    const masterPlusTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER']

    const data = teams.map((team, index) => {
      const teamPlayers = playersByTeam.get(team.team_id) || []

      // Calcul du totalLp : somme des LP des joueurs Master+ uniquement
      const teamTotalLp = teamPlayers.reduce((sum, p) => {
        const isMasterPlus = p.tier && masterPlusTiers.includes(p.tier.toUpperCase())
        return sum + (isMasterPlus ? (p.lp || 0) : 0)
      }, 0)

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
        gamesChange: 0,
        winrate: team.games > 0 ? Math.round((team.wins / team.games) * 1000) / 10 : 0,
        winrateChange: 0,
        totalMinutes: Math.round(team.total_duration / 60),
        totalMinutesChange: 0,
        totalLp: teamTotalLp,
        totalLpChange: 0,
        players: teamPlayers.map((p) => {
          const isMasterPlus = p.tier && masterPlusTiers.includes(p.tier.toUpperCase())
          const playerLp = isMasterPlus ? (p.lp || 0) : 0
          return {
            playerId: p.player_id,
            slug: p.slug,
            pseudo: p.current_pseudo,
            role: p.role || 'Unknown',
            games: p.games,
            winrate: p.games > 0 ? Math.round((p.wins / p.games) * 1000) / 10 : -1,
            tier: p.tier,
            rank: p.rank,
            lp: playerLp,
            totalLp: playerLp,
          }
        }),
      }
    })

    return ctx.response.ok({
      period,
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      data,
      meta: {
        total: Number(total),
        perPage: Number(perPage),
        currentPage: Number(page),
        lastPage: Math.ceil(Number(total) / Number(perPage)),
      },
    })
  }

  /**
   * GET /api/v1/lol/dashboard/players
   * Player leaderboard
   */
  async players(ctx: HttpContext) {
    const { start, end } = this.getDateRange(ctx)
    const { leagues, roles, minGames, page = 1, perPage = 20, sort = 'games', search } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0

    const query = db
      .from('players as p')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .leftJoin('organizations as o', 't.org_id', 'o.org_id')
      .join('lol_accounts as a', 'p.player_id', 'a.player_id')
      .join('lol_daily_stats as ds', (q) => {
        q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      })
      .groupBy('p.player_id', 't.team_id', 'o.org_id', 'pc.role')

    if (leagueFilter) {
      query.whereIn('t.league', leagueFilter)
    }

    if (roleFilter) {
      query.whereIn('pc.role', roleFilter)
    }

    if (search) {
      query.whereILike('p.current_pseudo', `%${search}%`)
    }

    if (minGamesVal > 0) {
      query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
    }

    // Count - use a subquery approach for minGames filter
    let total: number
    if (minGamesVal > 0) {
      const playersWithMinGames = await db
        .from('players as p')
        .leftJoin('player_contracts as pc', (q) => {
          q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
        })
        .leftJoin('teams as t', 'pc.team_id', 't.team_id')
        .join('lol_accounts as a', 'p.player_id', 'a.player_id')
        .join('lol_daily_stats as ds', (q) => {
          q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
        })
        .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
        .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))
        .if(search, (q) => q.whereILike('p.current_pseudo', `%${search}%`))
        .groupBy('p.player_id')
        .havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
        .select('p.player_id')

      total = playersWithMinGames.length
    } else {
      const countQuery = await db
        .from('players as p')
        .leftJoin('player_contracts as pc', (q) => {
          q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
        })
        .leftJoin('teams as t', 'pc.team_id', 't.team_id')
        .join('lol_accounts as a', 'p.player_id', 'a.player_id')
        .join('lol_daily_stats as ds', (q) => {
          q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
        })
        .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
        .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))
        .if(search, (q) => q.whereILike('p.current_pseudo', `%${search}%`))
        .countDistinct('p.player_id as count')

      total = Number(countQuery[0]?.count || 0)
    }

    const offset = (Number(page) - 1) * Number(perPage)

    const players = await query
      .select(
        'p.player_id',
        'p.slug',
        'p.current_pseudo',
        't.team_id',
        't.slug as team_slug',
        't.short_name',
        'o.logo_url',
        't.region',
        't.league',
        'pc.role',
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration')
      )
      .orderBy(sort === 'winrate' ? 'wins' : 'games', 'desc')
      .limit(Number(perPage))
      .offset(offset)

    // Fetch accounts for all players in one query
    const playerIds = players.map((p) => p.player_id)

    const accountsData = playerIds.length > 0
      ? await db
          .from('lol_accounts as a')
          .leftJoin('lol_daily_stats as ds', (q) => {
            q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
          })
          .leftJoin('lol_current_ranks as r', (q) => {
            q.on('r.puuid', 'a.puuid').andOnVal('r.queue_type', '=', 'RANKED_SOLO_5x5')
          })
          .whereIn('a.player_id', playerIds)
          .groupBy('a.puuid', 'a.player_id', 'a.game_name', 'a.tag_line', 'a.region', 'r.tier', 'r.rank', 'r.league_points')
          .select(
            'a.puuid',
            'a.player_id',
            'a.game_name',
            'a.tag_line',
            'a.region',
            'r.tier',
            'r.rank',
            'r.league_points as lp',
            db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
            db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
          )
          .orderBy('games', 'desc')
      : []

    // Group accounts by player_id
    const accountsByPlayer = new Map<number, typeof accountsData>()
    for (const account of accountsData) {
      const playerAccounts = accountsByPlayer.get(account.player_id) || []
      playerAccounts.push(account)
      accountsByPlayer.set(account.player_id, playerAccounts)
    }

    // Calculate total LP and best tier for each player
    // Seuls les comptes Master+ ont des LP significatifs
    const masterPlusTiers = ['CHALLENGER', 'GRANDMASTER', 'MASTER']
    const playerStats = new Map<number, { totalLp: number; bestTier: string | null; bestRank: string | null; bestLp: number }>()
    for (const [playerId, accounts] of accountsByPlayer) {
      let totalLp = 0
      let bestTier: string | null = null
      let bestRank: string | null = null
      let bestLp = 0
      const tierOrder = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON']

      for (const acc of accounts) {
        const isMasterPlus = acc.tier && masterPlusTiers.includes(acc.tier.toUpperCase())
        // LP = 0 si le compte n'est pas Master+
        const accLp = isMasterPlus ? (acc.lp || 0) : 0
        totalLp += accLp
        if (acc.tier) {
          const accTierIndex = tierOrder.indexOf(acc.tier.toUpperCase())
          const bestTierIndex = bestTier ? tierOrder.indexOf(bestTier.toUpperCase()) : 999
          if (accTierIndex < bestTierIndex || (accTierIndex === bestTierIndex && accLp > bestLp)) {
            bestTier = acc.tier
            bestRank = acc.rank
            bestLp = accLp
          }
        }
      }
      playerStats.set(playerId, { totalLp, bestTier, bestRank, bestLp })
    }

    const data = players.map((player, index) => {
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
        gamesChange: 0,
        winrate: player.games > 0 ? Math.round((player.wins / player.games) * 1000) / 10 : 0,
        winrateChange: 0,
        totalMinutes: Math.round(player.total_duration / 60),
        totalMinutesChange: 0,
        tier: stats?.bestTier || null,
        rank_division: stats?.bestRank || null,
        lp: stats?.bestLp || 0,
        totalLp: stats?.totalLp || 0,
        totalLpChange: 0,
        accounts: (accountsByPlayer.get(player.player_id) || []).map((acc) => {
          const isMasterPlus = acc.tier && masterPlusTiers.includes(acc.tier.toUpperCase())
          const accountLp = isMasterPlus ? (acc.lp || 0) : 0
          return {
            puuid: acc.puuid,
            gameName: acc.game_name,
            tagLine: acc.tag_line,
            region: acc.region,
            tier: acc.tier,
            rank: acc.rank,
            lp: accountLp,
            totalLp: accountLp,
            games: acc.games,
            wins: acc.wins,
            winrate: acc.games > 0 ? Math.round((acc.wins / acc.games) * 1000) / 10 : 0,
          }
        }),
      }
    })

    return ctx.response.ok({
      data,
      meta: {
        total: Number(total),
        perPage: Number(perPage),
        currentPage: Number(page),
        lastPage: Math.ceil(Number(total) / Number(perPage)),
      },
    })
  }

  /**
   * GET /api/v1/lol/dashboard/top-grinders
   */
  async topGrinders(ctx: HttpContext) {
    const { start, end } = this.getDateRange(ctx)
    const { leagues, roles, minGames, limit = 5 } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0

    const query = db
      .from('players as p')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .join('lol_accounts as a', 'p.player_id', 'a.player_id')
      .join('lol_daily_stats as ds', (q) => {
        q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      })
      .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
      .if(roleFilter, (q) => q.whereIn('pc.role', roleFilter!))

    if (minGamesVal > 0) {
      query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
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
      .orderBy('games', 'desc')
      .limit(Number(limit))

    const data = players.map((p, index) => ({
      rank: index + 1,
      player: {
        playerId: p.player_id,
        pseudo: p.current_pseudo,
        slug: p.slug,
      },
      team: {
        shortName: p.short_name || 'N/A',
        slug: p.team_slug || '',
      },
      role: p.role || 'Unknown',
      games: p.games,
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/lol/dashboard/streaks
   */
  async streaks(ctx: HttpContext) {
    const { leagues, limit = 5 } = ctx.request.qs()
    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null

    const streaks = await db
      .from('lol_streaks as s')
      .join('lol_accounts as a', 's.puuid', 'a.puuid')
      .join('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .where('s.current_streak', '>', 0)
      .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
      .groupBy('p.player_id', 't.slug', 't.short_name')
      .select(
        'p.player_id',
        'p.slug',
        'p.current_pseudo',
        't.slug as team_slug',
        't.short_name',
        db.raw('MAX(s.current_streak)::int as streak')
      )
      .orderBy('streak', 'desc')
      .limit(Number(limit))

    const data = streaks.map((s, index) => ({
      rank: index + 1,
      player: {
        playerId: s.player_id,
        pseudo: s.current_pseudo,
        slug: s.slug,
      },
      team: {
        shortName: s.short_name || 'N/A',
        slug: s.team_slug || '',
      },
      streak: s.streak,
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/lol/dashboard/loss-streaks
   */
  async lossStreaks(ctx: HttpContext) {
    const { leagues, limit = 5 } = ctx.request.qs()
    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null

    const streaks = await db
      .from('lol_streaks as s')
      .join('lol_accounts as a', 's.puuid', 'a.puuid')
      .join('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .where('s.current_streak', '<', 0)
      .if(leagueFilter, (q) => q.whereIn('t.league', leagueFilter!))
      .groupBy('p.player_id', 't.slug', 't.short_name')
      .select(
        'p.player_id',
        'p.slug',
        'p.current_pseudo',
        't.slug as team_slug',
        't.short_name',
        db.raw('MIN(s.current_streak)::int as streak')
      )
      .orderBy('streak', 'asc')
      .limit(Number(limit))

    const data = streaks.map((s, index) => ({
      rank: index + 1,
      player: {
        playerId: s.player_id,
        pseudo: s.current_pseudo,
        slug: s.slug,
      },
      team: {
        shortName: s.short_name || 'N/A',
        slug: s.team_slug || '',
      },
      streak: Math.abs(s.streak),
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/lol/dashboard/team-history
   */
  async teamHistory(ctx: HttpContext) {
    const { start, end, period } = this.getDateRange(ctx)
    const { teamId } = ctx.request.qs()

    if (!teamId) {
      return ctx.response.badRequest({ error: 'teamId is required' })
    }

    const dailyStats = await db
      .from('lol_daily_stats as ds')
      .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .join('player_contracts as pc', (q) => {
        q.on('a.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .where('pc.team_id', teamId)
      .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      .groupBy('ds.date')
      .select(
        'ds.date',
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
      )
      .orderBy('ds.date', 'asc')

    const data = dailyStats.map((d) => ({
      date: d.date,
      label: this.formatLabelForPeriod(d.date, period),
      games: d.games,
      wins: d.wins,
      winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
      totalLp: 0,
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/lol/dashboard/player-history
   */
  async playerHistory(ctx: HttpContext) {
    const { start, end, period } = this.getDateRange(ctx)
    const { playerId } = ctx.request.qs()

    if (!playerId) {
      return ctx.response.badRequest({ error: 'playerId is required' })
    }

    const dailyStats = await db
      .from('lol_daily_stats as ds')
      .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .where('a.player_id', playerId)
      .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      .groupBy('ds.date')
      .select(
        'ds.date',
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
      )
      .orderBy('ds.date', 'asc')

    const data = dailyStats.map((d) => ({
      date: d.date,
      label: this.formatLabelForPeriod(d.date, period),
      games: d.games,
      wins: d.wins,
      winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
      totalLp: 0,
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/lol/dashboard/leagues
   */
  async leagues(ctx: HttpContext) {
    const leagues = await League.query().where('isActive', true).orderBy('tier', 'asc')

    return ctx.response.ok({
      data: leagues.map((l) => ({
        leagueId: l.leagueId,
        name: l.name,
        shortName: l.shortName,
        region: l.region,
      })),
    })
  }

  /**
   * GET /api/v1/lol/dashboard/splits
   */
  async splits(ctx: HttpContext) {
    const splits = await Split.query().orderBy('startDate', 'desc').limit(10)

    return ctx.response.ok({
      data: splits.map((s) => ({
        split_id: s.splitId,
        season: s.season,
        split_number: s.splitNumber,
        name: s.name,
        start_date: s.startDate.toISODate(),
        end_date: s.endDate.toISODate(),
      })),
    })
  }
}
