/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'

/**
 * The error handler is used to convert an exception
 * to a HTTP response.
 */
router.use([
  // Request ID MUST be first to be available to all other middleware
  () => import('#middleware/request_id_middleware'),
  () => import('#middleware/request_logger_middleware'),
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('#middleware/security_headers_middleware'),
])

/**
 * Named middleware collection
 */
export const middleware = router.named({
  rateLimit: () => import('#middleware/rate_limit_middleware'),
  workerAuth: () => import('#middleware/worker_auth_middleware'),
})
