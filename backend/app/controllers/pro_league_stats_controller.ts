import { createHash, timingSafeEqual } from 'node:crypto'
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

    if (!password || typeof password !== 'string' || password.length > 1000) {
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
    const { leagueId, year, role, years, leagueIds, teamIds, playerIds, tournamentIds, tier, isPlayoffs, includeExcluded } = ctx.request.qs()
    const validRoles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
    const parsedRole = role && validRoles.includes(role) ? role : null

    // Parse array params (comma-separated), falling back to legacy single values
    const parsedYears = this.parseIds(years) ?? (year ? [Number(year)] : [])
    const parsedLeagueIds = this.parseIds(leagueIds) ?? (leagueId ? [Number(leagueId)] : [])
    const parsedTeamIds = this.parseIds(teamIds) ?? []
    const parsedPlayerIds = this.parseIds(playerIds) ?? []
    const parsedTournamentIds = this.parseIds(tournamentIds) ?? []
    const parsedTier = tier && Number.isFinite(Number(tier)) ? Number(tier) : null
    const parsedIsPlayoffs = isPlayoffs === 'true' ? true : isPlayoffs === 'false' ? false : null
    const parsedIncludeExcluded = includeExcluded === 'true'

    const cacheKey = `pro:stats:records:l=${[...parsedLeagueIds].sort().join(',') || 'all'}:y=${[...parsedYears].sort().join(',') || 'all'}:t=${[...parsedTeamIds].sort().join(',') || 'all'}:p=${[...parsedPlayerIds].sort().join(',') || 'all'}:tn=${[...parsedTournamentIds].sort().join(',') || 'all'}:ti=${parsedTier ?? 'all'}:po=${parsedIsPlayoffs ?? 'all'}:r=${parsedRole || 'all'}:ex=${parsedIncludeExcluded ? 1 : 0}`

    try {
    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const resolvedLeagueIds = await this.resolveLeagueIds(parsedLeagueIds)

      // Build parameterized filters
      const playerClauses: string[] = []
      const playerBindings: unknown[] = []
      const teamClauses: string[] = []
      const teamBindings: unknown[] = []

      if (resolvedLeagueIds.length > 0) {
        playerClauses.push(`AND tr.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
        playerBindings.push(...resolvedLeagueIds)
        teamClauses.push(`AND tr.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
        teamBindings.push(...resolvedLeagueIds)
      }
      if (parsedYears.length > 0) {
        playerClauses.push(`AND tr.year IN (${parsedYears.map(() => '?').join(',')})`)
        playerBindings.push(...parsedYears)
        teamClauses.push(`AND tr.year IN (${parsedYears.map(() => '?').join(',')})`)
        teamBindings.push(...parsedYears)
      }
      if (parsedTournamentIds.length > 0) {
        playerClauses.push(`AND m.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
        playerBindings.push(...parsedTournamentIds)
        teamClauses.push(`AND m.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
        teamBindings.push(...parsedTournamentIds)
      }
      if (parsedTier !== null) {
        playerClauses.push('AND pl.tier = ?')
        playerBindings.push(parsedTier)
        teamClauses.push('AND pl.tier = ?')
        teamBindings.push(parsedTier)
      }
      if (parsedIsPlayoffs !== null) {
        playerClauses.push('AND tr.is_playoffs = ?')
        playerBindings.push(parsedIsPlayoffs)
        teamClauses.push('AND tr.is_playoffs = ?')
        teamBindings.push(parsedIsPlayoffs)
      }
      if (!parsedIncludeExcluded) {
        playerClauses.push('AND tr.exclude_from_records = false')
        teamClauses.push('AND tr.exclude_from_records = false')
      }
      if (parsedRole) {
        playerClauses.push('AND ps.role = ?')
        playerBindings.push(parsedRole)
      }
      if (parsedTeamIds.length > 0) {
        playerClauses.push(`AND ps.team_id IN (${parsedTeamIds.map(() => '?').join(',')})`)
        playerBindings.push(...parsedTeamIds)
      }
      if (parsedPlayerIds.length > 0) {
        playerClauses.push(`AND ps.player_id IN (${parsedPlayerIds.map(() => '?').join(',')})`)
        playerBindings.push(...parsedPlayerIds)
      }

      const playerFilterSql = playerClauses.join(' ')
      const teamFilterSql = teamClauses.join(' ')

      // Quest gap uses a self-join (ps1/ps2) so needs adapted filter aliases
      const questGapClauses: string[] = []
      const questGapBindings: unknown[] = []

      if (resolvedLeagueIds.length > 0) {
        questGapClauses.push(`AND tr.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
        questGapBindings.push(...resolvedLeagueIds)
      }
      if (parsedYears.length > 0) {
        questGapClauses.push(`AND tr.year IN (${parsedYears.map(() => '?').join(',')})`)
        questGapBindings.push(...parsedYears)
      }
      if (parsedTournamentIds.length > 0) {
        questGapClauses.push(`AND m.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
        questGapBindings.push(...parsedTournamentIds)
      }
      if (parsedTier !== null) {
        questGapClauses.push('AND pl.tier = ?')
        questGapBindings.push(parsedTier)
      }
      if (parsedIsPlayoffs !== null) {
        questGapClauses.push('AND tr.is_playoffs = ?')
        questGapBindings.push(parsedIsPlayoffs)
      }
      if (!parsedIncludeExcluded) {
        questGapClauses.push('AND tr.exclude_from_records = false')
      }
      if (parsedTeamIds.length > 0) {
        const ph = parsedTeamIds.map(() => '?').join(',')
        questGapClauses.push(`AND (ps1.team_id IN (${ph}) OR ps2.team_id IN (${ph}))`)
        questGapBindings.push(...parsedTeamIds, ...parsedTeamIds)
      }
      if (parsedPlayerIds.length > 0) {
        const ph = parsedPlayerIds.map(() => '?').join(',')
        questGapClauses.push(`AND (ps1.player_id IN (${ph}) OR ps2.player_id IN (${ph}))`)
        questGapBindings.push(...parsedPlayerIds, ...parsedPlayerIds)
      }
      const questGapFilterSql = questGapClauses.join(' ')

      // Team ID filter for team game records (fastest win, longest game)
      let teamGameFilterSql = ''
      const teamGameFilterBindings: (number | string)[] = []
      if (parsedTeamIds.length > 0) {
        const placeholders = parsedTeamIds.map(() => '?').join(',')
        teamGameFilterSql = ` AND (g.blue_team_id IN (${placeholders}) OR g.red_team_id IN (${placeholders}))`
        teamGameFilterBindings.push(...parsedTeamIds, ...parsedTeamIds)
      }

      // Team ID filter for streak queries (on ts.team_id)
      let teamIdStreakSql = ''
      const teamIdStreakBindings: (number | string)[] = []
      if (parsedTeamIds.length > 0) {
        teamIdStreakSql = ` AND ts.team_id IN (${parsedTeamIds.map(() => '?').join(',')})`
        teamIdStreakBindings.push(...parsedTeamIds)
      }

      // Team ID filter for BO queries (EXISTS on pro_team_stats)
      let boTeamFilterSql = ''
      const boTeamFilterBindings: (number | string)[] = []
      if (parsedTeamIds.length > 0) {
        boTeamFilterSql = ` AND EXISTS (SELECT 1 FROM pro_team_stats ts_f WHERE ts_f.match_id = m.match_id AND ts_f.team_id IN (${parsedTeamIds.map(() => '?').join(',')}))`
        boTeamFilterBindings.push(...parsedTeamIds)
      }

      const playerJoins = `
        FROM pro_player_stats ps
        JOIN pro_games g ON ps.game_id = g.game_id
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
        LEFT JOIN teams pt ON ps.team_id = pt.team_id
        LEFT JOIN teams bt ON g.blue_team_id = bt.team_id
        LEFT JOIN teams rt ON g.red_team_id = rt.team_id
        LEFT JOIN players p ON ps.player_id = p.player_id
        WHERE g.status IN ('completed', 'processed') ${playerFilterSql}
      `
      const opponentCol = `CASE WHEN ps.team_id = g.blue_team_id THEN COALESCE(rt.short_name, rt.current_name) ELSE COALESCE(bt.short_name, bt.current_name) END as opponent_name`
      const winCol = `(g.winner_team_id = ps.team_id) as win`

      const teamGameJoins = `
        FROM pro_games g
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
        LEFT JOIN teams bt ON g.blue_team_id = bt.team_id
        LEFT JOIN teams rt ON g.red_team_id = rt.team_id
        LEFT JOIN pro_drafts d ON d.game_id = g.game_id
        WHERE g.status IN ('completed', 'processed') ${teamFilterSql}${teamGameFilterSql}
      `
      const teamGameBindings = [...teamBindings, ...teamGameFilterBindings]

      const [
        bestKda,
        mostKills,
        mostDeaths,
        mostAssists,
        mostKillsAssistsZeroDeaths,
        mostKillsAssists,
        highestDpm,
        highestDpmPost15,
        highestDamageShare,
        highestCsPerMin,
        fastestQuest,
        slowestQuest,
        biggestQuestGap,
        mostSoloKills,
        mostSoloDeaths,
        mostKillsAt15,
        mostKillsAssistsAt15,
        mostDeathsAt15,
        highestGoldDiffAt15,
        lowestGoldDiffAt15,
        highestCsDiffAt15,
        highestXpDiffAt15,
        highestGoldDiffEnd,
        highestCsDiffEnd,
        fastestWin,
        longestGame,
        fastestFirstBlood,
        slowestFirstBlood,
        fastestBo3,
        slowestBo3,
        fastestBo5,
        slowestBo5,
        gameWinStreaks,
        gameLossStreaks,
        matchWinStreaks,
        matchLossStreaks,
        avgKillsPerGameByTournament,
        mostTeamKills,
        mostGameKills,
        fastestFirstTower,
        fastestFirstDragon,
        fastestFirstHerald,
        fastestFirstBaron,
        mostDragons,
        mostElderDragons,
        mostBarons,
        // Tournament-aggregated player records
        tpBestKda,
        tpMostKills,
        tpMostAssists,
        tpHighestDpm,
        tpHighestDpmPost15,
        tpHighestCsPerMin,
        tpBestWinRate,
        tpHighestKp,
        tpBestAvgGoldDiffAt15,
        tpMostPentakills,
        tpMostUniqueChampions,
      ] = await Promise.all([
        // Best KDA in a single game (min 15 min duration)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ROUND((ps.kills + ps.assists)::numeric / GREATEST(ps.deaths, 1), 2) as value,
                 ps.kills, ps.deaths, ps.assists,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
          ORDER BY (ps.kills + ps.assists)::numeric / GREATEST(ps.deaths, 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id, ps.kills as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
          ORDER BY ps.kills DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most deaths in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id, ps.deaths as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
          ORDER BY ps.deaths DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most assists in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id, ps.assists as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
          ORDER BY ps.assists DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills+assists with zero deaths (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.kills + ps.assists) as value,
                 ps.kills, ps.deaths, ps.assists,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND ps.deaths = 0 AND g.duration > 900
          ORDER BY (ps.kills + ps.assists) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills+assists in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.kills + ps.assists) as value,
                 ps.kills, ps.deaths, ps.assists,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
          ORDER BY (ps.kills + ps.assists) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest DPM (damage per minute, min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ROUND(ps.damage_dealt * 60.0 / GREATEST(g.duration, 1), 0) as value,
                 ps.damage_dealt, g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
          ORDER BY ps.damage_dealt * 60.0 / GREATEST(g.duration, 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest DPM post 15 (damage per minute after 15 min, min 20 min game)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ROUND((ps.damage_dealt - COALESCE((ps.timing_data->'15'->>'damage')::numeric, 0)) * 60.0 / GREATEST(g.duration - 900, 1), 0) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND g.duration > 1200
            AND ps.timing_data->'15'->>'damage' IS NOT NULL
          ORDER BY (ps.damage_dealt - COALESCE((ps.timing_data->'15'->>'damage')::numeric, 0)) * 60.0 / GREATEST(g.duration - 900, 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest damage share % (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ROUND(ps.damage_dealt * 100.0 / GREATEST(
                   (SELECT SUM(ps2.damage_dealt) FROM pro_player_stats ps2 WHERE ps2.game_id = g.game_id AND ps2.team_id = ps.team_id),
                   1
                 ), 1) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
          ORDER BY ps.damage_dealt * 100.0 / GREATEST(
            (SELECT SUM(ps2.damage_dealt) FROM pro_player_stats ps2 WHERE ps2.game_id = g.game_id AND ps2.team_id = ps.team_id),
            1
          ) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest CS/min (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ROUND(ps.cs * 60.0 / GREATEST(g.duration, 1), 2) as value,
                 ps.cs, g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
          ORDER BY ps.cs * 60.0 / GREATEST(g.duration, 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Fastest quest completion (only 2025+ data has quest_completed_at)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ps.quest_completed_at as value, g.game_number,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND ps.quest_completed_at IS NOT NULL
            AND ps.quest_completed_at > 0
            AND tr.year >= 2025
          ORDER BY ps.quest_completed_at ASC
          LIMIT 50
        `, [...playerBindings]),

        // Slowest quest completion
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ps.quest_completed_at as value, g.game_number,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND ps.quest_completed_at IS NOT NULL
            AND ps.quest_completed_at > 0
            AND tr.year >= 2025
          ORDER BY ps.quest_completed_at DESC
          LIMIT 50
        `, [...playerBindings]),

        // Biggest quest gap between two supports in the same game
        db.rawQuery(`
          SELECT
            (ps2.quest_completed_at - ps1.quest_completed_at) as gap,
            p1.current_pseudo as fast_player_name, ps1.champion_id as fast_champion_id,
            ps1.quest_completed_at as fast_quest_time,
            COALESCE(t1.short_name, t1.current_name) as fast_team_name,
            t1.current_name as fast_team_full_name,
            p2.current_pseudo as slow_player_name, ps2.champion_id as slow_champion_id,
            ps2.quest_completed_at as slow_quest_time,
            COALESCE(t2.short_name, t2.current_name) as slow_team_name,
            t2.current_name as slow_team_full_name,
            ps1.role as role,
            (g.winner_team_id = ps1.team_id) as fast_win,
            g.game_number, COALESCE(g.started_at, m.started_at) as game_date, tr.name as tournament_name
          FROM pro_player_stats ps1
          JOIN pro_player_stats ps2 ON ps1.game_id = ps2.game_id
            AND ps1.team_id != ps2.team_id
            AND ps1.role = ps2.role
            AND ps1.quest_completed_at < ps2.quest_completed_at
          JOIN pro_games g ON ps1.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          LEFT JOIN teams t1 ON ps1.team_id = t1.team_id
          LEFT JOIN teams t2 ON ps2.team_id = t2.team_id
          LEFT JOIN players p1 ON ps1.player_id = p1.player_id
          LEFT JOIN players p2 ON ps2.player_id = p2.player_id
          WHERE g.status IN ('completed', 'processed')
            AND ps1.quest_completed_at IS NOT NULL AND ps1.quest_completed_at > 0
            AND ps2.quest_completed_at IS NOT NULL AND ps2.quest_completed_at > 0
            AND tr.year >= 2025
            ${questGapFilterSql}
          ORDER BY gap DESC
          LIMIT 50
        `, [...questGapBindings]),

        // Most solo kills in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 COALESCE((ps.solo_stats->>'solo_kills')::int, 0) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND (ps.solo_stats->>'solo_kills')::int > 0
          ORDER BY (ps.solo_stats->>'solo_kills')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most solo deaths in a single game
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 COALESCE((ps.solo_stats->>'solo_deaths')::int, 0) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND (ps.solo_stats->>'solo_deaths')::int > 0
          ORDER BY (ps.solo_stats->>'solo_deaths')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills at 15 min
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'kills')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'kills' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'kills')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills+assists at 15 min
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (COALESCE((ps.timing_data->'15'->>'kills')::int, 0) + COALESCE((ps.timing_data->'15'->>'assists')::int, 0)) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND (ps.timing_data->'15'->>'kills' IS NOT NULL OR ps.timing_data->'15'->>'assists' IS NOT NULL)
          ORDER BY (COALESCE((ps.timing_data->'15'->>'kills')::int, 0) + COALESCE((ps.timing_data->'15'->>'assists')::int, 0)) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most deaths at 15 min
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'deaths')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'deaths' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'deaths')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest gold diff at 15 (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'gold_diff')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'gold_diff' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'gold_diff')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Lowest gold diff at 15 (biggest deficit)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'gold_diff')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'gold_diff' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'gold_diff')::int ASC
          LIMIT 50
        `, [...playerBindings]),

        // Highest CS diff at 15 (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'cs_diff')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'cs_diff' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'cs_diff')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest XP diff at 15 (min 15 min)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 (ps.timing_data->'15'->>'xp_diff')::int as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins} AND g.duration > 900
            AND ps.timing_data->'15'->>'xp_diff' IS NOT NULL
          ORDER BY (ps.timing_data->'15'->>'xp_diff')::int DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest gold diff at end (vs role opponent)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ps.gold_earned - (SELECT opp.gold_earned FROM pro_player_stats opp WHERE opp.game_id = g.game_id AND opp.team_id != ps.team_id AND opp.role = ps.role LIMIT 1) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND g.duration > 900
            AND ps.gold_earned > 0
            AND EXISTS (SELECT 1 FROM pro_player_stats opp WHERE opp.game_id = g.game_id AND opp.team_id != ps.team_id AND opp.role = ps.role)
          ORDER BY value DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest CS diff at end (vs role opponent)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name, ps.champion_id,
                 ps.cs - (SELECT opp.cs FROM pro_player_stats opp WHERE opp.game_id = g.game_id AND opp.team_id != ps.team_id AND opp.role = ps.role LIMIT 1) as value,
                 g.duration, g.game_number, COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, tr.name as tournament_name,
                 COALESCE(g.started_at, m.started_at) as game_date, ps.role, ${opponentCol}, ${winCol}
          ${playerJoins}
            AND g.duration > 900
            AND ps.cs > 0
            AND EXISTS (SELECT 1 FROM pro_player_stats opp WHERE opp.game_id = g.game_id AND opp.team_id != ps.team_id AND opp.role = ps.role)
          ORDER BY value DESC
          LIMIT 50
        `, [...playerBindings]),

        // Fastest win
        db.rawQuery(`
          SELECT g.duration as value, g.game_number,
                 COALESCE(bt.short_name, bt.current_name) as blue_team_name, COALESCE(rt.short_name, rt.current_name) as red_team_name,
                 bt.current_name as blue_team_full_name, rt.current_name as red_team_full_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN COALESCE(bt.short_name, bt.current_name) ELSE COALESCE(rt.short_name, rt.current_name) END as winner_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN bt.current_name ELSE rt.current_name END as winner_full_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN COALESCE(rt.short_name, rt.current_name) ELSE COALESCE(bt.short_name, bt.current_name) END as loser_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN rt.current_name ELSE bt.current_name END as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (g.winner_team_id = g.blue_team_id) as winner_is_blue
          ${teamGameJoins} AND g.winner_team_id IS NOT NULL AND g.duration > 0
          ORDER BY g.duration ASC
          LIMIT 50
        `, [...teamGameBindings]),

        // Longest game
        db.rawQuery(`
          SELECT g.duration as value, g.game_number,
                 COALESCE(bt.short_name, bt.current_name) as blue_team_name, COALESCE(rt.short_name, rt.current_name) as red_team_name,
                 bt.current_name as blue_team_full_name, rt.current_name as red_team_full_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN COALESCE(bt.short_name, bt.current_name) ELSE COALESCE(rt.short_name, rt.current_name) END as winner_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN bt.current_name ELSE rt.current_name END as winner_full_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN COALESCE(rt.short_name, rt.current_name) ELSE COALESCE(bt.short_name, bt.current_name) END as loser_name,
                 CASE WHEN g.winner_team_id = g.blue_team_id THEN rt.current_name ELSE bt.current_name END as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (g.winner_team_id = g.blue_team_id) as winner_is_blue
          ${teamGameJoins} AND g.duration > 0
          ORDER BY g.duration DESC
          LIMIT 50
        `, [...teamGameBindings]),

        // Fastest first blood
        db.rawQuery(`
          SELECT ts.first_blood_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 (g.winner_team_id = ts.team_id) as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_blood = true
            AND ts.first_blood_time IS NOT NULL
            AND ts.first_blood_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_blood_time ASC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Slowest first blood
        db.rawQuery(`
          SELECT ts.first_blood_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 (g.winner_team_id = ts.team_id) as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_blood = true
            AND ts.first_blood_time IS NOT NULL
            AND ts.first_blood_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_blood_time DESC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Fastest BO3
        this.queryBoRecords('bo3', 'ASC', teamFilterSql, teamBindings, boTeamFilterSql, boTeamFilterBindings),

        // Slowest BO3
        this.queryBoRecords('bo3', 'DESC', teamFilterSql, teamBindings, boTeamFilterSql, boTeamFilterBindings),

        // Fastest BO5
        this.queryBoRecords('bo5', 'ASC', teamFilterSql, teamBindings, boTeamFilterSql, boTeamFilterBindings),

        // Slowest BO5
        this.queryBoRecords('bo5', 'DESC', teamFilterSql, teamBindings, boTeamFilterSql, boTeamFilterBindings),

        // Longest game win streak
        this.queryGameStreaks(true, teamFilterSql, teamBindings, teamIdStreakSql, teamIdStreakBindings),

        // Longest game loss streak
        this.queryGameStreaks(false, teamFilterSql, teamBindings, teamIdStreakSql, teamIdStreakBindings),

        // Longest match win streak
        this.queryMatchStreaks(true, teamFilterSql, teamBindings, teamIdStreakSql, teamIdStreakBindings),

        // Longest match loss streak
        this.queryMatchStreaks(false, teamFilterSql, teamBindings, teamIdStreakSql, teamIdStreakBindings),

        // Average kills per game by tournament
        db.rawQuery(`
          SELECT tr.name as tournament_name,
                 COUNT(DISTINCT ts.game_id) as total_games,
                 ROUND(SUM(ts.kills)::numeric / GREATEST(COUNT(DISTINCT ts.game_id), 1), 1) as avg_kills_per_game
          FROM pro_team_stats ts
          JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          WHERE 1=1 ${teamFilterSql}${teamIdStreakSql}
          GROUP BY tr.tournament_id, tr.name
          HAVING COUNT(DISTINCT ts.game_id) >= 5
          ORDER BY avg_kills_per_game DESC
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Most team kills in a single game
        db.rawQuery(`
          SELECT ts.kills as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.kills > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.kills DESC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Most total kills in a single game (both teams combined)
        db.rawQuery(`
          SELECT COALESCE(g.blue_kills, 0) + COALESCE(g.red_kills, 0) as value, g.game_number,
                 CASE WHEN COALESCE(g.blue_kills, 0) >= COALESCE(g.red_kills, 0)
                   THEN COALESCE(bt.short_name, bt.current_name) ELSE COALESCE(rt.short_name, rt.current_name) END as winner_name,
                 CASE WHEN COALESCE(g.blue_kills, 0) >= COALESCE(g.red_kills, 0)
                   THEN bt.current_name ELSE rt.current_name END as winner_full_name,
                 CASE WHEN COALESCE(g.blue_kills, 0) >= COALESCE(g.red_kills, 0)
                   THEN COALESCE(rt.short_name, rt.current_name) ELSE COALESCE(bt.short_name, bt.current_name) END as loser_name,
                 CASE WHEN COALESCE(g.blue_kills, 0) >= COALESCE(g.red_kills, 0)
                   THEN rt.current_name ELSE bt.current_name END as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (COALESCE(g.blue_kills, 0) >= COALESCE(g.red_kills, 0)) as winner_is_blue
          ${teamGameJoins}
          ORDER BY value DESC
          LIMIT 50
        `, [...teamGameBindings]),

        // Fastest first tower
        db.rawQuery(`
          SELECT ts.first_tower_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_tower = true
            AND ts.first_tower_time IS NOT NULL
            AND ts.first_tower_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_tower_time ASC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Fastest first dragon
        db.rawQuery(`
          SELECT ts.first_dragon_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_dragon = true
            AND ts.first_dragon_time IS NOT NULL
            AND ts.first_dragon_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_dragon_time ASC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Fastest first herald
        db.rawQuery(`
          SELECT ts.first_herald_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_herald = true
            AND ts.first_herald_time IS NOT NULL
            AND ts.first_herald_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_herald_time ASC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Fastest first baron
        db.rawQuery(`
          SELECT ts.first_baron_time as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.first_baron = true
            AND ts.first_baron_time IS NOT NULL
            AND ts.first_baron_time > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.first_baron_time ASC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Most dragons in a single game
        db.rawQuery(`
          SELECT ts.dragons as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.dragons > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.dragons DESC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Most elder dragons in a single game
        db.rawQuery(`
          SELECT ts.elder_dragons as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.elder_dragons > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.elder_dragons DESC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // Most barons in a single game
        db.rawQuery(`
          SELECT ts.barons as value, g.game_number,
                 COALESCE(fbt.short_name, fbt.current_name) as winner_name,
                 fbt.current_name as winner_full_name,
                 COALESCE(opp.short_name, opp.current_name) as loser_name,
                 opp.current_name as loser_full_name,
                 tr.name as tournament_name, COALESCE(g.started_at, m.started_at) as game_date,
                 ts.win as win,
                 d.team1_pick_1, d.team1_pick_2, d.team1_pick_3, d.team1_pick_4, d.team1_pick_5,
                 d.team2_pick_1, d.team2_pick_2, d.team2_pick_3, d.team2_pick_4, d.team2_pick_5,
                 (ts.team_id = g.blue_team_id) as winner_is_blue
          FROM pro_team_stats ts
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id
          JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
          LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
          JOIN teams fbt ON ts.team_id = fbt.team_id
          LEFT JOIN pro_team_stats ts_opp ON ts_opp.game_id = ts.game_id AND ts_opp.team_id != ts.team_id
          LEFT JOIN teams opp ON ts_opp.team_id = opp.team_id
          LEFT JOIN pro_drafts d ON d.game_id = g.game_id
          WHERE ts.barons > 0
            AND g.status IN ('completed', 'processed')
            ${teamFilterSql}${teamIdStreakSql}
          ORDER BY ts.barons DESC
          LIMIT 50
        `, [...teamBindings, ...teamIdStreakBindings]),

        // --- Tournament-aggregated player records (GROUP BY tournament + player) ---

        // Best KDA across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND((SUM(ps.kills) + SUM(ps.assists))::numeric / GREATEST(SUM(ps.deaths), 1), 2) as value,
                 SUM(ps.kills)::int as kills, SUM(ps.deaths)::int as deaths, SUM(ps.assists)::int as assists,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY (SUM(ps.kills) + SUM(ps.assists))::numeric / GREATEST(SUM(ps.deaths), 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most kills across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 SUM(ps.kills)::int as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY SUM(ps.kills) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most assists across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 SUM(ps.assists)::int as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY SUM(ps.assists) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest DPM across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND(SUM(ps.damage_dealt) * 60.0 / GREATEST(SUM(g.duration), 1), 0) as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins} AND g.duration > 900
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY SUM(ps.damage_dealt) * 60.0 / GREATEST(SUM(g.duration), 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest DPM post 15 across a tournament (min 3 games, min 20 min games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND(
                   SUM(CASE WHEN g.duration > 1200 AND ps.timing_data->'15'->>'damage' IS NOT NULL
                     THEN ps.damage_dealt - COALESCE((ps.timing_data->'15'->>'damage')::numeric, 0) ELSE 0 END) * 60.0
                   / GREATEST(SUM(CASE WHEN g.duration > 1200 AND ps.timing_data->'15'->>'damage' IS NOT NULL
                     THEN g.duration - 900 ELSE 0 END), 1)
                 , 0) as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins} AND g.duration > 1200 AND ps.timing_data->'15'->>'damage' IS NOT NULL
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY value DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest CS/min across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND(SUM(ps.cs) * 60.0 / GREATEST(SUM(g.duration), 1), 2) as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins} AND g.duration > 900
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY SUM(ps.cs) * 60.0 / GREATEST(SUM(g.duration), 1) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Best win rate across a tournament (min 4 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND(COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id) * 100.0 / COUNT(*), 1) as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 4
          ORDER BY COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id) * 100.0 / COUNT(*) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Highest KP across a tournament (min 3 games, lateral join for team kills)
        db.rawQuery(`
          SELECT sub.player_name, sub.value, sub.games_played, sub.games_won,
                 sub.team_name, sub.team_full_name, sub.role, sub.tournament_name, sub.league_short_name
          FROM (
            SELECT p.current_pseudo as player_name,
                   ROUND(
                     CASE WHEN SUM(team_totals.team_kills) > 0
                       THEN (SUM(ps.kills) + SUM(ps.assists)) * 100.0 / SUM(team_totals.team_kills)
                       ELSE 0 END
                   , 1) as value,
                   COUNT(*)::int as games_played,
                   COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                   COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                   tr.name as tournament_name, pl.short_name as league_short_name
            FROM pro_player_stats ps
            JOIN pro_games g ON ps.game_id = g.game_id
            JOIN pro_matches m ON g.match_id = m.match_id
            JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
            LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
            LEFT JOIN teams pt ON ps.team_id = pt.team_id
            LEFT JOIN players p ON ps.player_id = p.player_id
            LEFT JOIN LATERAL (
              SELECT SUM(ps2.kills) as team_kills
              FROM pro_player_stats ps2
              WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
            ) team_totals ON true
            WHERE g.status IN ('completed', 'processed') ${playerFilterSql}
            GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
            HAVING COUNT(*) >= 3
          ) sub
          WHERE sub.value > 0
          ORDER BY sub.value DESC
          LIMIT 50
        `, [...playerBindings]),

        // Best avg gold diff @15 across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 ROUND(AVG((ps.timing_data->'15'->>'gold_diff')::numeric), 0) as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
            AND g.duration > 900
            AND ps.timing_data->'15'->>'gold_diff' IS NOT NULL
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY AVG((ps.timing_data->'15'->>'gold_diff')::numeric) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most pentakills across a tournament (min 1 game)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 SUM(COALESCE((ps.multi_kills->>'penta')::int, 0))::int as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING SUM(COALESCE((ps.multi_kills->>'penta')::int, 0)) > 0
          ORDER BY SUM(COALESCE((ps.multi_kills->>'penta')::int, 0)) DESC
          LIMIT 50
        `, [...playerBindings]),

        // Most unique champions across a tournament (min 3 games)
        db.rawQuery(`
          SELECT p.current_pseudo as player_name,
                 COUNT(DISTINCT ps.champion_id)::int as value,
                 COUNT(*)::int as games_played,
                 COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
                 COALESCE(pt.short_name, pt.current_name) as team_name, pt.current_name as team_full_name, ps.role,
                 tr.name as tournament_name, pl.short_name as league_short_name
          ${playerJoins}
          GROUP BY tr.tournament_id, ps.player_id, p.current_pseudo, pt.short_name, pt.current_name, ps.role, tr.name, pl.short_name
          HAVING COUNT(*) >= 3
          ORDER BY COUNT(DISTINCT ps.champion_id) DESC
          LIMIT 50
        `, [...playerBindings]),
      ])

      return {
        playerRecords: {
          bestKda: this.formatPlayerRecords(bestKda.rows),
          mostKills: this.formatPlayerRecords(mostKills.rows),
          mostDeaths: this.formatPlayerRecords(mostDeaths.rows),
          mostAssists: this.formatPlayerRecords(mostAssists.rows),
          mostKillsAssistsZeroDeaths: this.formatPlayerRecords(mostKillsAssistsZeroDeaths.rows),
          mostKillsAssists: this.formatPlayerRecords(mostKillsAssists.rows),
          highestDpm: this.formatPlayerRecords(highestDpm.rows),
          highestDpmPost15: this.formatPlayerRecords(highestDpmPost15.rows),
          highestDamageShare: this.formatPlayerRecords(highestDamageShare.rows),
          highestCsPerMin: this.formatPlayerRecords(highestCsPerMin.rows),
          fastestQuest: this.formatPlayerRecords(fastestQuest.rows),
          slowestQuest: this.formatPlayerRecords(slowestQuest.rows),
          biggestQuestGap: this.formatQuestGapRecords(biggestQuestGap.rows),
          mostSoloKills: this.formatPlayerRecords(mostSoloKills.rows),
          mostSoloDeaths: this.formatPlayerRecords(mostSoloDeaths.rows),
          mostKillsAt15: this.formatPlayerRecords(mostKillsAt15.rows),
          mostKillsAssistsAt15: this.formatPlayerRecords(mostKillsAssistsAt15.rows),
          mostDeathsAt15: this.formatPlayerRecords(mostDeathsAt15.rows),
          highestGoldDiffAt15: this.formatPlayerRecords(highestGoldDiffAt15.rows),
          lowestGoldDiffAt15: this.formatPlayerRecords(lowestGoldDiffAt15.rows),
          highestCsDiffAt15: this.formatPlayerRecords(highestCsDiffAt15.rows),
          highestXpDiffAt15: this.formatPlayerRecords(highestXpDiffAt15.rows),
          highestGoldDiffEnd: this.formatPlayerRecords(highestGoldDiffEnd.rows),
          highestCsDiffEnd: this.formatPlayerRecords(highestCsDiffEnd.rows),
        },
        teamRecords: {
          fastestWin: this.formatTeamRecords(fastestWin.rows),
          longestGame: this.formatTeamRecords(longestGame.rows),
          fastestFirstBlood: this.formatTeamRecords(fastestFirstBlood.rows),
          slowestFirstBlood: this.formatTeamRecords(slowestFirstBlood.rows),
          fastestBo3: this.formatBoRecords(fastestBo3.rows),
          slowestBo3: this.formatBoRecords(slowestBo3.rows),
          fastestBo5: this.formatBoRecords(fastestBo5.rows),
          slowestBo5: this.formatBoRecords(slowestBo5.rows),
          mostTeamKills: this.formatTeamRecords(mostTeamKills.rows),
          mostGameKills: this.formatTeamRecords(mostGameKills.rows),
          fastestFirstTower: this.formatTeamRecords(fastestFirstTower.rows),
          fastestFirstDragon: this.formatTeamRecords(fastestFirstDragon.rows),
          fastestFirstHerald: this.formatTeamRecords(fastestFirstHerald.rows),
          fastestFirstBaron: this.formatTeamRecords(fastestFirstBaron.rows),
          mostDragons: this.formatTeamRecords(mostDragons.rows),
          mostElderDragons: this.formatTeamRecords(mostElderDragons.rows),
          mostBarons: this.formatTeamRecords(mostBarons.rows),
        },
        streakRecords: {
          longestGameWinStreak: this.formatStreakRecords(gameWinStreaks.rows),
          longestGameLossStreak: this.formatStreakRecords(gameLossStreaks.rows),
          longestMatchWinStreak: this.formatStreakRecords(matchWinStreaks.rows),
          longestMatchLossStreak: this.formatStreakRecords(matchLossStreaks.rows),
        },
        tournamentRecords: {
          avgKillsPerGame: avgKillsPerGameByTournament.rows.map(
            (row: Record<string, unknown>) => ({
              tournamentName: row.tournament_name,
              totalGames: Number(row.total_games),
              avgKillsPerGame: Number(row.avg_kills_per_game),
            })
          ),
        },
        tournamentPlayerRecords: {
          bestKda: this.formatTournamentPlayerRecords(tpBestKda.rows),
          mostKills: this.formatTournamentPlayerRecords(tpMostKills.rows),
          mostAssists: this.formatTournamentPlayerRecords(tpMostAssists.rows),
          highestDpm: this.formatTournamentPlayerRecords(tpHighestDpm.rows),
          highestDpmPost15: this.formatTournamentPlayerRecords(tpHighestDpmPost15.rows),
          highestCsPerMin: this.formatTournamentPlayerRecords(tpHighestCsPerMin.rows),
          bestWinRate: this.formatTournamentPlayerRecords(tpBestWinRate.rows),
          highestKp: this.formatTournamentPlayerRecords(tpHighestKp.rows),
          bestAvgGoldDiffAt15: this.formatTournamentPlayerRecords(tpBestAvgGoldDiffAt15.rows),
          mostPentakills: this.formatTournamentPlayerRecords(tpMostPentakills.rows),
          mostUniqueChampions: this.formatTournamentPlayerRecords(tpMostUniqueChampions.rows),
        },
      }
    })

    return ctx.response.ok(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return ctx.response.internalServerError({ error: 'Failed to fetch records', message })
    }
  }

  /**
   * GET /api/v1/pro/stats/tournaments
   * List tournaments that have player aggregated stats
   */
  async tournaments(ctx: HttpContext) {
    const { leagueId, year } = ctx.request.qs()
    const parsedLeagueId = leagueId ? Number(leagueId) : null
    const parsedYear = year ? Number(year) : null

    const cacheKey = `pro:stats:tournaments:${parsedLeagueId || 'all'}:${parsedYear || 'all'}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const clauses: string[] = []
      const bindings: (number | string)[] = []

      if (parsedLeagueId) {
        clauses.push('AND t.pro_league_id = ?')
        bindings.push(parsedLeagueId)
      }
      if (parsedYear) {
        clauses.push('AND t.year = ?')
        bindings.push(parsedYear)
      }

      const filterSql = clauses.join(' ')

      const dataResult = await db.rawQuery(`
        SELECT DISTINCT t.tournament_id, t.name, t.year, t.pro_league_id,
               l.short_name as league_short_name, t.start_date, t.is_playoffs, t.split
        FROM pro_tournaments t
        JOIN pro_matches m ON m.tournament_id = t.tournament_id
        JOIN pro_games g ON g.match_id = m.match_id
        JOIN pro_player_stats ps ON ps.game_id = g.game_id
        LEFT JOIN pro_leagues l ON t.pro_league_id = l.league_id
        WHERE 1=1 ${filterSql}
        ORDER BY t.start_date DESC NULLS LAST, t.name
      `, [...bindings])

      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          tournamentId: Number(row.tournament_id),
          name: row.name,
          year: row.year != null ? Number(row.year) : null,
          leagueId: row.pro_league_id != null ? Number(row.pro_league_id) : null,
          leagueShortName: row.league_short_name ?? null,
          startDate: row.start_date ?? null,
          isPlayoffs: Boolean(row.is_playoffs),
          split: row.split ?? null,
        })),
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
      leagueIds,
      teamId,
      teamIds,
      tournamentId,
      tournamentIds,
      year,
      years,
      playerIds,
      tier,
      isPlayoffs,
      role,
      search,
      startDate,
      endDate,
      minGames = 5,
      sortBy = 'kda',
      page = 1,
      perPage = 20,
    } = ctx.request.qs()

    const parsedLeagueIds = this.parseIds(leagueIds) ?? (leagueId ? [Number(leagueId)] : [])
    const parsedTeamIds = this.parseIds(teamIds) ?? (teamId ? [Number(teamId)] : [])
    const parsedTournamentIds = this.parseIds(tournamentIds) ?? (tournamentId ? [Number(tournamentId)] : [])
    const parsedYears = this.parseIds(years) ?? (year ? [Number(year)] : [])
    const parsedPlayerIds = this.parseIds(playerIds) ?? []
    const parsedTier = tier && Number.isFinite(Number(tier)) ? Number(tier) : null
    const parsedIsPlayoffs = isPlayoffs === 'true' ? true : isPlayoffs === 'false' ? false : null
    const parsedMinGames = Math.max(1, Number(minGames) || 5)
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    const sortColumns: Record<string, string> = {
      kda: 'avg_kda',
      csPerMin: 'avg_cs_per_min',
      goldPerMin: 'avg_gold_per_min',
      damagePerMin: 'avg_damage_per_min',
      dpmPost15: 'avg_dpm_post_15',
      winRate: 'win_rate',
      goldDiffAt15: 'avg_gold_diff_at_15',
      games: 'games_played',
      killParticipation: 'avg_kill_participation',
      kills: 'total_kills',
      deaths: 'total_deaths',
      assists: 'total_assists',
      visionScore: 'avg_vision_score',
      goldShare: 'avg_gold_share',
      damageShare: 'avg_damage_share',
      csDiffAt15: 'avg_cs_diff_at_15',
      xpDiffAt15: 'avg_xp_diff_at_15',
      firstBloodParticipations: 'first_blood_participations',
      doubleKills: 'double_kills',
      tripleKills: 'triple_kills',
      quadraKills: 'quadra_kills',
      pentaKills: 'penta_kills',
      uniqueChampions: 'unique_champions_played',
      avgKills: 'avg_kills',
      avgDeaths: 'avg_deaths',
      avgAssists: 'avg_assists',
      proximityTop: 'avg_proximity_top',
      proximityJungle: 'avg_proximity_jungle',
      proximityMid: 'avg_proximity_mid',
      proximityAdc: 'avg_proximity_adc',
      proximitySupport: 'avg_proximity_support',
      isolation: 'avg_isolation',
      botlane2v2Kills: 'total_2v2_kills',
      botlane2v2Deaths: 'total_2v2_deaths',
      goldAt15: 'avg_gold_at_15',
      xpAt15: 'avg_xp_at_15',
      csAt15: 'avg_cs_at_15',
      killsAt15: 'avg_kills_at_15',
      kpAt15: 'avg_kp_at_15',
      teamKillsAt15: 'avg_team_kills_at_15',
      deathsAt15: 'avg_deaths_at_15',
      soloKills: 'avg_solo_kills',
      vspm: 'avg_vspm',
      plates: 'avg_plates',
    }

    const orderColumn = sortColumns[sortBy] || 'avg_kda'

    const validRoles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
    const parsedRoles = role
      ? String(role).split(',').filter((r: string) => validRoles.includes(r))
      : []
    const resolvedLeagueIds = await this.resolveLeagueIds(parsedLeagueIds)

    // Build parameterized filters
    const filterClauses: string[] = []
    const filterBindings: unknown[] = []

    if (resolvedLeagueIds.length > 0) {
      filterClauses.push(`AND tr.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
      filterBindings.push(...resolvedLeagueIds)
    }
    if (parsedTournamentIds.length > 0) {
      filterClauses.push(`AND m.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
      filterBindings.push(...parsedTournamentIds)
    }
    if (parsedYears.length > 0) {
      filterClauses.push(`AND tr.year IN (${parsedYears.map(() => '?').join(',')})`)
      filterBindings.push(...parsedYears)
    }
    if (parsedTier !== null) {
      filterClauses.push('AND pl.tier = ?')
      filterBindings.push(parsedTier)
    }
    if (parsedIsPlayoffs !== null) {
      filterClauses.push('AND tr.is_playoffs = ?')
      filterBindings.push(parsedIsPlayoffs)
    }
    if (parsedTeamIds.length > 0) {
      filterClauses.push(`AND ps.team_id IN (${parsedTeamIds.map(() => '?').join(',')})`)
      filterBindings.push(...parsedTeamIds)
    }
    if (parsedPlayerIds.length > 0) {
      filterClauses.push(`AND ps.player_id IN (${parsedPlayerIds.map(() => '?').join(',')})`)
      filterBindings.push(...parsedPlayerIds)
    }
    if (parsedRoles.length > 0) {
      filterClauses.push(`AND ps.role IN (${parsedRoles.map(() => '?').join(',')})`)
      filterBindings.push(...parsedRoles)
    }

    // Date filters
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
    const parsedStartDate = startDate && isoDateRegex.test(String(startDate)) ? String(startDate) : null
    const parsedEndDate = endDate && isoDateRegex.test(String(endDate)) ? String(endDate) : null

    if (parsedStartDate) {
      filterClauses.push('AND COALESCE(g.started_at, m.started_at) >= ?::date')
      filterBindings.push(parsedStartDate)
    }
    if (parsedEndDate) {
      filterClauses.push("AND COALESCE(g.started_at, m.started_at) < ?::date + interval '1 day'")
      filterBindings.push(parsedEndDate)
    }

    const sanitizedSearch = search ? String(search).replace(/[%_'\\]/g, '').trim().slice(0, 100) : ''
    if (sanitizedSearch) {
      filterClauses.push(`AND (p.current_pseudo ILIKE ?
          OR p.player_id IN (
            SELECT pa.player_id FROM player_aliases pa
            WHERE LOWER(pa.alias) LIKE LOWER(?)
          ))`)
      filterBindings.push(`%${sanitizedSearch}%`, `%${sanitizedSearch}%`)
    }

    const filterSql = filterClauses.join(' ')
    const needsLeagueJoin = parsedTier !== null

    const cacheKey = `pro:stats:player-lb:l=${[...parsedLeagueIds].sort().join(',') || 'all'}:tn=${[...parsedTournamentIds].sort().join(',') || 'all'}:y=${[...parsedYears].sort().join(',') || 'all'}:t=${[...parsedTeamIds].sort().join(',') || 'all'}:p=${[...parsedPlayerIds].sort().join(',') || 'all'}:ti=${parsedTier ?? 'all'}:po=${parsedIsPlayoffs ?? 'all'}:${parsedRoles.join(',') || 'all'}:${sanitizedSearch || 'all'}:${parsedMinGames}:sd=${parsedStartDate || 'all'}:ed=${parsedEndDate || 'all'}:${sortBy}:${pageNum}:${perPageNum}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      // Base joins for querying per-game player stats
      const baseJoins = `
        FROM pro_player_stats ps
        JOIN pro_games g ON ps.game_id = g.game_id
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        ${needsLeagueJoin ? 'LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id' : ''}
        LEFT JOIN players p ON ps.player_id = p.player_id
        WHERE g.status IN ('completed', 'processed') ${filterSql}
      `

      // Count query
      const countResult = await db.rawQuery(`
        SELECT COUNT(*) as total FROM (
          SELECT ps.player_id
          ${baseJoins}
          GROUP BY ps.player_id
          HAVING COUNT(*) >= ?
        ) sub
      `, [...filterBindings, parsedMinGames])

      const total = Number(countResult.rows[0]?.total || 0)

      // Data query - aggregate per-game stats, one row per player
      const dataResult = await db.rawQuery(`
        SELECT
          ps.player_id,
          p.current_pseudo as player_name,

          -- Role (most played)
          (SELECT sub.role FROM pro_player_stats sub
           JOIN pro_games sg ON sub.game_id = sg.game_id
           WHERE sub.player_id = ps.player_id
             AND sg.status IN ('completed', 'processed')
           GROUP BY sub.role ORDER BY COUNT(*) DESC LIMIT 1
          ) as role,

          -- Team (most recent)
          (SELECT COALESCE(st.short_name, st.current_name) FROM pro_player_stats sub2
           JOIN pro_games sg2 ON sub2.game_id = sg2.game_id
           LEFT JOIN teams st ON sub2.team_id = st.team_id
           WHERE sub2.player_id = ps.player_id
             AND sg2.status IN ('completed', 'processed')
           ORDER BY sg2.started_at DESC NULLS LAST LIMIT 1
          ) as team_short_name,

          (SELECT st2.current_name FROM pro_player_stats sub3
           JOIN pro_games sg3 ON sub3.game_id = sg3.game_id
           LEFT JOIN teams st2 ON sub3.team_id = st2.team_id
           WHERE sub3.player_id = ps.player_id
             AND sg3.status IN ('completed', 'processed')
           ORDER BY sg3.started_at DESC NULLS LAST LIMIT 1
          ) as team_name,

          -- Core aggregates
          COUNT(*)::int as games_played,
          COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
          ROUND(COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id) * 100.0 / GREATEST(COUNT(*), 1), 1) as win_rate,
          ROUND(AVG(ps.kills), 2) as avg_kills,
          ROUND(AVG(ps.deaths), 2) as avg_deaths,
          ROUND(AVG(ps.assists), 2) as avg_assists,
          ROUND((SUM(ps.kills) + SUM(ps.assists))::numeric / GREATEST(SUM(ps.deaths), 1), 2) as avg_kda,
          ROUND(SUM(ps.cs) * 60.0 / GREATEST(SUM(g.duration), 1), 2) as avg_cs_per_min,
          ROUND(SUM(ps.gold_earned) * 60.0 / GREATEST(SUM(g.duration), 1), 0) as avg_gold_per_min,
          ROUND(SUM(ps.damage_dealt) * 60.0 / GREATEST(SUM(g.duration), 1), 0) as avg_damage_per_min,
          ROUND(
            SUM(CASE WHEN g.duration > 900 AND ps.timing_data->'15'->>'damage' IS NOT NULL
              THEN ps.damage_dealt - (ps.timing_data->'15'->>'damage')::numeric ELSE 0 END) * 60.0
            / GREATEST(SUM(CASE WHEN g.duration > 900 AND ps.timing_data->'15'->>'damage' IS NOT NULL
              THEN g.duration - 900 ELSE 0 END), 1)
          , 0) as avg_dpm_post_15,
          SUM(ps.kills)::int as total_kills,
          SUM(ps.deaths)::int as total_deaths,
          SUM(ps.assists)::int as total_assists,

          -- Vision
          ROUND(AVG(COALESCE((ps.vision->>'score')::numeric, 0)), 1) as avg_vision_score,

          -- Gold/damage share (computed via lateral join)
          ROUND(CASE WHEN SUM(team_totals.team_gold) > 0 THEN SUM(ps.gold_earned) * 100.0 / SUM(team_totals.team_gold) ELSE 0 END, 1) as avg_gold_share,
          ROUND(CASE WHEN SUM(team_totals.team_damage) > 0 THEN SUM(ps.damage_dealt) * 100.0 / SUM(team_totals.team_damage) ELSE 0 END, 1) as avg_damage_share,

          -- Kill participation
          ROUND(CASE WHEN SUM(team_totals.team_kills) > 0 THEN (SUM(ps.kills) + SUM(ps.assists)) * 100.0 / SUM(team_totals.team_kills) ELSE 0 END, 1) as avg_kill_participation,

          -- Diffs @15 (from timing_data JSONB)
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'cs_diff')::numeric, 0)), 1) as avg_cs_diff_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'gold_diff')::numeric, 0)), 0) as avg_gold_diff_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'xp_diff')::numeric, 0)), 0) as avg_xp_diff_at_15,

          -- First blood
          COUNT(*) FILTER (WHERE (ps.first_blood->>'participant')::boolean)::int as first_blood_participations,
          COUNT(*) FILTER (WHERE (ps.first_blood->>'victim')::boolean)::int as first_blood_victims,

          -- Multi-kills (from JSONB)
          SUM(COALESCE((ps.multi_kills->>'double')::int, 0))::int as double_kills,
          SUM(COALESCE((ps.multi_kills->>'triple')::int, 0))::int as triple_kills,
          SUM(COALESCE((ps.multi_kills->>'quadra')::int, 0))::int as quadra_kills,
          SUM(COALESCE((ps.multi_kills->>'penta')::int, 0))::int as penta_kills,

          -- Unique champions
          COUNT(DISTINCT ps.champion_id)::int as unique_champions_played,

          -- Early game stats (@15min, from timing_data->'15')
          SUM(COALESCE((ps.solo_stats->>'botlane_2v2_kills')::int, 0))::int as total_2v2_kills,
          SUM(COALESCE((ps.solo_stats->>'botlane_2v2_deaths')::int, 0))::int as total_2v2_deaths,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'gold')::numeric, 0)), 0) as avg_gold_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'xp')::numeric, 0)), 0) as avg_xp_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'cs')::numeric, 0)), 1) as avg_cs_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'kills')::numeric, 0)), 2) as avg_kills_at_15,
          ROUND(AVG(COALESCE((ps.timing_data->'15'->>'deaths')::numeric, 0)), 2) as avg_deaths_at_15,
          ROUND(CASE WHEN SUM(COALESCE(team_totals.team_kills_at_15, 0)) > 0
            THEN SUM(COALESCE((ps.timing_data->'15'->>'kills')::numeric, 0) + COALESCE((ps.timing_data->'15'->>'assists')::numeric, 0)) * 100.0 / SUM(COALESCE(team_totals.team_kills_at_15, 0))
            ELSE 0 END, 0) as avg_kp_at_15,
          ROUND(AVG(COALESCE(team_totals.team_kills_at_15, 0)), 2) as avg_team_kills_at_15,

          -- Proximity % (time near each role as % of own lane time)
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN COALESCE((ps.proximity->>'Top')::numeric, 0) * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_proximity_top,
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN COALESCE((ps.proximity->>'Jungle')::numeric, 0) * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_proximity_jungle,
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN COALESCE((ps.proximity->>'Mid')::numeric, 0) * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_proximity_mid,
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN COALESCE((ps.proximity->>'ADC')::numeric, 0) * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_proximity_adc,
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN COALESCE((ps.proximity->>'Support')::numeric, 0) * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_proximity_support,

          -- Isolation % (time alone as % of own lane time)
          ROUND(AVG(
            CASE WHEN COALESCE((ps.proximity->>ps.role)::numeric, 0) > 0
            THEN ps.isolation * 100.0 / (ps.proximity->>ps.role)::numeric
            ELSE 0 END
          ), 1) as avg_isolation,

          -- Solo kills
          ROUND(AVG(COALESCE((ps.solo_stats->>'solo_kills')::numeric, 0)), 2) as avg_solo_kills,

          -- Vision score per minute
          ROUND(SUM(COALESCE((ps.vision->>'score')::numeric, 0)) * 60.0 / GREATEST(SUM(g.duration), 1), 2) as avg_vspm,

          -- Plates destroyed
          ROUND(AVG(COALESCE((ps.plates->>'destroyed')::numeric, 0)), 2) as avg_plates

        FROM pro_player_stats ps
        JOIN pro_games g ON ps.game_id = g.game_id
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN players p ON ps.player_id = p.player_id
        LEFT JOIN LATERAL (
          SELECT SUM(ps2.kills) as team_kills,
                 SUM(ps2.gold_earned) as team_gold,
                 SUM(ps2.damage_dealt) as team_damage,
                 SUM(COALESCE((ps2.timing_data->'15'->>'kills')::numeric, 0)) as team_kills_at_15
          FROM pro_player_stats ps2
          WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
        ) team_totals ON true
        WHERE g.status IN ('completed', 'processed') ${filterSql}
        GROUP BY ps.player_id, p.current_pseudo
        HAVING COUNT(*) >= ?
        ORDER BY ${orderColumn} DESC
        OFFSET ?
        LIMIT ?
      `, [...filterBindings, parsedMinGames, (pageNum - 1) * perPageNum, perPageNum])

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
          avgDpmPost15: Number(row.avg_dpm_post_15),
          avgKillParticipation: Number(row.avg_kill_participation),
          avgGoldDiffAt15: Number(row.avg_gold_diff_at_15),
          totalKills: Number(row.total_kills),
          totalDeaths: Number(row.total_deaths),
          totalAssists: Number(row.total_assists),
          pentaKills: Number(row.penta_kills),
          avgVisionScore: Number(row.avg_vision_score),
          avgGoldShare: Number(row.avg_gold_share),
          avgDamageShare: Number(row.avg_damage_share),
          avgCsDiffAt15: Number(row.avg_cs_diff_at_15),
          avgXpDiffAt15: Number(row.avg_xp_diff_at_15),
          firstBloodParticipations: Number(row.first_blood_participations),
          firstBloodVictims: Number(row.first_blood_victims),
          doubleKills: Number(row.double_kills),
          tripleKills: Number(row.triple_kills),
          quadraKills: Number(row.quadra_kills),
          uniqueChampionsPlayed: Number(row.unique_champions_played),
          avgProximityTop: Number(row.avg_proximity_top),
          avgProximityJungle: Number(row.avg_proximity_jungle),
          avgProximityMid: Number(row.avg_proximity_mid),
          avgProximityAdc: Number(row.avg_proximity_adc),
          avgProximitySupport: Number(row.avg_proximity_support),
          avgIsolation: Number(row.avg_isolation),
          total2v2Kills: Number(row.total_2v2_kills),
          total2v2Deaths: Number(row.total_2v2_deaths),
          avgGoldAt15: Number(row.avg_gold_at_15),
          avgXpAt15: Number(row.avg_xp_at_15),
          avgCsAt15: Number(row.avg_cs_at_15),
          avgKillsAt15: Number(row.avg_kills_at_15),
          avgDeathsAt15: Number(row.avg_deaths_at_15),
          avgKpAt15: Number(row.avg_kp_at_15),
          avgTeamKillsAt15: Number(row.avg_team_kills_at_15),
          avgSoloKills: Number(row.avg_solo_kills),
          avgVspm: Number(row.avg_vspm),
          avgPlates: Number(row.avg_plates),
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
   * Cross-tournament team leaderboards (from per-game pro_team_stats)
   */
  async teamLeaderboards(ctx: HttpContext) {
    const {
      leagueId,
      leagueIds,
      years,
      tournamentIds,
      tier,
      isPlayoffs,
      startDate,
      endDate,
      minGames = 3,
      sortBy = 'winRate',
      page = 1,
      perPage = 20,
    } = ctx.request.qs()

    const parsedLeagueIds = this.parseIds(leagueIds) ?? (leagueId ? [Number(leagueId)] : [])
    const parsedYears = this.parseIds(years) ?? []
    const parsedTournamentIds = this.parseIds(tournamentIds) ?? []
    const parsedTier = tier && Number.isFinite(Number(tier)) ? Number(tier) : null
    const parsedIsPlayoffs = isPlayoffs === 'true' ? true : isPlayoffs === 'false' ? false : null
    const parsedMinGames = Math.max(1, Number(minGames) || 3)
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    const sortColumns: Record<string, string> = {
      winRate: 'game_win_rate',
      games: 'total_games',
      avgKills: 'avg_kills',
      avgDeaths: 'avg_deaths',
      avgDuration: 'avg_duration',
      avgTowers: 'avg_towers',
      avgDragons: 'avg_dragons',
      avgBarons: 'avg_barons',
      firstBloodRate: 'first_blood_rate',
      firstTowerRate: 'first_tower_rate',
      firstDragonRate: 'first_dragon_rate',
      firstHeraldRate: 'first_herald_rate',
      firstGrubsRate: 'first_grubs_rate',
      firstBaronRate: 'first_baron_rate',
      avgGoldAt15: 'avg_gold_at_15',
      avgGoldDiffAt15: 'avg_gold_diff_at_15',
      avgFirstDragonTime: 'avg_first_dragon_time',
      avgFirstTowerTime: 'avg_first_tower_time',
      dragonSoulRate: 'dragon_soul_rate',
      avgHeralds: 'avg_heralds',
      avgGrubs: 'avg_grubs',
      avgPlates: 'avg_plates',
      avgElderDragons: 'avg_elder_dragons',
      avgDragonsAt15: 'avg_dragons_at_15',
      avgTowersAt15: 'avg_towers_at_15',
      avgTotalGold: 'avg_total_gold',
      avgVisionScore: 'avg_vision_score',
      avgWardsPlaced: 'avg_wards_placed',
    }

    const orderColumn = sortColumns[sortBy] || 'game_win_rate'
    const resolvedLeagueIds = await this.resolveLeagueIds(parsedLeagueIds)

    // Build parameterized filters
    const filterClauses: string[] = []
    const filterBindings: unknown[] = []

    if (resolvedLeagueIds.length > 0) {
      filterClauses.push(`AND tr.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
      filterBindings.push(...resolvedLeagueIds)
    }
    if (parsedYears.length > 0) {
      filterClauses.push(`AND tr.year IN (${parsedYears.map(() => '?').join(',')})`)
      filterBindings.push(...parsedYears)
    }
    if (parsedTournamentIds.length > 0) {
      filterClauses.push(`AND ts.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
      filterBindings.push(...parsedTournamentIds)
    }
    if (parsedTier !== null) {
      filterClauses.push('AND pl.tier = ?')
      filterBindings.push(parsedTier)
    }
    if (parsedIsPlayoffs !== null) {
      filterClauses.push('AND tr.is_playoffs = ?')
      filterBindings.push(parsedIsPlayoffs)
    }

    // Date filters
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
    const parsedStartDate = startDate && isoDateRegex.test(String(startDate)) ? String(startDate) : null
    const parsedEndDate = endDate && isoDateRegex.test(String(endDate)) ? String(endDate) : null
    const needsDateFilter = parsedStartDate !== null || parsedEndDate !== null

    if (parsedStartDate) {
      filterClauses.push('AND COALESCE(g.started_at, m.started_at) >= ?::date')
      filterBindings.push(parsedStartDate)
    }
    if (parsedEndDate) {
      filterClauses.push("AND COALESCE(g.started_at, m.started_at) < ?::date + interval '1 day'")
      filterBindings.push(parsedEndDate)
    }

    const filterSql = filterClauses.join(' ')
    const needsLeagueJoin = parsedTier !== null

    const cacheKey = `pro:stats:team-lb:l=${[...parsedLeagueIds].sort().join(',') || 'all'}:y=${[...parsedYears].sort().join(',') || 'all'}:tn=${[...parsedTournamentIds].sort().join(',') || 'all'}:ti=${parsedTier ?? 'all'}:po=${parsedIsPlayoffs ?? 'all'}:sd=${parsedStartDate || 'all'}:ed=${parsedEndDate || 'all'}:${parsedMinGames}:${sortBy}:${pageNum}:${perPageNum}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      const leagueJoinSql = needsLeagueJoin ? 'LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id' : ''
      const dateJoinSql = needsDateFilter ? `
          JOIN pro_games g ON ts.game_id = g.game_id
          JOIN pro_matches m ON g.match_id = m.match_id` : ''

      const countResult = await db.rawQuery(`
        SELECT COUNT(*) as total FROM (
          SELECT ts.team_id
          FROM pro_team_stats ts
          JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
          ${leagueJoinSql}${dateJoinSql}
          WHERE 1=1 ${filterSql}
          GROUP BY ts.team_id
          HAVING COUNT(*) >= ?
        ) sub
      `, [...filterBindings, parsedMinGames])

      const total = Number(countResult.rows[0]?.total || 0)

      const dataResult = await db.rawQuery(`
        WITH team_agg AS (
          SELECT
            ts.team_id,
            t.current_name as team_name,
            COALESCE(t.short_name, t.current_name) as short_name,
            COUNT(*) as total_games,
            COUNT(*) FILTER (WHERE ts.win) as total_wins,
            ROUND(COUNT(*) FILTER (WHERE ts.win) * 100.0 / COUNT(*), 1) as game_win_rate,
            ROUND(AVG(ts.duration), 0) as avg_duration,
            ROUND(AVG(ts.kills)::numeric, 1) as avg_kills,
            ROUND(AVG(ts.deaths)::numeric, 1) as avg_deaths,
            ROUND(AVG(ts.towers)::numeric, 1) as avg_towers,
            ROUND(AVG(ts.dragons)::numeric, 1) as avg_dragons,
            ROUND(AVG(ts.barons)::numeric, 1) as avg_barons,
            ROUND(COUNT(*) FILTER (WHERE ts.first_blood) * 100.0 / COUNT(*), 1) as first_blood_rate,
            ROUND(COUNT(*) FILTER (WHERE ts.first_tower) * 100.0 / COUNT(*), 1) as first_tower_rate,
            ROUND(COUNT(*) FILTER (WHERE ts.first_dragon) * 100.0 / COUNT(*), 1) as first_dragon_rate,
            ROUND(COUNT(*) FILTER (WHERE ts.first_herald) * 100.0 / COUNT(*), 1) as first_herald_rate,
            ROUND(COUNT(*) FILTER (WHERE ts.first_grubs) * 100.0 / NULLIF(COUNT(*), 0), 1) as first_grubs_rate,
            ROUND(COUNT(*) FILTER (WHERE ts.first_baron) * 100.0 / NULLIF(COUNT(*), 0), 1) as first_baron_rate,
            ROUND(AVG(ts.gold_at_15)::numeric, 0) as avg_gold_at_15,
            ROUND(AVG(ts.gold_diff_at_15)::numeric, 0) as avg_gold_diff_at_15,
            COUNT(*) FILTER (WHERE ts.side = 'blue') as blue_games,
            COUNT(*) FILTER (WHERE ts.side = 'blue' AND ts.win) as blue_wins,
            COUNT(*) FILTER (WHERE ts.side = 'red') as red_games,
            COUNT(*) FILTER (WHERE ts.side = 'red' AND ts.win) as red_wins,
            -- First objective avg timings (only when team got the first)
            ROUND(AVG(ts.first_blood_time) FILTER (WHERE ts.first_blood_time IS NOT NULL)::numeric, 0) as avg_first_blood_time,
            ROUND(AVG(ts.first_tower_time) FILTER (WHERE ts.first_tower_time IS NOT NULL)::numeric, 0) as avg_first_tower_time,
            ROUND(AVG(ts.first_dragon_time) FILTER (WHERE ts.first_dragon_time IS NOT NULL)::numeric, 0) as avg_first_dragon_time,
            ROUND(AVG(ts.first_herald_time) FILTER (WHERE ts.first_herald_time IS NOT NULL)::numeric, 0) as avg_first_herald_time,
            ROUND(AVG(ts.first_baron_time) FILTER (WHERE ts.first_baron_time IS NOT NULL)::numeric, 0) as avg_first_baron_time,
            ROUND(AVG(ts.first_grubs_time) FILTER (WHERE ts.first_grubs_time IS NOT NULL)::numeric, 0) as avg_first_grubs_time,
            -- Dragon type averages per game
            ROUND(AVG(ts.fire_dragons)::numeric, 2) as avg_fire_dragons,
            ROUND(AVG(ts.ocean_dragons)::numeric, 2) as avg_ocean_dragons,
            ROUND(AVG(ts.mountain_dragons)::numeric, 2) as avg_mountain_dragons,
            ROUND(AVG(ts.air_dragons)::numeric, 2) as avg_air_dragons,
            ROUND(AVG(ts.hextech_dragons)::numeric, 2) as avg_hextech_dragons,
            ROUND(AVG(ts.chemtech_dragons)::numeric, 2) as avg_chemtech_dragons,
            ROUND(AVG(ts.elder_dragons)::numeric, 2) as avg_elder_dragons,
            -- Dragon soul rate
            ROUND(COUNT(*) FILTER (WHERE ts.dragon_soul) * 100.0 / NULLIF(COUNT(*), 0), 1) as dragon_soul_rate,
            -- Heralds, grubs, plates
            ROUND(AVG(ts.heralds)::numeric, 1) as avg_heralds,
            ROUND(AVG(ts.grubs)::numeric, 1) as avg_grubs,
            ROUND(AVG(ts.plates)::numeric, 1) as avg_plates,
            -- Early game @15min
            ROUND(AVG(ts.dragons_at_15)::numeric, 2) as avg_dragons_at_15,
            ROUND(AVG(ts.towers_at_15)::numeric, 2) as avg_towers_at_15,
            -- Gold and vision
            ROUND(AVG(ts.total_gold)::numeric, 0) as avg_total_gold,
            ROUND(AVG(ts.vision_score)::numeric, 1) as avg_vision_score,
            ROUND(AVG(ts.wards_placed)::numeric, 1) as avg_wards_placed,
            ROUND(AVG(ts.wards_destroyed)::numeric, 1) as avg_wards_destroyed,
            ROUND(AVG(ts.control_wards)::numeric, 1) as avg_control_wards
          FROM pro_team_stats ts
          JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
          ${leagueJoinSql}${dateJoinSql}
          LEFT JOIN teams t ON ts.team_id = t.team_id
          WHERE 1=1 ${filterSql}
          GROUP BY ts.team_id, t.current_name, t.short_name
          HAVING COUNT(*) >= ?
        ),
        match_agg AS (
          SELECT
            sub.team_id,
            COUNT(DISTINCT sub.match_id) as total_matches,
            COUNT(DISTINCT sub.match_id) FILTER (WHERE sub.match_won) as total_matches_won
          FROM (
            SELECT
              ts.match_id,
              ts.team_id,
              COUNT(*) FILTER (WHERE ts.win) > COUNT(*) FILTER (WHERE NOT ts.win) as match_won
            FROM pro_team_stats ts
            JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
            ${leagueJoinSql}${dateJoinSql}
            WHERE 1=1 ${filterSql}
            GROUP BY ts.match_id, ts.team_id
          ) sub
          GROUP BY sub.team_id
        )
        SELECT ta.*,
               COALESCE(ma.total_matches, 0) as total_matches,
               COALESCE(ma.total_matches_won, 0) as total_matches_won
        FROM team_agg ta
        LEFT JOIN match_agg ma ON ta.team_id = ma.team_id
        ORDER BY ${orderColumn} DESC
        OFFSET ?
        LIMIT ?
      `, [...filterBindings, parsedMinGames, ...filterBindings, (pageNum - 1) * perPageNum, perPageNum])

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
          avgDeaths: Number(row.avg_deaths),
          avgTowers: Number(row.avg_towers),
          avgDragons: Number(row.avg_dragons),
          avgBarons: Number(row.avg_barons),
          firstBloodRate: Number(row.first_blood_rate),
          firstTowerRate: Number(row.first_tower_rate),
          firstDragonRate: Number(row.first_dragon_rate),
          firstHeraldRate: Number(row.first_herald_rate),
          firstGrubsRate: Number(row.first_grubs_rate),
          firstBaronRate: Number(row.first_baron_rate),
          avgGoldAt15: Number(row.avg_gold_at_15),
          avgGoldDiffAt15: Number(row.avg_gold_diff_at_15),
          blueGames: Number(row.blue_games),
          blueWins: Number(row.blue_wins),
          redGames: Number(row.red_games),
          redWins: Number(row.red_wins),
          // First objective timings
          avgFirstBloodTime: row.avg_first_blood_time != null ? Number(row.avg_first_blood_time) : null,
          avgFirstTowerTime: row.avg_first_tower_time != null ? Number(row.avg_first_tower_time) : null,
          avgFirstDragonTime: row.avg_first_dragon_time != null ? Number(row.avg_first_dragon_time) : null,
          avgFirstHeraldTime: row.avg_first_herald_time != null ? Number(row.avg_first_herald_time) : null,
          avgFirstBaronTime: row.avg_first_baron_time != null ? Number(row.avg_first_baron_time) : null,
          avgFirstGrubsTime: row.avg_first_grubs_time != null ? Number(row.avg_first_grubs_time) : null,
          // Dragon type averages
          avgFireDragons: Number(row.avg_fire_dragons),
          avgOceanDragons: Number(row.avg_ocean_dragons),
          avgMountainDragons: Number(row.avg_mountain_dragons),
          avgAirDragons: Number(row.avg_air_dragons),
          avgHextechDragons: Number(row.avg_hextech_dragons),
          avgChemtechDragons: Number(row.avg_chemtech_dragons),
          avgElderDragons: Number(row.avg_elder_dragons),
          // Dragon soul & other objectives
          dragonSoulRate: Number(row.dragon_soul_rate),
          avgHeralds: Number(row.avg_heralds),
          avgGrubs: Number(row.avg_grubs),
          avgPlates: Number(row.avg_plates),
          // Early game @15min
          avgDragonsAt15: Number(row.avg_dragons_at_15),
          avgTowersAt15: Number(row.avg_towers_at_15),
          // Gold and vision
          avgTotalGold: Number(row.avg_total_gold),
          avgVisionScore: Number(row.avg_vision_score),
          avgWardsPlaced: Number(row.avg_wards_placed),
          avgWardsDestroyed: Number(row.avg_wards_destroyed),
          avgControlWards: Number(row.avg_control_wards),
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
    const { leagueId, leagueIds, years, tournamentIds, tier, isPlayoffs } = ctx.request.qs()
    const parsedLeagueIds = this.parseIds(leagueIds) ?? (leagueId ? [Number(leagueId)] : [])
    const parsedYears = this.parseIds(years) ?? []
    const parsedTournamentIds = this.parseIds(tournamentIds) ?? []
    const parsedTier = tier && Number.isFinite(Number(tier)) ? Number(tier) : null
    const parsedIsPlayoffs = isPlayoffs === 'true' ? true : isPlayoffs === 'false' ? false : null

    const cacheKey = `pro:stats:champion-stats:l=${[...parsedLeagueIds].sort().join(',') || 'all'}:y=${[...parsedYears].sort().join(',') || 'all'}:tn=${[...parsedTournamentIds].sort().join(',') || 'all'}:ti=${parsedTier ?? 'all'}:po=${parsedIsPlayoffs ?? 'all'}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      const resolvedLeagueIds = await this.resolveLeagueIds(parsedLeagueIds)
      const filterClauses: string[] = []
      const filterBindings: unknown[] = []

      if (resolvedLeagueIds.length > 0) {
        filterClauses.push(`AND t.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
        filterBindings.push(...resolvedLeagueIds)
      }
      if (parsedYears.length > 0) {
        filterClauses.push(`AND t.year IN (${parsedYears.map(() => '?').join(',')})`)
        filterBindings.push(...parsedYears)
      }
      if (parsedTournamentIds.length > 0) {
        filterClauses.push(`AND cs.tournament_id IN (${parsedTournamentIds.map(() => '?').join(',')})`)
        filterBindings.push(...parsedTournamentIds)
      }
      if (parsedTier !== null) {
        filterClauses.push('AND pl.tier = ?')
        filterBindings.push(parsedTier)
      }
      if (parsedIsPlayoffs !== null) {
        filterClauses.push('AND t.is_playoffs = ?')
        filterBindings.push(parsedIsPlayoffs)
      }

      const filterSql = filterClauses.join(' ')
      const needsLeagueJoin = parsedTier !== null
      const leagueJoinSql = needsLeagueJoin ? 'LEFT JOIN pro_leagues pl ON t.pro_league_id = pl.league_id' : ''

      const totalGamesResult = await db.rawQuery(`
        SELECT COUNT(DISTINCT g.game_id) as total
        FROM pro_games g
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments t ON m.tournament_id = t.tournament_id
        ${leagueJoinSql}
        WHERE g.status IN ('completed', 'processed') ${filterSql}
      `, [...filterBindings])
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
        ${leagueJoinSql}
        WHERE 1=1 ${filterSql}
        GROUP BY cs.champion_id
        ORDER BY SUM(cs.picks) DESC
      `, [...filterBindings])

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
   * GET /api/v1/pro/stats/league-stats
   * Aggregated match/game counts per league
   */
  async leagueStats(ctx: HttpContext) {
    const { leagueIds, years, tier, isPlayoffs } = ctx.request.qs()
    const parsedLeagueIds = this.parseIds(leagueIds) ?? []
    const parsedYears = this.parseIds(years) ?? []
    const parsedTier = tier && Number.isFinite(Number(tier)) ? Number(tier) : null
    const parsedIsPlayoffs = isPlayoffs === 'true' ? true : isPlayoffs === 'false' ? false : null

    const cacheKey = `pro:stats:league-stats:l=${[...parsedLeagueIds].sort().join(',') || 'all'}:y=${[...parsedYears].sort().join(',') || 'all'}:ti=${parsedTier ?? 'all'}:po=${parsedIsPlayoffs ?? 'all'}`

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.MEDIUM, async () => {
      const resolvedLeagueIds = await this.resolveLeagueIds(parsedLeagueIds)
      const filterClauses: string[] = []
      const filterBindings: unknown[] = []

      if (resolvedLeagueIds.length > 0) {
        filterClauses.push(`AND t.pro_league_id IN (${resolvedLeagueIds.map(() => '?').join(',')})`)
        filterBindings.push(...resolvedLeagueIds)
      }
      if (parsedYears.length > 0) {
        filterClauses.push(`AND t.year IN (${parsedYears.map(() => '?').join(',')})`)
        filterBindings.push(...parsedYears)
      }
      if (parsedTier !== null) {
        filterClauses.push('AND pl.tier = ?')
        filterBindings.push(parsedTier)
      }
      if (parsedIsPlayoffs !== null) {
        filterClauses.push('AND t.is_playoffs = ?')
        filterBindings.push(parsedIsPlayoffs)
      }

      const filterSql = filterClauses.join(' ')

      const dataResult = await db.rawQuery(`
        SELECT
          pl.league_id,
          pl.name,
          pl.short_name,
          pl.region,
          pl.tier,
          COUNT(DISTINCT m.match_id)::int as match_count,
          COUNT(DISTINCT g.game_id)::int as game_count,
          COUNT(DISTINCT CASE WHEN g.winner_team_id = g.blue_team_id THEN g.game_id END)::int as blue_wins,
          COUNT(DISTINCT CASE WHEN g.winner_team_id = g.red_team_id THEN g.game_id END)::int as red_wins,
          ROUND(AVG(g.duration) FILTER (WHERE g.duration > 0))::int as avg_duration
        FROM pro_leagues pl
        JOIN pro_tournaments t ON t.pro_league_id = pl.league_id
        JOIN pro_matches m ON m.tournament_id = t.tournament_id
        JOIN pro_games g ON g.match_id = m.match_id
        WHERE pl.canonical_league_id IS NULL
          AND g.status IN ('completed', 'processed')
          ${filterSql}
        GROUP BY pl.league_id, pl.name, pl.short_name, pl.region, pl.tier
        ORDER BY COUNT(DISTINCT g.game_id) DESC
      `, filterBindings)

      return dataResult.rows.map((row: Record<string, unknown>) => ({
        leagueId: Number(row.league_id),
        name: row.name,
        shortName: row.short_name,
        region: row.region,
        tier: Number(row.tier),
        matchCount: Number(row.match_count),
        gameCount: Number(row.game_count),
        blueWins: Number(row.blue_wins),
        redWins: Number(row.red_wins),
        avgDuration: Number(row.avg_duration) || 0,
      }))
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

  /**
   * GET /api/v1/pro/stats/teams
   * List all pro teams (for team filter dropdown)
   * Supports optional leagueId and year params to filter teams
   */
  async proTeams(ctx: HttpContext) {
    const { leagueId, year } = ctx.request.qs()
    const parsedLeagueId = leagueId ? Number(leagueId) : null
    const parsedYear = year ? Number(year) : null

    const cacheKey = `pro:stats:teams:${parsedLeagueId || 'all'}:${parsedYear || 'all'}`
    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      if (!parsedLeagueId && !parsedYear) {
        // No filters: use simpler query
        const dataResult = await db.rawQuery(`
          SELECT DISTINCT t.team_id, t.current_name as name, COALESCE(t.short_name, t.current_name) as short_name
          FROM teams t
          JOIN pro_team_stats ts ON ts.team_id = t.team_id
          ORDER BY COALESCE(t.short_name, t.current_name)
        `)
        return {
          data: dataResult.rows.map((row: Record<string, unknown>) => ({
            teamId: Number(row.team_id),
            name: row.name,
            shortName: row.short_name,
          })),
        }
      }

      // Filtered: join through games/matches/tournaments
      const clauses: string[] = []
      const bindings: (number | string)[] = []
      if (parsedLeagueId) {
        clauses.push('AND tr.pro_league_id = ?')
        bindings.push(parsedLeagueId)
      }
      if (parsedYear) {
        clauses.push('AND tr.year = ?')
        bindings.push(parsedYear)
      }
      const filterSql = clauses.join(' ')

      const dataResult = await db.rawQuery(`
        SELECT DISTINCT t.team_id, t.current_name as name, COALESCE(t.short_name, t.current_name) as short_name
        FROM teams t
        JOIN pro_team_stats ts ON ts.team_id = t.team_id
        JOIN pro_matches m ON ts.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        WHERE 1=1 ${filterSql}
        ORDER BY COALESCE(t.short_name, t.current_name)
      `, [...bindings])

      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          teamId: Number(row.team_id),
          name: row.name,
          shortName: row.short_name,
        })),
      }
    })
    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/players
   * List all pro players (for player H2H dropdown)
   */
  async proPlayers(ctx: HttpContext) {
    const cacheKey = 'pro:stats:players'
    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const dataResult = await db.rawQuery(`
        SELECT DISTINCT p.player_id, p.current_pseudo as name,
          (SELECT sub.role FROM pro_player_stats sub
           WHERE sub.player_id = p.player_id
           GROUP BY sub.role ORDER BY COUNT(*) DESC LIMIT 1
          ) as role,
          (SELECT COALESCE(st.short_name, st.current_name) FROM pro_player_stats sub2
           JOIN pro_games g2 ON sub2.game_id = g2.game_id
           LEFT JOIN teams st ON sub2.team_id = st.team_id
           WHERE sub2.player_id = p.player_id
           ORDER BY g2.started_at DESC NULLS LAST LIMIT 1
          ) as team_short_name
        FROM players p
        JOIN pro_player_stats ps ON ps.player_id = p.player_id
        ORDER BY p.current_pseudo
      `)
      return {
        data: dataResult.rows.map((row: Record<string, unknown>) => ({
          playerId: Number(row.player_id),
          name: row.name,
          role: row.role ?? null,
          teamShortName: row.team_short_name ?? null,
        })),
      }
    })
    return ctx.response.ok(result)
  }



  // --- Query helpers ---

  private async queryBoRecords(format: string, order: 'ASC' | 'DESC', filterSql: string, filterBindings: unknown[], boTeamFilterSql = '', boTeamFilterBindings: unknown[] = []) {
    const formatToWinScore: Record<string, number> = { bo1: 1, bo3: 2, bo5: 3 }
    const winScore = formatToWinScore[format]
    if (!winScore) return { rows: [] }

    return db.rawQuery(`
      WITH bo_games AS (
        SELECT m.match_id, m.format, m.team1_score, m.team2_score,
               SUM(g.duration) as total_duration,
               COUNT(g.game_id) as games_played,
               COALESCE(MIN(g.started_at), MIN(m.started_at)) as game_date,
               tr.name as tournament_name
        FROM pro_games g
        JOIN pro_matches m ON g.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
        WHERE g.status IN ('completed', 'processed')
          AND GREATEST(COALESCE(m.team1_score, 0), COALESCE(m.team2_score, 0)) = ?
          AND g.duration > 0
          ${filterSql}${boTeamFilterSql}
        GROUP BY m.match_id, m.format, m.team1_score, m.team2_score, tr.name
      ),
      bo_with_teams AS (
        SELECT bg.*,
               COALESCE(t1.short_name, t1.current_name) as team1_name, COALESCE(t2.short_name, t2.current_name) as team2_name,
               t1.current_name as team1_full_name, t2.current_name as team2_full_name,
               CASE WHEN ts1_wins > ts2_wins THEN COALESCE(t1.short_name, t1.current_name) ELSE COALESCE(t2.short_name, t2.current_name) END as winner_name
        FROM bo_games bg
        LEFT JOIN LATERAL (
          SELECT ts.team_id, COUNT(*) FILTER (WHERE ts.win) as wins
          FROM pro_team_stats ts WHERE ts.match_id = bg.match_id
          GROUP BY ts.team_id ORDER BY wins DESC LIMIT 1
        ) w1 ON true
        LEFT JOIN LATERAL (
          SELECT DISTINCT ts.team_id FROM pro_team_stats ts
          WHERE ts.match_id = bg.match_id AND ts.team_id != COALESCE(w1.team_id, 0)
          LIMIT 1
        ) w2 ON true
        LEFT JOIN teams t1 ON w1.team_id = t1.team_id
        LEFT JOIN teams t2 ON w2.team_id = t2.team_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE ts.win) as ts1_wins
          FROM pro_team_stats ts WHERE ts.match_id = bg.match_id AND ts.team_id = w1.team_id
        ) s1 ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) FILTER (WHERE ts.win) as ts2_wins
          FROM pro_team_stats ts WHERE ts.match_id = bg.match_id AND ts.team_id = COALESCE(w2.team_id, 0)
        ) s2 ON true
      )
      SELECT total_duration, format, team1_name, team2_name, team1_full_name, team2_full_name, winner_name,
             tournament_name, game_date, games_played
      FROM bo_with_teams
      ORDER BY total_duration ${order}
      LIMIT 50
    `, [winScore, ...filterBindings, ...boTeamFilterBindings])
  }

  private async queryGameStreaks(isWin: boolean, filterSql: string, filterBindings: unknown[], teamIdFilterSql = '', teamIdFilterBindings: unknown[] = []) {
    const winCondition = isWin ? 'win = true' : 'win = false'
    return db.rawQuery(`
      WITH game_results AS (
        SELECT ts.team_id, COALESCE(t.short_name, t.current_name) as team_name, g.started_at, ts.win,
          ROW_NUMBER() OVER (PARTITION BY ts.team_id ORDER BY g.started_at) -
          ROW_NUMBER() OVER (PARTITION BY ts.team_id, ts.win ORDER BY g.started_at) as grp
        FROM pro_team_stats ts
        JOIN pro_games g ON ts.game_id = g.game_id
        JOIN teams t ON ts.team_id = t.team_id
        JOIN pro_matches m ON ts.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
        WHERE g.status IN ('completed', 'processed') ${filterSql}${teamIdFilterSql}
      )
      SELECT team_name, COUNT(*) as streak_length,
             MIN(started_at) as streak_start, MAX(started_at) as streak_end
      FROM game_results
      WHERE ${winCondition}
      GROUP BY team_id, team_name, grp
      ORDER BY streak_length DESC
      LIMIT 50
    `, [...filterBindings, ...teamIdFilterBindings])
  }

  private async queryMatchStreaks(isWin: boolean, filterSql: string, filterBindings: unknown[], teamIdFilterSql = '', teamIdFilterBindings: unknown[] = []) {
    const winCondition = isWin ? 'match_won = true' : 'match_won = false'
    return db.rawQuery(`
      WITH match_results AS (
        SELECT ts.team_id, COALESCE(t.short_name, t.current_name) as team_name, ts.match_id,
               MIN(g.started_at) as match_date,
               COUNT(*) FILTER (WHERE ts.win) > COUNT(*) FILTER (WHERE NOT ts.win) as match_won
        FROM pro_team_stats ts
        JOIN pro_games g ON ts.game_id = g.game_id
        JOIN teams t ON ts.team_id = t.team_id
        JOIN pro_matches m ON ts.match_id = m.match_id
        JOIN pro_tournaments tr ON m.tournament_id = tr.tournament_id
        LEFT JOIN pro_leagues pl ON tr.pro_league_id = pl.league_id
        WHERE g.status IN ('completed', 'processed') ${filterSql}${teamIdFilterSql}
        GROUP BY ts.team_id, t.current_name, t.short_name, ts.match_id
      ),
      numbered AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY match_date) -
          ROW_NUMBER() OVER (PARTITION BY team_id, match_won ORDER BY match_date) as grp
        FROM match_results
      )
      SELECT team_name, COUNT(*) as streak_length,
             MIN(match_date) as streak_start, MAX(match_date) as streak_end
      FROM numbered
      WHERE ${winCondition}
      GROUP BY team_id, team_name, grp
      ORDER BY streak_length DESC
      LIMIT 50
    `, [...filterBindings, ...teamIdFilterBindings])
  }

  /**
   * GET /api/v1/pro/stats/filter-map
   * Returns independent filter lists (no cascading).
   * Each dropdown shows all available values — lightweight queries with EXISTS.
   */
  async filterMap(ctx: HttpContext) {
    const cacheKey = 'pro:stats:filter-map'

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const [yearsResult, leaguesResult, teamsResult, playersResult, tournamentsResult] = await Promise.all([
        // Years: distinct years from tournaments that have completed games
        db.rawQuery(`
          SELECT DISTINCT tr.year
          FROM pro_tournaments tr
          JOIN pro_matches m ON m.tournament_id = tr.tournament_id
          JOIN pro_games g ON g.match_id = m.match_id
          WHERE g.status IN ('completed', 'processed')
            AND tr.year IS NOT NULL AND tr.pro_league_id IS NOT NULL
          ORDER BY tr.year DESC
        `),

        // Leagues (only canonical — aliases are hidden)
        db.rawQuery(`
          SELECT league_id, name, short_name, tier FROM pro_leagues
          WHERE canonical_league_id IS NULL
          ORDER BY name
        `),

        // Teams (only those with completed/processed games)
        db.rawQuery(`
          SELECT DISTINCT t.team_id, t.current_name as name, COALESCE(t.short_name, t.current_name) as short_name
          FROM teams t
          WHERE EXISTS (
            SELECT 1 FROM pro_player_stats ps
            JOIN pro_games g ON ps.game_id = g.game_id
            WHERE ps.team_id = t.team_id AND g.status IN ('completed', 'processed')
          )
          ORDER BY COALESCE(t.short_name, t.current_name)
        `),

        // Players (only those with completed/processed games)
        db.rawQuery(`
          SELECT DISTINCT p.player_id, p.current_pseudo as name
          FROM players p
          WHERE EXISTS (
            SELECT 1 FROM pro_player_stats ps
            JOIN pro_games g ON ps.game_id = g.game_id
            WHERE ps.player_id = p.player_id AND g.status IN ('completed', 'processed')
          )
          ORDER BY p.current_pseudo
        `),

        // Tournaments (only those with completed/processed games)
        db.rawQuery(`
          SELECT DISTINCT t.tournament_id, t.name
          FROM pro_tournaments t
          WHERE EXISTS (
            SELECT 1 FROM pro_matches m
            JOIN pro_games g ON g.match_id = m.match_id
            WHERE m.tournament_id = t.tournament_id AND g.status IN ('completed', 'processed')
          )
            AND t.year IS NOT NULL AND t.pro_league_id IS NOT NULL
          ORDER BY t.name
        `),
      ])

      // Extract distinct tiers from leagues
      const tiers = [...new Set(leaguesResult.rows.map((r: Record<string, unknown>) => Number(r.tier ?? 1)))].sort((a: number, b: number) => a - b)

      return {
        years: yearsResult.rows.map((r: Record<string, unknown>) => Number(r.year)),
        tiers,
        leagues: leaguesResult.rows.map((r: Record<string, unknown>) => ({
          leagueId: Number(r.league_id),
          name: r.name as string,
          shortName: (r.short_name as string) ?? null,
          tier: Number(r.tier ?? 1),
        })),
        teams: teamsResult.rows.map((r: Record<string, unknown>) => ({
          teamId: Number(r.team_id),
          name: r.name as string,
          shortName: r.short_name as string,
        })),
        players: playersResult.rows.map((r: Record<string, unknown>) => ({
          playerId: Number(r.player_id),
          name: r.name as string,
        })),
        tournaments: tournamentsResult.rows.map((r: Record<string, unknown>) => ({
          tournamentId: Number(r.tournament_id),
          name: r.name as string,
        })),
      }
    })

    return ctx.response.ok(result)
  }

  /**
   * GET /api/v1/pro/stats/years
   * Distinct years from pro_tournaments
   */
  async years(ctx: HttpContext) {
    const cacheKey = 'pro:stats:years'
    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.LONG, async () => {
      const dataResult = await db.rawQuery(`
        SELECT DISTINCT year FROM pro_tournaments
        WHERE year IS NOT NULL ORDER BY year DESC
      `)
      return { data: dataResult.rows.map((r: Record<string, unknown>) => Number(r.year)) }
    })
    return ctx.response.ok(result)
  }

  // --- Format helpers ---

  private parseIds(value: string | undefined, max = 50): number[] | null {
    if (!value || typeof value !== 'string') return null
    const ids = value
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, max)
    return ids.length > 0 ? ids : null
  }

  /**
   * Resolve league IDs to include their aliases.
   * If a user selects LEC, this also returns the EU LCS league_id
   * (any league whose canonical_league_id is in the given set).
   */
  private async resolveLeagueIds(ids: number[]): Promise<number[]> {
    if (ids.length === 0) return ids
    const aliasRows = await db.rawQuery(
      `SELECT league_id FROM pro_leagues WHERE canonical_league_id IN (${ids.map(() => '?').join(',')})`,
      ids
    )
    const aliasIds: number[] = aliasRows.rows.map((r: Record<string, unknown>) => Number(r.league_id))
    // Return union of original + alias IDs (deduplicated)
    return [...new Set([...ids, ...aliasIds])]
  }

  private secureCompare(a: string, b: string): boolean {
    const hash = (s: string) => createHash('sha256').update(s).digest()
    return timingSafeEqual(hash(a), hash(b))
  }

  private formatPlayerRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      playerName: row.player_name,
      championId: row.champion_id != null && Number(row.champion_id) !== 0 ? Number(row.champion_id) : null,
      value: Number(row.value),
      teamName: row.team_name,
      teamFullName: row.team_full_name ?? null,
      opponentName: row.opponent_name ?? null,
      role: row.role ?? null,
      tournamentName: row.tournament_name,
      gameDate: row.game_date,
      kills: row.kills != null ? Number(row.kills) : undefined,
      deaths: row.deaths != null ? Number(row.deaths) : undefined,
      assists: row.assists != null ? Number(row.assists) : undefined,
      duration: row.duration != null ? Number(row.duration) : undefined,
      win: row.win ?? null,
      gameNumber: row.game_number != null ? Number(row.game_number) : null,
    }))
  }

  private formatTeamRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => {
      const bluePicks = [row.team1_pick_1, row.team1_pick_2, row.team1_pick_3, row.team1_pick_4, row.team1_pick_5].filter((v) => v != null).map(Number)
      const redPicks = [row.team2_pick_1, row.team2_pick_2, row.team2_pick_3, row.team2_pick_4, row.team2_pick_5].filter((v) => v != null).map(Number)
      const winnerIsBlue = row.winner_is_blue === true || row.winner_is_blue === 't'
      return {
        value: Number(row.value),
        winnerName: row.winner_name,
        winnerFullName: row.winner_full_name ?? null,
        loserName: row.loser_name,
        loserFullName: row.loser_full_name ?? null,
        tournamentName: row.tournament_name,
        gameDate: row.game_date,
        win: row.win ?? null,
        gameNumber: row.game_number != null ? Number(row.game_number) : null,
        winnerComp: winnerIsBlue ? bluePicks : redPicks,
        loserComp: winnerIsBlue ? redPicks : bluePicks,
        winnerSide: bluePicks.length > 0 || redPicks.length > 0 ? (winnerIsBlue ? 'blue' : 'red') : null,
      }
    })
  }

  private formatBoRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      value: Number(row.total_duration),
      format: row.format,
      team1Name: row.team1_name ?? null,
      team1FullName: row.team1_full_name ?? null,
      team2Name: row.team2_name ?? null,
      team2FullName: row.team2_full_name ?? null,
      winnerName: row.winner_name ?? null,
      tournamentName: row.tournament_name,
      gameDate: row.game_date ?? null,
      gamesPlayed: Number(row.games_played),
    }))
  }

  private formatStreakRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      teamName: row.team_name,
      value: Number(row.streak_length),
      streakStart: row.streak_start ?? null,
      streakEnd: row.streak_end ?? null,
    }))
  }

  private formatQuestGapRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      gap: Number(row.gap),
      fastPlayerName: row.fast_player_name,
      fastChampionId: row.fast_champion_id != null && Number(row.fast_champion_id) !== 0 ? Number(row.fast_champion_id) : null,
      fastQuestTime: Number(row.fast_quest_time),
      fastTeamName: row.fast_team_name ?? null,
      fastTeamFullName: row.fast_team_full_name ?? null,
      slowPlayerName: row.slow_player_name,
      slowChampionId: row.slow_champion_id != null && Number(row.slow_champion_id) !== 0 ? Number(row.slow_champion_id) : null,
      slowQuestTime: Number(row.slow_quest_time),
      slowTeamName: row.slow_team_name ?? null,
      slowTeamFullName: row.slow_team_full_name ?? null,
      role: row.role ?? null,
      fastWin: row.fast_win ?? null,
      tournamentName: row.tournament_name,
      gameDate: row.game_date,
      gameNumber: row.game_number != null ? Number(row.game_number) : null,
    }))
  }

  private formatTournamentPlayerRecords(rows: Record<string, unknown>[]) {
    return rows.map((row) => ({
      playerName: String(row.player_name ?? 'Unknown'),
      teamName: row.team_name ?? null,
      teamFullName: row.team_full_name ?? null,
      role: row.role ?? null,
      tournamentName: row.tournament_name,
      leagueShortName: row.league_short_name ?? null,
      gamesPlayed: Number(row.games_played),
      gamesWon: row.games_won != null ? Number(row.games_won) : undefined,
      winRate: row.games_won != null && Number(row.games_played) > 0
        ? Math.round(Number(row.games_won) * 1000 / Number(row.games_played)) / 10
        : undefined,
      value: row.value != null ? Number(row.value) : 0,
      kills: row.kills != null ? Number(row.kills) : undefined,
      deaths: row.deaths != null ? Number(row.deaths) : undefined,
      assists: row.assists != null ? Number(row.assists) : undefined,
    }))
  }

}
