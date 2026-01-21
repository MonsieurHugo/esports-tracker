# Authorization and Rate Limiting Tests Guide

This document provides an overview of the comprehensive authorization and rate limiting tests added to the Esports Tracker backend.

## Test Files Created/Updated

### 1. `tests/functional/authorization.spec.ts` (NEW)
Comprehensive authorization tests covering authentication and role-based access control.

### 2. `tests/functional/rate_limit.spec.ts` (UPDATED)
Enhanced rate limiting tests with detailed scenarios and edge cases.

---

## Authorization Tests (authorization.spec.ts)

### Coverage Areas

#### 1. Admin Endpoints Authorization (12 tests)
Tests that admin-protected endpoints properly enforce authentication and role requirements:

- **Teams Accounts Endpoint** (`/api/v1/admin/teams-accounts`)
  - ✓ Unauthenticated requests return 401
  - ✓ Non-admin users receive 403 Forbidden
  - ✓ Admin users can access

- **Players List Endpoint** (`/api/v1/admin/players`)
  - ✓ Unauthenticated requests return 401
  - ✓ Non-admin users receive 403 Forbidden
  - ✓ Admin users can access

- **Player Management Endpoints**
  - Update player (`PATCH /api/v1/admin/players/:id`)
  - Upsert contract (`POST /api/v1/admin/players/:id/contract`)
  - End contract (`DELETE /api/v1/admin/players/:id/contract`)
  - All enforce 401 for unauthenticated and 403 for non-admin users

#### 2. Auth Endpoints Authorization (8 tests)
Tests authentication requirements for user-specific endpoints:

- **Public Auth Endpoints** (accessible without authentication)
  - `/api/auth/login` - Returns 401 for invalid credentials (not 403)
  - `/api/auth/register` - Accepts requests, validates data

- **Protected Auth Endpoints** (require authentication)
  - `/api/auth/me` - Returns user data when authenticated
  - `/api/auth/logout` - Requires authentication
  - `/api/auth/change-password` - Requires authentication

#### 3. Admin Auth Endpoints (9 tests)
Tests admin-only user management endpoints:

- `/api/auth/users` (GET) - List users
- `/api/auth/users` (POST) - Create user
- `/api/auth/users/:id` (DELETE) - Delete user
- `/api/auth/users/:id/unlock` (POST) - Unlock user account

All require both authentication AND admin role.

#### 4. Public Endpoints (8 tests)
Verifies that public endpoints are accessible without authentication:

- LoL Dashboard endpoints (`/api/v1/lol/dashboard/*`)
  - batch, summary, teams, leagues, etc.
- Worker monitoring endpoints (`/api/v1/worker/*`)
  - status, metrics, logs, etc.
- Health check endpoints
  - `/health`, `/`

#### 5. Security Edge Cases (4 tests)
Tests for authorization bypass attempts and edge cases:

- ✓ Locked accounts can still be authenticated (locking is login-time check)
- ✓ Unverified email users can access authenticated endpoints
- ✓ Admin role cannot be bypassed with query parameters
- ✓ Admin role cannot be bypassed with HTTP headers

**Total: 41 authorization tests**

---

## Rate Limiting Tests (rate_limit.spec.ts)

### Coverage Areas

#### 1. Login Rate Limiting (8 tests)
Tests rate limits on login endpoint (5 attempts per 15 minutes):

- ✓ Allows requests under rate limit (4 requests)
- ✓ Blocks 6th request with 429 status
- ✓ Error response includes retry information (retryAfter, blockedUntil)
- ✓ Rate limit headers present (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- ✓ Remaining count decreases with each request
- ✓ Retry-After header present when rate limited
- ✓ Successful login works after some failed attempts (under limit)

#### 2. Registration Rate Limiting (3 tests)
Tests rate limits on registration endpoint (3 attempts per hour):

- ✓ Allows 3 registration attempts
- ✓ Blocks 4th attempt with 429 status
- ✓ Rate limit headers present

#### 3. Password Reset Rate Limiting (2 tests)
Tests rate limits on password reset endpoint (3 attempts per hour):

- ✓ Allows 3 password reset requests
- ✓ Blocks 4th request with 429 status

#### 4. 2FA Rate Limiting (2 tests)
Tests rate limits on 2FA endpoints (5 attempts per 10 minutes):

- ✓ Allows 5 2FA setup attempts
- ✓ Blocks 6th attempt with 429 status

#### 5. API Rate Limiting (3 tests)
Tests rate limits on API endpoints (500 requests per minute):

- ✓ Allows 10 rapid requests (well under limit)
- ✓ Rate limit headers present
- ✓ Verifies limit is 500 per minute

#### 6. Rate Limit Behavior (4 tests)
Tests rate limiting behavior and isolation:

- ✓ Rate limits are per-IP address (same IP, different emails)
- ✓ Different endpoints have separate rate limits
- ✓ Rate limit enforced consistently across multiple requests
- ✓ Remaining count decreases correctly

#### 7. Edge Cases (3 tests)
Tests edge cases and error handling:

- ✓ Rate limit applies to both successful and failed requests
- ✓ Rate limit works with empty request body
- ✓ Rate limit works with malformed JSON

**Total: 25 rate limiting tests**

---

## Running the Tests

### Run All Functional Tests
```bash
cd backend
npm test
```

### Run Authorization Tests Only
```bash
cd backend
npm test -- --files="tests/functional/authorization.spec.ts"
```

### Run Rate Limiting Tests Only
```bash
cd backend
npm test -- --files="tests/functional/rate_limit.spec.ts"
```

### Run Specific Test Group
```bash
cd backend
npm test -- --grep="Admin Endpoints"
```

---

## Test Configuration

Tests are configured in `adonisrc.ts`:

```typescript
tests: {
  suites: [
    {
      files: ['tests/functional/**/*.spec(.ts|.js)'],
      name: 'functional',
      timeout: 30000,
    },
  ],
}
```

### Test Setup
- **Database Transactions**: Each test runs in an isolated transaction (auto-rollback)
- **Timeout**: 30 seconds per test
- **Bootstrap**: `tests/bootstrap.ts` configures test environment

---

## Rate Limit Configuration

Rate limits are defined in `app/middleware/rate_limit_middleware.ts`:

| Endpoint Type | Max Attempts | Window | Block Duration |
|--------------|--------------|---------|----------------|
| Login | 5 | 15 minutes | 15 minutes |
| Registration | 3 | 1 hour | 1 hour |
| Password Reset | 3 | 1 hour | 1 hour |
| 2FA | 5 | 10 minutes | 30 minutes |
| API | 500 | 1 minute | 1 minute |
| Default | 100 | 1 minute | 1 minute |

---

## HTTP Status Codes Tested

### Authorization
- **200 OK**: Successful authenticated request
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Authenticated but insufficient permissions (not admin)
- **404 Not Found**: Resource not found (after auth check)

### Rate Limiting
- **200 OK / 401 Unauthorized**: Normal responses (under rate limit)
- **422 Unprocessable Entity**: Validation errors (under rate limit)
- **429 Too Many Requests**: Rate limit exceeded

---

## Expected Response Headers

### Rate Limit Headers (Always Present)
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1705500000
```

### Rate Limited Response (429)
```
Retry-After: 900
```

```json
{
  "error": "Trop de tentatives. Veuillez réessayer plus tard.",
  "retryAfter": 900,
  "blockedUntil": "2024-01-17T12:00:00.000Z"
}
```

---

## Test Patterns Used

### 1. Transaction Isolation
```typescript
test.group('Test Group', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  // Tests...
})
```

### 2. Authentication with loginAs
```typescript
const user = await User.create({ email: 'test@test.com', password: 'Pass123!@#' })
const response = await client.get('/api/auth/me').loginAs(user)
```

### 3. Query Parameters
```typescript
const response = await client.get('/api/v1/lol/dashboard/summary').qs({
  period: '7d',
  league: 'LEC'
})
```

### 4. JSON Body
```typescript
const response = await client.post('/api/auth/login').json({
  email: 'test@test.com',
  password: 'Pass123!@#'
})
```

### 5. Custom Headers
```typescript
const response = await client
  .get('/api/v1/admin/teams-accounts')
  .header('X-Custom-Header', 'value')
  .loginAs(admin)
```

---

## Common Test Assertions

```typescript
// Status code
response.assertStatus(200)

// Body contains
response.assertBodyContains({ user: { email: 'test@test.com' } })

// Header exists
assert.exists(response.header('x-ratelimit-limit'))

// Custom assertions
assert.equal(response.status(), 200)
assert.isAbove(parseInt(response.header('x-ratelimit-remaining')), 0)
```

---

## Troubleshooting

### Database Connection Issues
If tests fail with "connect ECONNREFUSED":
1. Ensure PostgreSQL is running
2. Check database configuration in `.env.test`
3. Run migrations: `node ace migration:run --force`

### Rate Limit Tests Flaky
Rate limit tests may occasionally be flaky due to:
- Shared test database state
- Timing issues with concurrent requests
- Memory-based rate limit store (when Redis unavailable)

To mitigate:
- Tests use transaction isolation
- Each test group resets database state
- Rate limit middleware uses in-memory fallback

### Schema Mismatches
If tests fail with column errors:
1. Run latest migrations: `node ace migration:run --force`
2. Check database schema matches User model
3. Verify `.env.test` points to correct test database

---

## Test Coverage Summary

### Authorization Coverage
- ✅ Admin endpoint protection
- ✅ User authentication requirements
- ✅ Role-based access control
- ✅ Public endpoint accessibility
- ✅ Authorization bypass prevention

### Rate Limiting Coverage
- ✅ Login attempts throttling
- ✅ Registration throttling
- ✅ Password reset throttling
- ✅ 2FA throttling
- ✅ API request throttling
- ✅ Rate limit headers
- ✅ Per-IP enforcement
- ✅ Endpoint isolation

---

## Next Steps

### Recommended Additional Tests

1. **Session Management**
   - Session expiration
   - Concurrent sessions
   - Session hijacking prevention

2. **OAuth Integration**
   - OAuth provider authorization
   - Account linking
   - OAuth token validation

3. **2FA Enforcement**
   - 2FA required for admin actions
   - Recovery code usage
   - 2FA bypass prevention

4. **API Token Authentication**
   - Bearer token validation
   - Token expiration
   - Token revocation

5. **CORS and Security Headers**
   - CORS policy enforcement
   - Security header presence
   - Content-Type validation

---

## Contributing

When adding new tests:

1. Follow existing test structure and naming conventions
2. Use transaction isolation for database tests
3. Test both success and failure scenarios
4. Include edge cases and security considerations
5. Document rate limit expectations
6. Verify tests pass in isolation and as a suite

---

## Test Performance

Expected test execution times:
- **Authorization tests**: ~5-7 seconds (41 tests)
- **Rate limiting tests**: ~4-6 seconds (25 tests)
- **All functional tests**: ~15-20 seconds

If tests run significantly slower, check:
- Database connection latency
- Transaction overhead
- Rate limit store performance (Redis vs memory)
