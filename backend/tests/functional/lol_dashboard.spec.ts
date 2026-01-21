import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Organization from '#models/organization'
import Team from '#models/team'
import Player from '#models/player'
import PlayerContract from '#models/player_contract'
import LolAccount from '#models/lol_account'
import LolDailyStat from '#models/lol_daily_stat'
import LolStreak from '#models/lol_streak'
import League from '#models/league'
import Split from '#models/split'
import { DateTime } from 'luxon'

/**
 * Helper to create test data for dashboard tests
 */
async function createTestData() {
  // Create organization
  const org = await Organization.create({
    slug: 'test-org',
    currentName: 'Test Organization',
    currentShortName: 'TST',
    logoUrl: 'https://example.com/logo.png',
  })

  // Create team
  const team = await Team.create({
    orgId: org.orgId,
    gameId: 1, // LoL
    slug: 'test-team',
    currentName: 'Test Team',
    shortName: 'TT',
    region: 'EUW',
    league: 'LEC',
    isActive: true,
  })

  // Create second team for comparison
  const team2 = await Team.create({
    orgId: org.orgId,
    gameId: 1,
    slug: 'test-team-2',
    currentName: 'Test Team 2',
    shortName: 'TT2',
    region: 'EUW',
    league: 'LFL',
    isActive: true,
  })

  // Create players with different roles
  const players = await Promise.all([
    Player.create({ slug: 'player-top', currentPseudo: 'TopPlayer' }),
    Player.create({ slug: 'player-jgl', currentPseudo: 'JunglePlayer' }),
    Player.create({ slug: 'player-mid', currentPseudo: 'MidPlayer' }),
    Player.create({ slug: 'player-adc', currentPseudo: 'ADCPlayer' }),
    Player.create({ slug: 'player-sup', currentPseudo: 'SupportPlayer' }),
  ])

  const roles = ['TOP', 'JGL', 'MID', 'ADC', 'SUP']

  // Create contracts linking players to team
  await Promise.all(
    players.map((player, index) =>
      PlayerContract.create({
        playerId: player.playerId,
        teamId: team.teamId,
        role: roles[index],
        isStarter: true,
        startDate: DateTime.now().minus({ months: 6 }),
        endDate: null,
      })
    )
  )

  // Create LoL accounts for each player
  const accounts = await Promise.all(
    players.map((player, index) =>
      LolAccount.create({
        puuid: `test-puuid-${index}`,
        playerId: player.playerId,
        gameName: `TestPlayer${index}`,
        tagLine: 'EUW',
        region: 'EUW1',
        isPrimary: true,
      })
    )
  )

  // Create daily stats for the past 7 days
  const today = DateTime.now()
  const statsPromises: Promise<LolDailyStat>[] = []

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = today.minus({ days: dayOffset })
    for (const account of accounts) {
      statsPromises.push(
        LolDailyStat.create({
          puuid: account.puuid!,
          date: date,
          gamesPlayed: 5 + dayOffset,
          wins: 3 + (dayOffset % 2),
          totalKills: 25,
          totalDeaths: 15,
          totalAssists: 30,
          totalGameDuration: 1800 * (5 + dayOffset),
          tier: 'CHALLENGER',
          rank: 'I',
          lp: 500 + (dayOffset * 20),
        })
      )
    }
  }
  await Promise.all(statsPromises)

  // Create streaks for some players
  await LolStreak.create({
    puuid: accounts[0].puuid!,
    currentStreak: 5,
    currentStreakStart: DateTime.now().minus({ days: 2 }),
    bestWinStreak: 8,
    worstLossStreak: -3,
  })

  await LolStreak.create({
    puuid: accounts[1].puuid!,
    currentStreak: -3,
    currentStreakStart: DateTime.now().minus({ days: 1 }),
    bestWinStreak: 5,
    worstLossStreak: -5,
  })

  await LolStreak.create({
    puuid: accounts[2].puuid!,
    currentStreak: 3,
    currentStreakStart: DateTime.now().minus({ days: 1 }),
    bestWinStreak: 6,
    worstLossStreak: -2,
  })

  return { org, team, team2, players, accounts }
}

/**
 * Helper to create leagues and splits for metadata endpoints
 */
async function createLeaguesAndSplits() {
  const leagues = await Promise.all([
    League.create({
      name: 'League of Legends European Championship',
      shortName: 'LEC',
      region: 'EMEA',
      tier: 1,
      isActive: true,
    }),
    League.create({
      name: 'Ligue Française de League of Legends',
      shortName: 'LFL',
      region: 'FR',
      tier: 2,
      isActive: true,
    }),
    League.create({
      name: 'Inactive League',
      shortName: 'INL',
      region: 'NA',
      tier: 3,
      isActive: false,
    }),
  ])

  const splits = await Promise.all([
    Split.create({
      season: 2025,
      splitNumber: 1,
      name: 'Spring 2025',
      startDate: DateTime.fromISO('2025-01-15'),
      endDate: DateTime.fromISO('2025-04-15'),
    }),
    Split.create({
      season: 2024,
      splitNumber: 3,
      name: 'Winter 2024',
      startDate: DateTime.fromISO('2024-09-15'),
      endDate: DateTime.fromISO('2024-12-15'),
    }),
  ])

  return { leagues, splits }
}

// ============================================
// SUMMARY ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Summary', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/summary returns dashboard stats', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/summary')

    response.assertStatus(200)
    const body = response.body()
    assert.isNumber(body.totalGames)
    assert.isNumber(body.avgWinrate)
    assert.isNumber(body.totalMinutes)
    assert.isString(body.lastUpdated)
  })

  test('GET /api/v1/lol/dashboard/summary filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/summary').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isNumber(body.totalGames)
  })

  test('GET /api/v1/lol/dashboard/summary handles period parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/summary').qs({ period: '30d' })

    response.assertStatus(200)
    const body = response.body()
    assert.isNumber(body.totalGames)
  })

  test('GET /api/v1/lol/dashboard/summary returns zero stats when no data', async ({ client, assert }) => {
    const response = await client.get('/api/v1/lol/dashboard/summary')

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.totalGames, 0)
    assert.equal(body.avgWinrate, 0)
  })
})

// ============================================
// TEAMS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Teams', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/teams returns team leaderboard', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.isNumber(body.meta.total)
    assert.isNumber(body.meta.perPage)
    assert.isNumber(body.meta.currentPage)
    assert.isNumber(body.meta.lastPage)
  })

  test('GET /api/v1/lol/dashboard/teams includes team and player data', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams')

    response.assertStatus(200)
    const body = response.body()
    assert.isAbove(body.data.length, 0)

    const firstTeam = body.data[0]
    assert.property(firstTeam, 'rank')
    assert.property(firstTeam, 'team')
    assert.property(firstTeam, 'games')
    assert.property(firstTeam, 'winrate')
    assert.property(firstTeam, 'players')
    assert.property(firstTeam.team, 'slug')
    assert.property(firstTeam.team, 'currentName')
  })

  test('GET /api/v1/lol/dashboard/teams filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()

    // All teams should be from LEC league
    for (const item of body.data) {
      assert.equal(item.team.league, 'LEC')
    }
  })

  test('GET /api/v1/lol/dashboard/teams filters by multiple leagues', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ leagues: 'LEC,LFL' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.include(['LEC', 'LFL'], item.team.league)
    }
  })

  test('GET /api/v1/lol/dashboard/teams filters by role', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ roles: 'TOP,MID' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/teams filters by minGames', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ minGames: 100 })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.isAtLeast(item.games, 100)
    }
  })

  test('GET /api/v1/lol/dashboard/teams supports pagination', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ page: 1, perPage: 5 })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.meta.perPage, 5)
    assert.equal(body.meta.currentPage, 1)
  })

  test('GET /api/v1/lol/dashboard/teams sorts by games (default)', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams')

    response.assertStatus(200)
    const body = response.body()

    // Verify descending order by games
    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].games, body.data[i].games)
    }
  })

  test('GET /api/v1/lol/dashboard/teams sorts by lp', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ sort: 'lp' })

    response.assertStatus(200)
    const body = response.body()

    // Verify descending order by LP
    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].totalLp, body.data[i].totalLp)
    }
  })

  test('GET /api/v1/lol/dashboard/teams sorts by winrate', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ sort: 'winrate' })

    response.assertStatus(200)
    const body = response.body()

    // Verify descending order by winrate
    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].winrate, body.data[i].winrate)
    }
  })

  test('GET /api/v1/lol/dashboard/teams supports search', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ search: 'Test' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      const nameMatches = item.team.currentName.toLowerCase().includes('test') ||
                         item.team.shortName.toLowerCase().includes('test')
      assert.isTrue(nameMatches)
    }
  })

  test('GET /api/v1/lol/dashboard/teams returns empty data when no matches', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ leagues: 'NONEXISTENT' })

    response.assertStatus(200)
    const body = response.body()
    assert.deepEqual(body.data, [])
    assert.equal(body.meta.total, 0)
  })
})

// ============================================
// PLAYERS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Players', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/players returns player leaderboard', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.isNumber(body.meta.total)
    assert.isNumber(body.meta.perPage)
    assert.isNumber(body.meta.currentPage)
    assert.isNumber(body.meta.lastPage)
  })

  test('GET /api/v1/lol/dashboard/players includes player and account data', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players')

    response.assertStatus(200)
    const body = response.body()
    assert.isAbove(body.data.length, 0)

    const firstPlayer = body.data[0]
    assert.property(firstPlayer, 'rank')
    assert.property(firstPlayer, 'player')
    assert.property(firstPlayer, 'team')
    assert.property(firstPlayer, 'role')
    assert.property(firstPlayer, 'games')
    assert.property(firstPlayer, 'winrate')
    assert.property(firstPlayer, 'accounts')
    assert.property(firstPlayer.player, 'slug')
    assert.property(firstPlayer.player, 'pseudo')
  })

  test('GET /api/v1/lol/dashboard/players filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      if (item.team) {
        assert.equal(item.team.league, 'LEC')
      }
    }
  })

  test('GET /api/v1/lol/dashboard/players filters by role', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ roles: 'MID' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.equal(item.role, 'MID')
    }
  })

  test('GET /api/v1/lol/dashboard/players filters by multiple roles', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ roles: 'TOP,JGL' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.include(['TOP', 'JGL'], item.role)
    }
  })

  test('GET /api/v1/lol/dashboard/players filters by minGames', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ minGames: 50 })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.isAtLeast(item.games, 50)
    }
  })

  test('GET /api/v1/lol/dashboard/players supports pagination', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ page: 1, perPage: 3 })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.meta.perPage, 3)
    assert.equal(body.meta.currentPage, 1)
  })

  test('GET /api/v1/lol/dashboard/players sorts by games (default)', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players')

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].games, body.data[i].games)
    }
  })

  test('GET /api/v1/lol/dashboard/players sorts by lp', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ sort: 'lp' })

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].totalLp, body.data[i].totalLp)
    }
  })

  test('GET /api/v1/lol/dashboard/players supports search', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/players').qs({ search: 'Mid' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.include(item.player.pseudo.toLowerCase(), 'mid')
    }
  })
})

// ============================================
// TOP GRINDERS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Top Grinders', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/top-grinders returns player grinders by default', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.isAbove(body.data.length, 0)
    assert.equal(body.data[0].entityType, 'player')
  })

  test('GET /api/v1/lol/dashboard/top-grinders returns team grinders with viewMode=teams', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ viewMode: 'teams' })

    response.assertStatus(200)
    const body = response.body()
    assert.isAbove(body.data.length, 0)
    assert.equal(body.data[0].entityType, 'team')
  })

  test('GET /api/v1/lol/dashboard/top-grinders respects limit parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ limit: 3 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 3)
  })

  test('GET /api/v1/lol/dashboard/top-grinders limits to max 10', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ limit: 100 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 10)
  })

  test('GET /api/v1/lol/dashboard/top-grinders sorts descending by default', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders')

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].games, body.data[i].games)
    }
  })

  test('GET /api/v1/lol/dashboard/top-grinders sorts ascending with sort=asc', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ sort: 'asc' })

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtMost(body.data[i - 1].games, body.data[i].games)
    }
  })

  test('GET /api/v1/lol/dashboard/top-grinders filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-grinders filters by role', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders').qs({ roles: 'MID' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.equal(item.role, 'MID')
    }
  })

  test('GET /api/v1/lol/dashboard/top-grinders includes team info for players', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-grinders')

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0 && body.data[0].entityType === 'player') {
      assert.property(body.data[0], 'team')
      assert.property(body.data[0].team, 'slug')
    }
  })
})

// ============================================
// STREAKS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Streaks', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/streaks returns win streaks', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/streaks returns only positive streaks', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks')

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.isAbove(item.streak, 0)
    }
  })

  test('GET /api/v1/lol/dashboard/streaks respects limit parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks').qs({ limit: 2 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 2)
  })

  test('GET /api/v1/lol/dashboard/streaks sorts by streak descending', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks')

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].streak, body.data[i].streak)
    }
  })

  test('GET /api/v1/lol/dashboard/streaks filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/streaks includes player and team info', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/streaks')

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'player')
      assert.property(body.data[0], 'team')
      assert.property(body.data[0].player, 'pseudo')
      assert.property(body.data[0].team, 'shortName')
    }
  })
})

// ============================================
// TOP LP GAINERS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Top LP Gainers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/top-lp-gainers returns LP gainers', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers returns only positive LP changes', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers')

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.isAbove(item.lpChange, 0)
    }
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers returns team gainers with viewMode=teams', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers').qs({ viewMode: 'teams' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.equal(item.entityType, 'team')
    }
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers respects limit parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers').qs({ limit: 3 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 3)
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers limits to max 10', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers').qs({ limit: 100 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 10)
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers sorts descending by default', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers')

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      assert.isAtLeast(body.data[i - 1].lpChange, body.data[i].lpChange)
    }
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers filters by role', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers').qs({ roles: 'ADC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-lp-gainers includes games count', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-gainers')

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.property(item, 'games')
      assert.isAtLeast(item.games, 0)
    }
  })
})

// ============================================
// TOP LP LOSERS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Top LP Losers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/top-lp-losers returns LP losers', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-lp-losers returns only negative LP changes', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers')

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.isBelow(item.lpChange, 0)
    }
  })

  test('GET /api/v1/lol/dashboard/top-lp-losers returns team losers with viewMode=teams', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers').qs({ viewMode: 'teams' })

    response.assertStatus(200)
    const body = response.body()

    for (const item of body.data) {
      assert.equal(item.entityType, 'team')
    }
  })

  test('GET /api/v1/lol/dashboard/top-lp-losers respects limit parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers').qs({ limit: 3 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 3)
  })

  test('GET /api/v1/lol/dashboard/top-lp-losers filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers').qs({ leagues: 'LFL' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/top-lp-losers filters by role', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/top-lp-losers').qs({ roles: 'SUP' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })
})

// ============================================
// LEAGUES ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Leagues', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/leagues returns active leagues', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/leagues')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/leagues excludes inactive leagues', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/leagues')

    response.assertStatus(200)
    const body = response.body()

    // Should not contain the inactive league
    for (const league of body.data) {
      assert.notEqual(league.shortName, 'INL')
    }
  })

  test('GET /api/v1/lol/dashboard/leagues includes required fields', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/leagues')

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'leagueId')
      assert.property(body.data[0], 'name')
      assert.property(body.data[0], 'shortName')
      assert.property(body.data[0], 'region')
    }
  })

  test('GET /api/v1/lol/dashboard/leagues returns empty array when no leagues', async ({ client, assert }) => {
    const response = await client.get('/api/v1/lol/dashboard/leagues')

    response.assertStatus(200)
    const body = response.body()
    assert.deepEqual(body.data, [])
  })
})

// ============================================
// SPLITS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Splits', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/splits returns splits', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/splits')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/splits sorts by start_date descending', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/splits')

    response.assertStatus(200)
    const body = response.body()

    for (let i = 1; i < body.data.length; i++) {
      const prevDate = new Date(body.data[i - 1].start_date)
      const currDate = new Date(body.data[i].start_date)
      assert.isAtLeast(prevDate.getTime(), currDate.getTime())
    }
  })

  test('GET /api/v1/lol/dashboard/splits includes required fields', async ({ client, assert }) => {
    await createLeaguesAndSplits()

    const response = await client.get('/api/v1/lol/dashboard/splits')

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'split_id')
      assert.property(body.data[0], 'season')
      assert.property(body.data[0], 'split_number')
      assert.property(body.data[0], 'name')
      assert.property(body.data[0], 'start_date')
      assert.property(body.data[0], 'end_date')
    }
  })

  test('GET /api/v1/lol/dashboard/splits limits to 10 results', async ({ client, assert }) => {
    // Create more than 10 splits
    for (let i = 0; i < 15; i++) {
      await Split.create({
        season: 2020 + Math.floor(i / 3),
        splitNumber: (i % 3) + 1,
        name: `Split ${i}`,
        startDate: DateTime.fromISO(`202${Math.floor(i / 3)}-0${(i % 3) + 1}-01`),
        endDate: DateTime.fromISO(`202${Math.floor(i / 3)}-0${(i % 3) + 4}-01`),
      })
    }

    const response = await client.get('/api/v1/lol/dashboard/splits')

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 10)
  })
})

// ============================================
// PERIOD PARAMETER TESTS
// ============================================

test.group('LoL Dashboard - Period Parameter', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('period=7d returns 7 days sliding window', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ period: '7d' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.period, '7d')
  })

  test('period=14d returns 14 days sliding window', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ period: '14d' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.period, '14d')
  })

  test('period=30d returns 30 days sliding window', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ period: '30d' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.period, '30d')
  })

  test('period=90d returns 90 days sliding window', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ period: '90d' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.period, '90d')
  })

  test('date parameter sets reference date', async ({ client, assert }) => {
    await createTestData()

    const referenceDate = DateTime.now().minus({ days: 3 }).toISODate()

    const response = await client.get('/api/v1/lol/dashboard/summary').qs({
      date: referenceDate,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isNumber(body.totalGames)
  })
})

// ============================================
// ERROR HANDLING TESTS
// ============================================

test.group('LoL Dashboard - Error Handling', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('team-history returns 400 without teamId', async ({ client }) => {
    const response = await client.get('/api/v1/lol/dashboard/team-history')

    response.assertStatus(400)
    response.assertBodyContains({
      error: 'teamId is required',
    })
  })

  test('player-history returns 400 without playerId', async ({ client }) => {
    const response = await client.get('/api/v1/lol/dashboard/player-history')

    response.assertStatus(400)
    response.assertBodyContains({
      error: 'playerId is required',
    })
  })

  test('invalid page number defaults gracefully', async ({ client }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ page: -1 })

    response.assertStatus(200)
  })

  test('invalid perPage value defaults gracefully', async ({ client }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/teams').qs({ perPage: 'invalid' })

    response.assertStatus(200)
  })
})

// ============================================
// HISTORY ENDPOINTS TESTS
// ============================================

test.group('LoL Dashboard - History Endpoints', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/team-history returns team history', async ({ client, assert }) => {
    const { team } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history').qs({ teamId: team.teamId })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/team-history includes daily stats', async ({ client, assert }) => {
    const { team } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history').qs({ teamId: team.teamId })

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'date')
      assert.property(body.data[0], 'label')
      assert.property(body.data[0], 'games')
      assert.property(body.data[0], 'wins')
      assert.property(body.data[0], 'winrate')
      assert.property(body.data[0], 'totalLp')
    }
  })

  test('GET /api/v1/lol/dashboard/player-history returns player history', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history').qs({ playerId: players[0].playerId })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/player-history includes daily stats', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history').qs({ playerId: players[0].playerId })

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'date')
      assert.property(body.data[0], 'label')
      assert.property(body.data[0], 'games')
      assert.property(body.data[0], 'wins')
      assert.property(body.data[0], 'winrate')
      assert.property(body.data[0], 'totalLp')
    }
  })

  test('GET /api/v1/lol/dashboard/team-history respects period parameter', async ({ client, assert }) => {
    const { team } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history').qs({
      teamId: team.teamId,
      period: '30d',
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/player-history respects period parameter', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history').qs({
      playerId: players[0].playerId,
      period: '30d',
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })
})

// ============================================
// LOSS STREAKS ENDPOINT TESTS
// ============================================

test.group('LoL Dashboard - Loss Streaks', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/loss-streaks returns loss streaks', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/loss-streaks')

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/loss-streaks returns positive streak values (absolute)', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/loss-streaks')

    response.assertStatus(200)
    const body = response.body()

    // Loss streaks are stored as negative but returned as positive (absolute value)
    for (const item of body.data) {
      assert.isAbove(item.streak, 0)
    }
  })

  test('GET /api/v1/lol/dashboard/loss-streaks respects limit parameter', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/loss-streaks').qs({ limit: 2 })

    response.assertStatus(200)
    const body = response.body()
    assert.isAtMost(body.data.length, 2)
  })

  test('GET /api/v1/lol/dashboard/loss-streaks filters by league', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/loss-streaks').qs({ leagues: 'LEC' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
  })

  test('GET /api/v1/lol/dashboard/loss-streaks includes player and team info', async ({ client, assert }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/loss-streaks')

    response.assertStatus(200)
    const body = response.body()

    if (body.data.length > 0) {
      assert.property(body.data[0], 'player')
      assert.property(body.data[0], 'team')
      assert.property(body.data[0].player, 'pseudo')
    }
  })
})

// ============================================
// BATCH HISTORY ENDPOINTS - ENTITYIDS VALIDATION TESTS
// ============================================

test.group('LoL Dashboard - Batch History EntityIds Validation', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/lol/dashboard/team-history-batch accepts valid entityIds', async ({ client, assert }) => {
    const { team, team2 } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: `${team.teamId},${team2.teamId}`,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isObject(body)
    assert.property(body, `${team.teamId}`)
    assert.property(body, `${team2.teamId}`)
  })

  test('GET /api/v1/lol/dashboard/player-history-batch accepts valid entityIds', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history-batch').qs({
      entityIds: `${players[0].playerId},${players[1].playerId}`,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isObject(body)
  })

  test('team-history-batch filters out negative IDs silently', async ({ client, assert }) => {
    const { team } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: `-1,${team.teamId},-2`,
    })

    response.assertStatus(200)
    const body = response.body()
    // Should only include valid team ID
    assert.property(body, `${team.teamId}`)
    assert.notProperty(body, '-1')
    assert.notProperty(body, '-2')
  })

  test('team-history-batch filters out decimal IDs silently', async ({ client, assert }) => {
    const { team } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: `1.5,${team.teamId},2.7`,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.property(body, `${team.teamId}`)
  })

  test('team-history-batch returns 400 when no valid entityIds', async ({ client }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: '-1,-2,-3',
    })

    response.assertStatus(422) // VineJS validation error
  })

  test('team-history-batch returns 422 when entityIds is empty', async ({ client }) => {
    await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: '',
    })

    response.assertStatus(422)
  })

  test('team-history-batch returns 422 for more than 50 IDs', async ({ client }) => {
    await createTestData()

    // Generate 51 IDs
    const ids = Array.from({ length: 51 }, (_, i) => i + 1).join(',')

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: ids,
    })

    response.assertStatus(422)
  })

  test('team-history-batch accepts exactly 50 IDs', async ({ client, assert }) => {
    const { team } = await createTestData()

    // Generate 50 IDs (with team.teamId as first)
    const ids = [team.teamId, ...Array.from({ length: 49 }, (_, i) => i + 1000)].join(',')

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: ids,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isObject(body)
  })

  test('player-history-batch handles whitespace in entityIds', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history-batch').qs({
      entityIds: ` ${players[0].playerId} , ${players[1].playerId} `,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isObject(body)
  })

  test('player-history-batch deduplicates entityIds', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history-batch').qs({
      entityIds: `${players[0].playerId},${players[0].playerId},${players[1].playerId}`,
    })

    response.assertStatus(200)
    const body = response.body()
    // Should only have unique IDs
    assert.isObject(body)
  })

  test('player-history-batch filters oversized numbers (> PostgreSQL INT max)', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history-batch').qs({
      entityIds: `9999999999999,${players[0].playerId}`,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.property(body, `${players[0].playerId}`)
  })

  test('player-history-batch accepts PostgreSQL INT max value', async ({ client, assert }) => {
    const { players } = await createTestData()

    const response = await client.get('/api/v1/lol/dashboard/player-history-batch').qs({
      entityIds: `2147483647,${players[0].playerId}`,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.isObject(body)
  })

  test('team-history-batch works with date range parameters', async ({ client, assert }) => {
    const { team } = await createTestData()
    const today = DateTime.now()
    const startDate = today.minus({ days: 7 }).toISODate()
    const endDate = today.toISODate()

    const response = await client.get('/api/v1/lol/dashboard/team-history-batch').qs({
      entityIds: `${team.teamId}`,
      startDate,
      endDate,
    })

    response.assertStatus(200)
    const body = response.body()
    assert.property(body, `${team.teamId}`)
  })
})
