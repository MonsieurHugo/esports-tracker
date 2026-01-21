# Observability Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client Request                            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Request Logger Middleware                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  1. Generate UUID (Request ID)                              │   │
│  │  2. Add X-Request-ID header                                 │   │
│  │  3. Start timer                                             │   │
│  │  4. Call next()                                             │   │
│  │  5. Measure duration                                        │   │
│  │  6. Log request (logger)                                    │   │
│  │  7. Record metrics (metricsCollector)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Other Middleware                              │
│  (Body Parser, CORS, Auth, Security Headers, etc.)                 │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Route Handler                               │
│                       (Controller)                                  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Response to Client                            │
│                  (includes X-Request-ID header)                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Request Logger Middleware                       │
│                  (request_logger_middleware.ts)                     │
└──────────┬──────────────────────────────────────────┬───────────────┘
           │                                          │
           ▼                                          ▼
┌────────────────────────┐              ┌────────────────────────────┐
│   AdonisJS Logger      │              │    Metrics Collector       │
│   (Pino)               │              │    (metrics.ts)            │
│                        │              │                            │
│  - Structured JSON     │              │  - In-Memory Storage       │
│  - Log Levels          │              │  - Aggregation             │
│  - Child Loggers       │              │  - Percentiles             │
│  - Pretty Print (dev)  │              │  - Top Endpoints           │
└────────────────────────┘              └────────────┬───────────────┘
                                                     │
                                                     ▼
                                        ┌────────────────────────────┐
                                        │   Metrics Endpoint         │
                                        │   GET /health/metrics      │
                                        │                            │
                                        │  - Current Snapshot        │
                                        │  - Percentiles             │
                                        │  - Top/Error Endpoints     │
                                        └────────────────────────────┘
```

## Data Flow

### 1. Request Logging Flow

```
[Client Request]
      │
      ├─► [Generate Request ID: UUID]
      │
      ├─► [Set Response Header: X-Request-ID]
      │
      ├─► [Start Timer: Date.now()]
      │
      ├─► [Process Request: next()]
      │
      ├─► [Measure Duration: Date.now() - startTime]
      │
      ├─► [Extract Context]:
      │   ├─ Method (GET/POST/etc.)
      │   ├─ Path (/api/v1/players)
      │   ├─ Status Code (200/404/500)
      │   ├─ User Agent
      │   ├─ IP Address
      │   └─ User ID (if authenticated)
      │
      ├─► [Determine Log Level]:
      │   ├─ statusCode >= 500 → ERROR
      │   ├─ statusCode >= 400 → WARN
      │   ├─ duration > 1000ms → WARN
      │   └─ else → INFO
      │
      ├─► [Log to Pino]:
      │   └─ Structured JSON Output
      │
      └─► [Record Metrics]:
          └─ metricsCollector.record(path, duration, statusCode)
```

### 2. Metrics Collection Flow

```
[metricsCollector.record(path, duration, statusCode)]
      │
      ├─► [Increment Total Requests]
      │
      ├─► [Check if Error (statusCode >= 500)]:
      │   ├─ Yes: Increment Total Errors
      │   └─     Increment Errors by Endpoint[path]
      │
      ├─► [Check if Slow (duration > 1000ms)]:
      │   └─ Yes: Increment Slow Requests
      │
      ├─► [Update Response Times]:
      │   ├─ Add duration to array
      │   ├─ If array.length > 1000: Remove oldest
      │   └─ Recalculate Average
      │
      └─► [Increment Requests by Endpoint[path]]
```

### 3. Metrics Query Flow

```
[GET /health/metrics]
      │
      ├─► [metricsCollector.getMetrics()]
      │   ├─ Total Requests
      │   ├─ Total Errors
      │   ├─ Average Response Time
      │   ├─ Slow Requests
      │   ├─ Error Rate (calculated)
      │   ├─ Slow Request Rate (calculated)
      │   └─ Requests/Errors by Endpoint
      │
      ├─► [metricsCollector.getPercentiles()]
      │   ├─ Sort response times
      │   ├─ Calculate p50 (median)
      │   ├─ Calculate p95
      │   └─ Calculate p99
      │
      ├─► [metricsCollector.getTopEndpoints(10)]
      │   └─ Sort by request count, take top 10
      │
      ├─► [metricsCollector.getErrorProneEndpoints(10)]
      │   └─ Sort by error count, take top 10
      │
      └─► [Return JSON Response]
```

## Storage Architecture

### In-Memory Metrics Storage

```
MetricsCollector
├─ metrics: RequestMetrics
│  ├─ totalRequests: number
│  ├─ totalErrors: number
│  ├─ avgResponseTime: number
│  ├─ slowRequests: number
│  ├─ requestsByEndpoint: Map<string, number>
│  │  └─ { "/api/v1/players": 1234, ... }
│  └─ errorsByEndpoint: Map<string, number>
│     └─ { "/api/v1/buggy": 5, ... }
│
└─ responseTimes: number[]
   ├─ [234, 156, 345, ...] (last 1000 samples)
   └─ MAX_SAMPLES = 1000
```

### Log Storage

```
Pino Logger
├─ Development Mode
│  ├─ Format: Pretty Print (human-readable)
│  ├─ Output: stdout (console)
│  └─ Colors: Enabled
│
└─ Production Mode
   ├─ Format: JSON (structured)
   ├─ Output: stdout (captured by log shipper)
   └─ Fields:
      ├─ level (number)
      ├─ time (timestamp)
      ├─ requestId (UUID)
      ├─ method (HTTP method)
      ├─ path (URL path)
      ├─ statusCode (HTTP status)
      ├─ duration (milliseconds)
      ├─ userAgent (string)
      ├─ ip (IP address)
      ├─ userId (number | null)
      └─ msg (message)
```

## Integration Points

### 1. Internal Integration

```
┌──────────────────────────────────────────────────────────────┐
│                      Request Logger                          │
└────────┬─────────────────────────────────────────────────────┘
         │
         ├─► http_utils.getClientIp(ctx)
         │   └─ Handles proxy headers safely
         │
         ├─► logger (Pino)
         │   ├─ logger.info()
         │   ├─ logger.warn()
         │   └─ logger.error()
         │
         └─► metricsCollector
             ├─ record()
             ├─ getMetrics()
             ├─ getPercentiles()
             ├─ getTopEndpoints()
             └─ getErrorProneEndpoints()
```

### 2. External Integration

```
┌──────────────────────────────────────────────────────────────┐
│                    Metrics Endpoint                          │
│                  GET /health/metrics                         │
└────────┬─────────────────────────────────────────────────────┘
         │
         ├─► Prometheus
         │   └─ Scrape endpoint every 30s
         │
         ├─► DataDog
         │   └─ Custom metrics reporter
         │
         ├─► Grafana
         │   └─ Dashboard queries
         │
         └─► Custom Monitoring
             └─ Alert scripts

┌──────────────────────────────────────────────────────────────┐
│                      Structured Logs                         │
│                         (stdout)                             │
└────────┬─────────────────────────────────────────────────────┘
         │
         ├─► CloudWatch Logs
         │   └─ AWS log shipper
         │
         ├─► Splunk
         │   └─ Splunk forwarder
         │
         ├─► ELK Stack
         │   └─ Filebeat → Logstash → Elasticsearch
         │
         └─► DataDog Logs
             └─ DataDog agent
```

## Request Lifecycle

### Complete Flow with Observability

```
1. [Client] → HTTP Request
              └─ GET /api/v1/players?page=1

2. [Middleware Stack]
   ├─ Request Logger (FIRST)
   │  ├─ Generate UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   │  ├─ Set Header: X-Request-ID
   │  ├─ Start Timer: 1705410000000
   │  └─ Call next() →
   │
   ├─ Body Parser
   ├─ CORS
   ├─ Session
   ├─ Auth (check token)
   ├─ Security Headers
   └─ Rate Limiter

3. [Route Handler]
   └─ PlayersController.index()
      ├─ Query Database
      ├─ Format Response
      └─ Return Data

4. [Request Logger] (FINALLY block)
   ├─ Stop Timer: 1705410000234 (234ms elapsed)
   ├─ Get Status: 200
   ├─ Get User: { id: 42 }
   │
   ├─ Log Request:
   │  {
   │    "level": "info",
   │    "time": 1705410000234,
   │    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
   │    "method": "GET",
   │    "path": "/api/v1/players?page=1",
   │    "statusCode": 200,
   │    "duration": 234,
   │    "userAgent": "Mozilla/5.0...",
   │    "ip": "192.168.1.100",
   │    "userId": 42,
   │    "msg": "Request completed"
   │  }
   │
   └─ Record Metrics:
      └─ metricsCollector.record("/api/v1/players?page=1", 234, 200)

5. [Client] ← HTTP Response
              ├─ Headers:
              │  └─ X-Request-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
              └─ Body: { data: [...] }
```

## Error Handling Flow

```
1. [Request] → GET /api/v1/invalid
                 └─ X-Request-ID: abc-123

2. [Request Logger] → Start tracking

3. [Route Handler] → Throws Error: "Not Found"

4. [Exception Handler]
   └─ Formats error response
      {
        "error": "Not Found",
        "requestId": "abc-123"
      }

5. [Request Logger] (FINALLY - always runs)
   ├─ Log Error:
   │  {
   │    "level": "warn",
   │    "requestId": "abc-123",
   │    "method": "GET",
   │    "path": "/api/v1/invalid",
   │    "statusCode": 404,
   │    "duration": 12,
   │    "msg": "Request completed with client error"
   │  }
   │
   └─ Record Metrics:
      └─ metricsCollector.record("/api/v1/invalid", 12, 404)
      └─ (404 is not counted as error, only 5xx)

6. [Client] ← Response
              └─ Status: 404
              └─ X-Request-ID: abc-123
```

## Monitoring Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    System Health Dashboard                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Requests  │  │   Errors    │  │  Avg Time   │        │
│  │   15,234    │  │     12      │  │   246ms     │        │
│  │   ↑ 12%    │  │   ↓ 2%     │  │   ↓ 5%     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │         Response Time Percentiles                  │   │
│  │  p50: ████████░░░░░░░░░░ 180ms                    │   │
│  │  p95: ████████████████░░ 650ms                    │   │
│  │  p99: ████████████████████ 1200ms                 │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │             Top Endpoints (by count)               │   │
│  │  1. /api/v1/lol/dashboard/teams      3,456       │   │
│  │  2. /api/v1/lol/dashboard/players    2,789       │   │
│  │  3. /api/v1/players/:id              1,234       │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │          Error-Prone Endpoints                     │   │
│  │  1. /api/v1/external-api             8 errors    │   │
│  │  2. /api/v1/legacy-endpoint          3 errors    │   │
│  │  3. /api/v1/timeout-prone            1 error     │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Scalability Considerations

### Single Instance

```
┌────────────────────────────┐
│       Backend Server       │
│  ┌──────────────────────┐  │
│  │  Metrics Collector   │  │
│  │  (In-Memory)         │  │
│  │  ~500KB RAM          │  │
│  └──────────────────────┘  │
└────────────────────────────┘
         │
         └─► GET /health/metrics
```

### Multiple Instances (Needs External Storage)

```
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Backend #1   │   │  Backend #2   │   │  Backend #3   │
│  ┌─────────┐  │   │  ┌─────────┐  │   │  ┌─────────┐  │
│  │ Metrics │  │   │  │ Metrics │  │   │  │ Metrics │  │
│  └────┬────┘  │   │  └────┬────┘  │   │  └────┬────┘  │
└───────┼───────┘   └───────┼───────┘   └───────┼───────┘
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
                    ┌───────▼──────────┐
                    │  Prometheus      │
                    │  (Aggregation)   │
                    └──────────────────┘
```

### Recommended Production Setup

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
└─────────────┬───────────────────────────────────────────────┘
              │
    ┌─────────┴─────────┬─────────────┐
    ▼                   ▼             ▼
┌─────────┐       ┌─────────┐   ┌─────────┐
│Backend 1│       │Backend 2│   │Backend 3│
└────┬────┘       └────┬────┘   └────┬────┘
     │                 │             │
     └─────────────────┴─────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌────────┐   ┌──────────┐   ┌────────┐
    │Prom.   │   │CloudWatch│   │DataDog │
    │        │   │Logs      │   │        │
    └────────┘   └──────────┘   └────────┘
         │
         ▼
    ┌────────┐
    │Grafana │
    │        │
    └────────┘
```

## Performance Impact

### CPU Overhead per Request

```
Request Logger Middleware:
├─ UUID Generation:          ~0.05ms
├─ Header Setting:           ~0.01ms
├─ Timer Operations:         ~0.02ms
├─ Context Extraction:       ~0.10ms
├─ Logging (async):          ~0.20ms
└─ Metrics Recording:        ~0.12ms
                    Total:   ~0.50ms

Typical Request Duration:     234ms
Overhead Percentage:          0.21%
```

### Memory Usage

```
Metrics Collector:
├─ Response Times Array:     1000 samples × 8 bytes = 8 KB
├─ Requests by Endpoint:     10,000 endpoints × ~100 bytes = 1 MB
├─ Errors by Endpoint:       100 endpoints × ~100 bytes = 10 KB
└─ Other Metrics:            ~1 KB
                    Total:   ~1 MB (typical production)
```

## Future Enhancements

### Phase 2: Distributed Tracing

```
┌──────────┐      ┌──────────┐      ┌──────────┐
│ Frontend │─────►│ Backend  │─────►│ Database │
│          │      │          │      │          │
│ Span 1   │      │ Span 2   │      │ Span 3   │
└──────────┘      └──────────┘      └──────────┘
     │                 │                 │
     └─────────────────┴─────────────────┘
                       │
                ┌──────▼───────┐
                │ OpenTelemetry│
                │    Trace     │
                └──────────────┘
```

### Phase 3: Real-Time Dashboard

```
┌─────────────────────────────────────────┐
│         Frontend Monitoring UI          │
├─────────────────────────────────────────┤
│  ┌────────────────────────────────┐    │
│  │   Real-Time Request Graph      │    │
│  │   (WebSocket Updates)          │    │
│  └────────────────────────────────┘    │
│                                         │
│  ┌────────────────────────────────┐    │
│  │   Live Error Stream            │    │
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘
              ▲
              │ WebSocket
              │
┌─────────────┴────────────────────┐
│   Backend Metrics Broadcaster   │
└──────────────────────────────────┘
```
