import { test } from '@japa/runner'
import DashboardService from '#services/dashboard_service'

/**
 * Cache key generation tests for DashboardService.
 *
 * These tests verify that:
 * 1. Cache keys are deterministic regardless of parameter order
 * 2. Different parameters produce different keys
 * 3. SHA256 is used with proper format (16 hex chars)
 * 4. Parameter normalization works correctly
 *
 * @security Cache key collisions could cause data leakage between users/contexts.
 */
test.group('DashboardService Cache Key Generation', () => {
  test('same params produce same cache key regardless of order', ({ assert }) => {
    const service = new DashboardService()

    const key1 = (service as unknown as { buildCacheKey: (prefix: string, params: object) => string }).buildCacheKey('teams', {
      leagues: ['LFL', 'LEC'],
      page: 1,
      period: 'month',
    })

    const key2 = (service as unknown as { buildCacheKey: (prefix: string, params: object) => string }).buildCacheKey('teams', {
      period: 'month',
      page: 1,
      leagues: ['LEC', 'LFL'], // Different order of props AND array elements
    })

    assert.equal(key1, key2)
  })

  test('different params produce different keys', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', { page: 1 })
    const key2 = accessor.buildCacheKey('teams', { page: 2 })

    assert.notEqual(key1, key2)
  })

  test('different prefixes produce different keys', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', { page: 1 })
    const key2 = accessor.buildCacheKey('players', { page: 1 })

    assert.notEqual(key1, key2)
  })

  test('cache key uses SHA256 format (16 hex chars)', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key = accessor.buildCacheKey('teams', { page: 1 })

    // Format: dashboard:teams:<16 hex chars>
    assert.match(key, /^dashboard:teams:[a-f0-9]{16}$/)
  })

  test('cache key includes dashboard prefix', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key = accessor.buildCacheKey('history', { teamId: 123 })

    assert.isTrue(key.startsWith('dashboard:history:'))
  })

  test('undefined and null values are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', {
      page: 1,
      leagues: undefined,
      roles: null,
    })

    const key2 = accessor.buildCacheKey('teams', {
      page: 1,
    })

    assert.equal(key1, key2)
  })

  test('empty arrays are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', {
      page: 1,
      leagues: [],
    })

    const key2 = accessor.buildCacheKey('teams', {
      page: 1,
    })

    assert.equal(key1, key2)
  })

  test('empty strings are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', {
      page: 1,
      search: '',
    })

    const key2 = accessor.buildCacheKey('teams', {
      page: 1,
    })

    assert.equal(key1, key2)
  })

  test('whitespace-only strings are ignored', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', {
      page: 1,
      search: '   ',
    })

    const key2 = accessor.buildCacheKey('teams', {
      page: 1,
    })

    assert.equal(key1, key2)
  })

  test('nested objects are normalized', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

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
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

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
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', { active: true })
    const key2 = accessor.buildCacheKey('teams', { active: false })

    assert.notEqual(key1, key2)
  })

  test('numeric values are preserved correctly', ({ assert }) => {
    const service = new DashboardService()
    const accessor = service as unknown as { buildCacheKey: (prefix: string, params: object) => string }

    const key1 = accessor.buildCacheKey('teams', { minGames: 5 })
    const key2 = accessor.buildCacheKey('teams', { minGames: 10 })

    assert.notEqual(key1, key2)
  })
})
