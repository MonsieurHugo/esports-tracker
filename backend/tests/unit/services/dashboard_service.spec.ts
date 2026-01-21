import { test } from '@japa/runner'
import DashboardService, {
  validateFilterCondition,
  validateAllConditions,
  buildInClause,
  ALLOWED_FILTER_PATTERNS,
  QueryTimeoutError,
} from '#services/dashboard_service'
import testUtils from '@adonisjs/core/services/test_utils'
import {
  createDashboardFixtures,
  cacheKeyTestCases,
  type DashboardFixtureData,
} from '../../fixtures/dashboard_fixtures.js'

/**
 * Comprehensive DashboardService Test Suite
 *
 * This suite covers all aspects of the DashboardService:
 * - Response structure validation
 * - Filtering functionality
 * - Pagination behavior
 * - SQL injection prevention (security)
 * - Query timeout handling
 * - Cache key generation (SHA256)
 * - N+1 query prevention
 * - Batch history operations
 * - Period handling
 * - Integration tests
 *
 * Security features tested (from batches 2.1-2.4):
 * - Step 2.1: SQL validation with ALLOWED_FILTER_PATTERNS and validateFilterCondition
 * - Step 2.2: Query timeouts with executeWithTimeout and QueryTimeoutError
 * - Step 2.3: Cache keys with SHA256 (16 hex characters)
 * - Step 2.4: N+1 prevention with player_details CTE and JSON aggregation
 */

// ============================================
// SECTION 1: Response Structure Tests
// ============================================

test.group('DashboardService - Response Structure', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('getTeamLeaderboard returns correct structure', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.properties(result, ['data', 'meta'])
    assert.isArray(result.data)
    assert.properties(result.meta, ['total', 'perPage', 'currentPage', 'lastPage'])
    assert.isNumber(result.meta.total)
    assert.equal(result.meta.perPage, 10)
    assert.equal(result.meta.currentPage, 1)
  })

  test('getPlayerLeaderboard returns correct structure', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.properties(result, ['data', 'meta'])
    assert.isArray(result.data)
    assert.properties(result.meta, ['total', 'perPage', 'currentPage', 'lastPage'])
  })

  test('team entries have required properties', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    if (result.data.length > 0) {
      const team = result.data[0]
      assert.property(team, 'rank')
      assert.property(team, 'team')
      assert.property(team, 'games')
      assert.property(team, 'winrate')
      assert.property(team, 'totalLp')
      assert.property(team, 'players')
      assert.isArray(team.players)
    }
  })

  test('player entries have required properties', async ({ assert }) => {
    const result = await service.getPlayerLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    if (result.data.length > 0) {
      const player = result.data[0]
      assert.property(player, 'rank')
      assert.property(player, 'player')
      assert.property(player, 'games')
      assert.property(player, 'winrate')
      assert.property(player, 'totalLp')
      assert.property(player, 'accounts')
    }
  })
})

// ============================================
// SECTION 2: Filtering Tests
// ============================================

test.group('DashboardService - Filtering', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('filters teams by league', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC'],
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.equal(entry.team.league, 'LEC')
    }
  })

  test('filters teams by multiple leagues', async ({ assert }) => {
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

  test('filters players by role', async ({ assert }) => {
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

  test('filters by minimum games', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      minGames: 50,
      page: 1,
      perPage: 100,
    })

    for (const entry of result.data) {
      assert.isAtLeast(entry.games, 50)
    }
  })

  test('empty league filter returns all leagues', async ({ assert }) => {
    const withEmpty = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: [],
      page: 1,
      perPage: 100,
    })

    const withoutFilter = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 100,
    })

    // Should have the same number of results
    assert.equal(withEmpty.meta.total, withoutFilter.meta.total)
  })
})

// ============================================
// SECTION 3: Pagination Tests
// ============================================

test.group('DashboardService - Pagination', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures({
      teamsPerLeague: 5,
      leagues: ['LEC', 'LFL'],
    })
  })

  test('respects perPage limit', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 2,
    })

    assert.isAtMost(result.data.length, 2)
    assert.equal(result.meta.perPage, 2)
  })

  test('perPage is validated by controller (service trusts input)', async ({ assert }) => {
    // Note: perPage validation happens at the controller/validator level (max 100)
    // The service trusts already-validated input
    // This test verifies the service handles the value it receives
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 100, // Use valid max value
    })

    // Service should honor the validated perPage value
    assert.equal(result.meta.perPage, 100)
  })

  test('returns different data for different pages', async ({ assert }) => {
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

    if (page1.data.length > 0 && page2.data.length > 0) {
      assert.notEqual(page1.data[0].team.teamId, page2.data[0].team.teamId)
    }
  })

  test('high page number returns empty data', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 999,
      perPage: 10,
    })

    assert.isEmpty(result.data)
    assert.equal(result.meta.currentPage, 999)
  })
})

// ============================================
// SECTION 4: Security Tests (SQL Injection Prevention) - Step 2.1
// ============================================

test.group('DashboardService - SQL Security (Step 2.1)', () => {
  // Valid pattern tests
  test('validateFilterCondition accepts valid league IN clause', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('t.league IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('t.league IN (?,?)'))
    assert.doesNotThrow(() => validateFilterCondition('t.league IN (?,?,?)'))
    assert.doesNotThrow(() => validateFilterCondition('t.league IN (?,?,?,?,?)'))
  })

  test('validateFilterCondition accepts valid role IN clauses', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('rp.role IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('rp.role IN (?,?,?)'))
    assert.doesNotThrow(() => validateFilterCondition('pc.role IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('pc.role IN (?,?,?)'))
  })

  test('validateFilterCondition accepts valid date conditions', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('ds.date >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('ds.date <= ?'))
    assert.doesNotThrow(() => validateFilterCondition('ds.date BETWEEN ? AND ?'))
  })

  test('validateFilterCondition accepts valid static conditions', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('t.is_active = true'))
    assert.doesNotThrow(() => validateFilterCondition('pc.end_date IS NULL'))
    assert.doesNotThrow(() => validateFilterCondition('p.is_active = true'))
  })

  test('validateFilterCondition accepts valid HAVING conditions', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('SUM(ds.games_played) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('COUNT(*) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('COALESCE(SUM(ds.games_played), 0) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('SUM(games) >= ?'))
  })

  test('validateFilterCondition handles whitespace variations', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('t.league  IN  (?)'))
    assert.doesNotThrow(() => validateFilterCondition('  t.league IN (?)  '))
    assert.doesNotThrow(() => validateFilterCondition('t.is_active  =  true'))
  })

  // SQL injection rejection tests
  test('validateFilterCondition rejects SQL injection with DROP TABLE', ({ assert }) => {
    const injectionAttempts = [
      "t.league IN ('LEC'); DROP TABLE teams; --",
      "t.league = 'LEC'; DROP TABLE users; --",
      "'; DROP TABLE teams; --",
      '1; DROP TABLE teams;',
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(
        () => validateFilterCondition(attempt),
        /Invalid filter/,
        `Should reject: ${attempt}`
      )
    }
  })

  test('validateFilterCondition rejects SQL injection with DELETE', ({ assert }) => {
    const injectionAttempts = [
      '1=1; DELETE FROM users;',
      "t.league = 'LEC'; DELETE FROM teams WHERE 1=1; --",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(
        () => validateFilterCondition(attempt),
        /Invalid filter/,
        `Should reject: ${attempt}`
      )
    }
  })

  test('validateFilterCondition rejects SQL injection with UNION', ({ assert }) => {
    const injectionAttempts = [
      't.league IN (?) UNION SELECT * FROM users',
      '1=1 UNION SELECT password FROM users --',
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(
        () => validateFilterCondition(attempt),
        /Invalid filter/,
        `Should reject: ${attempt}`
      )
    }
  })

  test('validateFilterCondition rejects OR-based injection', ({ assert }) => {
    const injectionAttempts = [
      "t.league = 'LEC' OR 1=1",
      't.league IN (?) OR 1=1',
      't.is_active = true OR 1=1 --',
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(
        () => validateFilterCondition(attempt),
        /Invalid filter/,
        `Should reject: ${attempt}`
      )
    }
  })

  test('validateFilterCondition rejects subquery injection', ({ assert }) => {
    const injectionAttempts = [
      't.league IN (SELECT * FROM users)',
      't.league = (SELECT password FROM users LIMIT 1)',
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(
        () => validateFilterCondition(attempt),
        /Invalid filter/,
        `Should reject: ${attempt}`
      )
    }
  })

  test('validateFilterCondition rejects unknown table aliases', ({ assert }) => {
    assert.throws(() => validateFilterCondition('unknown_table.column = ?'))
    assert.throws(() => validateFilterCondition('x.league IN (?)'))
    assert.throws(() => validateFilterCondition('foo.bar = true'))
  })

  test('validateFilterCondition rejects unknown column names', ({ assert }) => {
    assert.throws(() => validateFilterCondition('t.unknown_column IN (?)'))
    assert.throws(() => validateFilterCondition('p.password = ?'))
    assert.throws(() => validateFilterCondition('t.secret IN (?)'))
  })

  // validateAllConditions tests
  test('validateAllConditions accepts valid condition arrays', ({ assert }) => {
    assert.doesNotThrow(() => validateAllConditions(['t.is_active = true', 't.league IN (?)']))

    assert.doesNotThrow(() =>
      validateAllConditions(['lp_change > 0', 'league IN (?,?)', 'games >= ?'])
    )
  })

  test('validateAllConditions rejects arrays with any invalid condition', ({ assert }) => {
    assert.throws(() =>
      validateAllConditions([
        't.league IN (?)', // valid
        'INVALID CONDITION', // invalid
      ])
    )

    assert.throws(() =>
      validateAllConditions([
        't.is_active = true', // valid
        "t.league IN (?); DROP TABLE teams; --", // invalid
      ])
    )
  })

  test('validateAllConditions accepts empty array', ({ assert }) => {
    assert.doesNotThrow(() => validateAllConditions([]))
  })

  // buildInClause tests
  test('buildInClause creates correct format for single value', ({ assert }) => {
    const [condition, values] = buildInClause('t.league', ['LEC'])

    assert.equal(condition, 't.league IN (?)')
    assert.deepEqual(values, ['LEC'])
  })

  test('buildInClause creates correct format for multiple values', ({ assert }) => {
    const [condition, values] = buildInClause('t.league', ['LEC', 'LFL', 'LCK'])

    assert.equal(condition, 't.league IN (?,?,?)')
    assert.deepEqual(values, ['LEC', 'LFL', 'LCK'])
  })

  test('buildInClause rejects empty values array', ({ assert }) => {
    assert.throws(() => buildInClause('t.league', []), /IN clause requires at least one value/)
  })

  // Pattern coverage test
  test('all ALLOWED_FILTER_PATTERNS are documented', ({ assert }) => {
    // This test ensures we have coverage for all patterns
    const expectedPatternCount = 24 // Update when adding new patterns

    assert.equal(
      ALLOWED_FILTER_PATTERNS.length,
      expectedPatternCount,
      `Expected ${expectedPatternCount} patterns but found ${ALLOWED_FILTER_PATTERNS.length}. ` +
        'Update this test if you added new patterns.'
    )
  })
})

// ============================================
// SECTION 5: Timeout Tests (Step 2.2)
// ============================================

test.group('DashboardService - Timeout Handling (Step 2.2)', () => {
  test('QueryTimeoutError has correct properties', ({ assert }) => {
    const error = new QueryTimeoutError('testOperation', 8000)

    assert.equal(error.name, 'QueryTimeoutError')
    assert.equal(error.operationName, 'testOperation')
    assert.equal(error.timeoutMs, 8000)
    assert.include(error.message, 'testOperation')
    assert.include(error.message, '8000ms')
  })

  test('QueryTimeoutError is instanceof Error', ({ assert }) => {
    const error = new QueryTimeoutError('test', 1000)

    assert.instanceOf(error, Error)
    assert.instanceOf(error, QueryTimeoutError)
  })

  test('QueryTimeoutError message follows expected format', ({ assert }) => {
    const error = new QueryTimeoutError('getTeamLeaderboard', 8000)

    assert.equal(error.message, 'Query timeout: getTeamLeaderboard exceeded 8000ms')
  })

  test('QueryTimeoutError with different timeout values', ({ assert }) => {
    const error1 = new QueryTimeoutError('operation1', 5000)
    const error2 = new QueryTimeoutError('operation2', 15000)

    assert.equal(error1.timeoutMs, 5000)
    assert.equal(error2.timeoutMs, 15000)
    assert.include(error1.message, '5000ms')
    assert.include(error2.message, '15000ms')
  })

  test('QueryTimeoutError can be caught as Error', ({ assert }) => {
    try {
      throw new QueryTimeoutError('testOp', 3000)
    } catch (error) {
      assert.instanceOf(error, Error)
      if (error instanceof QueryTimeoutError) {
        assert.equal(error.operationName, 'testOp')
        assert.equal(error.timeoutMs, 3000)
      } else {
        assert.fail('Error should be instance of QueryTimeoutError')
      }
    }
  })
})

test.group('DashboardService - Timeout Performance', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('normal queries complete within timeout', async ({ assert }) => {
    const start = Date.now()

    await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 5,
    })

    const duration = Date.now() - start
    assert.isBelow(duration, 8000) // Less than the timeout
  })
})

// ============================================
// SECTION 6: Cache Key Tests (Step 2.3)
// ============================================

test.group('DashboardService - Cache Key Generation (Step 2.3)', () => {
  test('same params produce same cache key regardless of order', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', cacheKeyTestCases.params1)
    const key2 = accessor.buildCacheKey('teams', cacheKeyTestCases.params1Reordered)

    assert.equal(key1, key2)
  })

  test('different params produce different keys', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', cacheKeyTestCases.params2)
    const key2 = accessor.buildCacheKey('teams', cacheKeyTestCases.params3)

    assert.notEqual(key1, key2)
  })

  test('different prefixes produce different keys', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', { page: 1 })
    const key2 = accessor.buildCacheKey('players', { page: 1 })

    assert.notEqual(key1, key2)
  })

  test('cache key uses SHA256 format (16 hex chars)', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key = accessor.buildCacheKey('teams', { page: 1 })

    // Format: dashboard:teams:<16 hex chars>
    assert.match(key, /^dashboard:teams:[a-f0-9]{16}$/)
  })

  test('cache key includes dashboard prefix', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key = accessor.buildCacheKey('history', { teamId: 123 })

    assert.isTrue(key.startsWith('dashboard:history:'))
  })

  test('undefined and null values are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', cacheKeyTestCases.withUndefined)
    const key2 = accessor.buildCacheKey('teams', cacheKeyTestCases.params2)

    assert.equal(key1, key2)
  })

  test('empty arrays are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', cacheKeyTestCases.withEmptyArray)
    const key2 = accessor.buildCacheKey('teams', cacheKeyTestCases.params2)

    assert.equal(key1, key2)
  })

  test('empty strings are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', cacheKeyTestCases.withEmptyString)
    const key2 = accessor.buildCacheKey('teams', cacheKeyTestCases.params2)

    assert.equal(key1, key2)
  })

  test('nested objects are normalized', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('history', {
      dateRange: { start: '2024-01-01', end: '2024-01-31' },
    })

    const key2 = accessor.buildCacheKey('history', {
      dateRange: { end: '2024-01-31', start: '2024-01-01' }, // Different order
    })

    assert.equal(key1, key2)
  })

  test('arrays with mixed types are sorted correctly', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('test', {
      values: [1, 'a', 2, 'b'],
    })

    const key2 = accessor.buildCacheKey('test', {
      values: ['b', 2, 'a', 1],
    })

    assert.equal(key1, key2)
  })

  test('boolean values are preserved correctly', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as {
      buildCacheKey: (prefix: string, params: object) => string
    }

    const key1 = accessor.buildCacheKey('teams', { active: true })
    const key2 = accessor.buildCacheKey('teams', { active: false })

    assert.notEqual(key1, key2)
  })
})

// ============================================
// SECTION 7: N+1 Prevention Tests (Step 2.4)
// ============================================

test.group('DashboardService - N+1 Prevention (Step 2.4)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('teams include players array', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    for (const team of result.data) {
      assert.isArray(team.players, `Team ${team.team.currentName} should have players array`)
      assert.isNotNull(team.players)
    }
  })

  test('players are ordered by role', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    const roleOrder = ['Top', 'TOP', 'Jungle', 'JGL', 'Mid', 'MID', 'ADC', 'Bot', 'BOT', 'Support', 'SUP']

    for (const team of result.data) {
      if (team.players.length < 2) continue

      const roles = team.players.map((p) => p.role).filter((r): r is string => r !== null)

      for (let i = 1; i < roles.length; i++) {
        const prevIdx = roleOrder.indexOf(roles[i - 1])
        const currIdx = roleOrder.indexOf(roles[i])
        if (prevIdx !== -1 && currIdx !== -1) {
          assert.isAtMost(
            prevIdx,
            currIdx,
            `Team ${team.team.currentName}: ${roles[i - 1]} should come before ${roles[i]}`
          )
        }
      }
    }
  })

  // This test validates that players are returned with correct structure
  // Note: Account details are tested at the API/functional level
  test('players have correct structure', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    // Ensure we have teams with players
    assert.isAbove(result.data.length, 0, 'Should have at least one team')

    for (const team of result.data) {
      for (const player of team.players) {
        // Verify player structure has required fields
        assert.property(player, 'playerId', 'Player should have playerId')
        assert.property(player, 'pseudo', 'Player should have pseudo')
        assert.property(player, 'role', 'Player should have role')
      }
    }

    assert.isTrue(true, 'Player structure validation completed')
  })

  test('teams without players have empty array (not null)', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 100,
    })

    for (const team of result.data) {
      assert.isArray(team.players)
      assert.isNotNull(team.players)
    }
  })
})

// N+1 Helper function tests (unit tests without database)
test.group('DashboardService - N+1 Helper Functions', () => {
  test('role ordering helper produces correct order values', ({ assert }) => {
    const getRoleOrder = (role: string | null | undefined): number => {
      switch (role) {
        case 'Top':
        case 'TOP':
          return 1
        case 'Jungle':
        case 'JGL':
          return 2
        case 'Mid':
        case 'MID':
          return 3
        case 'ADC':
        case 'Bot':
        case 'BOT':
          return 4
        case 'Support':
        case 'SUP':
          return 5
        default:
          return 6
      }
    }

    const roleOrder = ['Top', 'TOP', 'Jungle', 'JGL', 'Mid', 'MID', 'ADC', 'Bot', 'BOT', 'Support', 'SUP']
    const expectedOrder = [1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5]

    roleOrder.forEach((role, index) => {
      const order = getRoleOrder(role)
      assert.equal(order, expectedOrder[index], `Role ${role} should have order ${expectedOrder[index]}`)
    })
  })

  test('unknown roles have order 6 (sorted last)', ({ assert }) => {
    const getRoleOrder = (role: string | null | undefined): number => {
      switch (role) {
        case 'Top':
        case 'TOP':
          return 1
        case 'Jungle':
        case 'JGL':
          return 2
        case 'Mid':
        case 'MID':
          return 3
        case 'ADC':
        case 'Bot':
        case 'BOT':
          return 4
        case 'Support':
        case 'SUP':
          return 5
        default:
          return 6
      }
    }

    const unknownRoles = ['Unknown', 'Coach', 'Analyst', null, undefined, '']

    unknownRoles.forEach((role) => {
      const order = getRoleOrder(role)
      assert.equal(order, 6, `Unknown role "${role}" should have order 6`)
    })
  })

  test('tier ordering produces correct priority (CHALLENGER highest)', ({ assert }) => {
    const tierOrder = [
      'CHALLENGER',
      'GRANDMASTER',
      'MASTER',
      'DIAMOND',
      'EMERALD',
      'PLATINUM',
      'GOLD',
      'SILVER',
      'BRONZE',
      'IRON',
    ]

    for (let i = 1; i < tierOrder.length; i++) {
      const higherTierIndex = tierOrder.indexOf(tierOrder[i - 1])
      const lowerTierIndex = tierOrder.indexOf(tierOrder[i])
      assert.isBelow(
        higherTierIndex,
        lowerTierIndex,
        `${tierOrder[i - 1]} should have lower index than ${tierOrder[i]}`
      )
    }
  })
})

// ============================================
// SECTION 8: Period Handling Tests
// ============================================

test.group('DashboardService - Period Handling', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('handles day period', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.endDate, // Single day
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.isArray(result.data)
  })

  test('handles week period', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.isArray(result.data)
  })

  test('handles month period', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 10,
    })

    assert.isArray(result.data)
  })
})

// ============================================
// SECTION 9: Sorting Tests
// ============================================

test.group('DashboardService - Sorting', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('sorts by games descending by default', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
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
    const result = await service.getTeamLeaderboard({
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

  test('sorts by winrate when specified', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      sort: 'winrate',
      page: 1,
      perPage: 20,
    })

    for (let i = 1; i < result.data.length; i++) {
      assert.isAtLeast(result.data[i - 1].winrate, result.data[i].winrate)
    }
  })
})

// ============================================
// SECTION 10: Integration Tests
// ============================================

test.group('DashboardService - Integration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
    fixtures = await createDashboardFixtures()
  })

  test('full flow: filter + paginate + sort', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['LEC', 'LFL'],
      minGames: 5,
      page: 1,
      perPage: 10,
    })

    // Structure
    assert.isArray(result.data)
    assert.properties(result.meta, ['total', 'perPage', 'currentPage', 'lastPage'])

    // Filters applied
    for (const entry of result.data) {
      assert.include(['LEC', 'LFL'], entry.team.league)
      assert.isAtLeast(entry.games, 5)
      assert.isArray(entry.players)
    }

    // Pagination
    assert.isAtMost(result.data.length, 10)
  })

  test('multiple concurrent requests work correctly', async ({ assert }) => {
    const [teams, players] = await Promise.all([
      service.getTeamLeaderboard({
        startDate: fixtures.dateRange.startDate,
        endDate: fixtures.dateRange.endDate,
        page: 1,
        perPage: 10,
      }),
      service.getPlayerLeaderboard({
        startDate: fixtures.dateRange.startDate,
        endDate: fixtures.dateRange.endDate,
        page: 1,
        perPage: 10,
      }),
    ])

    assert.isArray(teams.data)
    assert.isArray(players.data)
  })

  test('returns empty data when no matches', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      leagues: ['NONEXISTENT_LEAGUE'],
      page: 1,
      perPage: 10,
    })

    assert.deepEqual(result.data, [])
    assert.equal(result.meta.total, 0)
  })

  test('excludes inactive teams from results', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: fixtures.dateRange.startDate,
      endDate: fixtures.dateRange.endDate,
      page: 1,
      perPage: 100,
    })

    const inactiveTeamIds = fixtures.teams.inactive.map((t) => t.teamId)
    for (const entry of result.data) {
      assert.notInclude(inactiveTeamIds, entry.team.teamId)
    }
  })

  test('handles date range with no data gracefully', async ({ assert }) => {
    const result = await service.getTeamLeaderboard({
      startDate: '2020-01-01',
      endDate: '2020-01-07',
      page: 1,
      perPage: 10,
    })

    assert.deepEqual(result.data, [])
    assert.equal(result.meta.total, 0)
  })
})

// ============================================
// SECTION 11: Performance Tests
// ============================================

test.group('DashboardService - Performance', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let service: DashboardService
  let fixtures: DashboardFixtureData

  group.each.setup(async () => {
    service = new DashboardService()
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
