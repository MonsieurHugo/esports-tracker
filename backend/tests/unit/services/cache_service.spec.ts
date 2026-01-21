import { test } from '@japa/runner'
import { cacheService, CACHE_KEYS, CACHE_TTL } from '#services/cache_service'

/**
 * Cache Service Unit Tests
 *
 * These tests verify the cache service behavior.
 * Note: Actual Redis connection tests are skipped in test environment
 * to avoid requiring Redis during CI/CD.
 */

test.group('CacheService', (group) => {
  group.each.setup(async () => {
    // Clean up cache before each test
    if (process.env.REDIS_ENABLED === 'true') {
      await cacheService.flush()
    }
  })

  test('CACHE_KEYS constants are properly structured', ({ assert }) => {
    assert.equal(CACHE_KEYS.LEAGUES, 'leagues:all')
    assert.equal(CACHE_KEYS.SPLITS, 'splits:all')

    // Test dynamic key generators
    assert.equal(CACHE_KEYS.TEAM_LEADERBOARD('lec', '7d'), 'leaderboard:team:lec:7d')
    assert.equal(CACHE_KEYS.PLAYER_LEADERBOARD('lck', '30d'), 'leaderboard:player:lck:30d')
    assert.equal(CACHE_KEYS.TOP_GRINDERS('lfl', '24h'), 'grinders:lfl:24h')
    assert.equal(CACHE_KEYS.TOP_LP_GAINERS('lck', 'split'), 'lp:gainers:lck:split')
    assert.equal(CACHE_KEYS.TOP_LP_LOSERS('lec', '7d'), 'lp:losers:lec:7d')
    assert.equal(CACHE_KEYS.STREAKS('lfl'), 'streaks:lfl')
    assert.equal(CACHE_KEYS.SUMMARY_STATS('lck', '30d'), 'summary:lck:30d')
  })

  test('CACHE_TTL constants are defined', ({ assert }) => {
    assert.equal(CACHE_TTL.LEAGUES, 3600)
    assert.equal(CACHE_TTL.SPLITS, 3600)
    assert.equal(CACHE_TTL.LEADERBOARD, 300)
    assert.equal(CACHE_TTL.GRINDERS, 300)
    assert.equal(CACHE_TTL.LP_CHANGES, 60)
    assert.equal(CACHE_TTL.STREAKS, 300)
    assert.equal(CACHE_TTL.SUMMARY, 300)
    assert.equal(CACHE_TTL.PLAYER_PROFILE, 600)
    assert.equal(CACHE_TTL.TEAM_PROFILE, 600)
    assert.equal(CACHE_TTL.PLAYER_HISTORY, 180)
  })

  test('get returns null when key does not exist', async ({ assert }) => {
    const result = await cacheService.get('nonexistent:key')
    assert.isNull(result)
  })

  test('getOrSet executes fetcher when cache miss', async ({ assert }) => {
    let fetcherCalled = false
    const testData = { id: 1, name: 'Test' }

    const result = await cacheService.getOrSet(
      'test:key',
      60,
      async () => {
        fetcherCalled = true
        return testData
      }
    )

    assert.isTrue(fetcherCalled)
    assert.deepEqual(result, testData)
  })

  test('getOrSet returns cached value on second call', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0) // Skip test
      return
    }

    const testData = { id: 1, name: 'Test' }
    let fetcherCallCount = 0

    // First call - should fetch
    await cacheService.getOrSet('test:key2', 60, async () => {
      fetcherCallCount++
      return testData
    })

    // Second call - should use cache
    const result = await cacheService.getOrSet('test:key2', 60, async () => {
      fetcherCallCount++
      return testData
    })

    assert.equal(fetcherCallCount, 1) // Fetcher only called once
    assert.deepEqual(result, testData)
  })

  test('set and get work together', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    const testData = { leagues: ['LEC', 'LCK', 'LFL'] }

    await cacheService.set('test:leagues', testData, 60)
    const result = await cacheService.get<typeof testData>('test:leagues')

    assert.deepEqual(result, testData)
  })

  test('delete removes cache entry', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    await cacheService.set('test:delete', { value: 'test' }, 60)
    await cacheService.delete('test:delete')

    const result = await cacheService.get('test:delete')
    assert.isNull(result)
  })

  test('deletePattern removes matching keys', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    // Create multiple keys with same pattern
    await cacheService.set('leaderboard:team:lec:7d', { data: 1 }, 60)
    await cacheService.set('leaderboard:team:lck:7d', { data: 2 }, 60)
    await cacheService.set('leaderboard:player:lec:7d', { data: 3 }, 60)

    // Delete all team leaderboards
    await cacheService.deletePattern('leaderboard:team:*')

    // Team leaderboards should be gone
    assert.isNull(await cacheService.get('leaderboard:team:lec:7d'))
    assert.isNull(await cacheService.get('leaderboard:team:lck:7d'))

    // Player leaderboard should still exist
    assert.isNotNull(await cacheService.get('leaderboard:player:lec:7d'))
  })

  test('invalidateLeaderboards clears all leaderboard caches', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    // Create various leaderboard caches
    await cacheService.set(CACHE_KEYS.TEAM_LEADERBOARD('lec', '7d'), { data: 1 }, 60)
    await cacheService.set(CACHE_KEYS.TOP_GRINDERS('lec', '7d'), { data: 2 }, 60)
    await cacheService.set(CACHE_KEYS.TOP_LP_GAINERS('lec', '24h'), { data: 3 }, 60)
    await cacheService.set(CACHE_KEYS.STREAKS('lec'), { data: 4 }, 60)

    await cacheService.invalidateLeaderboards()

    // All should be cleared
    assert.isNull(await cacheService.get(CACHE_KEYS.TEAM_LEADERBOARD('lec', '7d')))
    assert.isNull(await cacheService.get(CACHE_KEYS.TOP_GRINDERS('lec', '7d')))
    assert.isNull(await cacheService.get(CACHE_KEYS.TOP_LP_GAINERS('lec', '24h')))
    assert.isNull(await cacheService.get(CACHE_KEYS.STREAKS('lec')))
  })

  test('invalidateLeague clears league-specific caches', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    // Create caches for multiple leagues
    await cacheService.set(CACHE_KEYS.TEAM_LEADERBOARD('lec', '7d'), { data: 1 }, 60)
    await cacheService.set(CACHE_KEYS.TEAM_LEADERBOARD('lck', '7d'), { data: 2 }, 60)

    await cacheService.invalidateLeague('lec')

    // LEC should be cleared, LCK should remain
    assert.isNull(await cacheService.get(CACHE_KEYS.TEAM_LEADERBOARD('lec', '7d')))
    assert.isNotNull(await cacheService.get(CACHE_KEYS.TEAM_LEADERBOARD('lck', '7d')))
  })

  test('cache service handles complex objects', async ({ assert }) => {
    // Skip if Redis is not enabled
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.plan(0)
      return
    }

    const complexData = {
      leagues: [
        { id: '1', name: 'LEC', region: 'EMEA' },
        { id: '2', name: 'LCK', region: 'KR' },
      ],
      stats: {
        totalPlayers: 150,
        totalTeams: 30,
        lastUpdated: new Date().toISOString(),
      },
      nested: {
        deep: {
          object: {
            value: 'test',
          },
        },
      },
    }

    await cacheService.set('test:complex', complexData, 60)
    const result = await cacheService.get<typeof complexData>('test:complex')

    assert.deepEqual(result, complexData)
  })

  test('cache service gracefully handles Redis being disabled', async ({ assert }) => {
    // This test always runs regardless of REDIS_ENABLED
    const testData = { value: 'test' }
    let fetcherCalled = false

    const result = await cacheService.getOrSet(
      'test:disabled',
      60,
      async () => {
        fetcherCalled = true
        return testData
      }
    )

    // Should always call fetcher when Redis is disabled
    assert.isTrue(fetcherCalled)
    assert.deepEqual(result, testData)

    // get() should always return null when disabled
    const getResult = await cacheService.get('test:disabled')
    if (process.env.REDIS_ENABLED !== 'true') {
      assert.isNull(getResult)
    }
  })

  test('getStats returns stats when Redis is enabled', async ({ assert }) => {
    const stats = await cacheService.getStats()

    if (process.env.REDIS_ENABLED !== 'true') {
      assert.isNull(stats)
    } else {
      assert.isNotNull(stats)
      assert.property(stats!, 'hits')
      assert.property(stats!, 'misses')
      assert.property(stats!, 'keys')
      assert.property(stats!, 'memory')
    }
  })
})
