# Observability in Esports Tracker Backend

This document describes the request logging and metrics collection system implemented for observability.

## Overview

The backend implements a comprehensive observability stack consisting of:

1. **Request Logger Middleware** - Logs all HTTP requests with correlation IDs
2. **Metrics Collector** - Aggregates performance metrics in-memory
3. **Health & Metrics Endpoints** - Exposes system health and metrics data

## Request Logger Middleware

### Location
`app/middleware/request_logger_middleware.ts`

### Features

- **Correlation IDs**: Each request gets a unique UUID added as `X-Request-ID` header
- **Response Time Tracking**: Measures request duration in milliseconds
- **Automatic Logging Levels**:
  - `ERROR` for 5xx status codes
  - `WARN` for 4xx status codes or slow requests (>1s)
  - `INFO` for successful requests
- **Structured Logging**: All logs include:
  - Request ID
  - HTTP method and path (with query string)
  - Status code
  - Duration
  - User agent
  - Client IP
  - User ID (if authenticated)

### Example Log Output

```json
{
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "/api/v1/lol/dashboard/teams?period=7d",
  "statusCode": 200,
  "duration": 234,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.100",
  "userId": 42
}
```

### Configuration

The middleware is registered globally in `start/kernel.ts` and runs for all requests:

```typescript
router.use([
  () => import('#middleware/request_logger_middleware'),
  // ... other middleware
])
```

## Metrics Collector

### Location
`app/utils/metrics.ts`

### Features

The metrics collector tracks:

- **Total Requests**: Count of all requests processed
- **Total Errors**: Count of 5xx responses
- **Average Response Time**: Rolling average of last 1000 requests
- **Slow Requests**: Count of requests taking >1s
- **Requests by Endpoint**: Map of endpoint → request count
- **Errors by Endpoint**: Map of endpoint → error count

### Methods

#### `record(path, duration, statusCode)`
Records a single request metric.

```typescript
metricsCollector.record('/api/v1/teams', 234, 200)
```

#### `getMetrics()`
Returns current metrics snapshot with calculated rates.

```typescript
const metrics = metricsCollector.getMetrics()
// Returns:
// {
//   totalRequests: 1234,
//   totalErrors: 5,
//   avgResponseTime: 234.56,
//   avgResponseTimeRounded: 235,
//   slowRequests: 12,
//   errorRate: "0.41%",
//   slowRequestRate: "0.97%",
//   requestsByEndpoint: { ... },
//   errorsByEndpoint: { ... }
// }
```

#### `getPercentiles()`
Returns p50, p95, p99 response time percentiles.

```typescript
const percentiles = metricsCollector.getPercentiles()
// Returns: { p50: 150, p95: 450, p99: 850 }
```

#### `getTopEndpoints(limit)`
Returns top N endpoints by request count.

```typescript
const top10 = metricsCollector.getTopEndpoints(10)
// Returns: [{ path: "/api/v1/teams", count: 450 }, ...]
```

#### `getErrorProneEndpoints(limit)`
Returns endpoints with most errors.

```typescript
const problematic = metricsCollector.getErrorProneEndpoints(5)
// Returns: [{ path: "/api/v1/buggy", count: 23 }, ...]
```

#### `reset()`
Resets all metrics (useful for testing or periodic resets).

```typescript
metricsCollector.reset()
```

## Health & Metrics Endpoints

### GET /health

Health check endpoint that verifies database connectivity.

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T10:30:00.000Z",
  "database": "connected"
}
```

**Response (503 Service Unavailable)**:
```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-16T10:30:00.000Z",
  "database": "disconnected",
  "error": "Connection timeout"
}
```

### GET /health/metrics

Exposes aggregated metrics for monitoring and alerting.

**Response (200 OK)**:
```json
{
  "timestamp": "2026-01-16T10:30:00.000Z",
  "metrics": {
    "totalRequests": 15234,
    "totalErrors": 12,
    "avgResponseTime": 245.67,
    "avgResponseTimeRounded": 246,
    "slowRequests": 45,
    "errorRate": "0.08%",
    "slowRequestRate": "0.30%",
    "requestsByEndpoint": {
      "/api/v1/lol/dashboard/teams": 3456,
      "/api/v1/lol/dashboard/players": 2789,
      ...
    },
    "errorsByEndpoint": {
      "/api/v1/some/endpoint": 8,
      ...
    }
  },
  "percentiles": {
    "p50": 180,
    "p95": 650,
    "p99": 1200
  },
  "topEndpoints": [
    { "path": "/api/v1/lol/dashboard/teams", "count": 3456 },
    { "path": "/api/v1/lol/dashboard/players", "count": 2789 },
    ...
  ],
  "errorProneEndpoints": [
    { "path": "/api/v1/some/endpoint", "count": 8 },
    ...
  ]
}
```

## Integration with Monitoring Systems

### Prometheus/Grafana

You can scrape the `/health/metrics` endpoint to export metrics to Prometheus:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'esports-tracker'
    scrape_interval: 30s
    static_configs:
      - targets: ['backend:3333']
    metrics_path: '/health/metrics'
```

### DataDog/New Relic

Parse the structured JSON logs and metrics endpoint to create custom dashboards.

### CloudWatch/Azure Monitor

Configure log shipping for the structured JSON logs produced by the request logger.

## Performance Considerations

### Memory Usage

- The metrics collector keeps the last **1000 response times** in memory
- When the limit is reached, the oldest samples are removed (FIFO)
- Each endpoint tracked requires minimal memory (~100 bytes)
- Typical memory usage: **<1MB** for 10,000 unique endpoints

### CPU Overhead

- Minimal: ~0.5ms per request for logging and metrics collection
- No blocking I/O operations
- All operations are synchronous and fast

### Recommendations

1. **Periodic Resets**: For long-running production instances, consider resetting metrics daily:
   ```typescript
   // In a scheduled job
   import { metricsCollector } from '#utils/metrics'
   metricsCollector.reset()
   ```

2. **External Metrics**: For production, export metrics to an external system (Prometheus, DataDog, etc.) rather than relying solely on in-memory storage.

3. **Log Levels**: In production, consider setting log level to `WARN` or `ERROR` to reduce log volume:
   ```typescript
   // In config/logger.ts
   level: env.get('LOG_LEVEL', 'info')
   ```

## Testing

Unit tests are provided for both the middleware and metrics collector:

- `tests/unit/middleware/request_logger.spec.ts`
- `tests/unit/utils/metrics.spec.ts`

Run tests:
```bash
node ace test tests/unit/middleware/request_logger.spec.ts
node ace test tests/unit/utils/metrics.spec.ts
```

## Troubleshooting

### Request IDs not appearing in logs

1. Check that the middleware is registered in `start/kernel.ts`
2. Verify the middleware runs before other middleware that might throw errors

### Metrics not updating

1. Check that `metricsCollector.record()` is being called in the middleware
2. Verify no exceptions are thrown in the metrics collector
3. Check that the `/health/metrics` endpoint is accessible

### Slow requests not being logged

The threshold is hardcoded to 1000ms. To change it, modify `SLOW_REQUEST_THRESHOLD` in `app/utils/metrics.ts`:

```typescript
private readonly SLOW_REQUEST_THRESHOLD = 500 // 500ms
```

## Future Enhancements

Potential improvements for the observability system:

1. **Distributed Tracing**: Add support for OpenTelemetry
2. **Custom Metrics**: Allow controllers to record custom business metrics
3. **Real-time Alerting**: Trigger alerts when error rates exceed thresholds
4. **Metrics Persistence**: Store metrics in Redis or TimescaleDB
5. **Dashboard UI**: Build a real-time monitoring dashboard in the frontend
6. **Query Performance**: Track database query performance separately
7. **Rate Limit Metrics**: Integrate with the rate limiter to track blocked requests

## Related Files

- `app/middleware/request_logger_middleware.ts` - Request logging middleware
- `app/utils/metrics.ts` - Metrics collector utility
- `app/utils/http_utils.ts` - HTTP utilities (IP extraction)
- `start/kernel.ts` - Middleware registration
- `start/routes.ts` - Health and metrics endpoints
- `tests/unit/middleware/request_logger.spec.ts` - Middleware tests
- `tests/unit/utils/metrics.spec.ts` - Metrics collector tests
