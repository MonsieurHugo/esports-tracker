import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { sanitizeLikeInput } from '#utils/validation'
import { cacheService, CACHE_TTL } from '#services/cache_service'
import type { TournamentRow, MatchRow, PlayerStatsRow, DraftActionRow } from '#types/pro_monitoring'

export default class ProDataController {
  /**
   * GET /api/v1/pro/monitoring/tournaments
   * List tournaments with filters
   */
  async tournaments(ctx: HttpContext) {
    const { year, search, leagueId } = ctx.request.qs()

    let query = db
      .from('pro_tournaments as t')
      .leftJoin('pro_matches as m', 't.tournament_id', 'm.tournament_id')
      .leftJoin('pro_games as g', 'm.match_id', 'g.match_id')
      .leftJoin('pro_leagues as l', 't.pro_league_id', 'l.league_id')
      .select(
        't.tournament_id',
        't.external_id',
        't.name',
        't.year',
        't.split',
        't.tournament_level',
        't.start_date',
        't.end_date',
        't.pro_league_id',
        't.parent_tournament_id',
        'l.name as league_name',
        'l.short_name as league_short_name',
        db.raw('COUNT(DISTINCT m.match_id)::int as match_count'),
        db.raw('COUNT(DISTINCT g.game_id)::int as game_count'),
        db.raw(
          '(SELECT COUNT(*)::int FROM pro_tournaments c WHERE c.parent_tournament_id = t.tournament_id) as child_count'
        )
      )
      .groupBy(
        't.tournament_id',
        't.external_id',
        't.name',
        't.year',
        't.split',
        't.tournament_level',
        't.start_date',
        't.end_date',
        't.pro_league_id',
        't.parent_tournament_id',
        'l.name',
        'l.short_name'
      )
      .orderBy('t.start_date', 'desc')

    if (year) {
      query = query.where('t.year', Number(year))
    }

    if (leagueId) {
      if (leagueId === 'unassigned') {
        query = query.whereNull('t.pro_league_id')
      } else {
        query = query.where('t.pro_league_id', Number(leagueId))
      }
    }

    if (search && typeof search === 'string' && search.trim().length >= 2) {
      const sanitizedSearch = sanitizeLikeInput(search, 100)
      query = query.whereILike('t.name', `%${sanitizedSearch}%`)
    }

    const tournaments = await query

    return ctx.response.ok({
      data: tournaments.map((t: TournamentRow) => ({
        id: t.tournament_id,
        externalId: t.external_id,
        name: t.name,
        year: t.year,
        split: t.split,
        tournamentLevel: t.tournament_level,
        startDate: t.start_date,
        endDate: t.end_date,
        matchCount: t.match_count,
        gameCount: t.game_count,
        leagueId: t.pro_league_id,
        leagueName: t.league_name,
        leagueShortName: t.league_short_name,
        parentTournamentId: t.parent_tournament_id,
        childCount: Number(t.child_count) || 0,
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/matches
   * List matches with filters and pagination
   */
  async matches(ctx: HttpContext) {
    const { status, tournamentId, leagueId, teamSearch, page = 1, perPage = 20 } = ctx.request.qs()

    let query = db
      .from('pro_matches as m')
      .leftJoin('pro_tournaments as t', 'm.tournament_id', 't.tournament_id')
      .leftJoin('pro_teams as t1', 'm.team1_external_id', 't1.external_id')
      .leftJoin('pro_teams as t2', 'm.team2_external_id', 't2.external_id')
      .leftJoin('pro_games as g', 'm.match_id', 'g.match_id')
      .select(
        'm.match_id',
        'm.external_id',
        't1.name as team1_name',
        't2.name as team2_name',
        'm.team1_score',
        'm.team2_score',
        'm.status',
        'm.started_at',
        't.name as tournament_name',
        db.raw('COUNT(DISTINCT g.game_id)::int as game_count')
      )
      .groupBy(
        'm.match_id',
        'm.external_id',
        't1.name',
        't2.name',
        'm.team1_score',
        'm.team2_score',
        'm.status',
        'm.started_at',
        't.name'
      )

    if (status && status !== 'all') {
      query = query.where('m.status', status)
    }

    if (tournamentId) {
      query = query.where('m.tournament_id', Number(tournamentId))
    }

    if (leagueId) {
      query = query.where('t.pro_league_id', Number(leagueId))
    }

    if (teamSearch && typeof teamSearch === 'string' && teamSearch.trim().length >= 2) {
      const sanitizedSearch = sanitizeLikeInput(teamSearch, 100)
      query = query.where((qb) => {
        qb.whereILike('t1.name', `%${sanitizedSearch}%`).orWhereILike(
          't2.name',
          `%${sanitizedSearch}%`
        )
      })
    }

    // Sorting
    query = query.orderBy('m.started_at', 'desc')

    // Pagination
    const pageNum = Math.max(1, Number(page))
    const perPageNum = Math.min(100, Math.max(1, Number(perPage)))

    // Build count query with same filters
    let countQuery = db
      .from('pro_matches as m')
      .leftJoin('pro_tournaments as t', 'm.tournament_id', 't.tournament_id')
      .leftJoin('pro_teams as t1', 'm.team1_external_id', 't1.external_id')
      .leftJoin('pro_teams as t2', 'm.team2_external_id', 't2.external_id')

    if (status && status !== 'all') {
      countQuery = countQuery.where('m.status', status)
    }
    if (tournamentId) {
      countQuery = countQuery.where('m.tournament_id', Number(tournamentId))
    }
    if (leagueId) {
      countQuery = countQuery.where('t.pro_league_id', Number(leagueId))
    }
    if (teamSearch && typeof teamSearch === 'string' && teamSearch.trim().length >= 2) {
      const sanitizedCountSearch = sanitizeLikeInput(teamSearch, 100)
      countQuery = countQuery.where((qb) => {
        qb.whereILike('t1.name', `%${sanitizedCountSearch}%`).orWhereILike(
          't2.name',
          `%${sanitizedCountSearch}%`
        )
      })
    }

    const countResult = await countQuery.count('* as total').first()

    const matches = await query.offset((pageNum - 1) * perPageNum).limit(perPageNum)

    const total = Number(countResult?.total || 0)
    const lastPage = Math.ceil(total / perPageNum)

    return ctx.response.ok({
      data: matches.map((m: MatchRow) => ({
        id: m.match_id,
        externalId: m.external_id,
        team1Name: m.team1_name || 'TBD',
        team2Name: m.team2_name || 'TBD',
        team1Score: m.team1_score,
        team2Score: m.team2_score,
        status: m.status,
        startTime: m.started_at,
        tournamentName: m.tournament_name,
        gameCount: m.game_count,
      })),
      meta: {
        total,
        perPage: perPageNum,
        currentPage: pageNum,
        lastPage,
      },
    })
  }

  /**
   * GET /api/v1/pro/monitoring/games/:id
   * Get detailed game information
   */
  async game(ctx: HttpContext) {
    const gameId = ctx.params.id

    // Get game info
    const game = await db
      .from('pro_games as g')
      .leftJoin('pro_matches as m', 'g.match_id', 'm.match_id')
      .leftJoin('pro_teams as bt', 'g.blue_team_id', 'bt.team_id')
      .leftJoin('pro_teams as rt', 'g.red_team_id', 'rt.team_id')
      .select(
        'g.game_id',
        'g.game_number',
        'g.duration',
        'g.patch',
        'g.status',
        db.raw(`
          CASE
            WHEN g.winner_team_id = g.blue_team_id THEN 'blue'
            WHEN g.winner_team_id = g.red_team_id THEN 'red'
            ELSE NULL
          END as winner_team_side
        `),
        'bt.name as blue_team_name',
        'rt.name as red_team_name',
        'bt.external_id as blue_team_external_id',
        'm.team1_external_id',
        'm.team1_score',
        'm.team2_score'
      )
      .where('g.game_id', Number(gameId))
      .first()

    if (!game) {
      return ctx.response.notFound({ error: 'Game not found' })
    }

    // Determine if team1 is on blue or red side
    // team1/team2 = pick order, blue/red = map side
    // Since 2026, the blue team is not always the first to pick
    const team1Side =
      game.blue_team_external_id === game.team1_external_id ? 'blue' : 'red'

    // Get player stats and draft actions in parallel (independent queries)
    const [playerStats, draftActions] = await Promise.all([
      db
        .from('pro_player_stats as ps')
        .leftJoin('players as p', 'ps.player_id', 'p.player_id')
        .select(
          'p.current_pseudo as player_name',
          'ps.team_side',
          'ps.role',
          'ps.champion_id',
          'ps.kills',
          'ps.deaths',
          'ps.assists',
          'ps.cs',
          'ps.gold_earned',
          'ps.damage_dealt',
          'ps.kill_participation'
        )
        .where('ps.game_id', Number(gameId))
        .orderByRaw("CASE ps.team_side WHEN 'blue' THEN 0 ELSE 1 END")
        .orderByRaw(`
          CASE ps.role
            WHEN 'Top' THEN 1
            WHEN 'Jungle' THEN 2
            WHEN 'Mid' THEN 3
            WHEN 'ADC' THEN 4
            WHEN 'Support' THEN 5
            ELSE 6
          END
        `),
      db
        .from('pro_draft_actions as da')
        .select('da.action_order', 'da.action_type', 'da.team_side', 'da.champion_id', 'da.role')
        .where('da.game_id', Number(gameId))
        .orderBy('da.action_order', 'asc'),
    ])

    return ctx.response.ok({
      game: {
        id: game.game_id,
        gameNumber: game.game_number,
        duration: game.duration,
        winnerTeamSide: game.winner_team_side,
        patch: game.patch,
        team1Side,
      },
      teams: {
        team1: { name: game.blue_team_name, score: game.team1_score },
        team2: { name: game.red_team_name, score: game.team2_score },
      },
      playerStats: playerStats.map((ps: PlayerStatsRow) => ({
        playerName: ps.player_name,
        teamSide: ps.team_side,
        role: ps.role,
        championId: ps.champion_id,
        kills: ps.kills,
        deaths: ps.deaths,
        assists: ps.assists,
        cs: ps.cs,
        goldEarned: ps.gold_earned,
        damageDealt: ps.damage_dealt,
        killParticipation: Math.round((ps.kill_participation || 0) * 100),
      })),
      draftActions: draftActions.map((da: DraftActionRow) => ({
        actionOrder: da.action_order,
        actionType: da.action_type,
        teamOrder: da.team_side,
        championId: da.champion_id,
        role: da.role,
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/games/:id/events
   * Get game events (timeline)
   */
  async gameEvents(ctx: HttpContext) {
    const gameId = ctx.params.id

    const events = await db
      .from('pro_game_events')
      .where('game_id', Number(gameId))
      .select('*')
      .orderBy('game_time', 'asc')

    return ctx.response.ok({
      data: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        gameTime: e.game_time,
        actorPlayerName: e.actor_player_name,
        targetPlayerName: e.target_player_name,
        positionX: e.position_x,
        positionY: e.position_y,
        eventData: e.event_data,
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/games-by-match/:matchId
   * Get all games for a match
   */
  async gamesByMatch(ctx: HttpContext) {
    const matchId = ctx.params.matchId

    const games = await db
      .from('pro_games as g')
      .select(
        'g.game_id',
        'g.game_number',
        'g.duration',
        'g.patch',
        'g.status',
        db.raw(`
          CASE
            WHEN g.winner_team_id = g.blue_team_id THEN 'blue'
            WHEN g.winner_team_id = g.red_team_id THEN 'red'
            ELSE NULL
          END as winner_team_side
        `),
        'g.blue_towers',
        'g.red_towers',
        'g.blue_dragons',
        'g.red_dragons',
        'g.blue_barons',
        'g.red_barons'
      )
      .where('g.match_id', Number(matchId))
      .orderBy('g.game_number', 'asc')

    return ctx.response.ok({
      data: games.map((g) => ({
        id: g.game_id,
        gameNumber: g.game_number,
        duration: g.duration,
        patch: g.patch,
        status: g.status,
        winnerTeamSide: g.winner_team_side,
        blueTowers: g.blue_towers,
        redTowers: g.red_towers,
        blueDragons: g.blue_dragons,
        redDragons: g.red_dragons,
        blueBarons: g.blue_barons,
        redBarons: g.red_barons,
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/teams/rankings
   * Get team rankings with stats (from per-game pro_team_stats)
   */
  async teamRankings(ctx: HttpContext) {
    const { tournamentId, minGames = 1 } = ctx.request.qs()

    // Validate tournamentId is a positive integer if provided
    const parsedTournamentId = tournamentId ? Number(tournamentId) : null
    if (parsedTournamentId !== null && (!Number.isInteger(parsedTournamentId) || parsedTournamentId <= 0)) {
      return ctx.response.badRequest({ error: 'Invalid tournamentId. Must be a positive integer.' })
    }

    const parsedMinGames = Math.max(1, Number(minGames))

    const dataResult = await db.rawQuery(
      `
      WITH team_agg AS (
        SELECT
          ts.team_id,
          t.name as team_name,
          t.short_name,
          MAX(tr.name) as tournament_name,
          COUNT(*) as games_played,
          COUNT(*) FILTER (WHERE ts.win) as games_won,
          ROUND(COUNT(*) FILTER (WHERE ts.win) * 100.0 / COUNT(*), 1) as game_win_rate,
          ROUND(AVG(ts.duration), 0) as avg_game_duration,
          ROUND(AVG(ts.kills)::numeric, 1) as avg_kills,
          ROUND(AVG(ts.towers)::numeric, 1) as avg_towers,
          ROUND(AVG(ts.dragons)::numeric, 1) as avg_dragons,
          ROUND(AVG(ts.barons)::numeric, 1) as avg_barons,
          ROUND(COUNT(*) FILTER (WHERE ts.first_blood) * 100.0 / COUNT(*), 1) as first_blood_rate,
          ROUND(COUNT(*) FILTER (WHERE ts.first_tower) * 100.0 / COUNT(*), 1) as first_tower_rate,
          ROUND(COUNT(*) FILTER (WHERE ts.first_dragon) * 100.0 / COUNT(*), 1) as first_dragon_rate,
          ROUND(COUNT(*) FILTER (WHERE ts.first_herald) * 100.0 / COUNT(*), 1) as first_herald_rate,
          COUNT(*) FILTER (WHERE ts.side = 'blue') as blue_side_games,
          COUNT(*) FILTER (WHERE ts.side = 'blue' AND ts.win) as blue_side_wins,
          COUNT(*) FILTER (WHERE ts.side = 'red') as red_side_games,
          COUNT(*) FILTER (WHERE ts.side = 'red' AND ts.win) as red_side_wins
        FROM pro_team_stats ts
        JOIN pro_tournaments tr ON ts.tournament_id = tr.tournament_id
        LEFT JOIN pro_teams t ON ts.team_id = t.team_id
        WHERE (?::int IS NULL OR ts.tournament_id = ?)
        GROUP BY ts.team_id, t.name, t.short_name
        HAVING COUNT(*) >= ?
      ),
      match_agg AS (
        SELECT
          sub.team_id,
          COUNT(DISTINCT sub.match_id) as matches_played,
          COUNT(DISTINCT sub.match_id) FILTER (WHERE sub.match_won) as matches_won
        FROM (
          SELECT
            ts.match_id,
            ts.team_id,
            COUNT(*) FILTER (WHERE ts.win) > COUNT(*) FILTER (WHERE NOT ts.win) as match_won
          FROM pro_team_stats ts
          WHERE (?::int IS NULL OR ts.tournament_id = ?)
          GROUP BY ts.match_id, ts.team_id
        ) sub
        GROUP BY sub.team_id
      )
      SELECT ta.*,
             COALESCE(ma.matches_played, 0) as matches_played,
             COALESCE(ma.matches_won, 0) as matches_won,
             ROUND(COALESCE(ma.matches_won, 0) * 100.0 / GREATEST(COALESCE(ma.matches_played, 1), 1), 1) as match_win_rate
      FROM team_agg ta
      LEFT JOIN match_agg ma ON ta.team_id = ma.team_id
      ORDER BY game_win_rate DESC, games_played DESC
      `,
      [parsedTournamentId, parsedTournamentId, parsedMinGames, parsedTournamentId, parsedTournamentId]
    )

    return ctx.response.ok({
      data: dataResult.rows.map((t: Record<string, unknown>) => ({
        teamId: t.team_id,
        teamName: t.team_name,
        shortName: t.short_name,
        tournamentName: t.tournament_name,
        matchesPlayed: Number(t.matches_played),
        matchesWon: Number(t.matches_won),
        gamesPlayed: Number(t.games_played),
        gamesWon: Number(t.games_won),
        matchWinRate: Number(t.match_win_rate) || 0,
        gameWinRate: Number(t.game_win_rate) || 0,
        firstBloodRate: Number(t.first_blood_rate) || 0,
        firstTowerRate: Number(t.first_tower_rate) || 0,
        firstDragonRate: Number(t.first_dragon_rate) || 0,
        firstHeraldRate: Number(t.first_herald_rate) || 0,
        avgGameDuration: Number(t.avg_game_duration) || 0,
        avgKills: Number(t.avg_kills) || 0,
        avgTowers: Number(t.avg_towers) || 0,
        avgDragons: Number(t.avg_dragons) || 0,
        avgBarons: Number(t.avg_barons) || 0,
        blueSideGames: Number(t.blue_side_games),
        blueSideWins: Number(t.blue_side_wins),
        redSideGames: Number(t.red_side_games),
        redSideWins: Number(t.red_side_wins),
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/players/rankings
   * Get player rankings with stats
   */
  async playerRankings(ctx: HttpContext) {
    const { tournamentId, role, teamId, minGames = 1 } = ctx.request.qs()

    const clauses: string[] = []
    const bindings: (number | string)[] = []

    if (tournamentId) {
      clauses.push('AND m.tournament_id = ?')
      bindings.push(Number(tournamentId))
    }
    if (role) {
      clauses.push('AND ps.role = ?')
      bindings.push(role)
    }
    if (teamId) {
      clauses.push('AND ps.team_id = ?')
      bindings.push(Number(teamId))
    }

    const filterSql = clauses.join(' ')
    const parsedMinGames = Math.max(1, Number(minGames) || 1)

    const result = await db.rawQuery(`
      SELECT
        ps.player_id,
        p.current_pseudo as player_name,
        -- Most played role
        (SELECT sub.role FROM pro_player_stats sub
         JOIN pro_games sg ON sub.game_id = sg.game_id
         JOIN pro_matches sm ON sg.match_id = sm.match_id
         WHERE sub.player_id = ps.player_id
           ${tournamentId ? 'AND sm.tournament_id = ?' : ''}
         GROUP BY sub.role ORDER BY COUNT(*) DESC LIMIT 1
        ) as role,
        -- Most recent team
        (SELECT COALESCE(st.short_name, st.name) FROM pro_player_stats sub2
         JOIN pro_games g2 ON sub2.game_id = g2.game_id
         LEFT JOIN pro_teams st ON sub2.team_id = st.team_id
         WHERE sub2.player_id = ps.player_id
         ORDER BY g2.started_at DESC NULLS LAST LIMIT 1
        ) as team_short_name,
        (SELECT st2.name FROM pro_player_stats sub3
         JOIN pro_games g3 ON sub3.game_id = g3.game_id
         LEFT JOIN pro_teams st2 ON sub3.team_id = st2.team_id
         WHERE sub3.player_id = ps.player_id
         ORDER BY g3.started_at DESC NULLS LAST LIMIT 1
        ) as team_name,
        -- Tournament name (first tournament if multiple)
        (SELECT tr2.name FROM pro_matches m2
         JOIN pro_tournaments tr2 ON m2.tournament_id = tr2.tournament_id
         JOIN pro_games g4 ON g4.match_id = m2.match_id
         JOIN pro_player_stats sub4 ON sub4.game_id = g4.game_id
         WHERE sub4.player_id = ps.player_id
         ORDER BY tr2.start_date DESC NULLS LAST LIMIT 1
        ) as tournament_name,
        COUNT(*)::int as games_played,
        COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id)::int as games_won,
        ROUND(COUNT(*) FILTER (WHERE g.winner_team_id = ps.team_id) * 100.0 / GREATEST(COUNT(*), 1), 1) as win_rate,
        ROUND(AVG(ps.kills), 2) as avg_kills,
        ROUND(AVG(ps.deaths), 2) as avg_deaths,
        ROUND(AVG(ps.assists), 2) as avg_assists,
        ROUND((SUM(ps.kills) + SUM(ps.assists))::numeric / GREATEST(SUM(ps.deaths), 1), 2) as avg_kda,
        ROUND(AVG(ps.cs * 60.0 / GREATEST(g.duration, 1)), 2) as avg_cs_per_min,
        ROUND(AVG(ps.gold_earned * 60.0 / GREATEST(g.duration, 1)), 0) as avg_gold_per_min,
        ROUND(AVG(ps.damage_dealt * 60.0 / GREATEST(g.duration, 1)), 0) as avg_damage_per_min,
        ROUND(AVG(COALESCE((ps.vision->>'score')::numeric, 0)), 1) as avg_vision_score,
        ROUND(AVG(
          CASE WHEN tk.total_team_kills > 0
          THEN (ps.kills + ps.assists) * 100.0 / tk.total_team_kills
          ELSE 0 END
        ), 1) as avg_kill_participation,
        ROUND(AVG(
          CASE WHEN tg.total_team_gold > 0
          THEN ps.gold_earned * 100.0 / tg.total_team_gold
          ELSE 0 END
        ), 1) as avg_gold_share,
        ROUND(AVG(
          CASE WHEN td.total_team_damage > 0
          THEN ps.damage_dealt * 100.0 / td.total_team_damage
          ELSE 0 END
        ), 1) as avg_damage_share,
        ROUND(AVG(COALESCE((ps.timing_data->'15'->>'cs_diff')::numeric, 0)), 1) as avg_cs_diff_at_15,
        ROUND(AVG(COALESCE((ps.timing_data->'15'->>'gold_diff')::numeric, 0)), 0) as avg_gold_diff_at_15,
        COUNT(DISTINCT ps.champion_id)::int as unique_champions_played,
        SUM(COALESCE((ps.multi_kills->>'double')::int, 0))::int as double_kills,
        SUM(COALESCE((ps.multi_kills->>'triple')::int, 0))::int as triple_kills,
        SUM(COALESCE((ps.multi_kills->>'quadra')::int, 0))::int as quadra_kills,
        SUM(COALESCE((ps.multi_kills->>'penta')::int, 0))::int as penta_kills
      FROM pro_player_stats ps
      JOIN pro_games g ON ps.game_id = g.game_id
      JOIN pro_matches m ON g.match_id = m.match_id
      LEFT JOIN players p ON ps.player_id = p.player_id
      LEFT JOIN LATERAL (
        SELECT SUM(ps2.kills) as total_team_kills
        FROM pro_player_stats ps2
        WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
      ) tk ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ps2.gold_earned) as total_team_gold
        FROM pro_player_stats ps2
        WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
      ) tg ON true
      LEFT JOIN LATERAL (
        SELECT SUM(ps2.damage_dealt) as total_team_damage
        FROM pro_player_stats ps2
        WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
      ) td ON true
      WHERE g.status IN ('completed', 'processed')
        AND ps.player_id IS NOT NULL
        ${filterSql}
      GROUP BY ps.player_id, p.current_pseudo
      HAVING COUNT(*) >= ?
      ORDER BY avg_kda DESC, games_played DESC
    `, [...(tournamentId ? [Number(tournamentId)] : []), ...bindings, parsedMinGames])

    return ctx.response.ok({
      data: result.rows.map((p: Record<string, unknown>) => ({
        playerId: Number(p.player_id),
        playerName: p.player_name,
        role: p.role ?? null,
        teamName: p.team_name ?? null,
        teamShortName: p.team_short_name ?? null,
        tournamentName: p.tournament_name ?? null,
        gamesPlayed: Number(p.games_played),
        gamesWon: Number(p.games_won),
        winRate: Number(p.win_rate) || 0,
        avgKills: Number(p.avg_kills) || 0,
        avgDeaths: Number(p.avg_deaths) || 0,
        avgAssists: Number(p.avg_assists) || 0,
        avgKda: Number(p.avg_kda) || 0,
        avgCsPerMin: Number(p.avg_cs_per_min) || 0,
        avgGoldPerMin: Number(p.avg_gold_per_min) || 0,
        avgDamagePerMin: Number(p.avg_damage_per_min) || 0,
        avgVisionScore: Number(p.avg_vision_score) || 0,
        avgKillParticipation: Number(p.avg_kill_participation) || 0,
        avgGoldShare: Number(p.avg_gold_share) || 0,
        avgDamageShare: Number(p.avg_damage_share) || 0,
        avgCsDiffAt15: Number(p.avg_cs_diff_at_15) || 0,
        avgGoldDiffAt15: Number(p.avg_gold_diff_at_15) || 0,
        uniqueChampionsPlayed: Number(p.unique_champions_played),
        doubleKills: Number(p.double_kills),
        tripleKills: Number(p.triple_kills),
        quadraKills: Number(p.quadra_kills),
        pentaKills: Number(p.penta_kills),
      })),
    })
  }

  /**
   * GET /api/v1/pro/monitoring/champions/stats
   * Get champion statistics with flexible filtering
   *
   * Query params:
   * - leagueId: Filter by pro_leagues.league_id
   * - tournamentIds: Comma-separated tournament IDs (max 100)
   * - startDate: ISO date string for start of date range
   * - endDate: ISO date string for end of date range
   * - patches: Comma-separated patch versions (max 100)
   * - minGames: Minimum number of games (picks + bans) for a champion to appear
   */
  async championStats(ctx: HttpContext) {
    const { leagueId, tournamentIds, startDate, endDate, patches, minGames = 1 } = ctx.request.qs()

    // Parse filter values
    const parsedLeagueId = leagueId ? Number(leagueId) : null

    // Validate leagueId is a positive integer if provided
    if (parsedLeagueId !== null && (!Number.isInteger(parsedLeagueId) || parsedLeagueId <= 0)) {
      return ctx.response.badRequest({ error: 'Invalid leagueId. Must be a positive integer.' })
    }

    const parsedTournamentIds = tournamentIds
      ? String(tournamentIds)
          .split(',')
          .map((id) => Number(id.trim()))
          .filter((id) => !isNaN(id) && Number.isInteger(id) && id > 0)
      : null

    // Validate array length
    if (parsedTournamentIds && parsedTournamentIds.length > 100) {
      return ctx.response.badRequest({ error: 'Maximum 100 tournament IDs allowed.' })
    }

    const parsedPatches = patches
      ? String(patches)
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && /^[\d.]+$/.test(p))
      : null

    // Validate array length
    if (parsedPatches && parsedPatches.length > 100) {
      return ctx.response.badRequest({ error: 'Maximum 100 patches allowed.' })
    }

    const parsedMinGames = Math.max(1, Number(minGames) || 1)

    // Build cache key from filters
    const cacheKey = `pro:champion-stats:${parsedLeagueId || 'all'}:${
      parsedTournamentIds?.sort().join('-') || 'all'
    }:${startDate || 'none'}:${endDate || 'none'}:${
      parsedPatches?.sort().join('-') || 'all'
    }:${parsedMinGames}`

    // Determine cache TTL based on whether we're querying recent data
    // Historical data (older than 7 days) can be cached longer
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const isHistoricalQuery = endDate && new Date(endDate) < sevenDaysAgo
    const cacheTtl = isHistoricalQuery ? CACHE_TTL.LONG : CACHE_TTL.MEDIUM

    const cachedResponse = await cacheService.getOrSet(cacheKey, cacheTtl, async () => {
      // Query from pre-aggregated daily stats table
      // Using positional parameters ($1, $2, etc.) for PostgreSQL
      const result = await db.rawQuery<{
      rows: Array<{
        champion_id: number
        picks: string
        bans: string
        fearless_bans: string
        wins: string
        blue_picks: string
        blue_wins: string
        red_picks: string
        red_wins: string
        top_picks: string
        top_wins: string
        jungle_picks: string
        jungle_wins: string
        mid_picks: string
        mid_wins: string
        adc_picks: string
        adc_wins: string
        support_picks: string
        support_wins: string
        total_games: string
      }>
    }>(
      `
      SELECT
        s.champion_id,
        SUM(s.picks)::int as picks,
        SUM(s.bans)::int as bans,
        SUM(s.fearless_bans)::int as fearless_bans,
        SUM(s.wins)::int as wins,
        SUM(s.total_games)::int as total_games,
        SUM(s.blue_picks)::int as blue_picks,
        SUM(s.blue_wins)::int as blue_wins,
        SUM(s.red_picks)::int as red_picks,
        SUM(s.red_wins)::int as red_wins,
        SUM(s.top_picks)::int as top_picks,
        SUM(s.top_wins)::int as top_wins,
        SUM(s.jungle_picks)::int as jungle_picks,
        SUM(s.jungle_wins)::int as jungle_wins,
        SUM(s.mid_picks)::int as mid_picks,
        SUM(s.mid_wins)::int as mid_wins,
        SUM(s.adc_picks)::int as adc_picks,
        SUM(s.adc_wins)::int as adc_wins,
        SUM(s.support_picks)::int as support_picks,
        SUM(s.support_wins)::int as support_wins
      FROM pro_champion_daily_stats s
      JOIN pro_tournaments t ON s.tournament_id = t.tournament_id
      WHERE (?::int IS NULL OR t.pro_league_id = ?)
        AND (?::int[] IS NULL OR s.tournament_id = ANY(?))
        AND (?::date IS NULL OR s.date >= ?::date)
        AND (?::date IS NULL OR s.date <= ?::date)
        AND (?::text[] IS NULL OR s.patch = ANY(?))
      GROUP BY s.champion_id
      HAVING (SUM(s.picks) + SUM(s.bans)) >= ?
      ORDER BY (SUM(s.picks) + SUM(s.bans)) DESC, SUM(s.picks) DESC
      `,
      [
        parsedLeagueId,
        parsedLeagueId,
        parsedTournamentIds,
        parsedTournamentIds,
        startDate || null,
        startDate || null,
        endDate || null,
        endDate || null,
        parsedPatches,
        parsedPatches,
        parsedMinGames,
      ]
    )

    const rows = result.rows || []
    const totalGames = rows.length > 0 ? Number(rows[0].total_games) : 0

    // Calculate rates and format response
    const data = rows.map((row) => {
      const picks = Number(row.picks) || 0
      const bans = Number(row.bans) || 0
      const fearlessBans = Number(row.fearless_bans) || 0
      const wins = Number(row.wins) || 0
      const bluePicks = Number(row.blue_picks) || 0
      const blueWins = Number(row.blue_wins) || 0
      const redPicks = Number(row.red_picks) || 0
      const redWins = Number(row.red_wins) || 0

      return {
        championId: row.champion_id,
        picks,
        bans,
        fearlessBans,
        wins,
        totalGames,
        blueSide: {
          picks: bluePicks,
          wins: blueWins,
        },
        redSide: {
          picks: redPicks,
          wins: redWins,
        },
        byRole: {
          Top: {
            picks: Number(row.top_picks) || 0,
            wins: Number(row.top_wins) || 0,
          },
          Jungle: {
            picks: Number(row.jungle_picks) || 0,
            wins: Number(row.jungle_wins) || 0,
          },
          Mid: {
            picks: Number(row.mid_picks) || 0,
            wins: Number(row.mid_wins) || 0,
          },
          ADC: {
            picks: Number(row.adc_picks) || 0,
            wins: Number(row.adc_wins) || 0,
          },
          Support: {
            picks: Number(row.support_picks) || 0,
            wins: Number(row.support_wins) || 0,
          },
        },
      }
    })

    return {
      totalGames,
      filters: {
        leagueId: parsedLeagueId,
        tournamentIds: parsedTournamentIds,
        startDate: startDate || null,
        endDate: endDate || null,
        patches: parsedPatches,
      },
      data,
    }
    }) // end of cacheService.getOrSet

    return ctx.response.ok(cachedResponse)
  }
}
