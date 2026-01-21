/**
 * Metrics Collector
 *
 * Collects and aggregates HTTP request metrics for observability.
 * Tracks response times, error rates, and request counts by endpoint.
 */

interface RequestMetrics {
  totalRequests: number
  totalErrors: number
  avgResponseTime: number
  slowRequests: number
  requestsByEndpoint: Map<string, number>
  errorsByEndpoint: Map<string, number>
}

class MetricsCollector {
  private metrics: RequestMetrics = {
    totalRequests: 0,
    totalErrors: 0,
    avgResponseTime: 0,
    slowRequests: 0,
    requestsByEndpoint: new Map(),
    errorsByEndpoint: new Map(),
  }

  private responseTimes: number[] = []
  private readonly MAX_SAMPLES = 1000
  private readonly SLOW_REQUEST_THRESHOLD = 1000 // 1 second

  /**
   * Record a request metric
   */
  record(path: string, duration: number, statusCode: number) {
    this.metrics.totalRequests++

    // Track response times (keep last 1000)
    this.responseTimes.push(duration)
    if (this.responseTimes.length > this.MAX_SAMPLES) {
      this.responseTimes.shift()
    }
    this.metrics.avgResponseTime =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length

    // Track slow requests (> 1s)
    if (duration > this.SLOW_REQUEST_THRESHOLD) {
      this.metrics.slowRequests++
    }

    // Track errors (5xx status codes)
    if (statusCode >= 500) {
      this.metrics.totalErrors++
      this.metrics.errorsByEndpoint.set(
        path,
        (this.metrics.errorsByEndpoint.get(path) || 0) + 1
      )
    }

    // Track requests by endpoint
    this.metrics.requestsByEndpoint.set(
      path,
      (this.metrics.requestsByEndpoint.get(path) || 0) + 1
    )
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    return {
      ...this.metrics,
      requestsByEndpoint: Object.fromEntries(this.metrics.requestsByEndpoint),
      errorsByEndpoint: Object.fromEntries(this.metrics.errorsByEndpoint),
      errorRate:
        this.metrics.totalRequests > 0
          ? ((this.metrics.totalErrors / this.metrics.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      slowRequestRate:
        this.metrics.totalRequests > 0
          ? ((this.metrics.slowRequests / this.metrics.totalRequests) * 100).toFixed(2) + '%'
          : '0%',
      avgResponseTimeRounded: Math.round(this.metrics.avgResponseTime),
    }
  }

  /**
   * Get percentile metrics for response times
   */
  getPercentiles() {
    if (this.responseTimes.length === 0) {
      return { p50: 0, p95: 0, p99: 0 }
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b)
    const p50Index = Math.floor(sorted.length * 0.5)
    const p95Index = Math.floor(sorted.length * 0.95)
    const p99Index = Math.floor(sorted.length * 0.99)

    return {
      p50: Math.round(sorted[p50Index]),
      p95: Math.round(sorted[p95Index]),
      p99: Math.round(sorted[p99Index]),
    }
  }

  /**
   * Get top N endpoints by request count
   */
  getTopEndpoints(limit: number = 10) {
    return Array.from(this.metrics.requestsByEndpoint.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([path, count]) => ({ path, count }))
  }

  /**
   * Get endpoints with most errors
   */
  getErrorProneEndpoints(limit: number = 10) {
    return Array.from(this.metrics.errorsByEndpoint.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([path, count]) => ({ path, count }))
  }

  /**
   * Reset all metrics (useful for testing or periodic resets)
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      slowRequests: 0,
      requestsByEndpoint: new Map(),
      errorsByEndpoint: new Map(),
    }
    this.responseTimes = []
  }
}

export const metricsCollector = new MetricsCollector()
