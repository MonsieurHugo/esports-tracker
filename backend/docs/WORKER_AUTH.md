# Worker API Authentication

This document describes the security implementation for worker API endpoints in the AdonisJS backend.

## Overview

The worker authentication middleware protects sensitive worker endpoints from unauthorized access using HMAC-SHA256 signatures. This ensures that only the authorized Python worker can access worker-specific endpoints.

## Security Features

1. **HMAC-SHA256 Signatures**: Cryptographically signed requests prevent forgery
2. **Timestamp Validation**: 5-minute window prevents replay attacks
3. **IP Allowlisting**: Optional restriction to specific IPs
4. **Timing-Safe Comparison**: Prevents timing attacks on signature validation

## Environment Variables

Add these to your `.env` file:

```bash
# Required: Secret key for HMAC signing (generate a strong random string)
WORKER_API_SECRET=your-strong-random-secret-here

# Optional: Comma-separated list of allowed worker IPs
# Leave empty to allow from any IP (relies on signature alone)
WORKER_ALLOWED_IPS=127.0.0.1,::1,10.0.0.5
```

### Generating a Secret

Generate a strong secret key:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"

# Using OpenSSL
openssl rand -hex 32
```

## Protected Endpoints

All endpoints under `/api/v1/worker/*` are protected:

- `GET /api/v1/worker/status` - Worker status
- `GET /api/v1/worker/metrics/history` - Metrics history
- `GET /api/v1/worker/metrics/daily` - Daily metrics
- `GET /api/v1/worker/logs` - Worker logs
- `GET /api/v1/worker/players/search` - Search players
- `GET /api/v1/worker/daily-coverage` - Daily coverage stats
- `GET /api/v1/worker/accounts` - Account info
- `GET /api/v1/worker/accounts/list` - Paginated account list
- `GET /api/v1/worker/coverage-stats` - Coverage statistics
- `GET /api/v1/worker/priority-stats` - Priority queue stats

## Request Format

Each worker request must include two headers:

### X-Worker-Timestamp

Current Unix timestamp (seconds since epoch):

```
X-Worker-Timestamp: 1705492800
```

The timestamp must be within 5 minutes of the server time to prevent replay attacks.

### X-Worker-Signature

HMAC-SHA256 signature of the request:

```
X-Worker-Signature: a1b2c3d4e5f6...
```

The signature is computed as:

```
HMAC-SHA256(secret, payload)

where payload = timestamp:method:path:body
```

- `timestamp`: The X-Worker-Timestamp value
- `method`: HTTP method in uppercase (GET, POST, PUT, DELETE)
- `path`: Request path including query string (e.g., `/api/v1/worker/status?hours=24`)
- `body`: JSON-serialized request body (empty string for GET requests)

## Python Implementation

### Option 1: Using the Helper Function

Copy the helper from `docs/worker_auth_example.py`:

```python
from worker_auth_example import generate_worker_signature
import httpx
import os

# Get secret from environment
WORKER_API_SECRET = os.environ['WORKER_API_SECRET']
API_BASE_URL = 'http://localhost:3333'

# Generate signature
timestamp, signature = generate_worker_signature(
    secret=WORKER_API_SECRET,
    method='GET',
    path='/api/v1/worker/status'
)

# Make request
headers = {
    'X-Worker-Timestamp': timestamp,
    'X-Worker-Signature': signature
}

response = httpx.get(f'{API_BASE_URL}/api/v1/worker/status', headers=headers)
print(response.json())
```

### Option 2: Using the WorkerAuthClient Class

For a more convenient wrapper:

```python
from worker_auth_example import WorkerAuthClient
import os

WORKER_API_SECRET = os.environ['WORKER_API_SECRET']
API_BASE_URL = 'http://localhost:3333'

async def fetch_worker_status():
    async with WorkerAuthClient(secret=WORKER_API_SECRET, base_url=API_BASE_URL) as client:
        response = await client.get('/api/v1/worker/status')
        return response.json()
```

### Option 3: Manual Implementation

If you prefer to implement it directly in your worker:

```python
import hmac
import hashlib
import time
import json
import httpx

def sign_request(secret: str, method: str, path: str, body: dict = None) -> tuple[str, str]:
    """Generate timestamp and signature for worker API request."""
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
secret = 'your-worker-api-secret'
timestamp, signature = sign_request(secret, 'GET', '/api/v1/worker/status')

headers = {
    'X-Worker-Timestamp': timestamp,
    'X-Worker-Signature': signature
}

response = httpx.get('http://localhost:3333/api/v1/worker/status', headers=headers)
```

## Testing

### Manual Testing with curl

```bash
# Set variables
SECRET="your-worker-api-secret"
TIMESTAMP=$(date +%s)
METHOD="GET"
PATH="/api/v1/worker/status"
BODY=""

# Generate signature (requires openssl)
PAYLOAD="${TIMESTAMP}:${METHOD}:${PATH}:${BODY}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

# Make request
curl -H "X-Worker-Timestamp: $TIMESTAMP" \
     -H "X-Worker-Signature: $SIGNATURE" \
     http://localhost:3333/api/v1/worker/status
```

### Unit Tests

Run the unit tests:

```bash
cd backend
node ace test tests/unit/middleware/worker_auth_middleware.spec.ts
```

## Development Mode

In development mode (`NODE_ENV=development`), if `WORKER_API_SECRET` is not set, the middleware will skip authentication and allow all requests. This is for convenience during development.

**WARNING**: Always set `WORKER_API_SECRET` in production!

## Error Responses

### 401 Unauthorized

Missing or invalid authentication:

```json
{
  "error": "Missing worker authentication headers"
}
```

```json
{
  "error": "Invalid timestamp format"
}
```

```json
{
  "error": "Request timestamp expired"
}
```

```json
{
  "error": "Invalid worker signature"
}
```

### 403 Forbidden

IP not allowed (when IP allowlisting is enabled):

```json
{
  "error": "IP address not allowed"
}
```

### 500 Internal Server Error

Worker API not configured:

```json
{
  "error": "Worker API not configured"
}
```

## Security Best Practices

1. **Keep Secret Secure**: Store `WORKER_API_SECRET` securely, never commit to version control
2. **Use Strong Secrets**: Generate at least 32 bytes of random data
3. **Enable HTTPS**: Use HTTPS in production to prevent man-in-the-middle attacks
4. **IP Allowlisting**: Enable `WORKER_ALLOWED_IPS` if your worker has a static IP
5. **Rotate Secrets**: Periodically rotate the secret key
6. **Monitor Access**: Check logs for unauthorized access attempts
7. **Time Sync**: Ensure server and worker clocks are synchronized (use NTP)

## Troubleshooting

### "Request timestamp expired"

- **Cause**: Server and worker clocks are not synchronized
- **Solution**: Ensure both systems use NTP for time synchronization

### "Invalid worker signature"

- **Cause**: Secret mismatch or incorrect payload construction
- **Solution**:
  - Verify `WORKER_API_SECRET` is identical on both systems
  - Check that method, path, and body are formatted correctly
  - Ensure JSON body uses consistent formatting (no extra spaces)

### "IP address not allowed"

- **Cause**: Worker IP not in allowlist
- **Solution**: Add worker IP to `WORKER_ALLOWED_IPS` or remove IP restriction

## Migration Guide

If you have an existing worker setup without authentication:

1. **Update Backend**:
   - Pull latest code with worker auth middleware
   - Add `WORKER_API_SECRET` to `.env`
   - Restart backend server

2. **Update Worker**:
   - Copy `backend/docs/worker_auth_example.py` to your worker codebase
   - Update worker code to use authenticated requests
   - Set `WORKER_API_SECRET` in worker's environment
   - Test with development/staging environment first

3. **Deployment**:
   - Deploy backend changes first
   - During deployment window, authentication is optional in development
   - Deploy worker changes
   - Verify logs show no authentication errors
   - Enable IP allowlisting if needed

## Architecture

```
┌─────────────────┐                    ┌─────────────────┐
│  Python Worker  │                    │  AdonisJS API   │
│                 │                    │                 │
│  1. Generate    │                    │  4. Validate    │
│     Timestamp   │                    │     Timestamp   │
│                 │                    │                 │
│  2. Create      │                    │  5. Verify      │
│     Signature   │                    │     Signature   │
│                 │                    │                 │
│  3. Send        │  ──────────────>   │  6. Process     │
│     Request     │   (HTTPS/Headers)  │     Request     │
│                 │                    │                 │
└─────────────────┘                    └─────────────────┘
     ^                                          │
     │                                          │
     └──────────── Shared Secret ───────────────┘
                (WORKER_API_SECRET)
```

## Related Files

- **Middleware**: `backend/app/middleware/worker_auth_middleware.ts`
- **Python Helper**: `backend/docs/worker_auth_example.py`
- **Tests**: `backend/tests/unit/middleware/worker_auth_middleware.spec.ts`
- **Routes**: `backend/start/routes.ts`
- **Env Config**: `backend/start/env.ts`
