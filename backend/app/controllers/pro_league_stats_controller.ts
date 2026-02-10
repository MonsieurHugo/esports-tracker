import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { cacheService, CACHE_TTL } from '#services/cache_service'

export default class ProLeagueStatsController {
  /**
   * POST /api/v1/pro/stats/verify-password
   * Verify the shared password for the pro stats page
   */
  async verifyPassword(ctx: HttpContext) {
    const { password } = ctx.request.body()
    const expected = env.get('PRO_STATS_PASSWORD')

    if (!expected) {
      return ctx.response.serviceUnavailable({
        error: 'Password not configured',
      })
    }

    if (!password || typeof password !== 'string') {
      return ctx.response.forbidden({ valid: false })
    }

    const isValid = this.secureCompare(password, expected)

    if (!isValid) {
      return ctx.response.forbidden({ valid: false })
    }

    return ctx.response.ok({ valid: true })
  }

  /**
   * GET /api/v1/pro/stats/records
   * All-time records across leagues
   */
  async records(ctx: HttpContext) {
    const { leagueId } = ctx.request.qs()
    const parsedLeagueId = leagueId ? Number(leagueId) : null

    const cacheKey = `pro:stats:records:${parsedLeagueId || 'all'}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const leagueFilter = parsedLeagueId
        ? `AND t.pro_league_id = ${parsedLeagueId}`
        : ''

      const [
        mostKills,
        bestKda,
        highestCsPerMin,
        mostDamage,
        mostPentaKills,
        fastestWin,
        longestGame,
      ] = await Promise.all([
        // Most kills in a single game
        db.rawQuery(`
          SELECT ps.player_name, ps.champion_name, ps.kills as value,
                 g.duration, pt.name as team_name, tr.name as tournament_name,
                 g.started_at as game_date
          FROM pro_player_stats ps
          JOIN pro_games g ON ps.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams pt ON ps.team_id = pt.team_id
          WHERE g.status = 'completed' ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY ps.kills DESC
          LIMIT 5
        `),

        // Best KDA in a single game (min 15 min duration)
        db.rawQuery(`
          SELECT ps.player_name, ps.champion_name,
                 ROUND((ps.kills + ps.assists)::numeric / GREATEST(ps.deaths, 1), 2) as value,
                 ps.kills, ps.deaths, ps.assists,
                 g.duration, pt.name as team_name, tr.name as tournament_name,
                 g.started_at as game_date
          FROM pro_player_stats ps
          JOIN pro_games g ON ps.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams pt ON ps.team_id = pt.team_id
          WHERE g.status = 'completed' AND g.duration > 900 ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY (ps.kills + ps.assists)::numeric / GREATEST(ps.deaths, 1) DESC
          LIMIT 5
        `),

        // Highest CS/min
        db.rawQuery(`
          SELECT ps.player_name, ps.champion_name,
                 ROUND(ps.cs * 60.0 / GREATEST(g.duration, 1), 2) as value,
                 ps.cs, g.duration, pt.name as team_name, tr.name as tournament_name,
                 g.started_at as game_date
          FROM pro_player_stats ps
          JOIN pro_games g ON ps.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams pt ON ps.team_id = pt.team_id
          WHERE g.status = 'completed' AND g.duration > 900 ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY ps.cs * 60.0 / GREATEST(g.duration, 1) DESC
          LIMIT 5
        `),

        // Most damage in a single game
        db.rawQuery(`
          SELECT ps.player_name, ps.champion_name, ps.damage_dealt as value,
                 g.duration, pt.name as team_name, tr.name as tournament_name,
                 g.started_at as game_date
          FROM pro_player_stats ps
          JOIN pro_games g ON ps.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams pt ON ps.team_id = pt.team_id
          WHERE g.status = 'completed' ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY ps.damage_dealt DESC
          LIMIT 5
        `),

        // Most penta kills (single game)
        db.rawQuery(`
          SELECT ps.player_name, ps.champion_name,
                 COALESCE((ps.multi_kills->>'penta')::int, 0) as value,
                 pt.name as team_name, tr.name as tournament_name,
                 g.started_at as game_date
          FROM pro_player_stats ps
          JOIN pro_games g ON ps.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams pt ON ps.team_id = pt.team_id
          WHERE g.status = 'completed'
            AND COALESCE((ps.multi_kills->>'penta')::int, 0) > 0
            ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY (ps.multi_kills->>'penta')::int DESC
          LIMIT 5
        `),

        // Fastest win
        db.rawQuery(`
          SELECT g.duration as value,
                 bt.name as blue_team_name, rt.name as red_team_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN bt.name ELSE rt.name END as winner_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN rt.name ELSE bt.name END as loser_name,
                 tr.name as tournament_name, g.started_at as game_date
          FROM pro_games g
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams bt ON g.blue_team_id = bt.team_id
          LEFT JOIN pro_teams rt ON g.red_team_id = rt.team_id
          WHERE g.status = 'completed' AND g.winner_team_id IS NOT NULL AND g.duration > 0
            ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY g.duration ASC
          LIMIT 5
        `),

        // Longest game
        db.rawQuery(`
          SELECT g.duration as value,
                 bt.name as blue_team_name, rt.name as red_team_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN bt.name ELSE rt.name END as winner_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN rt.name ELSE bt.name END as loser_name,
                 tr.name as tournament_name, g.started_at as game_date
          FROM pro_games g
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_teams bt ON g.blue_team_id = bt.team_id
          LEFT JOIN pro_teams rt ON g.red_team_id = rt.team_id
          WHERE g.status = 'completed' AND g.duration > 0
            ${leagueFilter.replace(/t\./g, 'tr.')}
          ORDER BY g.duration DESC
          LIMIT 5
        `),
      ])

      return {
        playerRecords: {
          mostKills: this.formatPlayerRecords(mostKills.rows),
          bestKda: this.formatPlayerRecords(bestKda.rows),
          highestCsPerMin: this.formatPlayerRecords(highestCsPerMin.rows),
          mostDamage: this.formatPlayerRecords(mostDamage.rows),
          mostPentaKills: this.formatPlayerRecords(mostPentaKills.rows),
        },
        teamRecords: {
          fastestWin: this.formatTeamRecords(fastestWin.rows),
          longestGame: this.formatTeamRecords(longestGame.rows),
        },
      }
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/player-leaderboards
   * Cross-tournament player leaderboards
   */
  async playerLeaderboards(ctx: HttpContext) {
    const {
      leagueId,
      role,
      search,
      minGames = 5,
      sortBy = 'kda',
      page = 1,
      perPage = 20,
    } = ctx.request.qs()

    const parsedLeagueId = leagueId ? Number(leagueId) : null
    const parsedMinGames = Math.max(1, Number(minGames) || 5)
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    const sortColumns: Record<string, string> = {
      kda: 'avg_kda',
      csPerMin: 'avg_cs_per_min',
      goldPerMin: 'avg_gold_per_min',
      damagePerMin: 'avg_damage_per_min',
      winRate: 'win_rate',
      goldDiffAt15: 'avg_gold_diff_at_15',
      games: 'games_played',
      killParticipation: 'avg_kill_participation',
      kills: 'total_kills',
      deaths: 'total_deaths',
      assists: 'total_assists',
    }

    const orderColumn = sortColumns[sortBy] || 'avg_kda'

    const leagueFilter = parsedLeagueId
      ? `AND tr.pro_league_id = ${parsedLeagueId}`
      : ''

    const validRoles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
    const roleFilter = role && validRoles.includes(role)
      ? `AND pas.role = '${role}'`
      : ''

    const sanitizedSearch = search ? String(search).replace(/[%_'\\]/g, '').trim() : ''
    const searchFilter = sanitizedSearch
      ? `AND (p.current_pseudo ILIKE '%${sanitizedSearch}%'
          OR p.player_id IN (
            SELECT pa.player_id FROM player_aliases pa
            WHERE LOWER(pa.alias) LIKE LOWER('%${sanitizedSearch}%')
          ))`
      : ''

    const cacheKey = `pro:stats:player-lb:${parsedLeagueId || 'all'}:${role || 'all'}:${sanitizedSearch || 'all'}:${parsedMinGames}:${sortBy}:${pageNum}:${perPageNum}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      // Count query
      const countResult = await db.rawQuery(`
        SELECT COUNT(*) as total FROM (
          SELECT pas.player_id, pas.role
          FROM pro_player_aggregated_stats pas
          JOIN pro_tournaments tr ON pas.tournament_id = tr.tournament_id
          ${searchFilter ? 'LEFT JOIN players p ON pas.player_id = p.player_id' : ''}
          WHERE 1=1 ${leagueFilter} ${roleFilter} ${searchFilter}
          GROUP BY pas.player_id, pas.role
          HAVING SUM(pas.games_played) >= ${parsedMinGames}
        ) sub
      `)

      const total = Number(countResult.rows[0]?.total || 0)

      // Data query - aggregate across tournaments
      const dataResult = await db.rawQuery(`
        SELECT
          pas.player_id,
          p.current_pseudo as player_name,
          pas.role,
          MAX(t.name) as team_name,
          MAX(t.short_name) as team_short_name,
          SUM(pas.games_played)::int as games_played,
          SUM(pas.games_won)::int as games_won,
          ROUND(SUM(pas.games_won) * 100.0 / GREATEST(SUM(pas.games_played), 1), 1) as win_rate,
          ROUND(SUM(pas.total_kills)::numeric / GREATEST(SUM(pas.games_played), 1), 2) as avg_kills,
          ROUND(SUM(pas.total_deaths)::numeric / GREATEST(SUM(pas.games_played), 1), 2) as avg_deaths,
          ROUND(SUM(pas.total_assists)::numeric / GREATEST(SUM(pas.games_played), 1), 2) as avg_assists,
          ROUND(
            (SUM(pas.total_kills) + SUM(pas.total_assists))::numeric /
            GREATEST(SUM(pas.total_deaths), 1), 2
          ) as avg_kda,
          ROUND(AVG(pas.avg_cs_per_min), 2) as avg_cs_per_min,
          ROUND(AVG(pas.avg_gold_per_min), 0) as avg_gold_per_min,
          ROUND(AVG(pas.avg_damage_per_min), 0) as avg_damage_per_min,
          ROUND(AVG(pas.avg_kill_participation), 1) as avg_kill_participation,
          ROUND(AVG(pas.avg_gold_diff_at_15), 0) as avg_gold_diff_at_15,
          SUM(pas.total_kills)::int as total_kills,
          SUM(pas.total_deaths)::int as total_deaths,
          SUM(pas.total_assists)::int as total_assists,
          SUM(pas.penta_kills)::int as penta_kills
        FROM pro_player_aggregated_stats pas
        JOIN pro_tournaments tr ON pas.tournament_id = tr.tournament_id
        LEFT JOIN players p ON pas.player_id = p.player_id
        LEFT JOIN pro_teams t ON pas.team_id = t.team_id
        WHERE 1=1 ${leagueFilter} ${roleFilter} ${searchFilter}
        GROUP BY pas.player_id, p.current_pseudo, pas.role
        HAVING SUM(pas.games_played) >= ${parsedMinGames}
        ORDER BY ${orderColumn} DESC
        OFFSET ${(pageNum - 1) * perPageNum}
        LIMIT ${perPageNum}
      `)

      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          playerId: row.player_id,
          playerName: row.player_name,
          role: row.role,
          teamName: row.team_name,
          teamShortName: row.team_short_name,
          gamesPlayed: Number(row.games_played),
          gamesWon: Number(row.games_won),
          winRate: Number(row.win_rate),
          avgKills: Number(row.avg_kills),
          avgDeaths: Number(row.avg_deaths),
          avgAssists: Number(row.avg_assists),
          avgKda: Number(row.avg_kda),
          avgCsPerMin: Number(row.avg_cs_per_min),
          avgGoldPerMin: Number(row.avg_gold_per_min),
          avgDamagePerMin: Number(row.avg_damage_per_min),
          avgKillParticipation: Number(row.avg_kill_participation),
          avgGoldDiffAt15: Number(row.avg_gold_diff_at_15),
          totalKills: Number(row.total_kills),
          totalDeaths: Number(row.total_deaths),
          totalAssists: Number(row.total_assists),
          pentaKills: Number(row.penta_kills),
        })),
        meta: {
          total,
          perPage: perPageNum,
          currentPage: pageNum,
          lastPage: Math.ceil(total / perPageNum),
        },
      }
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/team-leaderboards
   * Cross-tournament team leaderboards
   */
  async teamLeaderboards(ctx: HttpContext) {
    const {
      leagueId,
      minGames = 3,
      sortBy = 'winRate',
      page = 1,
      perPage = 20,
    } = ctx.request.qs()

    const parsedLeagueId = leagueId ? Number(leagueId) : null
    const parsedMinGames = Math.max(1, Number(minGames) || 3)
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    const sortColumns: Record<string, string> = {
      winRate: 'game_win_rate',
      games: 'total_games',
      avgKills: 'avg_kills',
      avgDuration: 'avg_duration',
      firstBloodRate: 'first_blood_rate',
      firstTowerRate: 'first_tower_rate',
    }

    const orderColumn = sortColumns[sortBy] || 'game_win_rate'

    const leagueFilter = parsedLeagueId
      ? `AND tr.pro_league_id = ${parsedLeagueId}`
      : ''

    const cacheKey = `pro:stats:team-lb:${parsedLeagueId || 'all'}:${parsedMinGames}:${sortBy}:${pageNum}:${perPageNum}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      const countResult = await db.rawQuery(`
        SELECT COUNT(*) as total FROM (
          SELECT ts.team_id
          FROM pro_team_stats ts
          JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
          WHERE 1=1 ${leagueFilter}
          GROUP BY ts.team_id
          HAVING SUM(ts.games_played) >= ${parsedMinGames}
        ) sub
      `)

      const total = Number(countResult.rows[0]?.total || 0)

      const dataResult = await db.rawQuery(`
        SELECT
          ts.team_id,
          t.name as team_name,
          t.short_name,
          SUM(ts.games_played)::int as total_games,
          SUM(ts.games_won)::int as total_wins,
          ROUND(SUM(ts.games_won) * 100.0 / GREATEST(SUM(ts.games_played), 1), 1) as game_win_rate,
          SUM(ts.matches_played)::int as total_matches,
          SUM(ts.matches_won)::int as total_matches_won,
          ROUND(AVG(ts.avg_game_duration), 0) as avg_duration,
          ROUND(AVG(ts.avg_kills), 1) as avg_kills,
          ROUND(
            SUM(ts.first_blood_rate * ts.games_played)::numeric /
            GREATEST(SUM(ts.games_played), 1), 0
          ) as first_blood_rate,
          ROUND(
            SUM(ts.first_tower_rate * ts.games_played)::numeric /
            GREATEST(SUM(ts.games_played), 1), 0
          ) as first_tower_rate,
          SUM(ts.blue_side_games)::int as blue_games,
          SUM(ts.blue_side_wins)::int as blue_wins,
          SUM(ts.red_side_games)::int as red_games,
          SUM(ts.red_side_wins)::int as red_wins
        FROM pro_team_stats ts
        JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
        LEFT JOIN pro_teams t ON ts.team_id = t.team_id
        WHERE 1=1 ${leagueFilter}
        GROUP BY ts.team_id, t.name, t.short_name
        HAVING SUM(ts.games_played) >= ${parsedMinGames}
        ORDER BY ${orderColumn} DESC
        OFFSET ${(pageNum - 1) * perPageNum}
        LIMIT ${perPageNum}
      `)

      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          teamId: row.team_id,
          teamName: row.team_name,
          shortName: row.short_name,
          gamesPlayed: Number(row.total_games),
          gamesWon: Number(row.total_wins),
          gameWinRate: Number(row.game_win_rate),
          matchesPlayed: Number(row.total_matches),
          matchesWon: Number(row.total_matches_won),
          avgDuration: Number(row.avg_duration),
          avgKills: Number(row.avg_kills),
          firstBloodRate: Number(row.first_blood_rate),
          firstTowerRate: Number(row.first_tower_rate),
          blueGames: Number(row.blue_games),
          blueWins: Number(row.blue_wins),
          redGames: Number(row.red_games),
          redWins: Number(row.red_wins),
        })),
        meta: {
          total,
          perPage: perPageNum,
          currentPage: pageNum,
          lastPage: Math.ceil(total / perPageNum),
        },
      }
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/champion-stats
   * Champion pick/ban stats aggregated across tournaments
   */
  async championStats(ctx: HttpContext) {
    const { leagueId } = ctx.request.qs()
    const parsedLeagueId = leagueId ? Number(leagueId) : null

    const cacheKey = `pro:stats:champion-stats:${parsedLeagueId || 'all'}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      const leagueFilter = parsedLeagueId
        ? `AND t.pro_league_id = ${parsedLeagueId}`
        : ''

      const totalGamesResult = await db.rawQuery(`
        SELECT COUNT(DISTINCT g.game_id) as total
        FROM pro_games g
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments t ON m.tournament_id = t.tournament_id
        WHERE g.status IN ('completed', 'processed') ${leagueFilter}
      `)
      const totalGames = Number(totalGamesResult.rows[0]?.total || 1)

      const dataResult = await db.rawQuery(`
        SELECT
          cs.champion_id,
          SUM(cs.picks)::int as picks,
          SUM(cs.bans)::int as bans,
          SUM(cs.wins)::int as wins,
          (SUM(cs.picks) - SUM(cs.wins))::int as losses,
          SUM(cs.blue_side_picks)::int as blue_picks,
          SUM(cs.blue_side_wins)::int as blue_wins,
          SUM(cs.red_side_picks)::int as red_picks,
          SUM(cs.red_side_wins)::int as red_wins,
          SUM(cs.top_picks)::int as top_picks,
          SUM(cs.jungle_picks)::int as jungle_picks,
          SUM(cs.mid_picks)::int as mid_picks,
          SUM(cs.adc_picks)::int as adc_picks,
          SUM(cs.support_picks)::int as support_picks
        FROM pro_champion_stats cs
        JOIN pro_tournaments t ON cs.tournament_id = t.tournament_id
        WHERE 1=1 ${leagueFilter}
        GROUP BY cs.champion_id
        ORDER BY SUM(cs.picks) DESC
      `)

      return {
        totalGames,
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          championId: Number(row.champion_id),
          picks: Number(row.picks),
          bans: Number(row.bans),
          fearlessBans: 0,
          wins: Number(row.wins),
          totalGames,
          blueSide: {
            picks: Number(row.blue_picks),
            wins: Number(row.blue_wins),
          },
          redSide: {
            picks: Number(row.red_picks),
            wins: Number(row.red_wins),
          },
          byRole: {
            Top: { picks: Number(row.top_picks), wins: 0 },
            Jungle: { picks: Number(row.jungle_picks), wins: 0 },
            Mid: { picks: Number(row.mid_picks), wins: 0 },
            ADC: { picks: Number(row.adc_picks), wins: 0 },
            Support: { picks: Number(row.support_picks), wins: 0 },
          },
        })),
      }
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/leagues
   * List available pro leagues
   */
  async leagues(ctx: HttpContext) {
    const cacheKey = 'pro:stats:leagues'

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const dataResult = await db.rawQuery(`
        SELECT league_id, name, short_name, region, tier
        FROM pro_leagues
        ORDER BY tier, name
      `)

      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          leagueId: Number(row.league_id),
          name: row.name,
          shortName: row.short_name,
          region: row.region,
          tier: Number(row.tier),
        })),
      }
    })

    return ctx.response.ok(result)
  }

  // --- Helpers ---

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }

  private formatPlayerRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      playerName: row.player_name,
      championName: row.champion_name,
      value: Number(row.value),
      teamName: row.team_name,
      tournamentName: row.tournament_name,
      gameDate: row.game_date,
      kills: row.kills != null ? Number(row.kills) : undefined,
      deaths: row.deaths != null ? Number(row.deaths) : undefined,
      assists: row.assists != null ? Number(row.assists) : undefined,
      duration: row.duration != null ? Number(row.duration) : undefined,
    }))
  }

  private formatTeamRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      value: Number(row.value),
      winnerName: row.winner_name,
      loserName: row.loser_name,
      tournamentName: row.tournament_name,
      gameDate: row.game_date,
    }))
  }
}
