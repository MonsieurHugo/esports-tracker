import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import type { Suite } from '@japa/runner/core'

/**
 * Export runner hooks for bin/test.ts
 */
export const runnerHooks = {
  setup: [
    async () => {
      // Run migrations to ensure database schema is up to date
      await testUtils.db().migrate()
      // Truncate all tables before running tests
      await testUtils.db().truncate()
    },
  ],
  teardown: [],
}

/**
 * Configure suite-specific setup hooks
 * - Unit tests: Just database setup
 * - Functional tests: Start HTTP server + database setup
 */
export const configureSuite = (suite: Suite) => {
  if (suite.name === 'functional') {
    suite.setup(() => testUtils.httpServer().start())
  }
}

/**
 * Export plugins for test runner
 */
export const plugins = [
  assert(),
  apiClient(),
  pluginAdonisJS(app),
]
