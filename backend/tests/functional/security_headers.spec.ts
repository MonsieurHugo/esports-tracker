import { test } from '@japa/runner'

test.group('Security Headers Middleware', () => {
  test('response includes X-Frame-Options header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('x-frame-options'), 'DENY')
  })

  test('response includes X-Content-Type-Options header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('x-content-type-options'), 'nosniff')
  })

  test('response includes X-XSS-Protection header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('x-xss-protection'), '1; mode=block')
  })

  test('response includes Referrer-Policy header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('referrer-policy'), 'strict-origin-when-cross-origin')
  })

  test('response includes Permissions-Policy header', async ({ client, assert }) => {
    const response = await client.get('/health')

    const permissionsPolicy = response.header('permissions-policy')
    assert.isNotNull(permissionsPolicy)
    assert.include(permissionsPolicy, 'camera=()')
    assert.include(permissionsPolicy, 'microphone=()')
  })

  test('response includes Content-Security-Policy header', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)
    assert.include(csp, "default-src 'self'")
    assert.include(csp, "frame-ancestors 'none'")
  })

  test('response includes Cross-Origin-Opener-Policy header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('cross-origin-opener-policy'), 'same-origin')
  })

  test('response includes Cross-Origin-Resource-Policy header', async ({ client, assert }) => {
    const response = await client.get('/health')

    assert.equal(response.header('cross-origin-resource-policy'), 'same-origin')
  })
})

test.group('CORS Configuration', () => {
  test('OPTIONS preflight returns proper CORS headers in development', async ({
    client,
    assert,
  }) => {
    const response = await client
      .options('/api/v1/auth/login')
      .header('Origin', 'http://localhost:3000')
      .header('Access-Control-Request-Method', 'POST')

    // In development, localhost should be allowed
    const allowedOrigin = response.header('access-control-allow-origin')
    assert.isTrue(allowedOrigin === 'http://localhost:3000' || allowedOrigin === '*')
  })

  test('CORS allows credentials', async ({ client, assert }) => {
    const response = await client
      .options('/api/v1/auth/login')
      .header('Origin', 'http://localhost:3000')
      .header('Access-Control-Request-Method', 'POST')

    assert.equal(response.header('access-control-allow-credentials'), 'true')
  })

  test('CORS exposes allowed methods', async ({ client, assert }) => {
    const response = await client
      .options('/api/v1/auth/login')
      .header('Origin', 'http://localhost:3000')
      .header('Access-Control-Request-Method', 'POST')

    const allowedMethods = response.header('access-control-allow-methods')
    assert.isNotNull(allowedMethods)
    assert.include(allowedMethods, 'POST')
  })
})
