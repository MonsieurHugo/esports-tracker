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
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/security_headers_middleware'),
])

/**
 * Named middleware collection
 */
export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  guest: () => import('#middleware/guest_middleware'),
  admin: () => import('#middleware/admin_middleware'),
  rateLimit: () => import('#middleware/rate_limit_middleware'),
})
