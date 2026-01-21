# OpenAPI Documentation - Quick Reference

## Access URLs

### Development
- **Swagger UI**: http://localhost:3333/api/docs
- **OpenAPI JSON**: http://localhost:3333/api/docs/openapi.json
- **OpenAPI YAML**: http://localhost:3333/api/docs/openapi.yaml

### Production
- **Swagger UI**: https://api.esports-tracker.com/api/docs
- **OpenAPI JSON**: https://api.esports-tracker.com/api/docs/openapi.json
- **OpenAPI YAML**: https://api.esports-tracker.com/api/docs/openapi.yaml

## Files Created

```
backend/
├── docs/
│   ├── openapi.yaml              # Complete OpenAPI 3.1 specification
│   ├── README.md                 # Comprehensive API documentation
│   ├── postman-quick-start.md    # Postman import and testing guide
│   ├── SETUP_SUMMARY.md          # Setup documentation and overview
│   └── QUICK_REFERENCE.md        # This file
├── app/
│   └── controllers/
│       └── docs_controller.ts    # Controller to serve documentation
├── start/
│   └── routes.ts                 # Updated with /api/docs routes
└── scripts/
    └── test_docs.ts              # Test script for documentation endpoints
```

## Quick Commands

```bash
# Start backend server
cd backend
npm run dev

# Test documentation endpoints
node --import=tsx scripts/test_docs.ts

# Validate OpenAPI spec (requires swagger-cli)
npm install -g @apidevtools/swagger-cli
swagger-cli validate backend/docs/openapi.yaml

# Import to Postman
# In Postman: Import → Link → http://localhost:3333/api/docs/openapi.json
```

## API Endpoints Summary

### Documentation (3 endpoints)
- `GET /api/docs` - Swagger UI
- `GET /api/docs/openapi.json` - JSON spec
- `GET /api/docs/openapi.yaml` - YAML spec

### Health (2 endpoints)
- `GET /` - API info
- `GET /health` - Health check

### Authentication (18 endpoints)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `PATCH /api/auth/profile`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `GET /api/auth/audit-logs`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/verify`
- `POST /api/auth/2fa/disable`
- `POST /api/auth/2fa/recovery-codes`
- `GET /api/auth/oauth/accounts`
- `GET /api/auth/oauth/{provider}`
- `DELETE /api/auth/oauth/{provider}`

### Dashboard (13 endpoints)
- `GET /api/v1/lol/dashboard/batch`
- `GET /api/v1/lol/dashboard/teams`
- `GET /api/v1/lol/dashboard/players`
- `GET /api/v1/lol/dashboard/top-grinders`
- `GET /api/v1/lol/dashboard/top-lp-gainers`
- `GET /api/v1/lol/dashboard/top-lp-losers`
- `GET /api/v1/lol/dashboard/streaks`
- `GET /api/v1/lol/dashboard/loss-streaks`
- `GET /api/v1/lol/dashboard/team-history`
- `GET /api/v1/lol/dashboard/team-history-batch`
- `GET /api/v1/lol/dashboard/player-history`
- `GET /api/v1/lol/dashboard/player-history-batch`
- `GET /api/v1/lol/dashboard/leagues`
- `GET /api/v1/lol/dashboard/splits`

### Players (5 endpoints)
- `GET /api/v1/players/{slug}/profile`
- `GET /api/v1/players/{slug}/play-hours`
- `GET /api/v1/players/{slug}/duos`
- `GET /api/v1/players/{slug}/champions`
- `GET /api/v1/players/{slug}/compare/{compareSlug}`

### Workers (10 endpoints)
- `GET /api/v1/worker/status`
- `GET /api/v1/worker/metrics/history`
- `GET /api/v1/worker/metrics/daily`
- `GET /api/v1/worker/logs`
- `GET /api/v1/worker/players/search`
- `GET /api/v1/worker/daily-coverage`
- `GET /api/v1/worker/accounts`
- `GET /api/v1/worker/accounts/list`
- `GET /api/v1/worker/coverage-stats`
- `GET /api/v1/worker/priority-stats`

### Admin (9 endpoints)
- `GET /api/v1/admin/teams-accounts`
- `GET /api/v1/admin/players`
- `PATCH /api/v1/admin/players/{id}`
- `POST /api/v1/admin/players/{id}/contract`
- `DELETE /api/v1/admin/players/{id}/contract`
- `GET /api/auth/users`
- `POST /api/auth/users`
- `DELETE /api/auth/users/{id}`
- `POST /api/auth/users/{id}/unlock`

**Total: 60+ documented endpoints**

## Common Usage Examples

### Get Dashboard Data (Batch)
```bash
curl "http://localhost:3333/api/v1/lol/dashboard/batch?leagueId=1&startDate=2024-01-01&endDate=2024-01-31"
```

### Login
```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"user@example.com","password":"Pass123!"}'
```

### Get Current User (Authenticated)
```bash
curl http://localhost:3333/api/auth/me -b cookies.txt
```

### Get Player Profile
```bash
curl http://localhost:3333/api/v1/players/faker/profile
```

### Import to Postman
```bash
# Open Postman → Import → Link
# Paste: http://localhost:3333/api/docs/openapi.json
```

## Data Models

### Key Schemas
- `User` - User account
- `TeamStats` - Team performance
- `PlayerStats` - Player performance
- `PlayerProfile` - Detailed player info
- `League` - League/competition
- `Split` - Season/split
- `Account` - Game account
- `DashboardSummary` - Aggregate stats

### Common Parameters
- `leagueId` - Filter by league (integer)
- `startDate` - Start date (ISO 8601: 2024-01-01)
- `endDate` - End date (ISO 8601: 2024-01-31)
- `period` - Aggregation (day/week/month/year)
- `limit` - Result limit (default varies)
- `page` - Page number (default: 1)

## Authentication

### Cookie-Based
- Session cookie set on login
- HTTP-only, secure
- Automatically sent with requests
- 30-minute lockout after 5 failed attempts

### Password Rules
- Min 8 characters
- 1 uppercase, 1 lowercase
- 1 number, 1 special character

### Optional 2FA
- TOTP-based
- Backup recovery codes
- 6-digit verification codes

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Login | 10/5min |
| Register | 5/15min |
| Password Reset | 3/15min |
| 2FA | 10/5min |
| General API | 60/min |

## Response Format

### Success
```json
{
  "data": { ... }
}
```

### Error
```json
{
  "error": "Error type",
  "message": "Detailed message",
  "errors": [
    {
      "field": "email",
      "rule": "email",
      "message": "Must be valid email"
    }
  ]
}
```

## HTTP Status Codes

- `200` OK
- `201` Created
- `400` Bad Request
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `422` Validation Error
- `423` Locked (account)
- `429` Rate Limited
- `500` Internal Error

## Testing

### Test Script
```bash
node --import=tsx backend/scripts/test_docs.ts
```

### Manual Tests
```bash
# Health check
curl http://localhost:3333/health

# OpenAPI JSON
curl http://localhost:3333/api/docs/openapi.json

# OpenAPI YAML
curl http://localhost:3333/api/docs/openapi.yaml
```

## Client SDK Generation

```bash
# Install generator
npm install -g @openapitools/openapi-generator-cli

# TypeScript client
openapi-generator-cli generate \
  -i http://localhost:3333/api/docs/openapi.json \
  -g typescript-fetch \
  -o ./client-typescript

# Python client
openapi-generator-cli generate \
  -i http://localhost:3333/api/docs/openapi.json \
  -g python \
  -o ./client-python
```

## Documentation Files

1. **openapi.yaml** - The specification itself
2. **README.md** - Complete API documentation
3. **postman-quick-start.md** - Postman guide
4. **SETUP_SUMMARY.md** - Setup overview
5. **QUICK_REFERENCE.md** - This quick reference

## Updating Documentation

1. Edit `backend/docs/openapi.yaml`
2. Restart backend server
3. Verify at http://localhost:3333/api/docs
4. Run test script to validate

## Support & Resources

- **Interactive Docs**: http://localhost:3333/api/docs
- **Full README**: backend/docs/README.md
- **Postman Guide**: backend/docs/postman-quick-start.md
- **OpenAPI Spec**: https://spec.openapis.org/oas/v3.1.0
- **Swagger UI**: https://swagger.io/tools/swagger-ui/

## Version

- **API Version**: 1.0.0
- **OpenAPI Version**: 3.1.0
- **Last Updated**: January 2026

---

For detailed information, see:
- [Complete Documentation](./README.md)
- [Postman Guide](./postman-quick-start.md)
- [Setup Summary](./SETUP_SUMMARY.md)
