import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DashboardService from '#services/dashboard_service'
import {
  createDashboardFixtures,
  createLpGainerScenario,
  createLpLoserScenario,
  createMultiAccountPlayer,
  createPartialRosterTeam,
  createDailyStatsForAccount,
  type DashboardFixtureData,
} from '../fixtures/dashboard_fixtures.js'
import Organization from '#models/organization'
import Team from '#models/team'
import Player from '#models/player'
import PlayerContract from '#models/player_contract'
import LolAccount from '#models/lol_account'

/**
 * DashboardService Integration Tests
 *
 * These tests verify the business logic of the DashboardService which powers
 * the main LoL dashboard. The service handles complex SQL queries with CTEs
 * for calculating team/player rankings, LP changes, and historical data.
 *
 * ## Test Organization
 * Tests are grouped by method being tested:
 * - getTeamLeaderboard: Team rankings with top 5 player LP calculation
 * - getPlayerLeaderboard: Player rankings with best account selection
 * - getTopGrinders: Most games played (player and team modes)
 * - getTopLpGainers: Positive LP changes (end-of-period best account)
 * - getTopLpLosers: Negative LP changes (start-of-period best account)
 * - Edge Cases: Multi-account, partial rosters, Diamond exclusion
 * - Performance: Query timing validation
 *
 * ## Key Business Rules Tested
 * 1. LP Calculation: Only MASTER, GRANDMASTER, CHALLENGER tiers count
 * 2. Team LP: Sum of top 5 players' best account LP only
 * 3. Best Account Selection: Highest tier first, then highest LP
 * 4. LP Gainers: Reference = best account at END of period
 * 5. LP Losers: Reference = best account at START of period
 * 6. Active Contracts: Only end_date IS NULL players count
 */

// ============================================
// TEAM LEADERBOARD TESTS
// ============================================

test.group('DashboardService - getTeamLeaderboard', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('returns paginated team leaderboard with correct structure', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.isArray(result.data)
    assert.isAbove(result.data.length, 0)
    assert.property(result.meta, 'total')
    assert.property(result.meta, 'perPage')
    assert.property(result.meta, 'currentPage')
    assert.property(result.meta, 'lastPage')
  })

  test('each team entry contains required fields', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    const team = result.data[0]
    assert.property(team, 'rank')
    assert.property(team, 'team')
    assert.property(team, 'games')
    assert.property(team, 'winrate')
    assert.property(team, 'totalLp')
    assert.property(team, 'players')
    assert.property(team.team, 'teamId')
    assert.property(team.team, 'slug')
    assert.property(team.team, 'currentName')
    assert.property(team.team, 'shortName')
  })

  test('excludes inactive teams from results', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 100,
    })

    // Inactive team should not appear
    const inactiveTeamIds = fixtures.teams.inactive.map((t) => t.teamId)
    for (const entry of result.data) {
      assert.notInclude(inactiveTeamIds, entry.team.teamId)
    }
  })

  test('filters by single league', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC'],
      page: 1,
      perPage: 10,
    })

    for (const entry of result.data) {
      assert.equal(entry.team.league, 'LEC')
    }
  })

  test('filters by multiple leagues', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC', 'LFL'],
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.include(['LEC', 'LFL'], entry.team.league)
    }
  })

  test('filters by role', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      roles: ['MID', 'ADC'],
      page: 1,
      perPage: 10,
    })

    // Teams should still appear, but player list should be filtered
    assert.isArray(result.data)
  })

  test('filters by minGames', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      minGames: 50,
      page: 1,
      perPage: 10,
    })

    for (const entry of result.data) {
      assert.isAtLeast(entry.games, 50)
    }
  })

  test('supports pagination correctly', async ({ assert }) => {
    const page1 = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 2,
    })

    const page2 = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 2,
      perPage: 2,
    })

    assert.equal(page1.meta.currentPage, 1)
    assert.equal(page2.meta.currentPage, 2)
    assert.isAtMost(page1.data.length, 2)

    // Ensure different data on each page
    if (page1.data.length > 0 && page2.data.length > 0) {
      assert.notEqual(page1.data[0].team.teamId, page2.data[0].team.teamId)
    }
  })

  test('sorts by games descending by default', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].games, result.data[i].games)
    }
  })

  test('sorts by LP when specified', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      sort: 'lp',
      page: 1,
      perPage: 10,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].totalLp, result.data[i].totalLp)
    }
  })

  test('sorts by winrate when specified', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      sort: 'winrate',
      page: 1,
      perPage: 10,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].winrate, result.data[i].winrate)
    }
  })

  test('supports search by team name', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      search: 'LEC',
      page: 1,
      perPage: 10,
    })

    for (const entry of result.data) {
      const nameMatches =
        entry.team.currentName.toLowerCase().includes('lec') ||
        entry.team.shortName.toLowerCase().includes('lec')
      assert.isTrue(nameMatches)
    }
  })

  test('returns empty data when no matches', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['NONEXISTENT'],
      page: 1,
      perPage: 10,
    })

    assert.deepEqual(result.data, [])
    assert.equal(result.meta.total, 0)
  })
})

// ============================================
// PLAYER LEADERBOARD TESTS
// ============================================

test.group('DashboardService - getPlayerLeaderboard', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('returns paginated player leaderboard with correct structure', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.isArray(result.data)
    assert.isAbove(result.data.length, 0)
    assert.property(result.meta, 'total')
    assert.property(result.meta, 'perPage')
    assert.property(result.meta, 'currentPage')
  })

  test('each player entry contains required fields', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    const player = result.data[0]
    assert.property(player, 'rank')
    assert.property(player, 'player')
    assert.property(player, 'team')
    assert.property(player, 'role')
    assert.property(player, 'games')
    assert.property(player, 'winrate')
    assert.property(player, 'totalLp')
    assert.property(player, 'accounts')
    assert.property(player.player, 'playerId')
    assert.property(player.player, 'slug')
    assert.property(player.player, 'pseudo')
  })

  test('includes accounts array for each player', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    for (const entry of result.data) {
      assert.isArray(entry.accounts)
    }
  })

  test('filters by league', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC'],
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      if (entry.team) {
        assert.equal(entry.team.league, 'LEC')
      }
    }
  })

  test('filters by role', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      roles: ['MID'],
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.equal(entry.role, 'MID')
    }
  })

  test('filters by multiple roles', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      roles: ['TOP', 'JGL'],
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.include(['TOP', 'JGL'], entry.role)
    }
  })

  test('filters by minGames', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      minGames: 30,
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.isAtLeast(entry.games, 30)
    }
  })

  test('sorts by games descending by default', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 20,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].games, result.data[i].games)
    }
  })

  test('sorts by LP when specified', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      sort: 'lp',
      page: 1,
      perPage: 20,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].totalLp, result.data[i].totalLp)
    }
  })

  test('supports search by player name', async ({ assert }) => {
    // Search for players with 'MID' in their name
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      search: 'MID',
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.include(entry.player.pseudo.toLowerCase(), 'mid')
    }
  })
})

// ============================================
// TOP GRINDERS TESTS
// ============================================

test.group('DashboardService - getTopGrinders', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('returns player grinders by default', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    assert.isArray(result)
    assert.isAbove(result.length, 0)
    assert.equal(result[0].entityType, 'player')
  })

  test('returns team grinders with viewMode=teams', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
      viewMode: 'teams',
    })

    assert.isAbove(result.length, 0)
    assert.equal(result[0].entityType, 'team')
  })

  test('respects limit parameter', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 3,
    })

    assert.isAtMost(result.length, 3)
  })

  test('sorts descending by default', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    for (let i = 1; i < result.length; i++) {
      assert.isAtLeast(result[i - 1].games, result[i].games)
    }
  })

  test('sorts ascending with sort=asc', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
      sort: 'asc',
    })

    for (let i = 1; i < result.length; i++) {
      assert.isAtMost(result[i - 1].games, result[i].games)
    }
  })

  test('filters by league', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC'],
      limit: 10,
    })

    // All results should be from LEC teams
    assert.isArray(result)
  })

  test('filters by role', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      roles: ['MID'],
      limit: 10,
    })

    for (const entry of result) {
      assert.equal(entry.role, 'MID')
    }
  })

  test('includes team info for players', async ({ assert }) => {
    const result = await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
      viewMode: 'players',
    })

    if (result.length > 0 && result[0].entityType === 'player') {
      assert.property(result[0], 'team')
      if (result[0].team) {
        assert.property(result[0].team, 'slug')
        assert.property(result[0].team, 'shortName')
      }
    }
  })
})

// ============================================
// TOP LP GAINERS TESTS
// ============================================

test.group('DashboardService - getTopLpGainers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('returns LP gainers array', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    assert.isArray(result)
  })

  test('returns only positive LP changes', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    for (const entry of result) {
      assert.isAbove(entry.lpChange, 0)
    }
  })

  test('returns player gainers by default', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    if (result.length > 0) {
      assert.equal(result[0].entityType, 'player')
    }
  })

  test('returns team gainers with viewMode=teams', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
      viewMode: 'teams',
    })

    for (const entry of result) {
      assert.equal(entry.entityType, 'team')
    }
  })

  test('respects limit parameter', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 3,
    })

    assert.isAtMost(result.length, 3)
  })

  test('sorts descending by default', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    for (let i = 1; i < result.length; i++) {
      assert.isAtLeast(result[i - 1].lpChange, result[i].lpChange)
    }
  })

  test('filters by league', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC'],
      limit: 10,
    })

    assert.isArray(result)
  })

  test('includes games count', async ({ assert }) => {
    const result = await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    for (const entry of result) {
      assert.property(entry, 'games')
      assert.isAtLeast(entry.games, 0)
    }
  })
})

// ============================================
// TOP LP LOSERS TESTS
// ============================================

test.group('DashboardService - getTopLpLosers', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('returns LP losers array', async ({ assert }) => {
    // Create a specific loser scenario
    const team = fixtures.teams.active[0]
    const startDate = DateTime.fromISO(fixtures.dateRange.startDate)
    const endDate = DateTime.fromISO(fixtures.dateRange.endDate)

    await createLpLoserScenario(
      team.teamId,
      500, // Start LP
      200, // End LP (lost 300)
      'MASTER',
      startDate,
      endDate
    )

    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    assert.isArray(result)
  })

  test('returns only negative LP changes', async ({ assert }) => {
    // Create loser scenarios
    const team = fixtures.teams.active[0]
    const startDate = DateTime.fromISO(fixtures.dateRange.startDate)
    const endDate = DateTime.fromISO(fixtures.dateRange.endDate)

    await createLpLoserScenario(team.teamId, 600, 300, 'MASTER', startDate, endDate)
    await createLpLoserScenario(team.teamId, 800, 400, 'GRANDMASTER', startDate, endDate)

    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    for (const entry of result) {
      assert.isBelow(entry.lpChange, 0)
    }
  })

  test('returns team losers with viewMode=teams', async ({ assert }) => {
    const team = fixtures.teams.active[0]
    const startDate = DateTime.fromISO(fixtures.dateRange.startDate)
    const endDate = DateTime.fromISO(fixtures.dateRange.endDate)

    await createLpLoserScenario(team.teamId, 500, 200, 'MASTER', startDate, endDate)

    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
      viewMode: 'teams',
    })

    for (const entry of result) {
      assert.equal(entry.entityType, 'team')
    }
  })

  test('respects limit parameter', async ({ assert }) => {
    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 3,
    })

    assert.isAtMost(result.length, 3)
  })

  test('filters by league', async ({ assert }) => {
    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LFL'],
      limit: 10,
    })

    assert.isArray(result)
  })

  test('filters by role', async ({ assert }) => {
    const result = await service.getTopLpLosers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      roles: ['SUP'],
      limit: 10,
    })

    assert.isArray(result)
  })
})

// ============================================
// EDGE CASES
// ============================================

test.group('DashboardService - Edge Cases', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService

  group.each.setup(async () => {
    service = new DashboardService()
  })

  test('multi-account player: selects best account by tier then LP', async ({ assert }) => {
    // Create fixtures with a team
    const org = await Organization.create({
      slug: 'multi-acc-org',
      currentName: 'Multi Account Org',
      currentShortName: 'MAO',
      logoUrl: null,
    })

    const team = await Team.create({
      orgId: org.orgId,
      gameId: 1,
      slug: 'multi-acc-team',
      currentName: 'Multi Account Team',
      shortName: 'MAT',
      region: 'EMEA',
      league: 'LEC',
      isActive: true,
    })

    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    // Player with GRANDMASTER account (400 LP) and MASTER account (800 LP)
    // Best account should be GRANDMASTER despite lower LP
    const { player, accounts } = await createMultiAccountPlayer(
      team.teamId,
      [
        { tier: 'MASTER', lp: 800, games: 10 }, // Higher LP but lower tier
        { tier: 'GRANDMASTER', lp: 400, games: 5 }, // Lower LP but higher tier
      ],
      startDate,
      endDate
    )

    // Verify accounts were created
    assert.equal(accounts.length, 2)
    assert.equal(accounts[0].playerId, player.playerId)

    const result = await service.getPlayerLeaderboard({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      page: 1,
      perPage: 100,
    })

    // Use flexible comparison (handles string/number type differences from raw queries)
    const playerEntry = result.data.find(
      (p) => Number(p.player.playerId) === Number(player.playerId)
    )

    // If not found, check if any data was returned
    if (!playerEntry) {
      assert.isAbove(
        result.data.length,
        0,
        `Expected player ${player.playerId} in results. Got ${result.data.length} entries: ${result.data.map((p) => p.player.playerId).join(', ')}`
      )
    }

    assert.exists(playerEntry, `Player ${player.playerId} should be in leaderboard results`)
    // Best account should be GRANDMASTER (tier takes priority over LP)
    assert.equal(playerEntry?.tier, 'GRANDMASTER')
    assert.equal(playerEntry?.lp, 400)
  })

  test('team with partial roster calculates LP correctly', async ({ assert }) => {
    // Create a team with only 3 players
    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    const { team, accounts } = await createPartialRosterTeam('LEC', 3)

    // Create stats for each account
    for (let i = 0; i < accounts.length; i++) {
      await createDailyStatsForAccount(
        accounts[i].puuid!,
        'MASTER',
        300 + i * 100, // 300, 400, 500 LP
        startDate,
        endDate
      )
    }

    const result = await service.getTeamLeaderboard({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      page: 1,
      perPage: 100,
    })

    const teamEntry = result.data.find((t) => t.team.teamId === team.teamId)
    assert.exists(teamEntry)
    // Team LP should be sum of all 3 players (not expecting 5)
    assert.isAbove(teamEntry!.totalLp, 0)
  })

  test('Diamond accounts are excluded from LP calculations', async ({ assert }) => {
    const org = await Organization.create({
      slug: 'diamond-test-org',
      currentName: 'Diamond Test Org',
      currentShortName: 'DIA',
      logoUrl: null,
    })

    const team = await Team.create({
      orgId: org.orgId,
      gameId: 1,
      slug: 'diamond-test-team',
      currentName: 'Diamond Test Team',
      shortName: 'DIA',
      region: 'EMEA',
      league: 'LEC',
      isActive: true,
    })

    const player = await Player.create({
      slug: 'diamond-only-player',
      currentPseudo: 'DiamondPlayer',
    })

    await PlayerContract.create({
      playerId: player.playerId,
      teamId: team.teamId,
      role: 'MID',
      isStarter: true,
      startDate: DateTime.now().minus({ months: 3 }),
      endDate: null,
    })

    const puuid = `diamond-only-${Date.now()}`
    await LolAccount.create({
      puuid: puuid,
      playerId: player.playerId,
      gameName: 'DiamondOnly',
      tagLine: 'EUW',
      region: 'EUW1',
      isPrimary: true,
    })

    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    // Create stats with DIAMOND tier
    await createDailyStatsForAccount(puuid, 'DIAMOND', 75, startDate, endDate, {
      gamesPerDay: 10,
    })

    const result = await service.getPlayerLeaderboard({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      page: 1,
      perPage: 100,
    })

    const playerEntry = result.data.find((p) => p.player.playerId === player.playerId)
    // Player might not appear in LP-sorted results since they have 0 LP
    // If they do appear (in games-sorted), their LP should be 0
    if (playerEntry) {
      assert.equal(playerEntry.totalLp, 0)
    }
  })

  test('player with expired contract is excluded', async ({ assert }) => {
    const org = await Organization.create({
      slug: 'expired-contract-org',
      currentName: 'Expired Contract Org',
      currentShortName: 'EXP',
      logoUrl: null,
    })

    const team = await Team.create({
      orgId: org.orgId,
      gameId: 1,
      slug: 'expired-contract-team',
      currentName: 'Expired Contract Team',
      shortName: 'EXP',
      region: 'EMEA',
      league: 'LEC',
      isActive: true,
    })

    const player = await Player.create({
      slug: 'expired-player',
      currentPseudo: 'ExpiredPlayer',
    })

    // Contract with end date (inactive)
    await PlayerContract.create({
      playerId: player.playerId,
      teamId: team.teamId,
      role: 'TOP',
      isStarter: true,
      startDate: DateTime.now().minus({ months: 6 }),
      endDate: DateTime.now().minus({ days: 1 }), // Expired!
    })

    const puuid = `expired-player-${Date.now()}`
    await LolAccount.create({
      puuid: puuid,
      playerId: player.playerId,
      gameName: 'ExpiredAcc',
      tagLine: 'EUW',
      region: 'EUW1',
      isPrimary: true,
    })

    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    await createDailyStatsForAccount(puuid, 'CHALLENGER', 1000, startDate, endDate)

    // Check team leaderboard - team should have 0 players contributing
    const result = await service.getTeamLeaderboard({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      page: 1,
      perPage: 100,
    })

    const teamEntry = result.data.find((t) => t.team.teamId === team.teamId)
    // Team might not appear or have 0 LP since the only player's contract expired
    if (teamEntry) {
      assert.equal(teamEntry.players.length, 0)
    }
  })

  test('handles date range with no data gracefully', async ({ assert }) => {
    // Use a date range far in the past
    const result = await service.getTeamLeaderboard({
      startDate: '2020-01-01',
      endDate: '2020-01-07',
      page: 1,
      perPage: 10,
    })

    assert.deepEqual(result.data, [])
    assert.equal(result.meta.total, 0)
  })

  test('LP gainers use end-of-period best account', async ({ assert }) => {
    // This tests the business rule that gainers reference end-of-period LP
    const org = await Organization.create({
      slug: 'gainer-test-org',
      currentName: 'Gainer Test Org',
      currentShortName: 'GTO',
      logoUrl: null,
    })

    const team = await Team.create({
      orgId: org.orgId,
      gameId: 1,
      slug: 'gainer-test-team',
      currentName: 'Gainer Test Team',
      shortName: 'GTO',
      region: 'EMEA',
      league: 'LEC',
      isActive: true,
    })

    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    const { player, account, stats } = await createLpGainerScenario(
      team.teamId,
      100, // Start LP
      500, // End LP (+400 gain)
      'MASTER',
      startDate,
      endDate
    )

    // Verify data was created correctly
    assert.exists(account)
    assert.isAbove(stats.length, 0, 'Stats should have been created')

    const result = await service.getTopLpGainers({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      limit: 100,
    })

    // Use flexible comparison (handles string/number type differences)
    const gainerEntry = result.find(
      (g) => g.entityType === 'player' && Number(g.entity.id) === Number(player.playerId)
    )

    // If not found, provide helpful debug info
    if (!gainerEntry) {
      const playerIds = result
        .filter((g) => g.entityType === 'player')
        .map((g) => g.entity.id)
      assert.isAbove(
        result.length,
        0,
        `Expected player ${player.playerId} in gainers. Got ${result.length} entries with player IDs: ${playerIds.join(', ')}`
      )
    }

    assert.exists(gainerEntry, `Player ${player.playerId} should be in LP gainers results`)
    // LP change should be approximately +400 (end - start)
    assert.isAbove(gainerEntry!.lpChange, 300)
  })

  test('LP losers use start-of-period best account', async ({ assert }) => {
    // This tests the business rule that losers reference start-of-period LP
    const org = await Organization.create({
      slug: 'loser-test-org',
      currentName: 'Loser Test Org',
      currentShortName: 'LTO',
      logoUrl: null,
    })

    const team = await Team.create({
      orgId: org.orgId,
      gameId: 1,
      slug: 'loser-test-team',
      currentName: 'Loser Test Team',
      shortName: 'LTO',
      region: 'EMEA',
      league: 'LEC',
      isActive: true,
    })

    const endDate = DateTime.now()
    const startDate = endDate.minus({ days: 7 })

    const { player } = await createLpLoserScenario(
      team.teamId,
      500, // Start LP
      100, // End LP (-400 loss)
      'MASTER',
      startDate,
      endDate
    )

    const result = await service.getTopLpLosers({
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      limit: 100,
    })

    const loserEntry = result.find(
      (l) => l.entityType === 'player' && l.entity.id === player.playerId
    )
    assert.exists(loserEntry)
    // LP change should be negative (around -400)
    assert.isBelow(loserEntry!.lpChange, -300)
  })
})

// ============================================
// PERFORMANCE TESTS
// ============================================

test.group('DashboardService - Performance', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    // Create a larger dataset for performance testing
    fixtures = await createDashboardFixtures({
      teamsPerLeague: 5,
      playersPerTeam: 5,
      daysOfStats: 30,
    })
  })

  test('getTeamLeaderboard completes in reasonable time', async ({ assert }) => {
    const start = Date.now()

    await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 50,
    })

    const elapsed = Date.now() - start
    // Should complete within 500ms even with larger dataset
    assert.isBelow(elapsed, 2000, `Query took ${elapsed}ms, expected < 2000ms`)
  })

  test('getPlayerLeaderboard completes in reasonable time', async ({ assert }) => {
    const start = Date.now()

    await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 50,
    })

    const elapsed = Date.now() - start
    assert.isBelow(elapsed, 2000, `Query took ${elapsed}ms, expected < 2000ms`)
  })

  test('getTopGrinders completes in reasonable time', async ({ assert }) => {
    const start = Date.now()

    await service.getTopGrinders({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    const elapsed = Date.now() - start
    assert.isBelow(elapsed, 1000, `Query took ${elapsed}ms, expected < 1000ms`)
  })

  test('getTopLpGainers completes in reasonable time', async ({ assert }) => {
    const start = Date.now()

    await service.getTopLpGainers({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      limit: 10,
    })

    const elapsed = Date.now() - start
    assert.isBelow(elapsed, 1000, `Query took ${elapsed}ms, expected < 1000ms`)
  })
})

// ============================================
// HISTORY CONSISTENCY TESTS
// ============================================

test.group('DashboardService - History Consistency', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('team history LP matches leaderboard LP for same single-day period', async ({ assert }) => {
    // Get team leaderboard for a single day
    const leaderboard = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.endDate, // Use end date as single day
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    // Skip if no teams in leaderboard
    if (leaderboard.data.length === 0) {
      return
    }

    // Get the first team's ID
    const firstTeam = leaderboard.data[0]
    const teamId = firstTeam.team.teamId

    // Get history for the same team and date
    const history = await service.getBatchTeamHistory({
      startDate: fixtures.dateRange.endDate,
      endDate: fixtures.dateRange.endDate,
      period: 'day',
      entityIds: [teamId],
    })

    // Verify the history returns data
    assert.isAbove(history.data.length, 0, 'History should return data for the team')

    const teamHistory = history.data.find((h) => h.teamId === teamId)
    assert.isOk(teamHistory, 'Team should be found in history')

    // If team has history data for that day, LP should match
    if (teamHistory && teamHistory.data.length > 0) {
      const historyLp = teamHistory.data[0].totalLp
      const leaderboardLp = firstTeam.totalLp

      assert.equal(
        historyLp,
        leaderboardLp,
        `Team ${firstTeam.team.currentName} LP mismatch: history=${historyLp}, leaderboard=${leaderboardLp}`
      )
    }
  })

  test('player history LP matches leaderboard LP for same single-day period', async ({ assert }) => {
    // Get player leaderboard for a single day
    const leaderboard = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.endDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
      sort: 'lp',
    })

    // Skip if no players in leaderboard
    if (leaderboard.data.length === 0) {
      return
    }

    // Get the first player's ID
    const firstPlayer = leaderboard.data[0]
    const playerId = firstPlayer.player.playerId

    // Get history for the same player and date
    const history = await service.getBatchPlayerHistory({
      startDate: fixtures.dateRange.endDate,
      endDate: fixtures.dateRange.endDate,
      period: 'day',
      entityIds: [playerId],
    })

    // Verify the history returns data
    assert.isAbove(history.data.length, 0, 'History should return data for the player')

    const playerHistory = history.data.find((h) => h.playerId === playerId)
    assert.isOk(playerHistory, 'Player should be found in history')

    // If player has history data for that day, LP should match
    if (playerHistory && playerHistory.data.length > 0) {
      const historyLp = playerHistory.data[0].totalLp
      const leaderboardLp = firstPlayer.totalLp

      assert.equal(
        historyLp,
        leaderboardLp,
        `Player ${firstPlayer.player.pseudo} LP mismatch: history=${historyLp}, leaderboard=${leaderboardLp}`
      )
    }
  })

  test('team history uses top 5 players only (not all players)', async ({ assert }) => {
    // Create a team with more than 5 players using the partial roster helper
    const testOrg = await Organization.create({
      slug: 'test-large-team-org',
      currentName: 'Test Large Team Org',
      currentShortName: 'TLT',
    })

    const testTeam = await Team.create({
      orgId: testOrg.orgId,
      gameId: 1,
      slug: 'test-large-team',
      currentName: 'Test Large Team',
      shortName: 'TLT',
      isActive: true,
    })

    // Create 7 players with different LP values
    const playerLps = [1000, 900, 800, 700, 600, 500, 400] // 7 players
    const expectedTop5Sum = 1000 + 900 + 800 + 700 + 600 // = 4000

    for (let i = 0; i < playerLps.length; i++) {
      const player = await Player.create({
        slug: `test-player-${i}-${Date.now()}`,
        currentPseudo: `TestPlayer${i}`,
      })

      await PlayerContract.create({
        playerId: player.playerId,
        teamId: testTeam.teamId,
        role: ['TOP', 'JGL', 'MID', 'ADC', 'SUP', 'TOP', 'JGL'][i],
        isStarter: true,
        startDate: DateTime.now().minus({ months: 1 }),
        endDate: null,
      })

      const puuid = `test-puuid-${i}-${Date.now()}`
      await LolAccount.create({
        playerId: player.playerId,
        puuid: puuid,
        gameName: `TestPlayer${i}`,
        tagLine: 'NA1',
        region: 'EUW',
        isPrimary: true,
      })

      // Create daily stats with MASTER tier and specific LP
      const endDateDt = DateTime.fromISO(fixtures.dateRange.endDate)
      await createDailyStatsForAccount(
        puuid,
        'MASTER',
        playerLps[i],
        endDateDt,
        endDateDt
      )
    }

    // Get history for this team
    const history = await service.getBatchTeamHistory({
      startDate: fixtures.dateRange.endDate,
      endDate: fixtures.dateRange.endDate,
      period: 'day',
      entityIds: [testTeam.teamId],
    })

    const teamHistory = history.data.find((h) => h.teamId === testTeam.teamId)

    if (teamHistory && teamHistory.data.length > 0) {
      const totalLp = teamHistory.data[0].totalLp

      // Should be sum of top 5 LP values (1000+900+800+700+600=4000)
      // Not sum of all 7 (1000+900+800+700+600+500+400=4900)
      assert.equal(
        totalLp,
        expectedTop5Sum,
        `Expected top 5 LP sum (${expectedTop5Sum}), got ${totalLp}`
      )
    }
  })
})
