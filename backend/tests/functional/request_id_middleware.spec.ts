import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('RequestIdMiddleware', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('generates UUID if no header provided', async ({ client, assert }) => {
    const response = await client.get('/health')

    const requestId = response.header('x-request-id')
    assert.isDefined(requestId)
    assert.match(requestId!, /^[a-f0-9\-]{36}$/) // UUID format
  })

  test('uses provided X-Request-ID header', async ({ client, assert }) => {
    const customId = 'my-custom-request-123'

    const response = await client.get('/health').header('X-Request-ID', customId)

    assert.equal(response.header('x-request-id'), customId)
  })

  test('rejects invalid request IDs with special characters', async ({ client, assert }) => {
    const maliciousId = '<script>alert("xss")</script>'

    const response = await client.get('/health').header('X-Request-ID', maliciousId)

    // Should generate new UUID instead of using malicious one
    const returnedId = response.header('x-request-id')
    assert.notEqual(returnedId, maliciousId)
    assert.match(returnedId!, /^[a-f0-9\-]{36}$/)
  })

  test('rejects overly long request IDs', async ({ client, assert }) => {
    const longId = 'a'.repeat(100)

    const response = await client.get('/health').header('X-Request-ID', longId)

    // Should generate new UUID instead
    const returnedId = response.header('x-request-id')
    assert.notEqual(returnedId, longId)
    assert.match(returnedId!, /^[a-f0-9\-]{36}$/)
  })

  test('accepts valid alphanumeric IDs with dashes and underscores', async ({ client, assert }) => {
    const validIds = [
      'req-abc-123-xyz',
      'request_id_123',
      'a1b2c3d4e5f6',
      'MyRequestID-2024',
    ]

    for (const validId of validIds) {
      const response = await client.get('/health').header('X-Request-ID', validId)

      assert.equal(response.header('x-request-id'), validId)
    }
  })

  test('rejects IDs with spaces', async ({ client, assert }) => {
    const idWithSpaces = 'my request id'

    const response = await client.get('/health').header('X-Request-ID', idWithSpaces)

    const returnedId = response.header('x-request-id')
    assert.notEqual(returnedId, idWithSpaces)
    assert.match(returnedId!, /^[a-f0-9\-]{36}$/)
  })

  test('rejects empty request IDs', async ({ client, assert }) => {
    const response = await client.get('/health').header('X-Request-ID', '')

    const returnedId = response.header('x-request-id')
    assert.isDefined(returnedId)
    assert.match(returnedId!, /^[a-f0-9\-]{36}$/)
  })

  test('request ID is available in all responses', async ({ client, assert }) => {
    const endpoints = ['/health', '/lol/dashboard/teams', '/lol/dashboard/players']

    for (const endpoint of endpoints) {
      const response = await client.get(endpoint)
      const requestId = response.header('x-request-id')

      assert.isDefined(requestId)
      assert.match(requestId!, /^[a-zA-Z0-9\-_]{1,64}$/)
    }
  })

  test('request ID persists across error responses', async ({ client, assert }) => {
    const customId = 'error-test-123'

    const response = await client.get('/non-existent-route').header('X-Request-ID', customId)

    // Even 404 responses should have the request ID
    assert.equal(response.header('x-request-id'), customId)
  })
})
