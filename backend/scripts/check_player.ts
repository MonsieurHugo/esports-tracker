import { Ignitor } from '@adonisjs/core'

const ignitor = new Ignitor(new URL('../', import.meta.url))

async function main() {
  const app = ignitor.createApp('console')
  await app.init()
  await app.boot()
  
  const db = await app.container.make('lucid.db')
  
  const startDate = '2026-01-12'
  const endDate = '2026-01-19'
  
  // Test the exact includeUnranked query
  const result = await db.rawQuery(`
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
    ),
    latest_ranks AS (
      SELECT DISTINCT ON (puuid) puuid, tier, lp
      FROM lol_daily_stats
      WHERE date >= ? AND date <= ?
      ORDER BY puuid, date DESC
    ),
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
    player_best AS (
      SELECT player_id, puuid as best_puuid, tier, lp
      FROM player_best_account
      WHERE rn = 1
    ),
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
        CASE WHEN pb.tier IN ('CHALLENGER', 'GRANDMASTER', 'MASTER')
             THEN COALESCE(pb.lp, 0) ELSE 0 END as total_lp
      FROM active_players ap
      LEFT JOIN player_best pb ON ap.player_id = pb.player_id
      LEFT JOIN lol_daily_stats ds ON ds.puuid = pb.best_puuid
        AND ds.date >= ? AND ds.date <= ?
      GROUP BY ap.player_id, ap.slug, ap.current_pseudo, ap.team_id, ap.team_slug,
               ap.short_name, ap.logo_url, ap.region, ap.league, ap.role, pb.tier, pb.lp
    )
    SELECT *, COUNT(*) OVER() as total_count
    FROM player_stats
    WHERE current_pseudo ILIKE '%josedeodo%'
    ORDER BY total_lp DESC NULLS LAST, current_pseudo ASC
    LIMIT 100 OFFSET 0
  `, [startDate, endDate, startDate, endDate])
  
  console.log('Query result for Josedeodo:', JSON.stringify(result.rows, null, 2))
  
  // Count all players in the query
  const countResult = await db.rawQuery(`
    WITH active_players AS (
      SELECT p.player_id
      FROM players p
      JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
    )
    SELECT COUNT(*) as count FROM active_players
  `)
  console.log('Total active players:', countResult.rows[0].count)
  
  await app.terminate()
}

main().catch(console.error)
