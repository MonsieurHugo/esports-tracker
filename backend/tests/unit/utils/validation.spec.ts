import { test } from '@japa/runner'
import { sanitizeLikeInput, validatePagination, validateLimit, parseEntityIds } from '#utils/validation'

// ============================================
// SANITIZE LIKE INPUT TESTS
// ============================================

test.group('sanitizeLikeInput', () => {
  test('returns empty string for empty input', ({ assert }) => {
    const result = sanitizeLikeInput('')
    assert.equal(result, '')
  })

  test('trims whitespace', ({ assert }) => {
    const result = sanitizeLikeInput('  test  ')
    assert.equal(result, 'test')
  })

  test('escapes percent sign', ({ assert }) => {
    const result = sanitizeLikeInput('100%winrate')
    assert.equal(result, '100\\%winrate')
  })

  test('escapes underscore', ({ assert }) => {
    const result = sanitizeLikeInput('player_name')
    assert.equal(result, 'player\\_name')
  })

  test('escapes backslash', ({ assert }) => {
    const result = sanitizeLikeInput('test\\path')
    assert.equal(result, 'test\\\\path')
  })

  test('escapes multiple special characters', ({ assert }) => {
    const result = sanitizeLikeInput('100%_test\\')
    assert.equal(result, '100\\%\\_test\\\\')
  })

  test('truncates to default max length (100)', ({ assert }) => {
    const longString = 'a'.repeat(150)
    const result = sanitizeLikeInput(longString)
    assert.equal(result.length, 100)
  })

  test('truncates to custom max length', ({ assert }) => {
    const longString = 'a'.repeat(50)
    const result = sanitizeLikeInput(longString, 20)
    assert.equal(result.length, 20)
  })

  test('preserves string shorter than max length', ({ assert }) => {
    const result = sanitizeLikeInput('short', 100)
    assert.equal(result, 'short')
  })

  test('handles SQL injection attempt', ({ assert }) => {
    const injection = "'; DROP TABLE players; --"
    const result = sanitizeLikeInput(injection)
    // Should not escape quotes or semicolons (that's for SQL params, not LIKE)
    // But should escape LIKE wildcards
    assert.equal(result, "'; DROP TABLE players; --")
  })

  test('handles LIKE wildcard injection', ({ assert }) => {
    const injection = '%admin%'
    const result = sanitizeLikeInput(injection)
    assert.equal(result, '\\%admin\\%')
  })

  test('handles mixed content', ({ assert }) => {
    const mixed = '  Test_Player%100  '
    const result = sanitizeLikeInput(mixed)
    assert.equal(result, 'Test\\_Player\\%100')
  })

  test('handles unicode characters', ({ assert }) => {
    const unicode = 'Tëst Plàyér 日本語'
    const result = sanitizeLikeInput(unicode)
    assert.equal(result, 'Tëst Plàyér 日本語')
  })

  test('escapes backslash before other characters', ({ assert }) => {
    // Important: backslash must be escaped first to avoid double escaping
    const result = sanitizeLikeInput('\\%')
    assert.equal(result, '\\\\\\%')
  })
})

// ============================================
// VALIDATE PAGINATION TESTS
// ============================================

test.group('validatePagination', () => {
  test('returns default values for undefined input', ({ assert }) => {
    const result = validatePagination(undefined, undefined)
    assert.equal(result.page, 1)
    assert.equal(result.perPage, 25)
  })

  test('returns default values for null input', ({ assert }) => {
    const result = validatePagination(null, null)
    assert.equal(result.page, 1)
    assert.equal(result.perPage, 25)
  })

  test('parses valid page number', ({ assert }) => {
    const result = validatePagination(5, 25)
    assert.equal(result.page, 5)
  })

  test('parses valid perPage number', ({ assert }) => {
    const result = validatePagination(1, 50)
    assert.equal(result.perPage, 50)
  })

  test('enforces minimum page of 1', ({ assert }) => {
    const result = validatePagination(-5, 25)
    assert.equal(result.page, 1)
  })

  test('enforces minimum page of 1 for zero', ({ assert }) => {
    const result = validatePagination(0, 25)
    assert.equal(result.page, 1)
  })

  test('enforces minimum perPage of 1', ({ assert }) => {
    const result = validatePagination(1, -10)
    assert.equal(result.perPage, 1)
  })

  test('returns default perPage for zero (falsy)', ({ assert }) => {
    // 0 is falsy, so it falls back to default (25)
    const result = validatePagination(1, 0)
    assert.equal(result.perPage, 25)
  })

  test('enforces default max perPage of 100', ({ assert }) => {
    const result = validatePagination(1, 500)
    assert.equal(result.perPage, 100)
  })

  test('accepts custom default perPage', ({ assert }) => {
    const result = validatePagination(undefined, undefined, { defaultPerPage: 50 })
    assert.equal(result.perPage, 50)
  })

  test('accepts custom max perPage', ({ assert }) => {
    const result = validatePagination(1, 500, { maxPerPage: 200 })
    assert.equal(result.perPage, 200)
  })

  test('handles string input for page', ({ assert }) => {
    const result = validatePagination('3', 25)
    assert.equal(result.page, 3)
  })

  test('handles string input for perPage', ({ assert }) => {
    const result = validatePagination(1, '50')
    assert.equal(result.perPage, 50)
  })

  test('handles non-numeric string input', ({ assert }) => {
    const result = validatePagination('invalid', 'abc')
    assert.equal(result.page, 1)
    assert.equal(result.perPage, 25)
  })

  test('floors decimal page numbers', ({ assert }) => {
    const result = validatePagination(2.7, 25)
    assert.equal(result.page, 2)
  })

  test('floors decimal perPage numbers', ({ assert }) => {
    const result = validatePagination(1, 25.9)
    assert.equal(result.perPage, 25)
  })

  test('handles NaN gracefully', ({ assert }) => {
    const result = validatePagination(NaN, NaN)
    assert.equal(result.page, 1)
    assert.equal(result.perPage, 25)
  })

  test('handles Infinity gracefully', ({ assert }) => {
    const result = validatePagination(Infinity, Infinity)
    // Infinity should be floored and capped
    assert.isNumber(result.page)
    assert.isNumber(result.perPage)
  })
})

// ============================================
// VALIDATE LIMIT TESTS
// ============================================

test.group('validateLimit', () => {
  test('returns default value for undefined input', ({ assert }) => {
    const result = validateLimit(undefined)
    assert.equal(result, 5)
  })

  test('returns default value for null input', ({ assert }) => {
    const result = validateLimit(null)
    assert.equal(result, 5)
  })

  test('parses valid limit number', ({ assert }) => {
    const result = validateLimit(7)
    assert.equal(result, 7)
  })

  test('enforces minimum limit of 1', ({ assert }) => {
    const result = validateLimit(-5)
    assert.equal(result, 1)
  })

  test('returns default limit for zero (falsy)', ({ assert }) => {
    // 0 is falsy, so it falls back to default (5)
    const result = validateLimit(0)
    assert.equal(result, 5)
  })

  test('enforces default max limit of 10', ({ assert }) => {
    const result = validateLimit(50)
    assert.equal(result, 10)
  })

  test('accepts custom default limit', ({ assert }) => {
    const result = validateLimit(undefined, { defaultLimit: 3 })
    assert.equal(result, 3)
  })

  test('accepts custom max limit', ({ assert }) => {
    const result = validateLimit(50, { maxLimit: 20 })
    assert.equal(result, 20)
  })

  test('handles string input', ({ assert }) => {
    const result = validateLimit('8')
    assert.equal(result, 8)
  })

  test('handles non-numeric string input', ({ assert }) => {
    const result = validateLimit('invalid')
    assert.equal(result, 5) // Default
  })

  test('floors decimal numbers', ({ assert }) => {
    const result = validateLimit(7.8)
    assert.equal(result, 7)
  })

  test('handles NaN gracefully', ({ assert }) => {
    const result = validateLimit(NaN)
    assert.equal(result, 5) // Default
  })

  test('respects both min and max', ({ assert }) => {
    const result = validateLimit(15, { defaultLimit: 5, maxLimit: 10 })
    assert.equal(result, 10) // Capped at max
  })

  test('allows limit equal to max', ({ assert }) => {
    const result = validateLimit(10, { maxLimit: 10 })
    assert.equal(result, 10)
  })
})

// ============================================
// PARSE ENTITY IDS TESTS
// ============================================

test.group('parseEntityIds', () => {
  // Basic parsing tests
  test('parses comma-separated string', ({ assert }) => {
    const result = parseEntityIds('1,2,3')
    assert.deepEqual(result, [1, 2, 3])
  })

  test('parses array of strings', ({ assert }) => {
    const result = parseEntityIds(['1', '2'])
    assert.deepEqual(result, [1, 2])
  })

  test('parses array of numbers', ({ assert }) => {
    const result = parseEntityIds([1, 2, 3])
    assert.deepEqual(result, [1, 2, 3])
  })

  test('parses single number', ({ assert }) => {
    const result = parseEntityIds(5)
    assert.deepEqual(result, [5])
  })

  test('parses single string number', ({ assert }) => {
    const result = parseEntityIds('42')
    assert.deepEqual(result, [42])
  })

  // Filtering invalid values
  test('filters out non-numeric strings', ({ assert }) => {
    const result = parseEntityIds('1,abc,3')
    assert.deepEqual(result, [1, 3])
  })

  test('filters out negative numbers', ({ assert }) => {
    const result = parseEntityIds('-1,0,1')
    assert.deepEqual(result, [1])
  })

  test('filters out zero', ({ assert }) => {
    const result = parseEntityIds([0, 1, 2])
    assert.deepEqual(result, [1, 2])
  })

  test('filters out decimal numbers', ({ assert }) => {
    const result = parseEntityIds('1.5,2')
    assert.deepEqual(result, [2])
  })

  test('filters out NaN values', ({ assert }) => {
    const result = parseEntityIds([NaN, 1, 2])
    assert.deepEqual(result, [1, 2])
  })

  test('filters out Infinity', ({ assert }) => {
    const result = parseEntityIds([Infinity, 1, -Infinity, 2])
    assert.deepEqual(result, [1, 2])
  })

  // Deduplication
  test('deduplicates IDs', ({ assert }) => {
    const result = parseEntityIds('1,1,2')
    assert.deepEqual(result, [1, 2])
  })

  test('deduplicates across different formats', ({ assert }) => {
    const result = parseEntityIds(['1', 1, '1', 1])
    assert.deepEqual(result, [1])
  })

  // Whitespace handling
  test('trims whitespace in comma-separated string', ({ assert }) => {
    const result = parseEntityIds(' 1 , 2 , 3 ')
    assert.deepEqual(result, [1, 2, 3])
  })

  test('handles empty strings in array', ({ assert }) => {
    const result = parseEntityIds(['1', '', '2'])
    assert.deepEqual(result, [1, 2])
  })

  // Count limit tests
  test('throws error when too many IDs', ({ assert }) => {
    const manyIds = Array(101).fill(1).map((_, i) => i + 1)
    assert.throws(
      () => parseEntityIds(manyIds),
      'Too many entity IDs. Maximum allowed: 100, received: 101'
    )
  })

  test('respects custom maxCount', ({ assert }) => {
    const ids = [1, 2, 3, 4, 5]
    assert.throws(
      () => parseEntityIds(ids, { maxCount: 3 }),
      'Too many entity IDs. Maximum allowed: 3, received: 5'
    )
  })

  test('allows exactly maxCount IDs', ({ assert }) => {
    const ids = [1, 2, 3]
    const result = parseEntityIds(ids, { maxCount: 3 })
    assert.deepEqual(result, [1, 2, 3])
  })

  // Empty result handling
  test('throws error for empty result by default', ({ assert }) => {
    assert.throws(
      () => parseEntityIds(''),
      'No valid entity IDs provided'
    )
  })

  test('throws error when all values are invalid', ({ assert }) => {
    assert.throws(
      () => parseEntityIds('abc,def,-1,0'),
      'No valid entity IDs provided'
    )
  })

  test('allows empty result with allowEmpty option', ({ assert }) => {
    const result = parseEntityIds('', { allowEmpty: true })
    assert.deepEqual(result, [])
  })

  test('allows empty array with allowEmpty option', ({ assert }) => {
    const result = parseEntityIds([], { allowEmpty: true })
    assert.deepEqual(result, [])
  })

  // Edge cases
  test('handles undefined input', ({ assert }) => {
    assert.throws(
      () => parseEntityIds(undefined),
      'No valid entity IDs provided'
    )
  })

  test('handles null input', ({ assert }) => {
    assert.throws(
      () => parseEntityIds(null),
      'No valid entity IDs provided'
    )
  })

  test('handles object input', ({ assert }) => {
    assert.throws(
      () => parseEntityIds({ id: 1 }),
      'No valid entity IDs provided'
    )
  })

  test('handles mixed valid and invalid in array', ({ assert }) => {
    const result = parseEntityIds([1, 'abc', 2, -5, 3, 1.5, 4, null, 5])
    assert.deepEqual(result, [1, 2, 3, 4, 5])
  })

  test('handles very large valid IDs', ({ assert }) => {
    const result = parseEntityIds([1, 999999999, 2])
    assert.deepEqual(result, [1, 999999999, 2])
  })

  test('count limit applies after deduplication', ({ assert }) => {
    // 10 unique IDs after dedup, should not throw with maxCount: 10
    const ids = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]
    const result = parseEntityIds(ids, { maxCount: 10 })
    assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

// ============================================
// INTEGRATION SCENARIOS
// ============================================

test.group('Validation Utils - Integration Scenarios', () => {
  test('sanitizeLikeInput + pagination for search queries', ({ assert }) => {
    // Simulate a search query with pagination
    const searchTerm = '  Test%Player_  '
    const page = '2'
    const perPage = '25'

    const sanitizedSearch = sanitizeLikeInput(searchTerm)
    const pagination = validatePagination(page, perPage)

    assert.equal(sanitizedSearch, 'Test\\%Player\\_')
    assert.equal(pagination.page, 2)
    assert.equal(pagination.perPage, 25)
  })

  test('handles malicious pagination bypass attempts', ({ assert }) => {
    // Attempt to set very high perPage to dump entire database
    const result = validatePagination(1, '999999999')
    assert.equal(result.perPage, 100)
  })

  test('handles negative page injection', ({ assert }) => {
    // Attempt to use negative page for SQL injection
    const result = validatePagination('-1; DROP TABLE users;--', 25)
    assert.equal(result.page, 1)
  })

  test('sanitizes search with limit', ({ assert }) => {
    const searchTerm = '%admin%'
    const limit = 100 // Attempt to bypass limit

    const sanitizedSearch = sanitizeLikeInput(searchTerm)
    const validLimit = validateLimit(limit)

    assert.equal(sanitizedSearch, '\\%admin\\%')
    assert.equal(validLimit, 10) // Capped at default max
  })
})
