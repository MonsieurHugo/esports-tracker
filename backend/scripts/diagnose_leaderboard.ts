/**
 * Diagnostic script to understand why leaderboard returns empty
 * Run with: npx ts-node scripts/diagnose_leaderboard.ts
 */

import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'

async function diagnose() {
  console.log('=== DIAGNOSTIC LEADERBOARD ===\n')

  // 1. Check lol_daily_stats date range
  console.log('1. Date range in lol_daily_stats:')
  const statsRange = await db.rawQuery(`
    SELECT
      MIN(date) as min_date,
      MAX(date) as max_date,
      COUNT(*) as total_rows
    FROM lol_daily_stats
  `)
  console.log(statsRange.rows[0])
  console.log('')

  // 2. Check active teams
  console.log('2. Active teams count:')
  const activeTeams = await db.rawQuery(`
    SELECT COUNT(*) as count FROM teams WHERE is_active = true
  `)
  console.log(activeTeams.rows[0])
  console.log('')

  // 3. Check active contracts
  console.log('3. Active contracts count:')
  const activeContracts = await db.rawQuery(`
    SELECT COUNT(*) as count FROM player_contracts WHERE end_date IS NULL
  `)
  console.log(activeContracts.rows[0])
  console.log('')

  // 4. Check lol_accounts
  console.log('4. LOL accounts count:')
  const accounts = await db.rawQuery(`
    SELECT COUNT(*) as count FROM lol_accounts
  `)
  console.log(accounts.rows[0])
  console.log('')

  // 5. Check players with active contracts AND lol accounts
  console.log('5. Players with active contracts AND lol accounts:')
  const playersWithAccounts = await db.rawQuery(`
    SELECT COUNT(DISTINCT pc.player_id) as count
    FROM player_contracts pc
    JOIN lol_accounts a ON pc.player_id = a.player_id
    WHERE pc.end_date IS NULL
  `)
  console.log(playersWithAccounts.rows[0])
  console.log('')

  // 6. Check if there's data for January 2026
  console.log('6. Stats for January 2026:')
  const jan2026 = await db.rawQuery(`
    SELECT
      COUNT(*) as total_rows,
      COUNT(DISTINCT puuid) as unique_accounts,
      SUM(games_played) as total_games
    FROM lol_daily_stats
    WHERE date >= '2026-01-01' AND date <= '2026-01-31'
  `)
  console.log(jan2026.rows[0])
  console.log('')

  // 7. Full join test
  console.log('7. Full join test (teams -> contracts -> accounts -> stats):')
  const fullJoin = await db.rawQuery(`
    SELECT COUNT(*) as matching_rows
    FROM teams t
    JOIN player_contracts pc ON pc.team_id = t.team_id AND pc.end_date IS NULL
    JOIN lol_accounts a ON pc.player_id = a.player_id
    JOIN lol_daily_stats ds ON ds.puuid = a.puuid
      AND ds.date >= '2026-01-01' AND ds.date <= '2026-01-16'
    WHERE t.is_active = true
  `)
  console.log(fullJoin.rows[0])
  console.log('')

  // 8. Sample of what data exists
  console.log('8. Sample of recent stats (last 5 entries):')
  const sample = await db.rawQuery(`
    SELECT date, puuid, games_played, wins, tier
    FROM lol_daily_stats
    ORDER BY date DESC
    LIMIT 5
  `)
  console.log(sample.rows)

  await app.terminate()
}

diagnose().catch(console.error)
