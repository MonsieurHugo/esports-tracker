import { test } from '@japa/runner'
import User from '#models/user'
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Auth API - Registration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST /api/v1/auth/register creates new user with valid data', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/register').json({
      email: 'newuser@example.com',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
      fullName: 'Test User',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      success: true,
      user: {
        email: 'newuser@example.com',
      },
    })
  })

  test('POST /api/v1/auth/register rejects weak password', async ({ client }) => {
    const response = await client.post('/api/v1/auth/register').json({
      email: 'newuser@example.com',
      password: 'weakpass',
      confirmPassword: 'weakpass',
    })

    response.assertStatus(422)
    response.assertBodyContains({
      errors: [{ field: 'password' }],
    })
  })

  test('POST /api/v1/auth/register rejects duplicate email', async ({ client }) => {
    // Create a user first
    await User.create({
      email: 'existing@example.com',
      password: 'StrongP@ss123',
    })

    const response = await client.post('/api/v1/auth/register').json({
      email: 'existing@example.com',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    })

    response.assertStatus(400)
  })

  test('POST /api/v1/auth/register normalizes email to lowercase', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/register').json({
      email: 'UPPERCASE@EXAMPLE.COM',
      password: 'StrongP@ss123',
      confirmPassword: 'StrongP@ss123',
    })

    response.assertStatus(201)

    const user = await User.findBy('email', 'uppercase@example.com')
    assert.isNotNull(user)
  })
})

test.group('Auth API - Login', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST /api/v1/auth/login succeeds with valid credentials', async ({ client }) => {
    // Create a user
    const user = await User.create({
      email: 'test@example.com',
      password: 'StrongP@ss123',
      emailVerified: true,
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'StrongP@ss123',
    })

    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      user: {
        email: 'test@example.com',
      },
    })
  })

  test('POST /api/v1/auth/login fails with wrong password', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'StrongP@ss123',
    })

    const response = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'WrongPassword123!',
    })

    response.assertStatus(401)
  })

  test('POST /api/v1/auth/login fails with non-existent email', async ({ client }) => {
    const response = await client.post('/api/v1/auth/login').json({
      email: 'nonexistent@example.com',
      password: 'StrongP@ss123',
    })

    response.assertStatus(401)
  })

  test('POST /api/v1/auth/login locks account after 5 failed attempts', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'StrongP@ss123',
    })

    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await client.post('/api/v1/auth/login').json({
        email: 'test@example.com',
        password: 'WrongPassword!',
      })
    }

    // 6th attempt should indicate locked account
    const response = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'WrongPassword!',
    })

    response.assertStatus(423)
  })
})

test.group('Auth API - Me Endpoint', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/auth/me returns 401 without session', async ({ client }) => {
    const response = await client.get('/api/v1/auth/me')
    response.assertStatus(401)
  })

  test('GET /api/v1/auth/me returns user data with valid session', async ({ client }) => {
    const user = await User.create({
      email: 'test@example.com',
      password: 'StrongP@ss123',
      emailVerified: true,
    })

    // Login first to get session
    const loginResponse = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'StrongP@ss123',
    })

    // Use the session cookie for the me request
    const response = await client
      .get('/api/v1/auth/me')
      .withCookie('adonis-session', loginResponse.cookie('adonis-session')?.value || '')

    response.assertStatus(200)
    response.assertBodyContains({
      user: {
        email: 'test@example.com',
      },
    })
  })
})

test.group('Auth API - Logout', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('POST /api/v1/auth/logout clears session', async ({ client }) => {
    await User.create({
      email: 'test@example.com',
      password: 'StrongP@ss123',
      emailVerified: true,
    })

    // Login
    const loginResponse = await client.post('/api/v1/auth/login').json({
      email: 'test@example.com',
      password: 'StrongP@ss123',
    })

    // Logout
    const logoutResponse = await client
      .post('/api/v1/auth/logout')
      .withCookie('adonis-session', loginResponse.cookie('adonis-session')?.value || '')

    logoutResponse.assertStatus(200)

    // Verify session is cleared
    const meResponse = await client
      .get('/api/v1/auth/me')
      .withCookie('adonis-session', loginResponse.cookie('adonis-session')?.value || '')

    meResponse.assertStatus(401)
  })
})
