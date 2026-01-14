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
    const { period = 'day', startDate, endDate, date } = ctx.request.qs()

    let start: DateTime
    // Si une date de référence est fournie, l'utiliser, sinon utiliser maintenant
    let end: DateTime = date ? DateTime.fromISO(date) : DateTime.now()

    switch (period) {
      case 'day':
        // 7 derniers jours à partir de la date de référence
        end = end.endOf('day')
        start = end.minus({ days: 6 }).startOf('day')
        break
      case 'month':
        start = end.startOf('month')
        end = end.endOf('month')
        break
      case 'year':
        start = end.startOf('year')
        end = end.endOf('year')
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

    // Ajouter le LEFT JOIN pour les LP d'équipe (uniquement Master+)
    query.joinRaw(`
      LEFT JOIN (
        SELECT lp_pc.team_id as lp_team_id, COALESCE(SUM(latest_rank.lp), 0)::int as total_lp
        FROM player_contracts as lp_pc
        JOIN lol_accounts as lp_acc ON lp_pc.player_id = lp_acc.player_id
        JOIN (
          SELECT DISTINCT ON (puuid) puuid, tier, lp
          FROM lol_daily_stats
          WHERE date <= ? AND date >= ?
          ORDER BY puuid, date DESC
        ) as latest_rank ON lp_acc.puuid = latest_rank.puuid
        WHERE lp_pc.end_date IS NULL
        AND latest_rank.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
        GROUP BY lp_pc.team_id
      ) as team_lp_stats ON t.team_id = team_lp_stats.lp_team_id
    `, [end.toSQLDate()!, start.toSQLDate()!])

    // Determine sort column
    let sortColumn = 'games'
    if (sort === 'lp') sortColumn = 'total_lp'
    else if (sort === 'winrate') sortColumn = 'winrate_calc'

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
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration'),
        db.raw('COALESCE(MAX(team_lp_stats.total_lp), 0)::int as total_lp'),
        db.raw('CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0 THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played) ELSE 0 END as winrate_calc')
      )
      .orderBy(sortColumn, 'desc')
      .limit(Number(perPage))
      .offset(offset)

    // Fetch players for all teams in one query
    const teamIds = teams.map((t) => t.team_id)

    // 1. Récupérer les joueurs des équipes (sans stats)
    const playersRaw = teamIds.length > 0
      ? await db
          .from('players as p')
          .join('player_contracts as pc', (q) => {
            q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
          })
          .whereIn('pc.team_id', teamIds)
          .select(
            'p.player_id',
            'p.slug',
            'p.current_pseudo',
            'pc.team_id',
            'pc.role'
          )
          .orderByRaw("CASE pc.role WHEN 'TOP' THEN 1 WHEN 'JGL' THEN 2 WHEN 'MID' THEN 3 WHEN 'ADC' THEN 4 WHEN 'SUP' THEN 5 ELSE 6 END")
      : []

    // 2. Récupérer tous les comptes des joueurs
    const playerIds = playersRaw.map((p) => p.player_id)
    const accountsData = playerIds.length > 0
      ? await db
          .from('lol_accounts')
          .whereIn('player_id', playerIds)
          .select('puuid', 'player_id')
      : []

    // 3. Récupérer les stats agrégées par joueur (cumulées de tous les comptes)
    const puuids = accountsData.map((a) => a.puuid)
    const statsData = puuids.length > 0
      ? await db
          .from('lol_daily_stats as ds')
          .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
          .whereIn('ds.puuid', puuids)
          .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
          .groupBy('a.player_id')
          .select(
            'a.player_id',
            db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
            db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
          )
      : []

    // 4. Créer une map player_id -> stats
    const statsByPlayer = new Map(statsData.map((s) => [s.player_id, { games: s.games, wins: s.wins }]))

    // 5. Récupérer les LP du dernier jour de la période depuis lol_daily_stats
    const latestRanks = puuids.length > 0
      ? await db
          .from('lol_daily_stats')
          .distinctOn('puuid')
          .whereIn('puuid', puuids)
          .where('date', '<=', end.toSQLDate()!)
          .where('date', '>=', start.toSQLDate()!)
          .orderBy('puuid')
          .orderBy('date', 'desc')
          .select('puuid', 'tier', 'rank', 'lp')
      : []

    // 6. Créer une map puuid -> rank data
    const ranksByPuuid = new Map(latestRanks.map((r) => [r.puuid, r]))

    // 7. Grouper les comptes par player_id et calculer le meilleur rang
    const tierOrder = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON']
    const masterPlusTiers = ['MASTER', 'GRANDMASTER', 'CHALLENGER']

    const bestRankByPlayer = new Map<number, { tier: string | null; rank: string | null; lp: number }>()
    for (const acc of accountsData) {
      const rankData = ranksByPuuid.get(acc.puuid)
      if (!rankData) continue

      const accTier = rankData.tier || null
      const accRank = rankData.rank || null
      const isMasterPlus = accTier && masterPlusTiers.includes(accTier.toUpperCase())
      const accLp = isMasterPlus ? (rankData.lp || 0) : 0

      const current = bestRankByPlayer.get(acc.player_id)
      if (!current) {
        bestRankByPlayer.set(acc.player_id, { tier: accTier, rank: accRank, lp: accLp })
      } else if (accTier) {
        const accTierIndex = tierOrder.indexOf(accTier.toUpperCase())
        const currentTierIndex = current.tier ? tierOrder.indexOf(current.tier.toUpperCase()) : 999
        // Meilleur = tier plus haut, ou même tier avec plus de LP
        if (accTierIndex < currentTierIndex || (accTierIndex === currentTierIndex && accLp > current.lp)) {
          bestRankByPlayer.set(acc.player_id, { tier: accTier, rank: accRank, lp: accLp })
        }
      }
    }

    // Group players by team_id
    const playersByTeam = new Map<number, typeof playersRaw>()
    for (const player of playersRaw) {
      const teamPlayers = playersByTeam.get(player.team_id) || []
      teamPlayers.push(player)
      playersByTeam.set(player.team_id, teamPlayers)
    }

    const data = teams.map((team, index) => {
      const teamPlayers = playersByTeam.get(team.team_id) || []

      // Calcul du totalLp : somme des LP du meilleur compte de chaque joueur Master+
      const teamTotalLp = teamPlayers.reduce((sum, p) => {
        const best = bestRankByPlayer.get(p.player_id)
        return sum + (best?.lp || 0)
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
          const best = bestRankByPlayer.get(p.player_id)
          const stats = statsByPlayer.get(p.player_id)
          const games = stats?.games || 0
          const wins = stats?.wins || 0
          return {
            playerId: p.player_id,
            slug: p.slug,
            pseudo: p.current_pseudo,
            role: p.role || 'Unknown',
            games,
            winrate: games > 0 ? Math.round((wins / games) * 1000) / 10 : -1,
            tier: best?.tier || null,
            rank: best?.rank || null,
            lp: best?.lp || 0,
            totalLp: best?.lp || 0,
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

    // Ajouter le LEFT JOIN pour les LP (uniquement Master+)
    query.joinRaw(`
      LEFT JOIN (
        SELECT lp_acc.player_id as lp_player_id, COALESCE(SUM(latest_rank.lp), 0)::int as total_lp
        FROM lol_accounts as lp_acc
        JOIN (
          SELECT DISTINCT ON (puuid) puuid, tier, lp
          FROM lol_daily_stats
          WHERE date <= ? AND date >= ?
          ORDER BY puuid, date DESC
        ) as latest_rank ON lp_acc.puuid = latest_rank.puuid
        WHERE latest_rank.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
        GROUP BY lp_acc.player_id
      ) as lp_stats ON p.player_id = lp_stats.lp_player_id
    `, [end.toSQLDate()!, start.toSQLDate()!])

    // Determine sort column
    let playerSortColumn = 'games'
    if (sort === 'lp') playerSortColumn = 'total_lp'
    else if (sort === 'winrate') playerSortColumn = 'winrate_calc'

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
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration'),
        db.raw('COALESCE(MAX(lp_stats.total_lp), 0)::int as total_lp'),
        db.raw('CASE WHEN COALESCE(SUM(ds.games_played), 0) > 0 THEN COALESCE(SUM(ds.wins), 0)::float / SUM(ds.games_played) ELSE 0 END as winrate_calc')
      )
      .orderBy(playerSortColumn, 'desc')
      .limit(Number(perPage))
      .offset(offset)

    // Fetch accounts for all players in one query
    const playerIds = players.map((p) => p.player_id)

    // 1. Récupérer les stats de jeux (games, wins)
    const accountsData = playerIds.length > 0
      ? await db
          .from('lol_accounts as a')
          .leftJoin('lol_daily_stats as ds', (q) => {
            q.on('ds.puuid', 'a.puuid').andOnBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
          })
          .whereIn('a.player_id', playerIds)
          .groupBy('a.puuid', 'a.player_id', 'a.game_name', 'a.tag_line', 'a.region')
          .select(
            'a.puuid',
            'a.player_id',
            'a.game_name',
            'a.tag_line',
            'a.region',
            db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
            db.raw('COALESCE(SUM(ds.wins), 0)::int as wins')
          )
          .orderBy('games', 'desc')
      : []

    // 2. Récupérer les LP du dernier jour de la période depuis lol_daily_stats
    const puuids = accountsData.map((a) => a.puuid)
    const latestRanks = puuids.length > 0
      ? await db
          .from('lol_daily_stats')
          .distinctOn('puuid')
          .whereIn('puuid', puuids)
          .where('date', '<=', end.toSQLDate()!)
          .where('date', '>=', start.toSQLDate()!)
          .orderBy('puuid')
          .orderBy('date', 'desc')
          .select('puuid', 'tier', 'rank', 'lp')
      : []

    // 3. Créer une map pour accès rapide aux rangs
    const ranksByPuuid = new Map(latestRanks.map((r) => [r.puuid, r]))

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
        // Récupérer tier/rank/lp depuis la map des rangs historiques
        const rankData = ranksByPuuid.get(acc.puuid)
        const accTier = rankData?.tier || null
        const accRank = rankData?.rank || null
        const accLpRaw = rankData?.lp || 0

        const isMasterPlus = accTier && masterPlusTiers.includes(accTier.toUpperCase())
        // LP = 0 si le compte n'est pas Master+
        const accLp = isMasterPlus ? accLpRaw : 0
        totalLp += accLp
        if (accTier) {
          const accTierIndex = tierOrder.indexOf(accTier.toUpperCase())
          const bestTierIndex = bestTier ? tierOrder.indexOf(bestTier.toUpperCase()) : 999
          if (accTierIndex < bestTierIndex || (accTierIndex === bestTierIndex && accLp > bestLp)) {
            bestTier = accTier
            bestRank = accRank
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
          // Récupérer tier/rank/lp depuis la map des rangs historiques
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
    const { leagues, roles, minGames, limit = 5, sort = 'desc', viewMode = 'players' } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0
    const limitVal = Math.min(Number(limit), 10)
    const sortDir = sort === 'asc' ? 'asc' : 'desc'

    if (viewMode === 'teams') {
      // Team mode: aggregate games per team
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
        .groupBy('t.team_id', 't.slug', 't.current_name', 't.short_name', 'o.logo_url')

      if (leagueFilter) {
        query.whereIn('t.league', leagueFilter)
      }

      if (roleFilter) {
        query.whereIn('pc.role', roleFilter)
      }

      if (minGamesVal > 0) {
        query.havingRaw('COALESCE(SUM(ds.games_played), 0) >= ?', [minGamesVal])
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
        .limit(limitVal)

      const data = teams.map((t, index) => ({
        rank: index + 1,
        entity: {
          id: t.team_id,
          slug: t.slug,
          name: t.current_name,
          shortName: t.short_name,
          logoUrl: t.logo_url,
        },
        entityType: 'team',
        games: t.games,
      }))

      return ctx.response.ok({ data })
    } else {
      // Player mode (default)
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
        .orderBy('games', sortDir)
        .limit(limitVal)

      const data = players.map((p, index) => ({
        rank: index + 1,
        entity: {
          id: p.player_id,
          slug: p.slug,
          name: p.current_pseudo,
        },
        entityType: 'player',
        team: p.team_slug ? {
          slug: p.team_slug,
          shortName: p.short_name || 'N/A',
        } : undefined,
        role: p.role || 'Unknown',
        games: p.games,
      }))

      return ctx.response.ok({ data })
    }
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
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
        db.raw("COALESCE(SUM(CASE WHEN ds.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN ds.lp ELSE 0 END), 0)::int as total_lp")
      )
      .orderBy('ds.date', 'asc')

    const data = dailyStats.map((d) => ({
      date: DateTime.fromJSDate(d.date).toISODate(),
      label: this.formatLabelForPeriod(d.date, period),
      games: d.games,
      wins: d.wins,
      winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
      totalLp: d.total_lp,
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
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
        db.raw("COALESCE(SUM(CASE WHEN ds.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER') THEN ds.lp ELSE 0 END), 0)::int as total_lp")
      )
      .orderBy('ds.date', 'asc')

    const data = dailyStats.map((d) => ({
      date: DateTime.fromJSDate(d.date).toISODate(),
      label: this.formatLabelForPeriod(d.date, period),
      games: d.games,
      wins: d.wins,
      winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
      totalLp: d.total_lp,
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

  /**
   * GET /api/v1/lol/dashboard/top-lp-gainers
   * Top LP gainers for the period
   */
  async topLpGainers(ctx: HttpContext) {
    const { start, end } = this.getDateRange(ctx)
    const { leagues, roles, minGames, limit = 5, sort = 'desc', viewMode = 'players' } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0
    const limitVal = Math.min(Number(limit), 10)
    const sortDir = sort === 'asc' ? 'asc' : 'desc'

    if (viewMode === 'teams') {
      // Team mode: aggregate LP change per team
      // Build filter conditions safely to avoid SQL injection
      const filters: string[] = ['lp_change > 0']
      const params: (string | number | null)[] = [
        start.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
      ]

      if (leagueFilter?.length) {
        filters.push(`league IN (${leagueFilter.map(() => '?').join(',')})`)
        params.push(...leagueFilter)
      }
      if (roleFilter?.length) {
        filters.push(`role IN (${roleFilter.map(() => '?').join(',')})`)
        params.push(...roleFilter)
      }
      if (minGamesVal > 0) {
        filters.push('games >= ?')
        params.push(minGamesVal)
      }
      params.push(limitVal)

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- LP au premier jour de la période (ou NULL si pas de données Master+ ce jour)
          SELECT ds.puuid, ds.lp as lp_start
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        last_lp AS (
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_end, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date >= ? AND ds.date <= ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        account_lp_change AS (
          SELECT
            a.player_id,
            a.puuid,
            l.lp_end - COALESCE(f.lp_start, 0) as lp_change
          FROM lol_accounts a
          JOIN last_lp l ON a.puuid = l.puuid
          LEFT JOIN first_day_lp f ON a.puuid = f.puuid
        ),
        player_games AS (
          SELECT
            a.player_id,
            SUM(ds.games_played) as games
          FROM lol_accounts a
          JOIN lol_daily_stats ds ON a.puuid = ds.puuid
          WHERE ds.date >= ? AND ds.date <= ?
          GROUP BY a.player_id
        ),
        team_lp AS (
          SELECT
            t.team_id,
            t.slug,
            t.current_name,
            t.short_name,
            t.league,
            pc.role,
            o.logo_url,
            SUM(alc.lp_change) as lp_change,
            SUM(pg.games) as games
          FROM teams t
          JOIN organizations o ON t.org_id = o.org_id
          JOIN player_contracts pc ON t.team_id = pc.team_id AND pc.end_date IS NULL
          JOIN account_lp_change alc ON pc.player_id = alc.player_id
          LEFT JOIN player_games pg ON pc.player_id = pg.player_id
          WHERE t.is_active = true
          GROUP BY t.team_id, t.slug, t.current_name, t.short_name, t.league, pc.role, o.logo_url
        )
        SELECT team_id, slug, current_name, short_name, logo_url, SUM(lp_change) as lp_change, SUM(games) as games
        FROM team_lp
        WHERE ${filters.join(' AND ')}
        GROUP BY team_id, slug, current_name, short_name, logo_url
        ORDER BY lp_change ${sortDir === 'asc' ? 'ASC' : 'DESC'}
        LIMIT ?
      `, params)

      const data = result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        entity: {
          id: row.team_id,
          slug: row.slug,
          name: row.current_name,
          shortName: row.short_name,
          logoUrl: row.logo_url,
        },
        entityType: 'team',
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))

      return ctx.response.ok({ data })
    } else {
      // Player mode
      // Build filter conditions safely to avoid SQL injection
      const filters: string[] = ['lp_change > 0']
      const params: (string | number | null)[] = [
        start.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
      ]

      if (leagueFilter?.length) {
        filters.push(`league IN (${leagueFilter.map(() => '?').join(',')})`)
        params.push(...leagueFilter)
      }
      if (roleFilter?.length) {
        filters.push(`role IN (${roleFilter.map(() => '?').join(',')})`)
        params.push(...roleFilter)
      }
      if (minGamesVal > 0) {
        filters.push('games >= ?')
        params.push(minGamesVal)
      }
      params.push(limitVal)

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- LP au premier jour de la période (ou NULL si pas de données Master+ ce jour)
          SELECT ds.puuid, ds.lp as lp_start
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        last_lp AS (
          SELECT DISTINCT ON (ds.puuid) ds.puuid, ds.lp as lp_end, ds.tier
          FROM lol_daily_stats ds
          WHERE ds.date >= ? AND ds.date <= ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
          ORDER BY ds.puuid, ds.date DESC
        ),
        player_lp AS (
          SELECT
            p.player_id,
            p.slug,
            p.current_pseudo,
            t.slug as team_slug,
            t.short_name as team_short_name,
            t.league,
            pc.role,
            SUM(l.lp_end - COALESCE(f.lp_start, 0)) as lp_change,
            SUM(ds_games.games) as games
          FROM players p
          JOIN lol_accounts a ON p.player_id = a.player_id
          JOIN last_lp l ON a.puuid = l.puuid
          LEFT JOIN first_day_lp f ON a.puuid = f.puuid
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN (
            SELECT puuid, SUM(games_played) as games
            FROM lol_daily_stats
            WHERE date >= ? AND date <= ?
            GROUP BY puuid
          ) ds_games ON a.puuid = ds_games.puuid
          GROUP BY p.player_id, p.slug, p.current_pseudo, t.slug, t.short_name, t.league, pc.role
        )
        SELECT player_id, slug, current_pseudo, team_slug, team_short_name, SUM(lp_change) as lp_change, SUM(games) as games
        FROM player_lp
        WHERE ${filters.join(' AND ')}
        GROUP BY player_id, slug, current_pseudo, team_slug, team_short_name
        ORDER BY lp_change ${sortDir === 'asc' ? 'ASC' : 'DESC'}
        LIMIT ?
      `, params)

      const data = result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        entity: {
          id: row.player_id,
          slug: row.slug,
          name: row.current_pseudo,
        },
        entityType: 'player',
        team: row.team_slug ? {
          slug: row.team_slug,
          shortName: row.team_short_name,
        } : undefined,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))

      return ctx.response.ok({ data })
    }
  }

  /**
   * GET /api/v1/lol/dashboard/top-lp-losers
   * Top LP losers for the period
   */
  async topLpLosers(ctx: HttpContext) {
    const { start, end } = this.getDateRange(ctx)
    const { leagues, roles, minGames, limit = 5, sort = 'desc', viewMode = 'players' } = ctx.request.qs()

    const leagueFilter = leagues ? (Array.isArray(leagues) ? leagues : leagues.split(',')) : null
    const roleFilter = roles ? (Array.isArray(roles) ? roles : roles.split(',')) : null
    const minGamesVal = minGames ? Number(minGames) : 0
    const limitVal = Math.min(Number(limit), 10)
    // For losers: desc = most losses first (most negative), asc = least losses
    const sortDir = sort === 'asc' ? 'desc' : 'asc'

    if (viewMode === 'teams') {
      // Team mode: aggregate LP change per team
      // Build filter conditions safely to avoid SQL injection
      const filters: string[] = ['lp_change < 0']
      const params: (string | number | null)[] = [
        start.toSQLDate(),
        end.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
      ]

      if (leagueFilter?.length) {
        filters.push(`league IN (${leagueFilter.map(() => '?').join(',')})`)
        params.push(...leagueFilter)
      }
      if (roleFilter?.length) {
        filters.push(`role IN (${roleFilter.map(() => '?').join(',')})`)
        params.push(...roleFilter)
      }
      if (minGamesVal > 0) {
        filters.push('games >= ?')
        params.push(minGamesVal)
      }
      params.push(limitVal)

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- LP au premier jour de la période
          SELECT ds.puuid, ds.lp as lp_start
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        last_day_lp AS (
          -- LP au dernier jour de la période (ou NULL si pas de données Master+ ce jour)
          SELECT ds.puuid, ds.lp as lp_end
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        account_lp_change AS (
          SELECT
            a.player_id,
            a.puuid,
            COALESCE(l.lp_end, 0) - f.lp_start as lp_change
          FROM lol_accounts a
          JOIN first_day_lp f ON a.puuid = f.puuid
          LEFT JOIN last_day_lp l ON a.puuid = l.puuid
        ),
        player_games AS (
          SELECT
            a.player_id,
            SUM(ds.games_played) as games
          FROM lol_accounts a
          JOIN lol_daily_stats ds ON a.puuid = ds.puuid
          WHERE ds.date >= ? AND ds.date <= ?
          GROUP BY a.player_id
        ),
        team_lp AS (
          SELECT
            t.team_id,
            t.slug,
            t.current_name,
            t.short_name,
            t.league,
            pc.role,
            o.logo_url,
            SUM(alc.lp_change) as lp_change,
            SUM(pg.games) as games
          FROM teams t
          JOIN organizations o ON t.org_id = o.org_id
          JOIN player_contracts pc ON t.team_id = pc.team_id AND pc.end_date IS NULL
          JOIN account_lp_change alc ON pc.player_id = alc.player_id
          LEFT JOIN player_games pg ON pc.player_id = pg.player_id
          WHERE t.is_active = true
          GROUP BY t.team_id, t.slug, t.current_name, t.short_name, t.league, pc.role, o.logo_url
        )
        SELECT team_id, slug, current_name, short_name, logo_url, SUM(lp_change) as lp_change, SUM(games) as games
        FROM team_lp
        WHERE ${filters.join(' AND ')}
        GROUP BY team_id, slug, current_name, short_name, logo_url
        ORDER BY lp_change ${sortDir === 'asc' ? 'ASC' : 'DESC'}
        LIMIT ?
      `, params)

      const data = result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        entity: {
          id: row.team_id,
          slug: row.slug,
          name: row.current_name,
          shortName: row.short_name,
          logoUrl: row.logo_url,
        },
        entityType: 'team',
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))

      return ctx.response.ok({ data })
    } else {
      // Player mode
      // Build filter conditions safely to avoid SQL injection
      const filters: string[] = ['lp_change < 0']
      const params: (string | number | null)[] = [
        start.toSQLDate(),
        end.toSQLDate(),
        start.toSQLDate(), end.toSQLDate(),
      ]

      if (leagueFilter?.length) {
        filters.push(`league IN (${leagueFilter.map(() => '?').join(',')})`)
        params.push(...leagueFilter)
      }
      if (roleFilter?.length) {
        filters.push(`role IN (${roleFilter.map(() => '?').join(',')})`)
        params.push(...roleFilter)
      }
      if (minGamesVal > 0) {
        filters.push('games >= ?')
        params.push(minGamesVal)
      }
      params.push(limitVal)

      const result = await db.rawQuery(`
        WITH first_day_lp AS (
          -- LP au premier jour de la période
          SELECT ds.puuid, ds.lp as lp_start
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        last_day_lp AS (
          -- LP au dernier jour de la période (ou NULL si pas de données Master+ ce jour)
          SELECT ds.puuid, ds.lp as lp_end
          FROM lol_daily_stats ds
          WHERE ds.date = ?
            AND ds.tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER')
        ),
        player_lp AS (
          SELECT
            p.player_id,
            p.slug,
            p.current_pseudo,
            t.slug as team_slug,
            t.short_name as team_short_name,
            t.league,
            pc.role,
            SUM(COALESCE(l.lp_end, 0) - f.lp_start) as lp_change,
            SUM(ds_games.games) as games
          FROM players p
          JOIN lol_accounts a ON p.player_id = a.player_id
          JOIN first_day_lp f ON a.puuid = f.puuid
          LEFT JOIN last_day_lp l ON a.puuid = l.puuid
          LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
          LEFT JOIN teams t ON pc.team_id = t.team_id
          LEFT JOIN (
            SELECT puuid, SUM(games_played) as games
            FROM lol_daily_stats
            WHERE date >= ? AND date <= ?
            GROUP BY puuid
          ) ds_games ON a.puuid = ds_games.puuid
          GROUP BY p.player_id, p.slug, p.current_pseudo, t.slug, t.short_name, t.league, pc.role
        )
        SELECT player_id, slug, current_pseudo, team_slug, team_short_name, SUM(lp_change) as lp_change, SUM(games) as games
        FROM player_lp
        WHERE ${filters.join(' AND ')}
        GROUP BY player_id, slug, current_pseudo, team_slug, team_short_name
        ORDER BY lp_change ${sortDir === 'asc' ? 'ASC' : 'DESC'}
        LIMIT ?
      `, params)

      const data = result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        entity: {
          id: row.player_id,
          slug: row.slug,
          name: row.current_pseudo,
        },
        entityType: 'player',
        team: row.team_slug ? {
          slug: row.team_slug,
          shortName: row.team_short_name,
        } : undefined,
        lpChange: Number(row.lp_change),
        games: Number(row.games) || 0,
      }))

      return ctx.response.ok({ data })
    }
  }
}
