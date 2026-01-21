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

  test('CSP includes nonce for script-src', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)

    // Should contain nonce directive with base64 encoded value
    assert.match(csp || '', /script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/)
  })

  test('CSP includes strict-dynamic for trusted scripts', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)
    assert.include(csp || '', "'strict-dynamic'")
  })

  test('CSP does not include unsafe-eval', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)

    // Security fix: unsafe-eval should be removed
    assert.notInclude(csp || '', "'unsafe-eval'")
  })

  test('CSP nonce is unique per request', async ({ client, assert }) => {
    const response1 = await client.get('/health')
    const response2 = await client.get('/health')

    const csp1 = response1.header('content-security-policy')
    const csp2 = response2.header('content-security-policy')

    // Extract nonces
    const nonceRegex = /nonce-([A-Za-z0-9+/=]+)/
    const nonce1 = csp1?.match(nonceRegex)?.[1]
    const nonce2 = csp2?.match(nonceRegex)?.[1]

    assert.isNotNull(nonce1)
    assert.isNotNull(nonce2)
    assert.notEqual(nonce1, nonce2, 'Nonces must be unique per request for security')
  })

  test('CSP allows required third-party domains', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)

    // Microsoft Clarity
    assert.include(csp || '', 'https://www.clarity.ms')

    // Google Analytics
    assert.include(csp || '', 'https://www.googletagmanager.com')
  })

  test('CSP allows LoL asset domains', async ({ client, assert }) => {
    const response = await client.get('/health')

    const csp = response.header('content-security-policy')
    assert.isNotNull(csp)

    // DDragon for champion icons
    assert.include(csp || '', 'ddragon.leagueoflegends.com')

    // CommunityDragon for additional assets
    assert.include(csp || '', 'raw.communitydragon.org')
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
