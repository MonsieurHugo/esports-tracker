import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { configure, processCLIArgs, run } from '@japa/runner'

/*
|--------------------------------------------------------------------------
| Configure test runner
|--------------------------------------------------------------------------
*/
processCLIArgs(process.argv.slice(2))

configure({
  suites: [
    {
      name: 'unit',
      files: ['tests/unit/**/*.spec.ts'],
    },
    {
      name: 'functional',
      files: ['tests/functional/**/*.spec.ts'],
    },
  ],
  plugins: [
    assert(),
    apiClient({
      baseURL: `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3333}`,
    }),
    pluginAdonisJS(app),
  ],
  setup: [
    async () => {
      await testUtils.db().truncate()
    },
  ],
})

/*
|--------------------------------------------------------------------------
| Run tests
|--------------------------------------------------------------------------
*/
run()
