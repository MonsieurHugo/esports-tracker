/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import db from '@adonisjs/lucid/services/db'

const LolDashboardController = () => import('#controllers/lol_dashboard_controller')
const PlayersController = () => import('#controllers/players_controller')
const WorkerController = () => import('#controllers/worker_controller')
const AdminController = () => import('#controllers/admin_controller')
const AuthController = () => import('#controllers/auth_controller')
const OAuthController = () => import('#controllers/oauth_controller')

/**
 * Health check
 */
router.get('/', async () => {
  return {
    status: 'ok',
    name: 'Esports Tracker API',
    version: '1.0.0',
  }
})

router.get('/health', async ({ response }) => {
  try {
    // Check database connectivity
    await db.rawQuery('SELECT 1')
    return response.ok({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    })
  } catch (error) {
    return response.serviceUnavailable({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Database connection failed',
    })
  }
})

/**
 * Auth routes
 */
router
  .group(() => {
    // Public routes (with rate limiting)
    router.post('/login', [AuthController, 'login']).use(middleware.rateLimit({ type: 'login' }))
    router.post('/register', [AuthController, 'register']).use(middleware.rateLimit({ type: 'register' }))
    router.post('/forgot-password', [AuthController, 'forgotPassword']).use(middleware.rateLimit({ type: 'passwordReset' }))
    router.post('/reset-password', [AuthController, 'resetPassword'])
    router.post('/verify-email', [AuthController, 'verifyEmail'])

    // Authenticated routes
    router.post('/logout', [AuthController, 'logout']).use(middleware.auth())
    router.get('/me', [AuthController, 'me']).use(middleware.auth())
    router.post('/change-password', [AuthController, 'changePassword']).use(middleware.auth())
    router.post('/resend-verification', [AuthController, 'resendVerification']).use(middleware.auth())
    router.patch('/profile', [AuthController, 'updateProfile']).use(middleware.auth())
    router.get('/audit-logs', [AuthController, 'auditLogs']).use(middleware.auth())

    // 2FA routes
    router
      .group(() => {
        router.post('/setup', [AuthController, 'setup2FA'])
        router.post('/verify', [AuthController, 'verify2FA']).use(middleware.rateLimit({ type: 'twoFactor' }))
        router.post('/disable', [AuthController, 'disable2FA']).use(middleware.rateLimit({ type: 'twoFactor' }))
        router.post('/recovery-codes', [AuthController, 'regenerateRecoveryCodes'])
      })
      .prefix('/2fa')
      .use(middleware.auth())

    // OAuth routes
    router
      .group(() => {
        router.get('/accounts', [OAuthController, 'accounts']).use(middleware.auth())
        router.get('/:provider', [OAuthController, 'redirect'])
        router.get('/:provider/callback', [OAuthController, 'callback'])
        router.delete('/:provider', [OAuthController, 'unlink']).use(middleware.auth())
      })
      .prefix('/oauth')

    // Admin-only routes
    router
      .group(() => {
        router.get('/users', [AuthController, 'listUsers'])
        router.post('/users', [AuthController, 'createUser'])
        router.delete('/users/:id', [AuthController, 'deleteUser'])
        router.post('/users/:id/unlock', [AuthController, 'unlockUser'])
      })
      .use([middleware.auth(), middleware.admin()])
  })
  .prefix('/api/auth')

/**
 * API v1 routes
 */
router
  .group(() => {
    /**
     * LoL Dashboard endpoints
     */
    router
      .group(() => {
        router.get('/summary', [LolDashboardController, 'summary'])
        router.get('/teams', [LolDashboardController, 'teams'])
        router.get('/players', [LolDashboardController, 'players'])
        router.get('/top-grinders', [LolDashboardController, 'topGrinders'])
        router.get('/streaks', [LolDashboardController, 'streaks'])
        router.get('/loss-streaks', [LolDashboardController, 'lossStreaks'])
        router.get('/team-history', [LolDashboardController, 'teamHistory'])
        router.get('/player-history', [LolDashboardController, 'playerHistory'])
        router.get('/leagues', [LolDashboardController, 'leagues'])
        router.get('/splits', [LolDashboardController, 'splits'])
      })
      .prefix('/lol/dashboard')

    /**
     * Player endpoints
     */
    router
      .group(() => {
        router.get('/:slug/profile', [PlayersController, 'profile'])
        router.get('/:slug/play-hours', [PlayersController, 'playHours'])
        router.get('/:slug/duos', [PlayersController, 'duos'])
        router.get('/:slug/champions', [PlayersController, 'champions'])
        router.get('/:slug/compare/:compareSlug', [PlayersController, 'compare'])
      })
      .prefix('/players')

    /**
     * Worker monitoring endpoints
     */
    router
      .group(() => {
        router.get('/status', [WorkerController, 'status'])
        router.get('/metrics/history', [WorkerController, 'metricsHistory'])
        router.get('/metrics/daily', [WorkerController, 'metricsDaily'])
        router.get('/logs', [WorkerController, 'logs'])
        router.get('/players/search', [WorkerController, 'searchPlayers'])
        router.get('/daily-coverage', [WorkerController, 'dailyCoverage'])
        router.get('/accounts', [WorkerController, 'accounts'])
      })
      .prefix('/worker')

    /**
     * Admin endpoints (protected)
     */
    router
      .group(() => {
        router.get('/teams-accounts', [AdminController, 'teamsAccounts'])
        router.get('/players', [AdminController, 'players'])
        router.patch('/players/:id', [AdminController, 'updatePlayer'])
        router.post('/players/:id/contract', [AdminController, 'upsertContract'])
        router.delete('/players/:id/contract', [AdminController, 'endContract'])
      })
      .prefix('/admin')
      .use([middleware.auth(), middleware.admin()])
  })
  .prefix('/api/v1')
