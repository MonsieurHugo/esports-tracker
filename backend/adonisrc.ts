import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/session/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/session/session_provider'),
    // Redis provider - loaded conditionally based on REDIS_ENABLED env var
    ...(process.env.REDIS_ENABLED === 'true' ? [() => import('@adonisjs/redis/redis_provider')] : []),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  */
  preloads: [
    () => import('#start/routes'),
    () => import('#start/kernel'),
    // Redis event handlers - loaded conditionally with provider
    ...(process.env.REDIS_ENABLED === 'true' ? [() => import('#start/redis')] : []),
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec.{ts,js}'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec.{ts,js}'],
        name: 'functional',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },

  metaFiles: [
    {
      pattern: 'public/**',
      reloadServer: false,
    },
    {
      pattern: 'resources/views/**/*.edge',
      reloadServer: false,
    },
  ],
})
