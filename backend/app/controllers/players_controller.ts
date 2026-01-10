import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Player from '#models/player'

export default class PlayersController {
  /**
   * Helper to get date range based on period
   */
  private getDateRange(ctx: HttpContext) {
    const { period = 'month', startDate, endDate, offset = 0 } = ctx.request.qs()

    let start: DateTime
    let end: DateTime = DateTime.now()

    switch (period) {
      case 'day':
        start = end.minus({ days: Number(offset) }).startOf('day')
        end = start.endOf('day')
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
        start = startDate ? DateTime.fromISO(startDate) : end.minus({ days: 30 })
        end = endDate ? DateTime.fromISO(endDate) : DateTime.now()
        break
      default:
        start = end.minus({ months: 1 })
    }

    return { start, end, period }
  }

  /**
   * GET /api/v1/players/:slug/profile
   */
  async profile(ctx: HttpContext) {
    const { slug } = ctx.params
    const { start, end, period } = this.getDateRange(ctx)

    const player = await Player.query()
      .where('slug', slug)
      .preload('contracts', (q) => {
        q.whereNull('endDate').preload('team', (t) => t.preload('organization'))
      })
      .firstOrFail()

    const contract = player.contracts[0]
    const team = contract?.team

    // Get aggregated stats for the period
    const [stats] = await db
      .from('lol_daily_stats as ds')
      .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
      .where('a.player_id', player.playerId)
      .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
      .select(
        db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
        db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
        db.raw('COALESCE(SUM(ds.total_game_duration), 0)::int as total_duration'),
        db.raw('COALESCE(SUM(ds.total_kills), 0)::int as total_kills'),
        db.raw('COALESCE(SUM(ds.total_deaths), 0)::int as total_deaths'),
        db.raw('COALESCE(SUM(ds.total_assists), 0)::int as total_assists')
      )

    // Get current rank from primary account
    const [rank] = await db
      .from('lol_current_ranks as r')
      .join('lol_accounts as a', 'r.puuid', 'a.puuid')
      .where('a.player_id', player.playerId)
      .where('a.is_primary', true)
      .where('r.queue_type', 'RANKED_SOLO_5x5')
      .select('r.tier', 'r.rank', 'r.league_points', 'r.wins', 'r.losses')

    // Calculate total LP across all accounts
    const [{ total_lp = 0 }] = await db
      .from('lol_current_ranks as r')
      .join('lol_accounts as a', 'r.puuid', 'a.puuid')
      .where('a.player_id', player.playerId)
      .where('r.queue_type', 'RANKED_SOLO_5x5')
      .select(db.raw('COALESCE(SUM(r.league_points), 0)::int as total_lp'))

    return ctx.response.ok({
      player: {
        playerId: player.playerId,
        slug: player.slug,
        pseudo: player.currentPseudo,
        team: team
          ? {
              teamId: team.teamId,
              name: team.currentName,
              shortName: team.shortName,
              slug: team.slug,
              region: team.region,
            }
          : null,
        role: contract?.role || null,
      },
      period,
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      stats: stats?.games
        ? {
            games: stats.games,
            wins: stats.wins,
            winrate: stats.games > 0 ? Math.round((stats.wins / stats.games) * 1000) / 10 : 0,
            gamesChange: 0,
            winrateChange: 0,
            totalDuration: stats.total_duration,
            avgKills:
              stats.games > 0 ? Math.round((stats.total_kills / stats.games) * 10) / 10 : 0,
            avgDeaths:
              stats.games > 0 ? Math.round((stats.total_deaths / stats.games) * 10) / 10 : 0,
            avgAssists:
              stats.games > 0 ? Math.round((stats.total_assists / stats.games) * 10) / 10 : 0,
          }
        : null,
      rank: rank
        ? {
            tier: rank.tier,
            rank: rank.rank,
            lp: rank.league_points,
            wins: rank.wins,
            losses: rank.losses,
          }
        : null,
      totalLp: total_lp,
      ranking: null,
    })
  }

  /**
   * GET /api/v1/players/:slug/play-hours
   */
  async playHours(ctx: HttpContext) {
    const { slug } = ctx.params
    const { start, end, period } = this.getDateRange(ctx)
    const { groupBy = 'hour' } = ctx.request.qs()

    const player = await Player.query().where('slug', slug).firstOrFail()

    const query = db
      .from('lol_match_stats as ms')
      .join('lol_matches as m', 'ms.match_id', 'm.match_id')
      .join('lol_accounts as a', 'ms.puuid', 'a.puuid')
      .where('a.player_id', player.playerId)
      .whereBetween('m.game_start', [start.toISO()!, end.toISO()!])

    let data

    if (groupBy === 'weekday-hour') {
      const results = await query
        .select(
          db.raw('EXTRACT(DOW FROM m.game_start)::int as dow'),
          db.raw('EXTRACT(HOUR FROM m.game_start)::int as hour'),
          db.raw('COUNT(*)::int as games'),
          db.raw('SUM(CASE WHEN ms.win THEN 1 ELSE 0 END)::int as wins')
        )
        .groupByRaw('EXTRACT(DOW FROM m.game_start), EXTRACT(HOUR FROM m.game_start)')
        .orderBy('dow')
        .orderBy('hour')

      // Create 7x24 matrix
      const matrix: { dow: number; hour: number; games: number; wins: number; winrate: number }[][] =
        Array.from({ length: 7 }, () => [])

      for (let dow = 0; dow < 7; dow++) {
        for (let hour = 0; hour < 24; hour++) {
          const found = results.find((r) => r.dow === dow && r.hour === hour)
          matrix[dow].push({
            dow,
            hour,
            games: found?.games || 0,
            wins: found?.wins || 0,
            winrate: found?.games ? Math.round((found.wins / found.games) * 1000) / 10 : 0,
          })
        }
      }

      data = matrix
    } else {
      const results = await query
        .select(
          db.raw('EXTRACT(HOUR FROM m.game_start)::int as hour'),
          db.raw('COUNT(*)::int as games'),
          db.raw('SUM(CASE WHEN ms.win THEN 1 ELSE 0 END)::int as wins')
        )
        .groupByRaw('EXTRACT(HOUR FROM m.game_start)')
        .orderBy('hour')

      data = Array.from({ length: 24 }, (_, hour) => {
        const found = results.find((r) => r.hour === hour)
        return {
          hour,
          games: found?.games || 0,
          wins: found?.wins || 0,
          winrate: found?.games ? Math.round((found.wins / found.games) * 1000) / 10 : 0,
        }
      })
    }

    return ctx.response.ok({
      player: { slug: player.slug, pseudo: player.currentPseudo },
      period,
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      groupBy,
      data,
    })
  }

  /**
   * GET /api/v1/players/:slug/duos
   */
  async duos(ctx: HttpContext) {
    const { slug } = ctx.params
    const { limit = 10 } = ctx.request.qs()

    const player = await Player.query().where('slug', slug).firstOrFail()

    // Get player's puuids
    const accounts = await db
      .from('lol_accounts')
      .where('player_id', player.playerId)
      .select('puuid')

    const puuids = accounts.map((a) => a.puuid)

    if (puuids.length === 0) {
      return ctx.response.ok({
        player: { slug: player.slug, pseudo: player.currentPseudo },
        duos: [],
        winAgainst: [],
        loseAgainst: [],
      })
    }

    // Find teammates (same team in match)
    const duos = await db
      .from('lol_match_stats as ms1')
      .join('lol_match_stats as ms2', (q) => {
        q.on('ms1.match_id', 'ms2.match_id')
          .andOn('ms1.team_id', 'ms2.team_id')
      })
      .whereRaw('ms1.puuid <> ms2.puuid')
      .join('lol_accounts as a', 'ms2.puuid', 'a.puuid')
      .leftJoin('players as p', 'a.player_id', 'p.player_id')
      .leftJoin('player_contracts as pc', (q) => {
        q.on('p.player_id', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', 't.team_id')
      .whereIn('ms1.puuid', puuids)
      .groupBy('ms2.puuid', 'a.game_name', 'a.tag_line', 'p.player_id', 'p.slug', 'p.current_pseudo', 't.short_name')
      .select(
        'ms2.puuid',
        'a.game_name',
        'a.tag_line',
        'p.player_id',
        'p.slug',
        'p.current_pseudo',
        't.short_name as team_name',
        db.raw('COUNT(*)::int as games'),
        db.raw('SUM(CASE WHEN ms1.win THEN 1 ELSE 0 END)::int as wins')
      )
      .orderBy('games', 'desc')
      .limit(Number(limit))

    return ctx.response.ok({
      player: { slug: player.slug, pseudo: player.currentPseudo },
      duos: duos.map((d) => ({
        puuid: d.puuid,
        gameName: d.game_name,
        tagLine: d.tag_line,
        player: d.player_id
          ? {
              playerId: d.player_id,
              slug: d.slug,
              pseudo: d.current_pseudo,
            }
          : null,
        team: d.team_name,
        games: d.games,
        wins: d.wins,
        winrate: d.games > 0 ? Math.round((d.wins / d.games) * 1000) / 10 : 0,
      })),
      winAgainst: [],
      loseAgainst: [],
    })
  }

  /**
   * GET /api/v1/players/:slug/champions
   */
  async champions(ctx: HttpContext) {
    const { slug } = ctx.params
    const { limit = 10 } = ctx.request.qs()

    const player = await Player.query().where('slug', slug).firstOrFail()

    const champions = await db
      .from('lol_champion_stats as cs')
      .join('lol_accounts as a', 'cs.puuid', 'a.puuid')
      .where('a.player_id', player.playerId)
      .groupBy('cs.champion_id')
      .select(
        'cs.champion_id',
        db.raw('SUM(cs.games_played)::int as games'),
        db.raw('SUM(cs.wins)::int as wins'),
        db.raw('SUM(cs.total_kills)::int as total_kills'),
        db.raw('SUM(cs.total_deaths)::int as total_deaths'),
        db.raw('SUM(cs.total_assists)::int as total_assists'),
        db.raw('SUM(cs.total_cs)::int as total_cs'),
        db.raw('SUM(cs.total_damage)::bigint as total_damage')
      )
      .orderBy('games', 'desc')
      .limit(Number(limit))

    return ctx.response.ok({
      player: { slug: player.slug, pseudo: player.currentPseudo },
      stats: champions.map((c) => ({
        championId: c.champion_id,
        games: c.games,
        wins: c.wins,
        winrate: c.games > 0 ? Math.round((c.wins / c.games) * 1000) / 10 : 0,
        avgKills: c.games > 0 ? Math.round((c.total_kills / c.games) * 10) / 10 : 0,
        avgDeaths: c.games > 0 ? Math.round((c.total_deaths / c.games) * 10) / 10 : 0,
        avgAssists: c.games > 0 ? Math.round((c.total_assists / c.games) * 10) / 10 : 0,
        avgCs: c.games > 0 ? Math.round(c.total_cs / c.games) : 0,
        avgDamage: c.games > 0 ? Math.round(Number(c.total_damage) / c.games) : 0,
        avgKp: null,
        avgDmgShare: null,
      })),
    })
  }

  /**
   * GET /api/v1/players/:slug/compare/:compareSlug
   */
  async compare(ctx: HttpContext) {
    const { slug, compareSlug } = ctx.params
    const { start, end, period } = this.getDateRange(ctx)

    const [player1, player2] = await Promise.all([
      Player.query().where('slug', slug).firstOrFail(),
      Player.query().where('slug', compareSlug).firstOrFail(),
    ])

    const getPlayerStats = async (playerId: number) => {
      const [stats] = await db
        .from('lol_daily_stats as ds')
        .join('lol_accounts as a', 'ds.puuid', 'a.puuid')
        .where('a.player_id', playerId)
        .whereBetween('ds.date', [start.toSQLDate()!, end.toSQLDate()!])
        .select(
          db.raw('COALESCE(SUM(ds.games_played), 0)::int as games'),
          db.raw('COALESCE(SUM(ds.wins), 0)::int as wins'),
          db.raw('COALESCE(SUM(ds.total_kills), 0)::int as total_kills'),
          db.raw('COALESCE(SUM(ds.total_deaths), 0)::int as total_deaths'),
          db.raw('COALESCE(SUM(ds.total_assists), 0)::int as total_assists')
        )

      const [{ total_lp = 0 }] = await db
        .from('lol_current_ranks as r')
        .join('lol_accounts as a', 'r.puuid', 'a.puuid')
        .where('a.player_id', playerId)
        .where('r.queue_type', 'RANKED_SOLO_5x5')
        .select(db.raw('COALESCE(SUM(r.league_points), 0)::int as total_lp'))

      const playHours = await db
        .from('lol_match_stats as ms')
        .join('lol_matches as m', 'ms.match_id', 'm.match_id')
        .join('lol_accounts as a', 'ms.puuid', 'a.puuid')
        .where('a.player_id', playerId)
        .whereBetween('m.game_start', [start.toISO()!, end.toISO()!])
        .select(
          db.raw('EXTRACT(HOUR FROM m.game_start)::int as hour'),
          db.raw('COUNT(*)::int as games')
        )
        .groupByRaw('EXTRACT(HOUR FROM m.game_start)')

      return {
        stats,
        totalLp: total_lp,
        playHours,
      }
    }

    const [data1, data2] = await Promise.all([
      getPlayerStats(player1.playerId),
      getPlayerStats(player2.playerId),
    ])

    const formatPlayerData = (player: Player, data: Awaited<ReturnType<typeof getPlayerStats>>) => ({
      slug: player.slug,
      pseudo: player.currentPseudo,
      team: null,
      stats: {
        games: data.stats?.games || 0,
        wins: data.stats?.wins || 0,
        winrate:
          data.stats?.games > 0
            ? Math.round((data.stats.wins / data.stats.games) * 1000) / 10
            : 0,
        avgKills:
          data.stats?.games > 0
            ? Math.round((data.stats.total_kills / data.stats.games) * 10) / 10
            : 0,
        avgDeaths:
          data.stats?.games > 0
            ? Math.round((data.stats.total_deaths / data.stats.games) * 10) / 10
            : 0,
        avgAssists:
          data.stats?.games > 0
            ? Math.round((data.stats.total_assists / data.stats.games) * 10) / 10
            : 0,
        totalLp: data.totalLp,
      },
      playHours: data.playHours.map((h) => ({ hour: h.hour, games: h.games })),
    })

    return ctx.response.ok({
      period,
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      players: [formatPlayerData(player1, data1), formatPlayerData(player2, data2)],
    })
  }
}
