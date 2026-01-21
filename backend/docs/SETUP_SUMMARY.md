# OpenAPI/Swagger Setup Summary

This document summarizes the OpenAPI documentation setup for the Esports Tracker API.

## What Was Created

### 1. OpenAPI Specification
**File:** `backend/docs/openapi.yaml`

A complete OpenAPI 3.1 specification documenting all API endpoints:
- 50+ endpoints across 8 major categories
- Detailed request/response schemas
- Authentication and security schemes
- Rate limiting information
- Error response formats

### 2. Documentation Controller
**File:** `backend/app/controllers/docs_controller.ts`

Serves the API documentation through three endpoints:
- `GET /api/docs` - Interactive Swagger UI
- `GET /api/docs/openapi.json` - JSON format spec
- `GET /api/docs/openapi.yaml` - YAML format spec

### 3. Route Configuration
**Modified:** `backend/start/routes.ts`

Added documentation routes under `/api/docs` prefix.

### 4. Supporting Documentation

**README.md** - Complete API documentation guide:
- Quick start examples
- Authentication flow
- Common query parameters
- Rate limits
- Troubleshooting

**postman-quick-start.md** - Postman-specific guide:
- Import instructions
- Environment setup
- Testing workflows
- Collection runner tips

**test_docs.ts** - Test script to verify documentation:
- Tests all three documentation endpoints
- Validates OpenAPI structure
- Checks for key endpoints

## Accessing the Documentation

### Development Server
```
http://localhost:3333/api/docs
```

### Production Server
```
https://api.esports-tracker.com/api/docs
```

### Download Specifications
- JSON: `http://localhost:3333/api/docs/openapi.json`
- YAML: `http://localhost:3333/api/docs/openapi.yaml`

## Features

### Interactive Swagger UI
- Browse all endpoints organized by category
- View request/response schemas
- Try out endpoints directly in the browser
- See authentication requirements
- Copy curl commands

### Import to API Clients
The OpenAPI spec can be imported into:
- Postman
- Insomnia
- Bruno
- HTTPie
- Any OpenAPI-compatible tool

### Generate Client SDKs
Use OpenAPI Generator to create client libraries in:
- TypeScript/JavaScript
- Python
- Java
- Go
- C#
- And 40+ more languages

## API Structure

### Endpoint Categories

1. **Health** - System health checks
2. **Authentication** - User auth, registration, profile
3. **Two-Factor Auth** - 2FA setup and management
4. **OAuth** - OAuth provider integration
5. **Dashboard** - LoL statistics and leaderboards
6. **Players** - Individual player profiles
7. **Workers** - Background job monitoring
8. **Admin** - Administrative operations

### API Versioning
- Main API: `/api/v1/*`
- Auth API: `/api/auth/*` (unversioned)
- Docs: `/api/docs/*`

### Authentication
- Cookie-based session authentication
- Secure HTTP-only cookies
- Optional 2FA with TOTP
- OAuth provider support (Google, Discord, GitHub)

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Login | 10 req / 5 min |
| Register | 5 req / 15 min |
| Password Reset | 3 req / 15 min |
| 2FA Operations | 10 req / 5 min |
| General API | 60 req / min |

## Testing the Setup

### 1. Start the Backend
```bash
cd backend
npm run dev
```

### 2. Test Documentation Endpoints
```bash
# Run the test script
node --import=tsx scripts/test_docs.ts

# Or manually test
curl http://localhost:3333/api/docs/openapi.json
```

### 3. Open Swagger UI
Navigate to: http://localhost:3333/api/docs

### 4. Import to Postman
1. Open Postman
2. Click Import → Link
3. Enter: `http://localhost:3333/api/docs/openapi.json`
4. Click Import

## Key Endpoints Documented

### Public Endpoints
- `GET /health` - Health check
- `GET /api/v1/lol/dashboard/batch` - Batch dashboard data
- `GET /api/v1/lol/dashboard/teams` - Team leaderboard
- `GET /api/v1/lol/dashboard/players` - Player leaderboard
- `GET /api/v1/lol/dashboard/leagues` - List all leagues
- `GET /api/v1/players/{slug}/profile` - Player profile

### Authentication Endpoints
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/2fa/setup` - Setup 2FA
- `GET /api/auth/oauth/accounts` - List OAuth accounts

### Admin Endpoints (Auth Required)
- `GET /api/v1/admin/teams-accounts` - Get all teams
- `GET /api/v1/admin/players` - List players
- `PATCH /api/v1/admin/players/{id}` - Update player
- `POST /api/v1/admin/players/{id}/contract` - Manage contracts
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create user

### Worker Endpoints (Token Auth)
- `GET /api/v1/worker/status` - Worker status
- `GET /api/v1/worker/metrics/history` - Metrics history
- `GET /api/v1/worker/accounts` - Account summary
- `GET /api/v1/worker/priority-stats` - Priority queue stats

## Schema Definitions

### Key Data Models
- **User** - User account with auth info
- **TeamStats** - Team performance data
- **PlayerStats** - Player performance data
- **PlayerProfile** - Detailed player information
- **League** - League/competition info
- **Split** - Season/split info
- **Account** - Game account data
- **DashboardSummary** - Aggregate statistics

### Common Parameters
- `leagueId` - Filter by league
- `startDate` - Date range start (ISO 8601)
- `endDate` - Date range end (ISO 8601)
- `period` - Aggregation period (day/week/month/year)
- `limit` - Result limit
- `page` - Page number

## Security Documentation

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Account Protection
- 5 failed login attempts = 30 min lockout
- Email verification required
- Optional 2FA with backup codes
- Audit logging for security events

### CORS Configuration
- Allowed origins: Frontend domains
- Credentials: Allowed (for cookies)
- Methods: GET, POST, PATCH, DELETE
- Headers: Standard + custom

## Maintenance

### Updating Documentation

1. **Edit the OpenAPI spec:**
   ```bash
   # Edit the YAML file
   code backend/docs/openapi.yaml
   ```

2. **Restart the server:**
   ```bash
   # Changes are loaded on server start
   npm run dev
   ```

3. **Verify changes:**
   ```bash
   # Test the endpoints
   node --import=tsx scripts/test_docs.ts

   # Or view in browser
   open http://localhost:3333/api/docs
   ```

### Adding New Endpoints

When adding a new endpoint:

1. **Add route** in `backend/start/routes.ts`
2. **Document in OpenAPI** at `backend/docs/openapi.yaml`:
   - Add path under `paths:`
   - Add schema under `components/schemas:` if needed
   - Add parameters if reusable
3. **Test** with the test script or Swagger UI
4. **Update README** if it's a major feature

### Versioning

Current version: **1.0.0**

When making breaking changes:
1. Increment version in `openapi.yaml`
2. Update `info.version`
3. Consider creating `/api/v2` endpoints
4. Document migration guide

## Best Practices

### For API Development
1. Always document new endpoints in OpenAPI spec
2. Include example requests/responses
3. Document all error cases
4. Specify validation rules
5. Add descriptions for complex fields

### For API Consumers
1. Use batch endpoints when possible
2. Respect rate limits
3. Implement exponential backoff for retries
4. Cache responses when appropriate
5. Handle all error status codes

### For Testing
1. Test with Swagger UI during development
2. Import to Postman for integration testing
3. Generate client SDKs for type safety
4. Use the test script in CI/CD
5. Validate against the OpenAPI spec

## Troubleshooting

### Issue: Swagger UI not loading
**Solution:** Check that:
- Backend is running
- Routes are registered
- OpenAPI YAML is valid
- Browser console for errors

### Issue: OpenAPI spec has errors
**Solution:**
```bash
# Validate YAML syntax
npm install -g @apidevtools/swagger-cli
swagger-cli validate backend/docs/openapi.yaml
```

### Issue: Changes not reflected
**Solution:**
- Restart the backend server
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)

### Issue: Import to Postman fails
**Solution:**
- Ensure OpenAPI version is 3.0 or 3.1
- Check JSON is valid
- Try importing YAML instead
- Check Postman version is up to date

## Resources

### Documentation
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [Postman OpenAPI Support](https://learning.postman.com/docs/integrations/available-integrations/working-with-openAPI/)

### Tools
- [OpenAPI Generator](https://openapi-generator.tech/) - Generate clients
- [Swagger Editor](https://editor.swagger.io/) - Online editor
- [Swagger CLI](https://www.npmjs.com/package/@apidevtools/swagger-cli) - Validation
- [OpenAPI DevTools](https://chrome.google.com/webstore/detail/openapi-devtools) - Chrome extension

### Project Files
- Main spec: `backend/docs/openapi.yaml`
- Controller: `backend/app/controllers/docs_controller.ts`
- Routes: `backend/start/routes.ts`
- README: `backend/docs/README.md`
- Postman guide: `backend/docs/postman-quick-start.md`

## Next Steps

### Recommended Improvements
1. Add more example requests/responses
2. Create tutorial videos
3. Generate client SDKs for common languages
4. Set up automated spec validation in CI
5. Add GraphQL documentation if needed
6. Create interactive tutorials
7. Add API changelog automation

### Integration Ideas
1. Auto-generate API docs in frontend
2. Set up API monitoring with the spec
3. Create mock server from OpenAPI spec
4. Integrate with API gateway
5. Add contract testing with Pact
6. Set up automated API testing

## Support

For questions or issues:
- Check the [README](./README.md)
- Review the [Postman guide](./postman-quick-start.md)
- Open the Swagger UI at `/api/docs`
- Check project CLAUDE.md
- Open GitHub issue

---

**Created:** January 2026
**Version:** 1.0.0
**Maintainer:** Esports Tracker Team
