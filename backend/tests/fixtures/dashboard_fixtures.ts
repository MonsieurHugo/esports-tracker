import { DateTime } from 'luxon'
import Organization from '#models/organization'
import Team from '#models/team'
import Player from '#models/player'
import PlayerContract from '#models/player_contract'
import LolAccount from '#models/lol_account'
import LolDailyStat from '#models/lol_daily_stat'
import LolStreak from '#models/lol_streak'

/**
 * Dashboard Integration Test Fixtures
 *
 * This module provides reusable test data creation helpers for DashboardService tests.
 * All data follows the business rules:
 * - Only Master+ tiers (MASTER, GRANDMASTER, CHALLENGER) count for LP
 * - Team LP = sum of top 5 players' best account LP
 * - Best account = highest tier, then highest LP
 * - Active contracts have end_date IS NULL
 */

export interface FixtureOptions {
  /** Number of teams per league (default: 2) */
  teamsPerLeague?: number
  /** Number of players per team (default: 5) */
  playersPerTeam?: number
  /** Number of accounts per player (default: 2) */
  accountsPerPlayer?: number
  /** Number of days of stats to create (default: 14) */
  daysOfStats?: number
  /** Whether to create an inactive team (default: true) */
  createInactiveTeam?: boolean
  /** Leagues to create teams for (default: ['LEC', 'LFL']) */
  leagues?: string[]
  /** Reference date for stats (default: today) */
  referenceDate?: DateTime
}

export interface DashboardFixtureData {
  organizations: Organization[]
  teams: {
    active: Team[]
    inactive: Team[]
    all: Team[]
  }
  players: Player[]
  contracts: PlayerContract[]
  accounts: {
    masterPlus: LolAccount[]
    diamond: LolAccount[]
    all: LolAccount[]
  }
  dailyStats: LolDailyStat[]
  streaks: LolStreak[]
  dateRange: {
    startDate: string
    endDate: string
    prevStartDate: string
    prevEndDate: string
  }
}

const TIERS = ['CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD'] as const
const ROLES = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'] as const

/**
 * Generate a unique PUUID for test accounts
 */
function generatePuuid(prefix: string, index: number): string {
  return `test-puuid-${prefix}-${index}-${Date.now()}`
}

/**
 * Calculate total LP for a tier/LP combination
 * Follows the standard LP calculation:
 * - Challenger: 2800 base + LP
 * - Grandmaster: 2500 base + LP
 * - Master: 0 base + LP (Master starts at 0)
 */
export function calculateTotalLp(tier: string, lp: number): number {
  switch (tier.toUpperCase()) {
    case 'CHALLENGER':
      return lp // Challenger uses raw LP
    case 'GRANDMASTER':
      return lp // GM uses raw LP
    case 'MASTER':
      return lp // Master uses raw LP
    default:
      return 0 // Sub-Master doesn't count
  }
}

/**
 * Create complete test data for dashboard tests
 *
 * Creates a realistic data structure with:
 * - Multiple organizations and teams across leagues
 * - Players with contracts and roles
 * - Multiple accounts per player (mix of tiers)
 * - Daily stats over a 14-day period
 * - Win/loss streaks
 */
export async function createDashboardFixtures(
  options: FixtureOptions = {}
): Promise<DashboardFixtureData> {
  const {
    teamsPerLeague = 2,
    playersPerTeam = 5,
    accountsPerPlayer = 2,
    daysOfStats = 14,
    createInactiveTeam = true,
    leagues = ['LEC', 'LFL'],
    referenceDate = DateTime.now(),
  } = options

  const organizations: Organization[] = []
  const activeTeams: Team[] = []
  const inactiveTeams: Team[] = []
  const players: Player[] = []
  const contracts: PlayerContract[] = []
  const masterPlusAccounts: LolAccount[] = []
  const diamondAccounts: LolAccount[] = []
  const dailyStats: LolDailyStat[] = []
  const streaks: LolStreak[] = []

  // Calculate date range
  const endDate = referenceDate
  const startDate = endDate.minus({ days: daysOfStats - 1 })
  const prevEndDate = startDate.minus({ days: 1 })
  const prevStartDate = prevEndDate.minus({ days: daysOfStats - 1 })

  // Create organizations and teams for each league
  let orgIndex = 0
  let playerIndex = 0
  let accountIndex = 0

  for (const league of leagues) {
    for (let teamIdx = 0; teamIdx < teamsPerLeague; teamIdx++) {
      // Create organization
      const org = await Organization.create({
        slug: `test-org-${league.toLowerCase()}-${teamIdx}`,
        currentName: `${league} Organization ${teamIdx + 1}`,
        currentShortName: `${league}O${teamIdx + 1}`,
        logoUrl: `https://example.com/logo-${league.toLowerCase()}-${teamIdx}.png`,
      })
      organizations.push(org)

      // Create active team
      const team = await Team.create({
        orgId: org.orgId,
        gameId: 1, // LoL
        slug: `test-team-${league.toLowerCase()}-${teamIdx}`,
        currentName: `${league} Team ${teamIdx + 1}`,
        shortName: `${league}${teamIdx + 1}`,
        region: league === 'LEC' ? 'EMEA' : 'FR',
        league: league,
        isActive: true,
      })
      activeTeams.push(team)

      // Create players with contracts
      for (let playerIdx = 0; playerIdx < playersPerTeam; playerIdx++) {
        const role = ROLES[playerIdx % ROLES.length]
        const player = await Player.create({
          slug: `player-${league.toLowerCase()}-${teamIdx}-${role.toLowerCase()}`,
          currentPseudo: `${league}${teamIdx + 1}${role}`,
        })
        players.push(player)

        // Create contract
        const contract = await PlayerContract.create({
          playerId: player.playerId,
          teamId: team.teamId,
          role: role,
          isStarter: true,
          startDate: DateTime.now().minus({ months: 6 }),
          endDate: null, // Active contract
        })
        contracts.push(contract)

        // Create accounts for this player
        for (let accIdx = 0; accIdx < accountsPerPlayer; accIdx++) {
          // First account is Master+, second is Diamond (for testing tier filtering)
          const isMasterPlus = accIdx === 0
          const tier = isMasterPlus
            ? TIERS[orgIndex % 3] // Rotate through CHALLENGER, GRANDMASTER, MASTER
            : 'DIAMOND'

          const puuid = generatePuuid(`${league}-${teamIdx}-${playerIdx}`, accIdx)
          const account = await LolAccount.create({
            puuid: puuid,
            playerId: player.playerId,
            gameName: `${league}${teamIdx + 1}${role}${accIdx === 0 ? 'Main' : 'Smurf'}`,
            tagLine: league === 'LEC' ? 'EUW' : 'EUW',
            region: 'EUW1',
            isPrimary: accIdx === 0,
          })

          if (isMasterPlus) {
            masterPlusAccounts.push(account)
          } else {
            diamondAccounts.push(account)
          }

          // Create daily stats for this account
          const accountBaseLp = isMasterPlus ? 300 + (orgIndex * 50) + (playerIdx * 20) : 50
          const baseLp = accountBaseLp
          const baseGames = 5 + (playerIdx % 3)

          for (let dayOffset = 0; dayOffset < daysOfStats; dayOffset++) {
            const date = endDate.minus({ days: daysOfStats - 1 - dayOffset })
            // LP increases over time for Master+ accounts
            const lpChange = isMasterPlus ? dayOffset * 10 : dayOffset * 2
            const gamesPlayed = baseGames + (dayOffset % 2)
            const wins = Math.floor(gamesPlayed * (0.5 + (playerIdx * 0.05)))

            const stat = await LolDailyStat.create({
              puuid: puuid,
              date: date,
              gamesPlayed: gamesPlayed,
              wins: wins,
              totalKills: gamesPlayed * 5,
              totalDeaths: gamesPlayed * 3,
              totalAssists: gamesPlayed * 7,
              totalGameDuration: gamesPlayed * 1800, // 30 min per game
              tier: tier,
              rank: 'I',
              lp: baseLp + lpChange,
            })
            dailyStats.push(stat)
          }

          accountIndex++
        }

        // Create streak for first player of each team (after their accounts are created)
        if (playerIdx === 0 && masterPlusAccounts.length > 0) {
          // Get the last added master+ account (which belongs to the current player)
          const lastMasterAccount = masterPlusAccounts[masterPlusAccounts.length - 1]
          if (!lastMasterAccount.puuid) continue // Skip if no PUUID
          const streak = await LolStreak.create({
            puuid: lastMasterAccount.puuid,
            currentStreak: teamIdx % 2 === 0 ? 5 : -3, // Alternate win/loss streaks
            currentStreakStart: DateTime.now().minus({ days: 2 }),
            bestWinStreak: 8,
            worstLossStreak: -5,
          })
          streaks.push(streak)
        }

        playerIndex++
      }

      orgIndex++
    }
  }

  // Create inactive team if requested
  if (createInactiveTeam) {
    const inactiveOrg = await Organization.create({
      slug: 'test-inactive-org',
      currentName: 'Inactive Organization',
      currentShortName: 'INACT',
      logoUrl: undefined,
    })
    organizations.push(inactiveOrg)

    const inactiveTeam = await Team.create({
      orgId: inactiveOrg.orgId,
      gameId: 1,
      slug: 'test-inactive-team',
      currentName: 'Inactive Team',
      shortName: 'INA',
      region: 'EMEA',
      league: 'LEC',
      isActive: false, // Inactive!
    })
    inactiveTeams.push(inactiveTeam)
  }

  return {
    organizations,
    teams: {
      active: activeTeams,
      inactive: inactiveTeams,
      all: [...activeTeams, ...inactiveTeams],
    },
    players,
    contracts,
    accounts: {
      masterPlus: masterPlusAccounts,
      diamond: diamondAccounts,
      all: [...masterPlusAccounts, ...diamondAccounts],
    },
    dailyStats,
    streaks,
    dateRange: {
      startDate: startDate.toISODate()!,
      endDate: endDate.toISODate()!,
      prevStartDate: prevStartDate.toISODate()!,
      prevEndDate: prevEndDate.toISODate()!,
    },
  }
}

/**
 * Create a specific LP gainer scenario for testing
 *
 * Creates a player who gained LP over the period.
 * Best account is determined at END of period.
 *
 * @param teamId - Team to associate player with
 * @param startLp - LP at start of period
 * @param endLp - LP at end of period
 * @param tier - Tier (must be Master+)
 * @param startDate - Start date
 * @param endDate - End date
 */
export async function createLpGainerScenario(
  teamId: number,
  startLp: number,
  endLp: number,
  tier: 'CHALLENGER' | 'GRANDMASTER' | 'MASTER' = 'MASTER',
  startDate: DateTime,
  endDate: DateTime
): Promise<{ player: Player; account: LolAccount; stats: LolDailyStat[] }> {
  const player = await Player.create({
    slug: `lp-gainer-${Date.now()}`,
    currentPseudo: `LpGainer${Math.floor(Math.random() * 1000)}`,
  })

  await PlayerContract.create({
    playerId: player.playerId,
    teamId: teamId,
    role: 'MID',
    isStarter: true,
    startDate: DateTime.now().minus({ months: 3 }),
    endDate: null,
  })

  const puuid = generatePuuid('gainer', Date.now())
  const account = await LolAccount.create({
    puuid: puuid,
    playerId: player.playerId,
    gameName: `Gainer${player.playerId}`,
    tagLine: 'EUW',
    region: 'EUW1',
    isPrimary: true,
  })

  const stats: LolDailyStat[] = []
  const daysDiff = Math.ceil(endDate.diff(startDate, 'days').days)
  const lpPerDay = (endLp - startLp) / daysDiff

  for (let i = 0; i <= daysDiff; i++) {
    const date = startDate.plus({ days: i })
    const lpOnDay = Math.round(startLp + (lpPerDay * i))

    const stat = await LolDailyStat.create({
      puuid: puuid,
      date: date,
      gamesPlayed: 5,
      wins: 3,
      totalKills: 25,
      totalDeaths: 15,
      totalAssists: 35,
      totalGameDuration: 9000,
      tier: tier,
      rank: 'I',
      lp: lpOnDay,
    })
    stats.push(stat)
  }

  return { player, account, stats }
}

/**
 * Create a specific LP loser scenario for testing
 *
 * Creates a player who lost LP over the period.
 * Best account is determined at START of period for losers.
 *
 * @param teamId - Team to associate player with
 * @param startLp - LP at start of period
 * @param endLp - LP at end of period (lower than startLp)
 * @param tier - Tier (must be Master+)
 * @param startDate - Start date
 * @param endDate - End date
 */
export async function createLpLoserScenario(
  teamId: number,
  startLp: number,
  endLp: number,
  tier: 'CHALLENGER' | 'GRANDMASTER' | 'MASTER' = 'MASTER',
  startDate: DateTime,
  endDate: DateTime
): Promise<{ player: Player; account: LolAccount; stats: LolDailyStat[] }> {
  const player = await Player.create({
    slug: `lp-loser-${Date.now()}`,
    currentPseudo: `LpLoser${Math.floor(Math.random() * 1000)}`,
  })

  await PlayerContract.create({
    playerId: player.playerId,
    teamId: teamId,
    role: 'ADC',
    isStarter: true,
    startDate: DateTime.now().minus({ months: 3 }),
    endDate: null,
  })

  const puuid = generatePuuid('loser', Date.now())
  const account = await LolAccount.create({
    puuid: puuid,
    playerId: player.playerId,
    gameName: `Loser${player.playerId}`,
    tagLine: 'EUW',
    region: 'EUW1',
    isPrimary: true,
  })

  const stats: LolDailyStat[] = []
  const daysDiff = Math.ceil(endDate.diff(startDate, 'days').days)
  const lpPerDay = (endLp - startLp) / daysDiff

  for (let i = 0; i <= daysDiff; i++) {
    const date = startDate.plus({ days: i })
    const lpOnDay = Math.round(startLp + (lpPerDay * i))

    const stat = await LolDailyStat.create({
      puuid: puuid,
      date: date,
      gamesPlayed: 5,
      wins: 2, // Lower winrate for losers
      totalKills: 20,
      totalDeaths: 20,
      totalAssists: 30,
      totalGameDuration: 9000,
      tier: tier,
      rank: 'I',
      lp: lpOnDay,
    })
    stats.push(stat)
  }

  return { player, account, stats }
}

/**
 * Create a player with multiple accounts at different tiers
 * Useful for testing best account selection logic
 */
export async function createMultiAccountPlayer(
  teamId: number,
  accounts: Array<{
    tier: string
    lp: number
    games: number
  }>,
  startDate: DateTime,
  endDate: DateTime
): Promise<{ player: Player; accounts: LolAccount[]; stats: LolDailyStat[] }> {
  const player = await Player.create({
    slug: `multi-account-${Date.now()}`,
    currentPseudo: `MultiAcc${Math.floor(Math.random() * 1000)}`,
  })

  await PlayerContract.create({
    playerId: player.playerId,
    teamId: teamId,
    role: 'TOP',
    isStarter: true,
    startDate: DateTime.now().minus({ months: 3 }),
    endDate: null,
  })

  const createdAccounts: LolAccount[] = []
  const allStats: LolDailyStat[] = []

  for (let i = 0; i < accounts.length; i++) {
    const accConfig = accounts[i]
    const puuid = generatePuuid(`multi-${player.playerId}`, i)

    const account = await LolAccount.create({
      puuid: puuid,
      playerId: player.playerId,
      gameName: `MultiAcc${player.playerId}${i}`,
      tagLine: 'EUW',
      region: 'EUW1',
      isPrimary: i === 0,
    })
    createdAccounts.push(account)

    // Create stats for each day
    const daysDiff = Math.ceil(endDate.diff(startDate, 'days').days)
    for (let d = 0; d <= daysDiff; d++) {
      const date = startDate.plus({ days: d })
      const stat = await LolDailyStat.create({
        puuid: puuid,
        date: date,
        gamesPlayed: accConfig.games,
        wins: Math.floor(accConfig.games * 0.55),
        totalKills: accConfig.games * 5,
        totalDeaths: accConfig.games * 3,
        totalAssists: accConfig.games * 7,
        totalGameDuration: accConfig.games * 1800,
        tier: accConfig.tier,
        rank: 'I',
        lp: accConfig.lp,
      })
      allStats.push(stat)
    }
  }

  return { player, accounts: createdAccounts, stats: allStats }
}

/**
 * Create a team with a partial roster (less than 5 players)
 * Useful for testing edge cases in team LP calculation
 */
export async function createPartialRosterTeam(
  league: string,
  playerCount: number
): Promise<{ team: Team; players: Player[]; accounts: LolAccount[] }> {
  const org = await Organization.create({
    slug: `partial-roster-org-${Date.now()}`,
    currentName: 'Partial Roster Org',
    currentShortName: 'PRT',
    logoUrl: undefined,
  })

  const team = await Team.create({
    orgId: org.orgId,
    gameId: 1,
    slug: `partial-roster-team-${Date.now()}`,
    currentName: 'Partial Roster Team',
    shortName: 'PRT',
    region: 'EMEA',
    league: league,
    isActive: true,
  })

  const players: Player[] = []
  const accounts: LolAccount[] = []

  for (let i = 0; i < playerCount; i++) {
    const player = await Player.create({
      slug: `partial-player-${Date.now()}-${i}`,
      currentPseudo: `PartialPlayer${i}`,
    })
    players.push(player)

    await PlayerContract.create({
      playerId: player.playerId,
      teamId: team.teamId,
      role: ROLES[i],
      isStarter: true,
      startDate: DateTime.now().minus({ months: 3 }),
      endDate: null,
    })

    const puuid = generatePuuid(`partial-${team.teamId}`, i)
    const account = await LolAccount.create({
      puuid: puuid,
      playerId: player.playerId,
      gameName: `Partial${i}`,
      tagLine: 'EUW',
      region: 'EUW1',
      isPrimary: true,
    })
    accounts.push(account)
  }

  return { team, players, accounts }
}

/**
 * Create daily stats for a specific account
 */
export async function createDailyStatsForAccount(
  puuid: string,
  tier: string,
  baseLp: number,
  startDate: DateTime,
  endDate: DateTime,
  options: {
    gamesPerDay?: number
    winrate?: number
    lpChangePerDay?: number
  } = {}
): Promise<LolDailyStat[]> {
  const { gamesPerDay = 5, winrate = 0.55, lpChangePerDay = 10 } = options

  const stats: LolDailyStat[] = []
  const daysDiff = Math.ceil(endDate.diff(startDate, 'days').days)

  for (let d = 0; d <= daysDiff; d++) {
    const date = startDate.plus({ days: d })
    const wins = Math.floor(gamesPerDay * winrate)

    const stat = await LolDailyStat.create({
      puuid: puuid,
      date: date,
      gamesPlayed: gamesPerDay,
      wins: wins,
      totalKills: gamesPerDay * 5,
      totalDeaths: gamesPerDay * 3,
      totalAssists: gamesPerDay * 7,
      totalGameDuration: gamesPerDay * 1800,
      tier: tier,
      rank: 'I',
      lp: baseLp + (lpChangePerDay * d),
    })
    stats.push(stat)
  }

  return stats
}

// ============================================
// PARAMETER-BASED TEST FIXTURES
// For testing filters, SQL injection, and edge cases
// ============================================

/**
 * Valid filter configurations for testing
 */
export const validTeamFilters = {
  page: 1,
  perPage: 20,
  period: 'month' as const,
  referenceDate: DateTime.now().toISODate()!,
}

export const validPlayerFilters = {
  page: 1,
  perPage: 20,
  period: 'month' as const,
  referenceDate: DateTime.now().toISODate()!,
}

export const validHistoryDateRange = {
  startDate: DateTime.now().minus({ days: 30 }).toISODate()!,
  endDate: DateTime.now().toISODate()!,
}

/**
 * Filter variations for testing different scenarios
 */
export const filtersWithLeagues = {
  ...validTeamFilters,
  leagues: ['LEC', 'LFL'],
}

export const filtersWithRoles = {
  ...validPlayerFilters,
  roles: ['Mid', 'ADC'],
}

export const filtersWithMinGames = {
  ...validTeamFilters,
  minGames: 10,
}

export const filtersWithSearch = {
  ...validPlayerFilters,
  search: 'Caps',
}

export const filtersWithPagination = {
  ...validTeamFilters,
  page: 2,
  perPage: 5,
}

/**
 * SQL injection attempt patterns for security testing
 */
export const sqlInjectionAttempts = {
  leagues: [
    "LEC'; DROP TABLE teams; --",
    "LEC' OR '1'='1",
    "LEC'; DELETE FROM users; --",
    "LEC' UNION SELECT * FROM users; --",
  ],
  roles: ["Mid' OR '1'='1", "Mid'; DROP TABLE players; --"],
  search: ["'; DROP TABLE players; --", "' OR 1=1; --"],
}

/**
 * Edge case filter configurations
 */
export const edgeCaseFilters = {
  emptyLeagues: { ...validTeamFilters, leagues: [] },
  singleLeague: { ...validTeamFilters, leagues: ['LEC'] },
  manyLeagues: { ...validTeamFilters, leagues: ['LEC', 'LFL', 'LCK', 'LPL', 'LCS'] },

  zeroMinGames: { ...validTeamFilters, minGames: 0 },
  highMinGames: { ...validTeamFilters, minGames: 1000 },

  firstPage: { ...validTeamFilters, page: 1 },
  highPage: { ...validTeamFilters, page: 999 },

  smallPerPage: { ...validTeamFilters, perPage: 1 },
  largePerPage: { ...validTeamFilters, perPage: 100 }, // Max allowed by validator
  // Note: perPage validation (max 100) happens at controller level, not service level
}

/**
 * Period filter variations
 */
export const periodFilters = {
  day: { ...validTeamFilters, period: 'day' as const },
  week: { ...validTeamFilters, period: 'week' as const },
  month: { ...validTeamFilters, period: 'month' as const },
  year: { ...validTeamFilters, period: 'year' as const },
}

/**
 * Batch history request configurations
 */
export const batchHistoryRequests = {
  singleTeam: [{ type: 'team' as const, entityId: 1 }],
  singlePlayer: [{ type: 'player' as const, entityId: 1 }],
  mixed: [
    { type: 'team' as const, entityId: 1 },
    { type: 'player' as const, entityId: 1 },
    { type: 'team' as const, entityId: 2 },
  ],
  empty: [],
}

/**
 * Cache key test cases for verifying normalization and hashing
 */
export const cacheKeyTestCases = {
  // These two should produce the same key (different order)
  params1: { leagues: ['LFL', 'LEC'], page: 1, period: 'month' },
  params1Reordered: { period: 'month', page: 1, leagues: ['LEC', 'LFL'] },

  // These two should produce different keys
  params2: { page: 1 },
  params3: { page: 2 },

  // Values to be ignored in cache key generation
  withUndefined: { page: 1, leagues: undefined },
  withNull: { page: 1, leagues: null },
  withEmptyArray: { page: 1, leagues: [] },
  withEmptyString: { page: 1, search: '' },
}
