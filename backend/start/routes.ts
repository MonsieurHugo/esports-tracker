/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import db from '@adonisjs/lucid/services/db'
import { metricsCollector } from '#utils/metrics'

const LolDashboardController = () => import('#controllers/lol_dashboard_controller')
const PlayersController = () => import('#controllers/players_controller')
const WorkerController = () => import('#controllers/worker_controller')
const DocsController = () => import('#controllers/docs_controller')
const ProStatsController = () => import('#controllers/pro_stats_controller')

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

router.get('/health/metrics', async ({ response }) => {
  const metrics = metricsCollector.getMetrics()
  const percentiles = metricsCollector.getPercentiles()
  const topEndpoints = metricsCollector.getTopEndpoints(10)
  const errorProneEndpoints = metricsCollector.getErrorProneEndpoints(10)

  return response.ok({
    timestamp: new Date().toISOString(),
    metrics,
    percentiles,
    topEndpoints,
    errorProneEndpoints,
  })
})

/**
 * API Documentation routes
 */
router
  .group(() => {
    router.get('/', [DocsController, 'swaggerUi'])
    router.get('/openapi.json', [DocsController, 'openApiJson'])
    router.get('/openapi.yaml', [DocsController, 'openApiYaml'])
  })
  .prefix('/api/docs')

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
        // Batch endpoints (optimized - combine multiple requests)
        router.get('/batch', [LolDashboardController, 'batch'])
        router.get('/team-history-batch', [LolDashboardController, 'teamHistoryBatch'])
        router.get('/player-history-batch', [LolDashboardController, 'playerHistoryBatch'])

        // Leaderboard endpoints
        router.get('/teams', [LolDashboardController, 'teams'])
        router.get('/players', [LolDashboardController, 'players'])

        // Reference data
        router.get('/leagues', [LolDashboardController, 'leagues'])
      })
      .prefix('/lol/dashboard')
      .use(middleware.rateLimit({ type: 'api' }))

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
     * Worker monitoring endpoints (public read-only for dashboard)
     */
    router
      .group(() => {
        router.get('/status', [WorkerController, 'status'])
        router.get('/metrics/history', [WorkerController, 'metricsHistory'])
        router.get('/metrics/daily', [WorkerController, 'metricsDaily'])
        router.get('/logs', [WorkerController, 'logs'])
        router.get('/accounts/list', [WorkerController, 'accountsList'])
        router.get('/coverage-stats', [WorkerController, 'coverageStats'])
        router.get('/priority-stats', [WorkerController, 'priorityStats'])
        router.get('/rate-limiter-stats', [WorkerController, 'rateLimiterStats'])
      })
      .prefix('/worker')
      .use(middleware.rateLimit({ type: 'api' }))

    /**
     * Pro Stats endpoints (professional match data)
     */
    router
      .group(() => {
        // Tournaments
        router.get('/tournaments', [ProStatsController, 'tournaments'])
        router.get('/tournaments/:slug', [ProStatsController, 'tournamentBySlug'])

        // Matches
        router.get('/matches', [ProStatsController, 'matches'])
        router.get('/matches/upcoming', [ProStatsController, 'upcomingMatches'])
        router.get('/matches/live', [ProStatsController, 'liveMatches'])
        router.get('/matches/:id', [ProStatsController, 'matchById'])

        // Games
        router.get('/games/:id', [ProStatsController, 'gameById'])

        // Team stats
        router.get('/teams/:slug/stats', [ProStatsController, 'teamStats'])

        // Player stats
        router.get('/players/:slug/stats', [ProStatsController, 'playerStats'])

        // Draft analysis
        router.get('/drafts/analysis', [ProStatsController, 'draftsAnalysis'])

        // Head-to-head
        router.get('/head-to-head', [ProStatsController, 'headToHead'])
      })
      .prefix('/pro')
      .use(middleware.rateLimit({ type: 'api' }))

  })
  .prefix('/api/v1')
