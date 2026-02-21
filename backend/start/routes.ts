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
const ProStatsController = () => import('#controllers/pro_stats_controller')
const ProDataController = () => import('#controllers/pro_data_controller')
const ProLeagueStatsController = () => import('#controllers/pro_league_stats_controller')
const ProAdminController = () => import('#controllers/pro_admin_controller')
const ProMappingController = () => import('#controllers/pro_mapping_controller')
const DocsController = () => import('#controllers/docs_controller')
const SoloqAdminController = () => import('#controllers/soloq_admin_controller')

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
     * Pro esports monitoring endpoints - READ ONLY (public)
     */
    router
      .group(() => {
        router.get('/worker-status', [ProStatsController, 'workerStatus'])
        router.get('/stats', [ProStatsController, 'stats'])
        router.get('/stats/enhanced', [ProStatsController, 'statsEnhanced'])
        router.get('/tournaments', [ProDataController, 'tournaments'])
        router.get('/matches', [ProDataController, 'matches'])
        router.get('/games/:id', [ProDataController, 'game'])
        router.get('/games/:id/events', [ProDataController, 'gameEvents'])
        router.get('/games-by-match/:matchId', [ProDataController, 'gamesByMatch'])
        router.get('/matches-overview', [ProDataController, 'matchesOverview'])
        // Data quality & health
        router.get('/data-quality', [ProStatsController, 'dataQuality'])
        router.get('/data-quality-flags', [ProStatsController, 'dataQualityFlags'])

        // Analytics
        router.get('/teams/rankings', [ProDataController, 'teamRankings'])
        router.get('/players/rankings', [ProDataController, 'playerRankings'])
        router.get('/champions/stats', [ProDataController, 'championStats'])

        // League listing (read-only)
        router.get('/leagues', [ProAdminController, 'leagues'])

        // Entity mapping (read-only)
        router.get('/proposals', [ProMappingController, 'proposals'])
        router.get('/mappings', [ProMappingController, 'mappings'])
        router.get('/entities/search', [ProMappingController, 'searchEntities'])
      })
      .prefix('/pro/monitoring')
      .use(middleware.rateLimit({ type: 'api' }))

    /**
     * Pro esports monitoring endpoints - WRITE (requires API key authentication)
     */
    router
      .group(() => {
        // Destructive operations (cleanTables requires confirmation param)
        router.post('/clean-tables', [ProAdminController, 'cleanTables'])

        // League management
        router.post('/leagues', [ProAdminController, 'createLeague'])
        router.patch('/leagues/:id', [ProAdminController, 'updateLeague'])
        router.delete('/leagues/:id', [ProAdminController, 'deleteLeague'])

        // Tournament league assignment
        router.patch('/tournaments/:id/league', [ProAdminController, 'assignLeague'])

        // Entity mapping management
        router.patch('/proposals/:id', [ProMappingController, 'updateProposal'])
        router.post('/proposals/batch', [ProMappingController, 'batchUpdateProposals'])
        router.post('/mappings', [ProMappingController, 'createMapping'])
        router.delete('/mappings/:id', [ProMappingController, 'deleteMapping'])

        // Data quality flags management
        router.post('/data-quality-flags/:id/resolve', [ProStatsController, 'resolveFlag'])
        router.post('/data-quality-flags/resolve-bulk', [ProStatsController, 'resolveFlagsBulk'])
      })
      .prefix('/pro/monitoring')
      .use(middleware.rateLimit({ type: 'api' }))
      .use(middleware.proAdminAuth())

    /**
     * Pro stats page endpoints (public read, password verify)
     */
    router
      .group(() => {
        router
          .post('/verify-password', [ProLeagueStatsController, 'verifyPassword'])
          .use(middleware.rateLimit({ type: 'auth' }))
        router.get('/filter-map', [ProLeagueStatsController, 'filterMap'])
        router.get('/records', [ProLeagueStatsController, 'records'])
        router.get('/player-leaderboards', [ProLeagueStatsController, 'playerLeaderboards'])
        router.get('/team-leaderboards', [ProLeagueStatsController, 'teamLeaderboards'])
        router.get('/champion-stats', [ProLeagueStatsController, 'championStats'])
        router.get('/league-stats', [ProLeagueStatsController, 'leagueStats'])
        router.get('/leagues', [ProLeagueStatsController, 'leagues'])
        router.get('/teams', [ProLeagueStatsController, 'proTeams'])
        router.get('/tournaments', [ProLeagueStatsController, 'tournaments'])
        router.get('/players', [ProLeagueStatsController, 'proPlayers'])
        router.get('/years', [ProLeagueStatsController, 'years'])
      })
      .prefix('/pro/stats')
      .use(middleware.rateLimit({ type: 'api' }))

    /**
     * SoloQ Admin endpoints
     */
    router
      .post('/soloq/admin/verify-password', [SoloqAdminController, 'verifyPassword'])
      .use(middleware.rateLimit({ type: 'auth' }))

    router
      .group(() => {
        // Players
        router.get('/players', [SoloqAdminController, 'listPlayers'])
        router.post('/players', [SoloqAdminController, 'createPlayer'])
        router.post('/players/full', [SoloqAdminController, 'createFullPlayer'])
        router.patch('/players/:id', [SoloqAdminController, 'updatePlayer'])
        router.delete('/players/:id', [SoloqAdminController, 'deletePlayer'])

        // Accounts
        router.post('/players/:id/accounts', [SoloqAdminController, 'addAccount'])
        router.delete('/players/:id/accounts/:accountId', [SoloqAdminController, 'deleteAccount'])

        // Contracts
        router.post('/players/:id/contract', [SoloqAdminController, 'upsertContract'])
        router.post('/players/:id/contract/end', [SoloqAdminController, 'endContract'])

        // Organizations
        router.get('/organizations', [SoloqAdminController, 'listOrganizations'])
        router.post('/organizations', [SoloqAdminController, 'createOrganization'])
        router.patch('/organizations/:id', [SoloqAdminController, 'updateOrganization'])
        router.delete('/organizations/:id', [SoloqAdminController, 'deleteOrganization'])

        // Teams
        router.get('/teams', [SoloqAdminController, 'listTeams'])
        router.post('/teams', [SoloqAdminController, 'createTeam'])
        router.patch('/teams/:id', [SoloqAdminController, 'updateTeam'])
        router.delete('/teams/:id', [SoloqAdminController, 'deleteTeam'])

        // Leagues (read-only for dropdowns)
        router.get('/leagues', [SoloqAdminController, 'listLeagues'])
      })
      .prefix('/soloq/admin')
      .use(middleware.soloqAdminAuth())

  })
  .prefix('/api/v1')
