# Request ID Middleware

## Overview

The `RequestIdMiddleware` adds a unique correlation ID to every HTTP request for distributed tracing and debugging.

## Features

- **Automatic UUID Generation**: Creates a unique UUID for each request if none provided
- **Upstream ID Support**: Respects `x-request-id` header from load balancers/API gateways
- **Security Validation**: Validates format to prevent header injection attacks
- **Response Header**: Returns the request ID in response for client-side debugging
- **Context Integration**: Makes request ID available in `ctx.requestId` for use in controllers, services, and logs

## Implementation

### Middleware Location
- **File**: `backend/app/middleware/request_id_middleware.ts`
- **Registration**: `backend/start/kernel.ts` (FIRST middleware in the chain)

### Execution Order

```typescript
router.use([
  () => import('#middleware/request_id_middleware'),  // ← MUST BE FIRST
  () => import('#middleware/request_logger_middleware'),
  () => import('@adonisjs/core/bodyparser_middleware'),
  // ... other middleware
])
```

The request ID middleware MUST be first to ensure all subsequent middleware and logging have access to the request ID.

### Usage in Code

```typescript
// In controllers
export default class MyController {
  async index(ctx: HttpContext) {
    logger.info({ requestId: ctx.requestId }, 'Processing request')
    // ...
  }
}

// In services
export class MyService {
  async process(ctx: HttpContext) {
    const requestId = ctx.requestId
    // Use for logging, error tracking, etc.
  }
}
```

## Validation Rules

The middleware validates incoming request IDs to prevent injection attacks:

- **Allowed characters**: Alphanumeric, dashes (`-`), underscores (`_`)
- **Max length**: 64 characters
- **Pattern**: `/^[a-zA-Z0-9\-_]{1,64}$/`

Invalid IDs are rejected and a new UUID is generated instead.

### Valid Request IDs

```
my-custom-request-123
request_id_456
a1b2c3d4e5f6
MyRequestID-2024
550e8400-e29b-41d4-a716-446655440000  (UUID)
```

### Invalid Request IDs (Rejected)

```
<script>alert("xss")</script>  (Special characters)
my request id                  (Spaces)
                               (Empty string)
a...repeat 100 times           (Too long - max 64 chars)
```

## HTTP Headers

### Request Header

Clients and upstream services can provide a request ID:

```http
GET /api/v1/lol/dashboard/teams HTTP/1.1
Host: api.example.com
x-request-id: my-custom-request-123
```

### Response Header

The middleware always returns the request ID in the response:

```http
HTTP/1.1 200 OK
x-request-id: my-custom-request-123
Content-Type: application/json
```

## Testing

### Unit Tests

Location: `backend/tests/functional/request_id_middleware.spec.ts`

Run tests:
```bash
cd backend
npm run test -- --files=request_id_middleware
```

### Manual Testing

```bash
# Test automatic UUID generation
curl -i http://localhost:3333/health

# Test custom request ID
curl -i -H "x-request-id: my-test-123" http://localhost:3333/health

# Test injection prevention
curl -i -H "x-request-id: <script>alert('xss')</script>" http://localhost:3333/health
```

## Integration with Request Logger

The `RequestLoggerMiddleware` uses `ctx.requestId` for all log entries:

```typescript
// Incoming request log
logger.info({
  requestId: ctx.requestId,
  method: 'GET',
  path: '/api/v1/lol/dashboard/teams',
  ip: '192.168.1.100',
}, 'Incoming request')

// Response log
logger.info({
  requestId: ctx.requestId,
  statusCode: 200,
  duration: '125ms',
}, 'Request completed')
```

This allows tracing a single request across all log entries.

## Benefits

### 1. Distributed Tracing
Track requests across multiple services and log aggregation systems.

### 2. Debugging
Clients can provide the request ID when reporting errors, making it easy to find relevant logs.

### 3. Performance Analysis
Correlate slow requests with specific operations using the request ID.

### 4. Load Balancer Integration
Respects request IDs from upstream load balancers (AWS ALB, Nginx, etc.).

## Production Considerations

### Load Balancer Configuration

Most load balancers can be configured to add request IDs:

**AWS Application Load Balancer**:
```
X-Amzn-Trace-Id: Root=1-67890-abcdef...
```

**Nginx**:
```nginx
proxy_set_header X-Request-ID $request_id;
```

**Cloudflare**:
```
CF-Ray: 1234567890abcdef-CDG
```

The middleware will use these IDs if they match the validation pattern.

### Log Aggregation

When using centralized logging (ELK, Datadog, CloudWatch), ensure the `requestId` field is indexed for fast search:

```json
{
  "requestId": "my-request-123",
  "timestamp": "2026-01-21T10:30:00Z",
  "level": "info",
  "message": "Request completed",
  "duration": 125
}
```

## Troubleshooting

### Request ID not appearing in logs

1. Check middleware order in `start/kernel.ts`
2. Verify `RequestIdMiddleware` is registered before `RequestLoggerMiddleware`
3. Ensure middleware is imported correctly

### Custom request IDs not working

1. Check header name is lowercase: `x-request-id` (not `X-Request-ID`)
2. Verify ID matches validation pattern
3. Test with curl to isolate client issues

### Performance impact

The middleware has minimal performance impact:
- UUID generation: ~1μs
- Regex validation: ~2μs
- Total overhead: <10μs per request

For high-throughput applications (>10k req/s), consider:
- Using shorter IDs (base62 encoded timestamps)
- Skipping validation for trusted upstream sources
