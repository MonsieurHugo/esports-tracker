# Postman Quick Start Guide

This guide will help you get started testing the Esports Tracker API with Postman.

## Import the API Collection

### Method 1: Import from URL (Recommended)

1. Open Postman Desktop
2. Click **"Import"** in the top left
3. Select the **"Link"** tab
4. Enter the URL:
   ```
   http://localhost:3333/api/docs/openapi.json
   ```
   (or use production URL: `https://api.esports-tracker.com/api/docs/openapi.json`)
5. Click **"Continue"**
6. Review the import settings and click **"Import"**

### Method 2: Import from File

1. Download the OpenAPI spec:
   ```bash
   curl http://localhost:3333/api/docs/openapi.json > esports-tracker-api.json
   ```
2. In Postman, click **"Import"**
3. Drag and drop the `esports-tracker-api.json` file
4. Click **"Import"**

## Setup Environment

Create an environment to switch between development and production easily.

1. Click **"Environments"** in the left sidebar
2. Click **"Create Environment"**
3. Name it `Esports Tracker - Dev`
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|--------------|---------------|
| `baseUrl` | `http://localhost:3333` | `http://localhost:3333` |
| `apiBaseUrl` | `{{baseUrl}}/api/v1` | `{{baseUrl}}/api/v1` |
| `authBaseUrl` | `{{baseUrl}}/api/auth` | `{{baseUrl}}/api/auth` |

5. Click **"Save"**
6. Select the environment from the dropdown in the top right

## Configure Cookie-Based Authentication

The API uses cookie-based sessions. To test authenticated endpoints:

### Step 1: Register or Login

1. Find the **"POST /api/auth/login"** request in your collection
2. In the request body, enter your credentials:
   ```json
   {
     "email": "your-email@example.com",
     "password": "YourPassword123!"
   }
   ```
3. Click **"Send"**
4. If successful, you'll receive a response with user data

### Step 2: Verify Cookie is Saved

1. Go to **"Cookies"** (click the Cookies icon in the top right, or press Ctrl+K and type "cookies")
2. You should see a cookie named `session` for `localhost:3333`
3. This cookie will be automatically sent with subsequent requests

### Step 3: Test Authenticated Endpoint

1. Find the **"GET /api/auth/me"** request
2. Click **"Send"**
3. You should receive your user profile data

### Troubleshooting Authentication

If cookies aren't working:

1. Go to **Settings** (gear icon) → **General**
2. Make sure **"Automatically follow redirects"** is enabled
3. Make sure **"Enable SSL certificate verification"** is disabled for localhost
4. Under **Cookies**, ensure **"Manage cookies"** is not blocking localhost

## Testing Workflow

### 1. Health Check

Start by verifying the API is running:

**Request:** `GET {{baseUrl}}/health`

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

### 2. Public Endpoints (No Auth Required)

Test dashboard endpoints without authentication:

**Get Team Leaderboard:**
```
GET {{apiBaseUrl}}/lol/dashboard/teams?leagueId=1&startDate=2024-01-01&endDate=2024-01-31&limit=10
```

**Get All Leagues:**
```
GET {{apiBaseUrl}}/lol/dashboard/leagues
```

### 3. Authenticated Endpoints (User)

After logging in:

**Get Your Profile:**
```
GET {{authBaseUrl}}/me
```

**Get Your Audit Logs:**
```
GET {{authBaseUrl}}/audit-logs?page=1&limit=20
```

**Update Your Profile:**
```
PATCH {{authBaseUrl}}/profile
Body: { "fullName": "New Name" }
```

### 4. Admin Endpoints (Admin Role Required)

These require admin role:

**Get All Teams with Accounts:**
```
GET {{apiBaseUrl}}/admin/teams-accounts
```

**List All Players (Paginated):**
```
GET {{apiBaseUrl}}/admin/players?page=1&perPage=20
```

**Update Player:**
```
PATCH {{apiBaseUrl}}/admin/players/1
Body: { "currentPseudo": "NewNickname" }
```

## Creating a Collection Runner

To test multiple endpoints in sequence:

1. Right-click on the collection or folder
2. Select **"Run collection"**
3. Select the requests you want to run
4. Configure:
   - **Iterations:** 1
   - **Delay:** 100ms between requests
5. Click **"Run [Collection Name]"**

## Useful Pre-request Scripts

### Auto-generate Date Ranges

Add this to a request's **Pre-request Script** tab:

```javascript
// Set date range to last 7 days
const endDate = new Date();
const startDate = new Date();
startDate.setDate(startDate.getDate() - 7);

pm.environment.set("startDate", startDate.toISOString().split('T')[0]);
pm.environment.set("endDate", endDate.toISOString().split('T')[0]);
```

Then use `{{startDate}}` and `{{endDate}}` in your query parameters.

### Extract League ID from Response

Add this to a request's **Tests** tab:

```javascript
// Save first league ID to environment
const response = pm.response.json();
if (response && response.length > 0) {
    pm.environment.set("leagueId", response[0].id);
    console.log("Saved leagueId:", response[0].id);
}
```

## Common Query Parameters

Create environment variables for common filters:

| Variable | Value | Usage |
|----------|-------|-------|
| `leagueId` | `1` | `?leagueId={{leagueId}}` |
| `startDate` | `2024-01-01` | `?startDate={{startDate}}` |
| `endDate` | `2024-01-31` | `?endDate={{endDate}}` |
| `limit` | `10` | `?limit={{limit}}` |

## Rate Limiting

The API has rate limits. If you get a 429 error:

1. Check the response headers:
   - `X-RateLimit-Limit`: Your rate limit
   - `X-RateLimit-Remaining`: Requests remaining
   - `X-RateLimit-Reset`: When the limit resets

2. Wait before retrying, or reduce your request rate in the Collection Runner

## Batch Testing

For performance testing, use batch endpoints instead of individual calls:

**Instead of multiple requests:**
```
GET /api/v1/lol/dashboard/teams
GET /api/v1/lol/dashboard/players
GET /api/v1/lol/dashboard/top-grinders
GET /api/v1/lol/dashboard/streaks
```

**Use one batch request:**
```
GET /api/v1/lol/dashboard/batch?leagueId=1&startDate=2024-01-01&endDate=2024-01-31
```

## Example Test Scripts

Add these to the **Tests** tab of requests for automated testing:

### Test Status Code
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});
```

### Test Response Structure
```javascript
pm.test("Response has required fields", function () {
    const response = pm.response.json();
    pm.expect(response).to.have.property('status');
    pm.expect(response).to.have.property('timestamp');
});
```

### Test Response Time
```javascript
pm.test("Response time is less than 500ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(500);
});
```

### Test Array Length
```javascript
pm.test("Returns at least one item", function () {
    const response = pm.response.json();
    pm.expect(response).to.be.an('array').that.is.not.empty;
});
```

## Exporting Results

After running a collection:

1. Click **"Export Results"** in the Collection Runner
2. Choose format (JSON)
3. Save for documentation or reporting

## Additional Resources

- **Swagger UI (Interactive):** http://localhost:3333/api/docs
- **OpenAPI Spec (JSON):** http://localhost:3333/api/docs/openapi.json
- **API Documentation:** See `backend/docs/README.md`
- **Postman Learning Center:** https://learning.postman.com/

## Tips

1. **Use folders** to organize requests by feature area
2. **Save example responses** for documentation
3. **Use environment variables** for easy switching between dev/prod
4. **Add descriptions** to requests for team documentation
5. **Share collections** with your team via Postman workspaces
6. **Version control** your collections by exporting to Git

## Troubleshooting

### "Could not get response"
- Verify the backend is running: `curl http://localhost:3333/health`
- Check your environment variables
- Disable SSL verification for localhost

### "401 Unauthorized"
- Verify you're logged in
- Check cookies are enabled and saved
- Try logging in again

### "403 Forbidden"
- Endpoint requires admin role
- Check your role: `GET {{authBaseUrl}}/me`

### "422 Validation Error"
- Check request body matches schema
- Refer to OpenAPI docs for field requirements
- Look at the `errors` array in the response

### "429 Too Many Requests"
- You've hit the rate limit
- Wait and retry
- Reduce request frequency

## Support

For issues or questions:
- Check the OpenAPI docs at `/api/docs`
- Review API documentation in `backend/docs/README.md`
- Open an issue on GitHub
