# Worker API Security Implementation Summary

## Overview

This document summarizes the security hardening implementation for the worker API in the AdonisJS backend. All worker endpoints (`/api/v1/worker/*`) are now protected with HMAC-SHA256 signature authentication.

## Files Created/Modified

### New Files

1. **`app/middleware/worker_auth_middleware.ts`**
   - HMAC-SHA256 signature validation
   - Timestamp-based replay attack prevention
   - Optional IP allowlisting
   - Development mode bypass

2. **`docs/worker_auth_example.py`**
   - Python helper functions for signature generation
   - `generate_worker_signature()` - Manual signature generation
   - `WorkerAuthClient` - Convenient HTTP client wrapper
   - Complete examples and documentation

3. **`docs/WORKER_AUTH.md`**
   - Complete authentication documentation
   - Setup instructions
   - Python implementation examples
   - Security best practices
   - Troubleshooting guide

4. **`tests/unit/middleware/worker_auth_middleware.spec.ts`**
   - Unit tests for middleware validation
   - Tests for signature verification
   - Tests for timestamp validation
   - Tests for error cases

5. **`docs/WORKER_AUTH_IMPLEMENTATION.md`** (this file)
   - Implementation summary
   - Setup checklist
   - Integration guide

### Modified Files

1. **`start/env.ts`**
   - Added `WORKER_API_SECRET` (optional string)
   - Added `WORKER_ALLOWED_IPS` (optional string, comma-separated)

2. **`start/kernel.ts`**
   - Registered `workerAuth` middleware in named middleware collection

3. **`start/routes.ts`**
   - Applied `workerAuth` middleware to `/api/v1/worker` route group
   - All worker endpoints now require authentication

4. **`.env.example`**
   - Added `WORKER_API_SECRET` with generation instructions
   - Added `WORKER_ALLOWED_IPS` with examples

## Security Features

### 1. HMAC-SHA256 Signatures

Each request requires a cryptographic signature computed as:

```
HMAC-SHA256(secret, payload)
where payload = timestamp:method:path:body
```

This ensures:
- Only authorized clients with the shared secret can make requests
- Requests cannot be forged or modified in transit
- Body content is validated (prevents tampering)

### 2. Timestamp Validation

Requests include a timestamp that must be within 5 minutes of server time:

- Prevents replay attacks (old signatures can't be reused)
- Requires synchronized clocks between worker and API
- Configurable window (currently 300 seconds)

### 3. IP Allowlisting (Optional)

Optionally restrict access to specific IP addresses:

- Additional layer of defense
- Useful when worker has static IP
- Can be disabled for dynamic IPs (relies on signature alone)

### 4. Development Mode

In development (`NODE_ENV=development`):
- If `WORKER_API_SECRET` is not set, authentication is skipped
- Simplifies local development
- **Must be set in production**

## Environment Variables

### WORKER_API_SECRET

**Required in Production**

Generate a strong secret:

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Python
python -c "import secrets; print(secrets.token_hex(32))"

# OpenSSL
openssl rand -hex 32
```

Example:
```bash
WORKER_API_SECRET=a1b2c3d4e5f6789...
```

### WORKER_ALLOWED_IPS (Optional)

Comma-separated list of allowed IPs:

```bash
WORKER_ALLOWED_IPS=127.0.0.1,::1,10.0.0.5
```

Leave empty to allow from any IP (signature validation only).

## Protected Endpoints

All endpoints under `/api/v1/worker/*`:

- `GET /api/v1/worker/status` - Worker status
- `GET /api/v1/worker/metrics/history` - Metrics history
- `GET /api/v1/worker/metrics/daily` - Daily metrics
- `GET /api/v1/worker/logs` - Worker logs
- `GET /api/v1/worker/players/search` - Search players
- `GET /api/v1/worker/daily-coverage` - Daily coverage
- `GET /api/v1/worker/accounts` - Account info
- `GET /api/v1/worker/accounts/list` - Account list
- `GET /api/v1/worker/coverage-stats` - Coverage stats
- `GET /api/v1/worker/priority-stats` - Priority stats

## Python Integration

### Quick Start

1. Copy the helper to your worker:

```bash
cp backend/docs/worker_auth_example.py worker/src/services/worker_auth.py
```

2. Update your HTTP client code:

```python
from worker_auth import WorkerAuthClient
import os

WORKER_API_SECRET = os.environ['WORKER_API_SECRET']
API_BASE_URL = os.environ.get('API_BASE_URL', 'http://localhost:3333')

async def fetch_worker_status():
    async with WorkerAuthClient(secret=WORKER_API_SECRET, base_url=API_BASE_URL) as client:
        response = await client.get('/api/v1/worker/status')
        return response.json()
```

### Manual Implementation

If you prefer to implement directly:

```python
import hmac
import hashlib
import time
import json
import httpx

def sign_request(secret: str, method: str, path: str, body: dict = None):
    timestamp = str(int(time.time()))
    body_str = json.dumps(body, separators=(',', ':')) if body else ''
    payload = f"{timestamp}:{method}:{path}:{body_str}"
    signature = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return timestamp, signature

# Usage
timestamp, signature = sign_request(secret, 'GET', '/api/v1/worker/status')
headers = {
    'X-Worker-Timestamp': timestamp,
    'X-Worker-Signature': signature
}
```

## Setup Checklist

### Backend Setup

- [x] Create `worker_auth_middleware.ts`
- [x] Update `start/env.ts` with new variables
- [x] Register middleware in `start/kernel.ts`
- [x] Apply middleware to worker routes in `start/routes.ts`
- [x] Update `.env.example` with documentation
- [x] Create documentation in `docs/WORKER_AUTH.md`
- [x] Create Python helper in `docs/worker_auth_example.py`
- [x] Create unit tests

### Production Deployment

- [ ] Generate strong `WORKER_API_SECRET`
- [ ] Add secret to backend `.env`
- [ ] Add secret to worker environment
- [ ] (Optional) Configure `WORKER_ALLOWED_IPS`
- [ ] Deploy backend changes
- [ ] Update worker code to use authentication
- [ ] Deploy worker changes
- [ ] Test worker connectivity
- [ ] Monitor logs for auth errors

### Testing

- [ ] Test valid signature accepts request
- [ ] Test missing headers reject request
- [ ] Test invalid signature rejects request
- [ ] Test expired timestamp rejects request
- [ ] Test IP allowlist (if configured)
- [ ] Test development mode bypass

## API Request Format

### Required Headers

```http
GET /api/v1/worker/status HTTP/1.1
Host: api.example.com
X-Worker-Timestamp: 1705492800
X-Worker-Signature: a1b2c3d4e5f6...
```

### Success Response (200 OK)

```json
{
  "is_running": true,
  "started_at": "2026-01-16T10:00:00.000Z",
  "uptime": 3600,
  ...
}
```

### Error Responses

**401 Unauthorized** - Missing/invalid authentication:

```json
{
  "error": "Missing worker authentication headers"
}
```

```json
{
  "error": "Invalid worker signature"
}
```

```json
{
  "error": "Request timestamp expired"
}
```

**403 Forbidden** - IP not allowed:

```json
{
  "error": "IP address not allowed"
}
```

## Security Best Practices

1. **Keep Secrets Secure**
   - Never commit secrets to version control
   - Use environment variables
   - Rotate secrets periodically

2. **Use HTTPS in Production**
   - Prevents man-in-the-middle attacks
   - Protects secrets in transit
   - Essential for signature security

3. **Enable IP Allowlisting**
   - Use when worker has static IP
   - Additional defense layer
   - Reduces attack surface

4. **Monitor Access**
   - Check logs for unauthorized attempts
   - Set up alerts for repeated failures
   - Review access patterns regularly

5. **Time Synchronization**
   - Use NTP on both systems
   - Monitor clock drift
   - Adjust window if needed

6. **Secret Rotation**
   - Rotate secrets periodically
   - Have rollout plan (overlap period)
   - Document rotation procedure

## Troubleshooting

### "Request timestamp expired"

**Cause**: Clock synchronization issue

**Solution**:
```bash
# Check time on both systems
date -u

# Install/configure NTP
sudo apt-get install ntp
sudo systemctl enable ntp
sudo systemctl start ntp
```

### "Invalid worker signature"

**Cause**: Secret mismatch or payload construction error

**Solution**:
1. Verify secrets match exactly on both systems
2. Check method is uppercase (GET, POST, etc.)
3. Verify path includes query string
4. Ensure JSON body formatting is consistent

### "IP address not allowed"

**Cause**: Worker IP not in allowlist

**Solution**:
1. Add worker IP to `WORKER_ALLOWED_IPS`
2. Or remove IP restriction (empty value)
3. Check if using proxy (may need proxy IP)

## Migration from Non-Authenticated Setup

### Phase 1: Backend Preparation

1. Deploy backend with worker auth middleware
2. Set `WORKER_API_SECRET` in development environment
3. Test with development worker
4. Verify logs show successful authentication

### Phase 2: Worker Update

1. Update worker code to include authentication
2. Test in development environment
3. Verify all endpoints work correctly
4. Check for any missing endpoints

### Phase 3: Production Rollout

1. Generate production secret
2. Add to backend production environment
3. Deploy backend changes
4. Add secret to worker production environment
5. Update worker code in production
6. Monitor logs for errors
7. Roll back if issues detected

### Zero-Downtime Migration

For zero-downtime deployment:

1. Deploy backend first (auth is optional in dev mode)
2. Worker continues to work without auth headers
3. Deploy worker with auth support
4. Enable `WORKER_API_SECRET` in production
5. Restart both services
6. Monitor for successful authentication

## Architecture Diagram

```
┌─────────────────────┐                      ┌──────────────────────┐
│                     │                      │                      │
│   Python Worker     │                      │   AdonisJS Backend   │
│                     │                      │                      │
│  ┌───────────────┐  │                      │  ┌────────────────┐  │
│  │ 1. Generate   │  │                      │  │ 4. Extract     │  │
│  │    Timestamp  │  │                      │  │    Headers     │  │
│  └───────────────┘  │                      │  └────────────────┘  │
│         │           │                      │         │            │
│         ▼           │                      │         ▼            │
│  ┌───────────────┐  │                      │  ┌────────────────┐  │
│  │ 2. Create     │  │                      │  │ 5. Validate    │  │
│  │    HMAC-SHA256│  │    HTTPS Request     │  │    Timestamp   │  │
│  │    Signature  │  │ ───────────────────> │  │    (5 min max) │  │
│  └───────────────┘  │  with Auth Headers   │  └────────────────┘  │
│         │           │                      │         │            │
│         ▼           │                      │         ▼            │
│  ┌───────────────┐  │                      │  ┌────────────────┐  │
│  │ 3. Add        │  │                      │  │ 6. Recompute   │  │
│  │    Headers    │  │                      │  │    Signature   │  │
│  │    - Timestamp│  │                      │  │    & Compare   │  │
│  │    - Signature│  │                      │  └────────────────┘  │
│  └───────────────┘  │                      │         │            │
│                     │                      │         ▼            │
│                     │                      │  ┌────────────────┐  │
│                     │    Response (JSON)   │  │ 7. Process     │  │
│                     │ <─────────────────── │  │    or Reject   │  │
│                     │                      │  └────────────────┘  │
│                     │                      │                      │
└─────────────────────┘                      └──────────────────────┘
          │                                              │
          │                                              │
          └──────── Shared Secret (WORKER_API_SECRET) ───┘
                   (Must be identical on both sides)
```

## Testing Commands

### Manual Test with curl

```bash
#!/bin/bash
SECRET="your-worker-api-secret"
TIMESTAMP=$(date +%s)
METHOD="GET"
PATH="/api/v1/worker/status"
BODY=""

PAYLOAD="${TIMESTAMP}:${METHOD}:${PATH}:${BODY}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -H "X-Worker-Timestamp: $TIMESTAMP" \
     -H "X-Worker-Signature: $SIGNATURE" \
     http://localhost:3333/api/v1/worker/status
```

### Python Test

```python
import asyncio
from worker_auth_example import WorkerAuthClient

async def test_auth():
    async with WorkerAuthClient(
        secret='your-worker-api-secret',
        base_url='http://localhost:3333'
    ) as client:
        response = await client.get('/api/v1/worker/status')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")

asyncio.run(test_auth())
```

### Unit Tests

```bash
cd backend
node ace test tests/unit/middleware/worker_auth_middleware.spec.ts
```

## Related Documentation

- **Full Guide**: `docs/WORKER_AUTH.md`
- **Python Helper**: `docs/worker_auth_example.py`
- **Environment Config**: `.env.example`

## Support

For issues or questions:

1. Check `docs/WORKER_AUTH.md` for detailed documentation
2. Review troubleshooting section above
3. Check application logs for specific error messages
4. Verify environment variables are set correctly
5. Test clock synchronization between systems

## Version History

- **v1.0.0** (2026-01-16): Initial implementation
  - HMAC-SHA256 signature validation
  - Timestamp-based replay prevention
  - Optional IP allowlisting
  - Development mode bypass
  - Complete documentation and examples
