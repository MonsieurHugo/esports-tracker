import { test } from '@japa/runner'
import { metricsCollector } from '#utils/metrics'

test.group('MetricsCollector', (group) => {
  group.each.setup(() => {
    // Reset metrics before each test
    metricsCollector.reset()
  })

  test('records request metrics', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 200)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1)
    assert.equal(metrics.totalErrors, 0)
    assert.equal(metrics.slowRequests, 0)
  })

  test('tracks error requests', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 500)
    metricsCollector.record('/api/test', 100, 503)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 2)
    assert.equal(metrics.totalErrors, 2)
  })

  test('tracks slow requests', ({ assert }) => {
    metricsCollector.record('/api/test', 1500, 200)
    metricsCollector.record('/api/test', 2000, 200)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.slowRequests, 2)
  })

  test('calculates average response time', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 200, 200)
    metricsCollector.record('/api/test', 300, 200)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.avgResponseTimeRounded, 200)
  })

  test('groups requests by endpoint', ({ assert }) => {
    metricsCollector.record('/api/test1', 100, 200)
    metricsCollector.record('/api/test1', 100, 200)
    metricsCollector.record('/api/test2', 100, 200)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.requestsByEndpoint['/api/test1'], 2)
    assert.equal(metrics.requestsByEndpoint['/api/test2'], 1)
  })

  test('groups errors by endpoint', ({ assert }) => {
    metricsCollector.record('/api/test1', 100, 500)
    metricsCollector.record('/api/test1', 100, 500)
    metricsCollector.record('/api/test2', 100, 503)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.errorsByEndpoint['/api/test1'], 2)
    assert.equal(metrics.errorsByEndpoint['/api/test2'], 1)
  })

  test('calculates percentiles', ({ assert }) => {
    // Add various response times
    for (let i = 1; i <= 100; i++) {
      metricsCollector.record('/api/test', i * 10, 200)
    }

    const percentiles = metricsCollector.getPercentiles()
    assert.isAbove(percentiles.p50, 0)
    assert.isAbove(percentiles.p95, percentiles.p50)
    assert.isAbove(percentiles.p99, percentiles.p95)
  })

  test('returns top endpoints by request count', ({ assert }) => {
    metricsCollector.record('/api/popular', 100, 200)
    metricsCollector.record('/api/popular', 100, 200)
    metricsCollector.record('/api/popular', 100, 200)
    metricsCollector.record('/api/other', 100, 200)

    const topEndpoints = metricsCollector.getTopEndpoints(2)
    assert.equal(topEndpoints[0].path, '/api/popular')
    assert.equal(topEndpoints[0].count, 3)
    assert.equal(topEndpoints[1].path, '/api/other')
    assert.equal(topEndpoints[1].count, 1)
  })

  test('returns error prone endpoints', ({ assert }) => {
    metricsCollector.record('/api/buggy', 100, 500)
    metricsCollector.record('/api/buggy', 100, 500)
    metricsCollector.record('/api/stable', 100, 500)

    const errorProneEndpoints = metricsCollector.getErrorProneEndpoints(2)
    assert.equal(errorProneEndpoints[0].path, '/api/buggy')
    assert.equal(errorProneEndpoints[0].count, 2)
    assert.equal(errorProneEndpoints[1].path, '/api/stable')
    assert.equal(errorProneEndpoints[1].count, 1)
  })

  test('calculates error rate', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 100, 500)
    metricsCollector.record('/api/test', 100, 500)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.errorRate, '50.00%')
  })

  test('calculates slow request rate', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 1500, 200)
    metricsCollector.record('/api/test', 2000, 200)

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.slowRequestRate, '50.00%')
  })

  test('limits response time samples to MAX_SAMPLES', ({ assert }) => {
    // Record more than MAX_SAMPLES (1000) requests
    for (let i = 0; i < 1500; i++) {
      metricsCollector.record('/api/test', 100, 200)
    }

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1500)
    // Average should still be calculated from the last 1000 samples
    assert.equal(metrics.avgResponseTimeRounded, 100)
  })

  test('resets all metrics', ({ assert }) => {
    metricsCollector.record('/api/test', 100, 200)
    metricsCollector.record('/api/test', 100, 500)

    metricsCollector.reset()

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 0)
    assert.equal(metrics.totalErrors, 0)
    assert.equal(metrics.avgResponseTimeRounded, 0)
    assert.equal(metrics.slowRequests, 0)
  })
})
