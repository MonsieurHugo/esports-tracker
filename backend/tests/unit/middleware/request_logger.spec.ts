import { test } from '@japa/runner'
import RequestLoggerMiddleware from '#middleware/request_logger_middleware'
import { HttpContextFactory } from '@adonisjs/core/factories/http'
import { metricsCollector } from '#utils/metrics'

test.group('RequestLoggerMiddleware', (group) => {
  group.each.setup(() => {
    // Reset metrics before each test
    metricsCollector.reset()
  })

  test('adds request ID header to response', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    await middleware.handle(ctx, async () => {})

    const requestId = ctx.response.getHeader('X-Request-ID')
    assert.isString(requestId)
    assert.match(requestId as string, /^[a-f0-9-]+$/)
  })

  test('stores request ID in request headers', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    await middleware.handle(ctx, async () => {})

    const requestId = ctx.request.request.headers['x-request-id']
    assert.isString(requestId)
  })

  test('collects metrics for successful request', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    await middleware.handle(ctx, async () => {
      ctx.response.status(200)
    })

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1)
    assert.equal(metrics.totalErrors, 0)
  })

  test('collects metrics for error request', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    await middleware.handle(ctx, async () => {
      ctx.response.status(500)
    })

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1)
    assert.equal(metrics.totalErrors, 1)
  })

  test('tracks slow requests', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    await middleware.handle(ctx, async () => {
      // Simulate slow request
      await new Promise((resolve) => setTimeout(resolve, 1100))
      ctx.response.status(200)
    })

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.slowRequests, 1)
  })

  test('runs even when next throws error', async ({ assert }) => {
    const ctx = new HttpContextFactory().create()
    const middleware = new RequestLoggerMiddleware()

    try {
      await middleware.handle(ctx, async () => {
        throw new Error('Test error')
      })
    } catch {
      // Expected error
    }

    const metrics = metricsCollector.getMetrics()
    assert.equal(metrics.totalRequests, 1)
  })
})
