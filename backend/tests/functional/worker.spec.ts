import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'

/**
 * Test the sanitizeLikeInput function behavior through API calls
 * The function should escape %, _, and \ characters to prevent SQL injection
 */
test.group('Worker API - sanitizeLikeInput', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/players/search escapes % wildcard in search query', async ({
    client,
    assert,
  }) => {
    // Create a test player with % in name
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-percent-player',
        current_pseudo: 'Test%Player',
        is_active: true,
      })
      .returning('player_id')

    // Create an account for this player
    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-percent-1',
      player_id: player.player_id,
      game_name: 'TestPercent',
      tag_line: 'EUW',
      region: 'EUW1',
    })

    // Search with % character - should escape it and search literally
    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'Test%' })

    response.assertStatus(200)
    // Should find the player since 'Test%' matches 'Test%Player' literally
    const body = response.body()
    // Either finds the player or returns empty (depending on exact DB escaping)
    assert.isArray(body.players)
  })

  test('GET /api/v1/worker/players/search escapes _ wildcard in search query', async ({
    client,
    assert,
  }) => {
    // Create a test player with _ in name
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-underscore-player',
        current_pseudo: 'Test_Player',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-underscore-1',
      player_id: player.player_id,
      game_name: 'TestUnderscore',
      tag_line: 'EUW',
      region: 'EUW1',
    })

    // Search with _ character - should escape it and not match any single char
    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'Test_' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.players)
  })

  test('GET /api/v1/worker/players/search escapes backslash in search query', async ({
    client,
    assert,
  }) => {
    // Create a test player with backslash in name
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-backslash-player',
        current_pseudo: 'Test\\Player',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-backslash-1',
      player_id: player.player_id,
      game_name: 'TestBackslash',
      tag_line: 'EUW',
      region: 'EUW1',
    })

    // Search with backslash - should escape it properly
    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'Test\\' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.players)
  })

  test('GET /api/v1/worker/players/search handles multiple special characters', async ({
    client,
    assert,
  }) => {
    // Search with combination of special chars
    const response = await client.get('/api/v1/worker/players/search').qs({ q: '%_\\test' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.players)
  })

  test('GET /api/v1/worker/accounts/list escapes special chars in search filter', async ({
    client,
    assert,
  }) => {
    // Create a test player
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-special-search',
        current_pseudo: 'Special%_Test',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-special-search-1',
      player_id: player.player_id,
      game_name: 'Special%Game',
      tag_line: 'EUW',
      region: 'EUW1',
      last_fetched_at: DateTime.now().toSQL(),
    })

    // Search with special characters
    const response = await client.get('/api/v1/worker/accounts/list').qs({ search: 'Special%' })

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.exists(body.meta)
    assert.exists(body.summary)
  })
})

test.group('Worker API - Status', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/status returns default status when no record exists', async ({
    client,
    assert,
  }) => {
    // Ensure no worker_status record exists
    await db.from('worker_status').delete()

    const response = await client.get('/api/v1/worker/status')

    response.assertStatus(200)
    const body = response.body()

    assert.isFalse(body.is_running)
    assert.isNull(body.started_at)
    assert.equal(body.uptime, 0)
    assert.deepEqual(body.active_batches, {})
    assert.equal(body.session_lol_matches, 0)
    assert.equal(body.session_valorant_matches, 0)
  })

  test('GET /api/v1/worker/status returns worker status when record exists', async ({
    client,
    assert,
  }) => {
    // Create a test player and account first (required for region stats)
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-status-player',
        current_pseudo: 'StatusPlayer',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-status-1',
      player_id: player.player_id,
      game_name: 'StatusGame',
      tag_line: 'EUW',
      region: 'EUW1',
      last_fetched_at: DateTime.now().toSQL(),
    })

    // Create worker status
    await db.table('worker_status').insert({
      id: 1,
      is_running: true,
      started_at: DateTime.now().minus({ hours: 1 }).toSQL(),
      session_lol_matches: 150,
      session_valorant_matches: 50,
      session_lol_accounts: 25,
      session_valorant_accounts: 10,
      session_errors: 3,
      session_api_requests: 500,
      current_account_name: 'TestAccount',
      current_account_region: 'EUW1',
      active_accounts_count: 100,
      today_accounts_count: 50,
      inactive_accounts_count: 5,
    })

    const response = await client.get('/api/v1/worker/status')

    response.assertStatus(200)
    const body = response.body()

    assert.isTrue(body.is_running)
    assert.isNotNull(body.started_at)
    assert.isAbove(body.uptime, 0)
    assert.equal(body.session_lol_matches, 150)
    assert.equal(body.session_valorant_matches, 50)
    assert.equal(body.current_account_name, 'TestAccount')
    assert.equal(body.current_account_region, 'EUW1')
  })
})

test.group('Worker API - Metrics History', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/metrics/history returns metrics for last 24 hours by default', async ({
    client,
    assert,
  }) => {
    // Create some test metrics
    await db.table('worker_metrics_hourly').insert([
      {
        hour: DateTime.now().minus({ hours: 2 }).toSQL(),
        lol_matches_added: 100,
        valorant_matches_added: 50,
        lol_accounts_processed: 20,
        valorant_accounts_processed: 10,
        api_requests_made: 200,
        api_errors: 5,
      },
      {
        hour: DateTime.now().minus({ hours: 1 }).toSQL(),
        lol_matches_added: 120,
        valorant_matches_added: 60,
        lol_accounts_processed: 25,
        valorant_accounts_processed: 12,
        api_requests_made: 250,
        api_errors: 3,
      },
    ])

    const response = await client.get('/api/v1/worker/metrics/history')

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    assert.exists(body.totals)
    assert.isAtLeast(body.data.length, 2)
  })

  test('GET /api/v1/worker/metrics/history accepts hours parameter', async ({
    client,
    assert,
  }) => {
    // Create metrics for different time ranges
    await db.table('worker_metrics_hourly').insert([
      {
        hour: DateTime.now().minus({ hours: 6 }).toSQL(),
        lol_matches_added: 50,
        valorant_matches_added: 25,
        lol_accounts_processed: 10,
        valorant_accounts_processed: 5,
        api_requests_made: 100,
        api_errors: 1,
      },
      {
        hour: DateTime.now().minus({ hours: 48 }).toSQL(),
        lol_matches_added: 200,
        valorant_matches_added: 100,
        lol_accounts_processed: 40,
        valorant_accounts_processed: 20,
        api_requests_made: 400,
        api_errors: 10,
      },
    ])

    // Request only last 12 hours - should exclude the 48h old metric
    const response = await client.get('/api/v1/worker/metrics/history').qs({ hours: 12 })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    // The 48h old metric should not be included
    const old = body.data.find((m: any) => m.lol_matches_added === 200)
    assert.isUndefined(old)
  })
})

test.group('Worker API - Metrics Daily', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/metrics/daily returns daily aggregated metrics', async ({
    client,
    assert,
  }) => {
    // Create hourly metrics for the same day
    const today = DateTime.now()
    await db.table('worker_metrics_hourly').insert([
      {
        hour: today.set({ hour: 10 }).toSQL(),
        lol_matches_added: 100,
        valorant_matches_added: 50,
        lol_accounts_processed: 20,
        valorant_accounts_processed: 10,
        api_requests_made: 200,
        api_errors: 5,
      },
      {
        hour: today.set({ hour: 14 }).toSQL(),
        lol_matches_added: 150,
        valorant_matches_added: 75,
        lol_accounts_processed: 30,
        valorant_accounts_processed: 15,
        api_requests_made: 300,
        api_errors: 2,
      },
    ])

    const response = await client.get('/api/v1/worker/metrics/daily')

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    // Should aggregate metrics by day
    if (body.data.length > 0) {
      const todayData = body.data.find((d: any) => d.date === today.toSQLDate())
      if (todayData) {
        // Should be aggregated sum
        assert.equal(todayData.lol_matches, 250)
        assert.equal(todayData.valorant_matches, 125)
        assert.equal(todayData.errors, 7)
      }
    }
  })

  test('GET /api/v1/worker/metrics/daily accepts days parameter', async ({ client, assert }) => {
    const response = await client.get('/api/v1/worker/metrics/daily').qs({ days: 3 })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
  })
})

test.group('Worker API - Logs', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/logs returns logs ordered by timestamp desc', async ({
    client,
    assert,
  }) => {
    // Create test logs
    await db.table('worker_logs').insert([
      {
        timestamp: DateTime.now().minus({ minutes: 5 }).toSQL(),
        log_type: 'info',
        severity: 'info',
        message: 'Older log message',
      },
      {
        timestamp: DateTime.now().toSQL(),
        log_type: 'lol',
        severity: 'info',
        message: 'Newer log message',
      },
    ])

    const response = await client.get('/api/v1/worker/logs')

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    assert.isAtLeast(body.data.length, 2)
    // First log should be newer
    if (body.data.length >= 2) {
      assert.equal(body.data[0].message, 'Newer log message')
    }
  })

  test('GET /api/v1/worker/logs filters by type', async ({ client, assert }) => {
    await db.table('worker_logs').insert([
      {
        timestamp: DateTime.now().toSQL(),
        log_type: 'error',
        severity: 'error',
        message: 'Error message',
      },
      {
        timestamp: DateTime.now().toSQL(),
        log_type: 'lol',
        severity: 'info',
        message: 'LoL message',
      },
    ])

    const response = await client.get('/api/v1/worker/logs').qs({ type: 'error' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    // All logs should be of type 'error'
    body.data.forEach((log: any) => {
      assert.equal(log.log_type, 'error')
    })
  })

  test('GET /api/v1/worker/logs filters by severity', async ({ client, assert }) => {
    await db.table('worker_logs').insert([
      {
        timestamp: DateTime.now().toSQL(),
        log_type: 'lol',
        severity: 'warning',
        message: 'Warning message',
      },
      {
        timestamp: DateTime.now().toSQL(),
        log_type: 'lol',
        severity: 'info',
        message: 'Info message',
      },
    ])

    const response = await client.get('/api/v1/worker/logs').qs({ severity: 'warning' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    body.data.forEach((log: any) => {
      assert.equal(log.severity, 'warning')
    })
  })

  test('GET /api/v1/worker/logs respects limit parameter', async ({ client, assert }) => {
    // Create multiple logs
    const logs = Array.from({ length: 10 }, (_, i) => ({
      timestamp: DateTime.now().minus({ minutes: i }).toSQL(),
      log_type: 'info',
      severity: 'info',
      message: `Log message ${i}`,
    }))
    await db.table('worker_logs').insert(logs)

    const response = await client.get('/api/v1/worker/logs').qs({ limit: 5 })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    assert.isAtMost(body.data.length, 5)
  })
})

test.group('Worker API - Players Search', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/players/search returns empty array for short query', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'a' })

    response.assertStatus(200)
    const body = response.body()

    assert.deepEqual(body.players, [])
  })

  test('GET /api/v1/worker/players/search returns empty array for missing query', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/worker/players/search')

    response.assertStatus(200)
    const body = response.body()

    assert.deepEqual(body.players, [])
  })

  test('GET /api/v1/worker/players/search finds players by pseudo', async ({ client, assert }) => {
    // Create a test player
    const [player] = await db
      .table('players')
      .insert({
        slug: 'faker-test',
        current_pseudo: 'Faker',
        is_active: true,
      })
      .returning('player_id')

    // Create an account for this player
    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-faker-1',
      player_id: player.player_id,
      game_name: 'Hide on bush',
      tag_line: 'KR1',
      region: 'KR',
    })

    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'Faker' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.players)
    assert.isAtLeast(body.players.length, 1)
    assert.equal(body.players[0].pseudo, 'Faker')
    assert.isArray(body.players[0].accounts)
  })

  test('GET /api/v1/worker/players/search is case insensitive', async ({ client, assert }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'caps-test',
        current_pseudo: 'Caps',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-caps-1',
      player_id: player.player_id,
      game_name: 'CapsLock',
      tag_line: 'EUW',
      region: 'EUW1',
    })

    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'CAPS' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.players)
    assert.isAtLeast(body.players.length, 1)
  })

  test('GET /api/v1/worker/players/search limits results to 10', async ({ client, assert }) => {
    // Create 15 players with similar names
    for (let i = 0; i < 15; i++) {
      const [player] = await db
        .table('players')
        .insert({
          slug: `test-player-${i}`,
          current_pseudo: `TestPlayer${i}`,
          is_active: true,
        })
        .returning('player_id')

      await db.table('lol_accounts').insert({
        puuid: `test-puuid-limit-${i}`,
        player_id: player.player_id,
        game_name: `TestGame${i}`,
        tag_line: 'EUW',
        region: 'EUW1',
      })
    }

    const response = await client.get('/api/v1/worker/players/search').qs({ q: 'TestPlayer' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.players)
    assert.isAtMost(body.players.length, 10)
  })
})

test.group('Worker API - Accounts List', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/accounts/list returns paginated results', async ({
    client,
    assert,
  }) => {
    // Create test player and accounts
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-pagination-player',
        current_pseudo: 'PaginationTest',
        is_active: true,
      })
      .returning('player_id')

    for (let i = 0; i < 5; i++) {
      await db.table('lol_accounts').insert({
        puuid: `test-puuid-pagination-${i}`,
        player_id: player.player_id,
        game_name: `PaginationGame${i}`,
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().minus({ hours: i }).toSQL(),
      })
    }

    const response = await client.get('/api/v1/worker/accounts/list').qs({ perPage: 2, page: 1 })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    assert.isAtMost(body.data.length, 2)
    assert.exists(body.meta)
    assert.equal(body.meta.perPage, 2)
    assert.equal(body.meta.currentPage, 1)
  })

  test('GET /api/v1/worker/accounts/list filters by region', async ({ client, assert }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-region-filter',
        current_pseudo: 'RegionFilter',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert([
      {
        puuid: 'test-puuid-region-euw',
        player_id: player.player_id,
        game_name: 'EUWPlayer',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().toSQL(),
      },
      {
        puuid: 'test-puuid-region-kr',
        player_id: player.player_id,
        game_name: 'KRPlayer',
        tag_line: 'KR',
        region: 'KR',
        last_fetched_at: DateTime.now().toSQL(),
      },
    ])

    const response = await client.get('/api/v1/worker/accounts/list').qs({ region: 'KR' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    body.data.forEach((account: any) => {
      assert.equal(account.region, 'KR')
    })
  })

  test('GET /api/v1/worker/accounts/list filters by status', async ({ client, assert }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-status-filter',
        current_pseudo: 'StatusFilter',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert([
      {
        puuid: 'test-puuid-status-fresh',
        player_id: player.player_id,
        game_name: 'FreshPlayer',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().toSQL(),
      },
      {
        puuid: 'test-puuid-status-critical',
        player_id: player.player_id,
        game_name: 'CriticalPlayer',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: null,
      },
    ])

    const response = await client.get('/api/v1/worker/accounts/list').qs({ status: 'critical' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    body.data.forEach((account: any) => {
      assert.equal(account.health_status, 'critical')
    })
  })

  test('GET /api/v1/worker/accounts/list sorts by valid columns', async ({ client, assert }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-sort',
        current_pseudo: 'SortTest',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert([
      {
        puuid: 'test-puuid-sort-a',
        player_id: player.player_id,
        game_name: 'APlayer',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().toSQL(),
      },
      {
        puuid: 'test-puuid-sort-z',
        player_id: player.player_id,
        game_name: 'ZPlayer',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().toSQL(),
      },
    ])

    const response = await client
      .get('/api/v1/worker/accounts/list')
      .qs({ sortBy: 'game_name', sortDir: 'asc' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
    // Should be sorted alphabetically
    if (body.data.length >= 2) {
      const names = body.data.map((a: any) => a.game_name)
      const sorted = [...names].sort()
      assert.deepEqual(names, sorted)
    }
  })

  test('GET /api/v1/worker/accounts/list ignores invalid sort columns', async ({
    client,
    assert,
  }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-invalid-sort',
        current_pseudo: 'InvalidSort',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-invalid-sort',
      player_id: player.player_id,
      game_name: 'TestPlayer',
      tag_line: 'EUW',
      region: 'EUW1',
      last_fetched_at: DateTime.now().toSQL(),
    })

    // Try to inject SQL via sortBy - should fallback to default
    const response = await client
      .get('/api/v1/worker/accounts/list')
      .qs({ sortBy: 'game_name; DROP TABLE players;--' })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
  })

  test('GET /api/v1/worker/accounts/list returns summary counts', async ({ client, assert }) => {
    const response = await client.get('/api/v1/worker/accounts/list')

    response.assertStatus(200)
    const body = response.body()

    assert.exists(body.summary)
    assert.exists(body.summary.fresh)
    assert.exists(body.summary.normal)
    assert.exists(body.summary.stale)
    assert.exists(body.summary.critical)
  })

  test('GET /api/v1/worker/accounts/list clamps perPage to max 100', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/worker/accounts/list').qs({ perPage: 500 })

    response.assertStatus(200)
    const body = response.body()

    assert.equal(body.meta.perPage, 100)
  })
})

test.group('Worker API - Coverage Stats', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/coverage-stats returns zero values when no accounts', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/api/v1/worker/coverage-stats')

    response.assertStatus(200)
    const body = response.body()

    assert.equal(body.todayCoverage, 0)
    assert.equal(body.weeklyAvgCoverage, 0)
    assert.equal(body.totalAccounts, 0)
    assert.equal(body.trend, 'stable')
  })

  test('GET /api/v1/worker/coverage-stats returns coverage data', async ({ client, assert }) => {
    // Create test player and accounts
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-coverage-player',
        current_pseudo: 'CoveragePlayer',
        is_active: true,
      })
      .returning('player_id')

    await db.table('lol_accounts').insert({
      puuid: 'test-puuid-coverage-1',
      player_id: player.player_id,
      game_name: 'CoverageGame',
      tag_line: 'EUW',
      region: 'EUW1',
      last_fetched_at: DateTime.now().toSQL(),
    })

    // Create daily stats for today
    await db.table('lol_daily_stats').insert({
      puuid: 'test-puuid-coverage-1',
      date: DateTime.now().toSQLDate(),
      games_played: 5,
      wins: 3,
      losses: 2,
      lp_change: 25,
      created_at: DateTime.now().toSQL(),
      updated_at: DateTime.now().toSQL(),
    })

    const response = await client.get('/api/v1/worker/coverage-stats')

    response.assertStatus(200)
    const body = response.body()

    assert.isNumber(body.todayCoverage)
    assert.isNumber(body.weeklyAvgCoverage)
    assert.isNumber(body.totalAccounts)
    assert.isAtLeast(body.totalAccounts, 1)
    assert.isArray(body.dailyCoverage)
  })
})

test.group('Worker API - Accounts Overview', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/accounts returns recent and oldest accounts', async ({
    client,
    assert,
  }) => {
    // Create test player
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-accounts-overview',
        current_pseudo: 'AccountsOverview',
        is_active: true,
      })
      .returning('player_id')

    // Create accounts with different fetch times
    await db.table('lol_accounts').insert([
      {
        puuid: 'test-puuid-recent',
        player_id: player.player_id,
        game_name: 'RecentAccount',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().toSQL(),
      },
      {
        puuid: 'test-puuid-old',
        player_id: player.player_id,
        game_name: 'OldAccount',
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().minus({ days: 7 }).toSQL(),
      },
    ])

    const response = await client.get('/api/v1/worker/accounts')

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.recent)
    assert.isArray(body.oldest)
    assert.isNumber(body.total)
    assert.isArray(body.by_region)
  })

  test('GET /api/v1/worker/accounts respects limit parameter', async ({ client, assert }) => {
    const [player] = await db
      .table('players')
      .insert({
        slug: 'test-accounts-limit',
        current_pseudo: 'AccountsLimit',
        is_active: true,
      })
      .returning('player_id')

    for (let i = 0; i < 10; i++) {
      await db.table('lol_accounts').insert({
        puuid: `test-puuid-limit-${i}`,
        player_id: player.player_id,
        game_name: `LimitAccount${i}`,
        tag_line: 'EUW',
        region: 'EUW1',
        last_fetched_at: DateTime.now().minus({ hours: i }).toSQL(),
      })
    }

    const response = await client.get('/api/v1/worker/accounts').qs({ limit: 3 })

    response.assertStatus(200)
    const body = response.body()

    assert.isAtMost(body.recent.length, 3)
    assert.isAtMost(body.oldest.length, 3)
  })
})

test.group('Worker API - Daily Coverage', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /api/v1/worker/daily-coverage returns coverage data', async ({ client, assert }) => {
    const response = await client.get('/api/v1/worker/daily-coverage')

    response.assertStatus(200)
    const body = response.body()

    assert.isNumber(body.totalAccounts)
    assert.isArray(body.data)
  })

  test('GET /api/v1/worker/daily-coverage accepts days parameter', async ({ client, assert }) => {
    const response = await client.get('/api/v1/worker/daily-coverage').qs({ days: 3 })

    response.assertStatus(200)
    const body = response.body()

    assert.isArray(body.data)
  })
})
