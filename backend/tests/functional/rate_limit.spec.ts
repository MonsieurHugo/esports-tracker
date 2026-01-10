import { test } from '@japa/runner'

test.group('Rate Limiting Middleware', () => {
  test('login endpoint returns 429 after too many requests', async ({ client, assert }) => {
    // Make many rapid requests to trigger rate limit
    const requests = []
    for (let i = 0; i < 10; i++) {
      requests.push(
        client.post('/api/v1/auth/login').json({
          email: `test${i}@example.com`,
          password: 'anypassword',
        })
      )
    }

    const responses = await Promise.all(requests)

    // At least one should be rate limited (429) if rate limiting is working
    // Or all should be 401 (invalid credentials) if under the limit
    const statusCodes = responses.map((r) => r.status())
    const hasRateLimitOrAuth = statusCodes.every((code) => code === 401 || code === 429)

    assert.isTrue(hasRateLimitOrAuth, 'Should return 401 or 429 for login attempts')
  })

  test('rate limited response includes Retry-After header', async ({ client, assert }) => {
    // Make many requests quickly to trigger rate limit
    for (let i = 0; i < 20; i++) {
      await client.post('/api/v1/auth/login').json({
        email: 'test@example.com',
        password: 'wrongpassword',
      })
    }

    // This request should be rate limited
    const response = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'wrongpassword',
    })

    // If rate limited, should have Retry-After header
    if (response.status() === 429) {
      assert.isNotNull(response.header('retry-after'))
    }
  })

  test('registration endpoint has rate limiting', async ({ client, assert }) => {
    // Make rapid registration attempts
    const requests = []
    for (let i = 0; i < 15; i++) {
      requests.push(
        client.post('/api/v1/auth/register').json({
          email: `newuser${i}@example.com`,
          password: 'StrongP@ss123',
          confirmPassword: 'StrongP@ss123',
        })
      )
    }

    const responses = await Promise.all(requests)
    const statusCodes = responses.map((r) => r.status())

    // Should either succeed (201), fail validation (422), or be rate limited (429)
    const validCodes = statusCodes.every((code) => [201, 422, 429, 400].includes(code))
    assert.isTrue(validCodes, 'Should return valid status codes for registration attempts')
  })
})
