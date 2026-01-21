# Observability Examples

Practical examples of using the observability features in the Esports Tracker backend.

## Table of Contents
1. [Using Request IDs in Controllers](#using-request-ids-in-controllers)
2. [Context-Aware Logging](#context-aware-logging)
3. [Custom Metrics](#custom-metrics)
4. [Debugging with Request IDs](#debugging-with-request-ids)
5. [Monitoring Endpoints](#monitoring-endpoints)
6. [Error Tracking](#error-tracking)

---

## Using Request IDs in Controllers

### Basic Usage

Every request automatically gets a unique `X-Request-ID` header. You can access it in your controllers:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getRequestId } from '#utils/logger_helper'

export default class PlayersController {
  async show({ params, response }: HttpContext) {
    const requestId = getRequestId(ctx)
    console.log(`Processing request ${requestId} for player ${params.id}`)

    // ... rest of your logic
  }
}
```

### Passing Request ID to External Services

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getRequestId } from '#utils/logger_helper'

export default class RiotApiService {
  async fetchSummonerData(ctx: HttpContext, summonerId: string) {
    const requestId = getRequestId(ctx)

    const response = await fetch(`https://api.riotgames.com/...`, {
      headers: {
        'X-Request-ID': requestId, // Pass along for distributed tracing
        'Authorization': `Bearer ${this.apiKey}`,
      }
    })

    return response.json()
  }
}
```

---

## Context-Aware Logging

### Using Child Logger

Create a child logger that automatically includes the request ID:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getContextLogger } from '#utils/logger_helper'
import Player from '#models/player'

export default class PlayersController {
  async update({ params, request, response }: HttpContext) {
    const log = getContextLogger(ctx)

    log.info('Starting player update')

    const player = await Player.findOrFail(params.id)
    log.info({ playerId: player.id, playerName: player.summonerName }, 'Player loaded')

    player.merge(request.body())
    await player.save()

    log.info({ playerId: player.id }, 'Player updated successfully')

    return response.ok(player)
  }
}
```

Output:
```json
{"level":"info","time":1705410000000,"requestId":"abc-123","msg":"Starting player update"}
{"level":"info","time":1705410001000,"requestId":"abc-123","playerId":42,"playerName":"Faker","msg":"Player loaded"}
{"level":"info","time":1705410002000,"requestId":"abc-123","playerId":42,"msg":"Player updated successfully"}
```

### Using Log Helper Function

For simple one-off logs:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { logWithContext } from '#utils/logger_helper'

export default class AuthController {
  async login({ request, response }: HttpContext) {
    const { email } = request.body()

    logWithContext(ctx, 'info', 'Login attempt', { email })

    // ... authentication logic

    if (authenticated) {
      logWithContext(ctx, 'info', 'Login successful', { email, userId: user.id })
    } else {
      logWithContext(ctx, 'warn', 'Login failed', { email, reason: 'invalid_credentials' })
    }
  }
}
```

---

## Custom Metrics

### Recording Custom Business Metrics

While the metrics collector automatically tracks HTTP metrics, you can also record custom metrics:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { metricsCollector } from '#utils/metrics'

export default class PaymentController {
  async processPayment({ request, response }: HttpContext) {
    const startTime = Date.now()

    try {
      // Process payment...
      const result = await this.paymentGateway.charge(...)

      // Record custom metric (treat as successful request)
      metricsCollector.record('/payment/charge', Date.now() - startTime, 200)

      return response.ok(result)
    } catch (error) {
      // Record as error
      metricsCollector.record('/payment/charge', Date.now() - startTime, 500)
      throw error
    }
  }
}
```

### Tracking Async Operations

```typescript
export default class DataSyncService {
  async syncPlayerData(playerId: number) {
    const startTime = Date.now()

    try {
      await this.fetchFromRiotApi(playerId)
      await this.updateDatabase(playerId)

      // Track as a synthetic "request"
      const duration = Date.now() - startTime
      metricsCollector.record('background/sync-player', duration, 200)

      logger.info({ playerId, duration }, 'Player sync completed')
    } catch (error) {
      const duration = Date.now() - startTime
      metricsCollector.record('background/sync-player', duration, 500)

      logger.error({ playerId, duration, error }, 'Player sync failed')
    }
  }
}
```

---

## Debugging with Request IDs

### Tracing a Single Request Across Logs

When a user reports an error, ask for the Request ID from the response headers:

```bash
# User sees error with Request ID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# Find all logs for that request
grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" production.log

# Or if using structured JSON logs
jq 'select(.requestId == "a1b2c3d4-e5f6-7890-abcd-ef1234567890")' production.log
```

### Adding Request ID to Error Pages

In your error handler, include the request ID in error responses:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getRequestId } from '#utils/logger_helper'

export default class HttpExceptionHandler extends ExceptionHandler {
  async handle(error: unknown, ctx: HttpContext) {
    const requestId = getRequestId(ctx)

    if (error instanceof ValidationError) {
      return ctx.response.status(422).json({
        error: 'Validation failed',
        requestId, // Include for debugging
        details: error.messages,
      })
    }

    return ctx.response.status(500).json({
      error: 'Internal server error',
      requestId, // User can provide this when reporting the bug
      message: process.env.NODE_ENV === 'production'
        ? 'An error occurred. Please contact support with the request ID.'
        : error.message,
    })
  }
}
```

### Client-Side Error Reporting

In your frontend, capture and display the request ID:

```typescript
// Frontend API client
async function apiCall(endpoint: string) {
  try {
    const response = await fetch(endpoint)
    const requestId = response.headers.get('X-Request-ID')

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Request ${requestId} failed: ${error.message}`)
    }

    return response.json()
  } catch (error) {
    // Show user-friendly error with request ID
    showError({
      message: 'Something went wrong',
      requestId: error.requestId,
      hint: 'Please provide this ID to support: ' + error.requestId
    })
  }
}
```

---

## Monitoring Endpoints

### Health Check for Load Balancers

Use the `/health` endpoint for basic health checks:

```bash
curl http://localhost:3333/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-16T10:30:00.000Z",
  "database": "connected"
}
```

### Metrics for Monitoring Systems

Query the metrics endpoint periodically:

```bash
curl http://localhost:3333/health/metrics
```

Response:
```json
{
  "timestamp": "2026-01-16T10:30:00.000Z",
  "metrics": {
    "totalRequests": 15234,
    "totalErrors": 12,
    "avgResponseTimeRounded": 246,
    "errorRate": "0.08%",
    "slowRequestRate": "0.30%"
  },
  "percentiles": {
    "p50": 180,
    "p95": 650,
    "p99": 1200
  },
  "topEndpoints": [
    { "path": "/api/v1/lol/dashboard/teams", "count": 3456 }
  ],
  "errorProneEndpoints": [
    { "path": "/api/v1/some/endpoint", "count": 8 }
  ]
}
```

### Setting Up Alerts

Use the metrics to set up alerts:

```javascript
// Monitoring script (run every 5 minutes)
const response = await fetch('http://backend:3333/health/metrics')
const data = await response.json()

// Alert on high error rate
if (parseFloat(data.metrics.errorRate) > 1.0) {
  sendAlert('Error rate exceeded 1%: ' + data.metrics.errorRate)
}

// Alert on slow responses
if (data.percentiles.p95 > 1000) {
  sendAlert('P95 response time exceeded 1s: ' + data.percentiles.p95 + 'ms')
}

// Alert on specific endpoint problems
data.errorProneEndpoints.forEach(endpoint => {
  if (endpoint.count > 10) {
    sendAlert(`Endpoint ${endpoint.path} has ${endpoint.count} errors`)
  }
})
```

---

## Error Tracking

### Structured Error Logging

Log errors with full context:

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { getContextLogger } from '#utils/logger_helper'

export default class DataImportService {
  async importMatches(ctx: HttpContext) {
    const log = getContextLogger(ctx)

    try {
      const matches = await this.fetchMatches()
      log.info({ count: matches.length }, 'Fetched matches from API')

      const imported = await this.saveMatches(matches)
      log.info({ imported: imported.length }, 'Matches imported successfully')

    } catch (error) {
      // Log error with full context
      log.error({
        error: error.message,
        stack: error.stack,
        code: error.code,
        context: 'match_import',
      }, 'Failed to import matches')

      throw error // Re-throw to be handled by error handler
    }
  }
}
```

### Error Aggregation

Query error-prone endpoints from metrics:

```typescript
import { metricsCollector } from '#utils/metrics'

export default class MonitoringController {
  async errorReport() {
    const errorProneEndpoints = metricsCollector.getErrorProneEndpoints(20)
    const metrics = metricsCollector.getMetrics()

    return {
      summary: {
        totalErrors: metrics.totalErrors,
        errorRate: metrics.errorRate,
      },
      topErrors: errorProneEndpoints.map(e => ({
        endpoint: e.path,
        count: e.count,
        percentage: ((e.count / metrics.totalRequests) * 100).toFixed(2) + '%'
      }))
    }
  }
}
```

---

## Integration Examples

### Prometheus Exporter

Create a custom Prometheus exporter endpoint:

```typescript
import { metricsCollector } from '#utils/metrics'

export default class MetricsController {
  async prometheus() {
    const metrics = metricsCollector.getMetrics()
    const percentiles = metricsCollector.getPercentiles()

    // Convert to Prometheus format
    const prometheusMetrics = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metrics.totalRequests}

# HELP http_errors_total Total number of HTTP errors
# TYPE http_errors_total counter
http_errors_total ${metrics.totalErrors}

# HELP http_request_duration_ms HTTP request latencies in milliseconds
# TYPE http_request_duration_ms summary
http_request_duration_ms{quantile="0.5"} ${percentiles.p50}
http_request_duration_ms{quantile="0.95"} ${percentiles.p95}
http_request_duration_ms{quantile="0.99"} ${percentiles.p99}
http_request_duration_ms_sum ${metrics.avgResponseTime * metrics.totalRequests}
http_request_duration_ms_count ${metrics.totalRequests}
`.trim()

    return prometheusMetrics
  }
}
```

### DataDog Integration

Send metrics to DataDog:

```typescript
import { metricsCollector } from '#utils/metrics'

class DataDogReporter {
  async sendMetrics() {
    const metrics = metricsCollector.getMetrics()
    const percentiles = metricsCollector.getPercentiles()

    await this.datadogClient.gauge('http.requests.total', metrics.totalRequests)
    await this.datadogClient.gauge('http.errors.total', metrics.totalErrors)
    await this.datadogClient.gauge('http.response_time.p50', percentiles.p50)
    await this.datadogClient.gauge('http.response_time.p95', percentiles.p95)
    await this.datadogClient.gauge('http.response_time.p99', percentiles.p99)
  }
}

// Run every minute
setInterval(() => {
  new DataDogReporter().sendMetrics()
}, 60000)
```

---

## Testing Examples

### Testing with Request IDs

In your tests, you can verify request IDs are set:

```typescript
import { test } from '@japa/runner'

test.group('Request IDs', () => {
  test('sets X-Request-ID header', async ({ client }) => {
    const response = await client.get('/api/v1/players')

    const requestId = response.header('X-Request-ID')
    assert.exists(requestId)
    assert.match(requestId, /^[a-f0-9-]{36}$/) // UUID format
  })

  test('includes request ID in error responses', async ({ client }) => {
    const response = await client.get('/api/v1/invalid-endpoint')

    const body = response.body()
    assert.exists(body.requestId)
  })
})
```

### Mocking Metrics in Tests

```typescript
import { test } from '@japa/runner'
import { metricsCollector } from '#utils/metrics'

test.group('Metrics', (group) => {
  group.each.setup(() => {
    metricsCollector.reset() // Clean state for each test
  })

  test('records request metrics', async ({ client, assert }) => {
    await client.get('/api/v1/players')

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1)
  })
})
```

---

## Best Practices

### 1. Always Use Context Logger

```typescript
// ❌ Bad - no request context
logger.info('User logged in')

// ✅ Good - includes request ID
const log = getContextLogger(ctx)
log.info('User logged in')
```

### 2. Include Meaningful Data in Logs

```typescript
// ❌ Bad - not enough context
log.error('Update failed')

// ✅ Good - actionable information
log.error({
  userId: user.id,
  operation: 'update_profile',
  error: error.message,
  stack: error.stack
}, 'Failed to update user profile')
```

### 3. Use Appropriate Log Levels

```typescript
log.debug('Cache hit for key: ' + key)        // Development debugging
log.info('User registered', { userId })       // Important events
log.warn('Rate limit approaching', { count }) // Potential issues
log.error('Database query failed', { error }) // Actual errors
```

### 4. Monitor the Right Metrics

Focus on:
- **Error rate**: Should be <1%
- **p95 latency**: Should be <1s for most endpoints
- **Slow requests**: Should be <5% of total
- **Top error-prone endpoints**: Fix these first

### 5. Clean Up Old Metrics

For long-running processes, reset metrics periodically:

```typescript
// Reset metrics daily at midnight
import { metricsCollector } from '#utils/metrics'
import cron from 'node-cron'

cron.schedule('0 0 * * *', () => {
  // Export current metrics before reset
  const finalMetrics = metricsCollector.getMetrics()
  logger.info({ metrics: finalMetrics }, 'Daily metrics summary')

  // Reset for new day
  metricsCollector.reset()
})
```
