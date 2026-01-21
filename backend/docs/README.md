# Esports Tracker API Documentation

Complete OpenAPI 3.1 documentation for the Esports Tracker backend API.

## Accessing the Documentation

### Interactive Swagger UI

The easiest way to explore the API is through the interactive Swagger UI:

```
http://localhost:3333/api/docs
```

This provides:
- Complete API reference with all endpoints
- Interactive "Try it out" functionality
- Request/response examples
- Schema definitions
- Authentication testing

### OpenAPI Specification Files

The OpenAPI specification is available in two formats:

**JSON Format:**
```
http://localhost:3333/api/docs/openapi.json
```

**YAML Format:**
```
http://localhost:3333/api/docs/openapi.yaml
```

Use these URLs to:
- Import into Postman, Insomnia, or other API clients
- Generate client SDKs
- Integrate with API testing tools
- Set up mock servers

## Quick Start

### 1. Authentication

The API uses cookie-based session authentication. Most endpoints are public, but admin endpoints require authentication.

**Register a new account:**
```bash
curl -X POST http://localhost:3333/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

**Authenticated requests:**
```bash
curl http://localhost:3333/api/auth/me \
  -b cookies.txt
```

### 2. Dashboard Data

Get League of Legends dashboard statistics:

**Team leaderboard:**
```bash
curl "http://localhost:3333/api/v1/lol/dashboard/teams?leagueId=1&startDate=2024-01-01&endDate=2024-01-31"
```

**Player leaderboard:**
```bash
curl "http://localhost:3333/api/v1/lol/dashboard/players?leagueId=1&startDate=2024-01-01&endDate=2024-01-31"
```

**Batch endpoint (recommended for performance):**
```bash
curl "http://localhost:3333/api/v1/lol/dashboard/batch?leagueId=1&startDate=2024-01-01&endDate=2024-01-31"
```

### 3. Player Profiles

Get detailed player information:

```bash
curl http://localhost:3333/api/v1/players/faker/profile
curl http://localhost:3333/api/v1/players/faker/champions?days=30
curl http://localhost:3333/api/v1/players/faker/duos?days=30
```

## API Structure

### Base URL

- **Development:** `http://localhost:3333`
- **Production:** `https://api.esports-tracker.com`

### API Versioning

All main API endpoints are versioned under `/api/v1/`:

```
/api/v1/lol/dashboard/*    # Dashboard endpoints
/api/v1/players/*          # Player endpoints
/api/v1/worker/*           # Worker monitoring
/api/v1/admin/*            # Admin operations
```

Authentication endpoints are unversioned:
```
/api/auth/*                # Auth endpoints
```

### Response Format

All endpoints return JSON with consistent error formatting:

**Success Response:**
```json
{
  "data": { ... }
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "message": "Detailed error description",
  "errors": [
    {
      "field": "email",
      "rule": "email",
      "message": "The email field must be a valid email address"
    }
  ]
}
```

## Rate Limits

| Endpoint Type | Rate Limit |
|--------------|------------|
| Login | 10 requests per 5 minutes |
| Register | 5 requests per 15 minutes |
| Password Reset | 3 requests per 15 minutes |
| 2FA Operations | 10 requests per 5 minutes |
| General API | 60 requests per minute |
| Worker Auth | Special token-based auth |

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets

## Common Query Parameters

### Date Range Parameters

Most dashboard endpoints support date filtering:

- `startDate`: Start date (ISO 8601 format, e.g., `2024-01-01`)
- `endDate`: End date (ISO 8601 format, e.g., `2024-01-31`)
- `period`: Aggregation period (`day`, `week`, `month`, `year`)
- `date`: Single date reference (alternative to range)

Maximum date range: **365 days**

### Filtering Parameters

- `leagueId`: Filter by league (integer)
- `teamId`: Filter by team (integer)
- `limit`: Number of results (default varies by endpoint)
- `minStreak`: Minimum streak length for streak endpoints

### Pagination Parameters

- `page`: Page number (default: 1)
- `perPage` or `limit`: Items per page (default: 20, max: 100)

## Using with API Clients

### Postman

1. Open Postman
2. Click "Import"
3. Choose "Link"
4. Enter: `http://localhost:3333/api/docs/openapi.json`
5. Click "Continue" and "Import"

### Insomnia

1. Open Insomnia
2. Click "Create" → "Import from URL"
3. Enter: `http://localhost:3333/api/docs/openapi.json`
4. Click "Fetch and Import"

### Bruno

1. Open Bruno
2. Click "Import" → "OpenAPI"
3. Enter: `http://localhost:3333/api/docs/openapi.json`
4. Click "Import"

## Generating Client SDKs

Use OpenAPI Generator to create client libraries in any language:

```bash
# Install OpenAPI Generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript client
openapi-generator-cli generate \
  -i http://localhost:3333/api/docs/openapi.json \
  -g typescript-fetch \
  -o ./client-typescript

# Generate Python client
openapi-generator-cli generate \
  -i http://localhost:3333/api/docs/openapi.json \
  -g python \
  -o ./client-python
```

## Testing the API

### Health Check

Verify the API is running:

```bash
curl http://localhost:3333/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

### Test Authenticated Endpoints

1. Create a test admin user (requires direct database access):
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
   ```

2. Login and save cookies:
   ```bash
   curl -X POST http://localhost:3333/api/auth/login \
     -H "Content-Type: application/json" \
     -c cookies.txt \
     -d '{"email":"your-email@example.com","password":"YourPassword123!"}'
   ```

3. Test admin endpoint:
   ```bash
   curl http://localhost:3333/api/v1/admin/teams-accounts \
     -b cookies.txt
   ```

## Security

### Authentication Flow

1. **Session-based authentication** using secure HTTP-only cookies
2. **Password requirements:**
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character

3. **Account protection:**
   - Account locked after 5 failed login attempts
   - 30-minute lockout period
   - Email verification required
   - Optional 2FA with TOTP

### Security Headers

The API includes security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- CORS configuration for frontend

### CORS

CORS is configured to allow requests from the frontend:
- Development: `http://localhost:3000`
- Production: `https://esports-tracker.com`

Credentials (cookies) are allowed for authentication.

## Troubleshooting

### 401 Unauthorized

- Ensure you're including cookies with authenticated requests
- Check that your session hasn't expired
- Verify you're using the correct credentials

### 403 Forbidden

- Endpoint requires admin role
- Check your user role: `curl http://localhost:3333/api/auth/me -b cookies.txt`

### 422 Validation Error

- Check the `errors` array in the response for specific validation failures
- Refer to the OpenAPI schema for field requirements

### 429 Too Many Requests

- You've exceeded the rate limit
- Wait for the time specified in `X-RateLimit-Reset` header
- Implement exponential backoff in your client

## Support

For API questions or issues:
- Review the OpenAPI specification at `/api/docs`
- Check the CLAUDE.md file in the project root
- Open an issue on GitHub
- Contact: support@esports-tracker.com

## Updates

The OpenAPI specification is maintained in:
```
backend/docs/openapi.yaml
```

After making changes:
1. Update the YAML file
2. Restart the backend server
3. Refresh the Swagger UI to see changes

## API Changelog

### Version 1.0.0 (Current)

**Initial Release:**
- Authentication system with 2FA support
- Dashboard endpoints with batch optimization
- Player profile endpoints
- Worker monitoring endpoints
- Admin management endpoints
- OpenAPI 3.1 documentation
