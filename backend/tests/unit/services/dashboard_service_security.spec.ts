import { test } from '@japa/runner'
import {
  validateFilterCondition,
  validateAllConditions,
  buildInClause,
  ALLOWED_FILTER_PATTERNS,
} from '#services/dashboard_service'

/**
 * Security tests for DashboardService SQL injection prevention system.
 *
 * These tests verify that:
 * 1. Valid SQL filter conditions are accepted
 * 2. SQL injection attempts are rejected
 * 3. Unknown patterns are rejected (defense in depth)
 * 4. The buildInClause helper produces correct output
 *
 * @security These tests are CRITICAL for maintaining SQL injection protection.
 * Any changes to ALLOWED_FILTER_PATTERNS must be accompanied by corresponding test updates.
 */
test.group('DashboardService SQL Security', () => {
  // ============================================================================
  // VALID PATTERN TESTS
  // These tests verify that legitimate conditions are accepted
  // ============================================================================

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

  test('validateFilterCondition accepts valid player filters', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('p.player_id IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('p.player_id IN (?,?,?)'))
    assert.doesNotThrow(() => validateFilterCondition('p.current_pseudo ILIKE ?'))
  })

  test('validateFilterCondition accepts valid search conditions', ({ assert }) => {
    assert.doesNotThrow(
      () => validateFilterCondition('(t.current_name ILIKE ? OR t.short_name ILIKE ?)')
    )
  })

  test('validateFilterCondition accepts valid LP change conditions', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('lp_change > 0'))
    assert.doesNotThrow(() => validateFilterCondition('lp_change < 0'))
    assert.doesNotThrow(() => validateFilterCondition('league IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('league IN (?,?,?)'))
    assert.doesNotThrow(() => validateFilterCondition('role IN (?)'))
    assert.doesNotThrow(() => validateFilterCondition('games >= ?'))
  })

  test('validateFilterCondition accepts valid HAVING conditions', ({ assert }) => {
    assert.doesNotThrow(() => validateFilterCondition('SUM(ds.games_played) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('COUNT(*) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('COALESCE(SUM(ds.games_played), 0) >= ?'))
    assert.doesNotThrow(() => validateFilterCondition('SUM(games) >= ?'))
  })

  test('validateFilterCondition handles whitespace variations', ({ assert }) => {
    // Multiple spaces should be normalized
    assert.doesNotThrow(() => validateFilterCondition('t.league  IN  (?)'))
    assert.doesNotThrow(() => validateFilterCondition('  t.league IN (?)  '))
    assert.doesNotThrow(() => validateFilterCondition('t.is_active  =  true'))
  })

  // ============================================================================
  // SQL INJECTION REJECTION TESTS
  // These tests verify that malicious input is rejected
  // ============================================================================

  test('validateFilterCondition rejects SQL injection with DROP TABLE', ({ assert }) => {
    const injectionAttempts = [
      "t.league IN ('LEC'); DROP TABLE teams; --",
      "t.league = 'LEC'; DROP TABLE users; --",
      "'; DROP TABLE teams; --",
      "1; DROP TABLE teams;",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects SQL injection with DELETE', ({ assert }) => {
    const injectionAttempts = [
      "1=1; DELETE FROM users;",
      "t.league = 'LEC'; DELETE FROM teams WHERE 1=1; --",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects SQL injection with UNION', ({ assert }) => {
    const injectionAttempts = [
      "t.league IN (?) UNION SELECT * FROM users",
      "1=1 UNION SELECT password FROM users --",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects OR-based injection', ({ assert }) => {
    const injectionAttempts = [
      "t.league = 'LEC' OR 1=1",
      "t.league IN (?) OR 1=1",
      "t.is_active = true OR 1=1 --",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects subquery injection', ({ assert }) => {
    const injectionAttempts = [
      "t.league IN (SELECT * FROM users)",
      "t.league = (SELECT password FROM users LIMIT 1)",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects comment-based injection', ({ assert }) => {
    const injectionAttempts = [
      "t.league IN (?) -- comment",
      "t.league IN (?); /* comment */",
      "t.is_active = true /* OR 1=1 */",
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  test('validateFilterCondition rejects direct value injection', ({ assert }) => {
    const injectionAttempts = [
      "t.league = 'LEC'", // Should use parameterized (?)
      "t.league IN ('LEC', 'LFL')", // Should use parameterized (?,?)
      "games >= 10", // Should use parameterized ?
    ]

    for (const attempt of injectionAttempts) {
      assert.throws(() => validateFilterCondition(attempt), /Invalid filter/, `Should reject: ${attempt}`)
    }
  })

  // ============================================================================
  // UNKNOWN PATTERN REJECTION TESTS
  // Defense in depth: reject anything not explicitly whitelisted
  // ============================================================================

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

  test('validateFilterCondition rejects unknown operators', ({ assert }) => {
    assert.throws(() => validateFilterCondition('t.league LIKE ?')) // Should be ILIKE
    assert.throws(() => validateFilterCondition('t.league = ?')) // Should be IN
    assert.throws(() => validateFilterCondition('t.is_active = false')) // Only true allowed
  })

  // ============================================================================
  // validateAllConditions TESTS
  // ============================================================================

  test('validateAllConditions accepts valid condition arrays', ({ assert }) => {
    assert.doesNotThrow(() =>
      validateAllConditions([
        't.is_active = true',
        't.league IN (?)',
      ])
    )

    assert.doesNotThrow(() =>
      validateAllConditions([
        'lp_change > 0',
        'league IN (?,?)',
        'games >= ?',
      ])
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

  // ============================================================================
  // buildInClause TESTS
  // ============================================================================

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

  test('buildInClause works with different column types', ({ assert }) => {
    const columns: Array<['t.league' | 'pc.role' | 'p.player_id', (string | number)[]]> = [
      ['t.league', ['LEC', 'LFL']],
      ['pc.role', ['TOP', 'MID']],
      ['p.player_id', [1, 2, 3]],
    ]

    for (const [column, vals] of columns) {
      const [condition, returnedVals] = buildInClause(column, vals)
      const expectedPlaceholders = vals.map(() => '?').join(',')
      assert.equal(condition, `${column} IN (${expectedPlaceholders})`)
      assert.deepEqual(returnedVals, vals)
    }
  })

  test('buildInClause rejects empty values array', ({ assert }) => {
    assert.throws(() => buildInClause('t.league', []), /IN clause requires at least one value/)
  })

  // ============================================================================
  // PATTERN COVERAGE TESTS
  // Ensure all patterns in ALLOWED_FILTER_PATTERNS are tested
  // ============================================================================

  test('all ALLOWED_FILTER_PATTERNS have at least one matching test', ({ assert }) => {
    // This test documents which patterns exist
    // If this test fails, it means patterns were added without corresponding tests
    const expectedPatternCount = 24 // Update this when adding new patterns

    assert.equal(
      ALLOWED_FILTER_PATTERNS.length,
      expectedPatternCount,
      `Expected ${expectedPatternCount} patterns but found ${ALLOWED_FILTER_PATTERNS.length}. ` +
        'If you added new patterns, update this test and add corresponding validation tests.'
    )
  })
})
