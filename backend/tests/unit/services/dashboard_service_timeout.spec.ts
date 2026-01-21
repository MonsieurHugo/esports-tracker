import { test } from '@japa/runner'
import { QueryTimeoutError } from '#services/dashboard_service'

/**
 * Tests for DashboardService query timeout protection.
 *
 * These tests verify that:
 * 1. QueryTimeoutError has correct properties
 * 2. QueryTimeoutError is properly identifiable as an Error instance
 *
 * @security These tests ensure timeout errors are properly distinguishable
 * from other database errors for appropriate error handling.
 */
test.group('DashboardService Timeout', () => {

  test('QueryTimeoutError has correct properties', ({ assert }) => {
    const error = new QueryTimeoutError('testOperation', 8000)

    assert.equal(error.name, 'QueryTimeoutError')
    assert.equal(error.operationName, 'testOperation')
    assert.equal(error.timeoutMs, 8000)
    assert.include(error.message, 'testOperation')
    assert.include(error.message, '8000ms')
  })

  test('QueryTimeoutError is instanceof Error', ({ assert }) => {
    const error = new QueryTimeoutError('test', 1000)

    assert.instanceOf(error, Error)
    assert.instanceOf(error, QueryTimeoutError)
  })

  test('QueryTimeoutError message follows expected format', ({ assert }) => {
    const error = new QueryTimeoutError('getTeamLeaderboard', 8000)

    assert.equal(error.message, 'Query timeout: getTeamLeaderboard exceeded 8000ms')
  })

  test('QueryTimeoutError with different timeout values', ({ assert }) => {
    const error1 = new QueryTimeoutError('operation1', 5000)
    const error2 = new QueryTimeoutError('operation2', 15000)

    assert.equal(error1.timeoutMs, 5000)
    assert.equal(error2.timeoutMs, 15000)
    assert.include(error1.message, '5000ms')
    assert.include(error2.message, '15000ms')
  })

  test('QueryTimeoutError can be caught as Error', ({ assert }) => {
    try {
      throw new QueryTimeoutError('testOp', 3000)
    } catch (error) {
      assert.instanceOf(error, Error)
      if (error instanceof QueryTimeoutError) {
        assert.equal(error.operationName, 'testOp')
        assert.equal(error.timeoutMs, 3000)
      } else {
        assert.fail('Error should be instance of QueryTimeoutError')
      }
    }
  })
})
