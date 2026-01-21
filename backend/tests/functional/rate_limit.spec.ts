import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Rate Limiting Tests
 *
 * Tests for rate limiting enforcement on API endpoints:
 * - API endpoints (500 requests per minute)
 * - Rate limit headers
 */

// ============================================
// API RATE LIMITING
// ============================================

test.group('Rate Limiting - API Endpoints', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('API endpoints have high rate limits', async ({ client, assert }) => {
    // Make 10 requests quickly (limit is 500 per minute)
    const responses = []
    for (let i = 0; i < 10; i++) {
      const response = await client.get('/api/v1/lol/dashboard/teams').qs({
        period: '7d',
      })
      responses.push(response)
    }

    // All should succeed
    responses.forEach((response) => {
      assert.equal(response.status(), 200)
    })
  })

  test('API rate limit headers are present', async ({ client, assert }) => {
    const response = await client.get('/api/v1/lol/dashboard/teams').qs({
      period: '7d',
    })

    assert.exists(response.header('x-ratelimit-limit'))
    assert.exists(response.header('x-ratelimit-remaining'))
    assert.exists(response.header('x-ratelimit-reset'))
  })

  test('API rate limit is 500 requests per minute', async ({ client, assert }) => {
    const response = await client.get('/api/v1/lol/dashboard/teams').qs({
      period: '7d',
    })

    const limit = parseInt(response.header('x-ratelimit-limit') || '0')
    assert.equal(limit, 500, 'API rate limit should be 500 per minute')
  })

  test('rate limit countdown in remaining header', async ({ client, assert }) => {
    const responses = []

    // Make 3 requests and check remaining count
    for (let i = 0; i < 3; i++) {
      const response = await client.get('/api/v1/lol/dashboard/teams').qs({
        period: '7d',
      })
      responses.push(response)
    }

    // Verify remaining count decreases
    const remaining1 = parseInt(responses[0].header('x-ratelimit-remaining') || '0')
    const remaining2 = parseInt(responses[1].header('x-ratelimit-remaining') || '0')
    const remaining3 = parseInt(responses[2].header('x-ratelimit-remaining') || '0')

    assert.isBelow(remaining2, remaining1)
    assert.isBelow(remaining3, remaining2)
  })
})
