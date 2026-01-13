/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),
  APP_KEY: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring Redis
  |----------------------------------------------------------
  */
  REDIS_HOST: Env.schema.string.optional(),
  REDIS_PORT: Env.schema.number.optional(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variables for configuring CORS
  |----------------------------------------------------------
  */
  CORS_ALLOWED_ORIGINS: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Frontend URL for redirects
  |----------------------------------------------------------
  */
  FRONTEND_URL: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | OAuth Providers
  |----------------------------------------------------------
  */
  GOOGLE_CLIENT_ID: Env.schema.string.optional(),
  GOOGLE_CLIENT_SECRET: Env.schema.string.optional(),
  GOOGLE_REDIRECT_URI: Env.schema.string.optional(),

  GITHUB_CLIENT_ID: Env.schema.string.optional(),
  GITHUB_CLIENT_SECRET: Env.schema.string.optional(),
  GITHUB_REDIRECT_URI: Env.schema.string.optional(),

  DISCORD_CLIENT_ID: Env.schema.string.optional(),
  DISCORD_CLIENT_SECRET: Env.schema.string.optional(),
  DISCORD_REDIRECT_URI: Env.schema.string.optional(),
})
