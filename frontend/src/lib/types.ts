export interface LeagueInfo {
  leagueId: number
  name: string
  shortName: string
  region: string
}

export interface Game {
  gameId: number
  slug: string
  displayName: string
}

export interface Organization {
  orgId: number
  slug: string
  currentName: string
  currentShortName?: string
  logoUrl?: string
  country?: string
  twitter?: string
  website?: string
}

export interface Team {
  teamId: number
  orgId: number
  gameId: number
  slug: string
  currentName: string
  shortName: string
  region?: string
  division?: string
  isActive: boolean
  organization?: Organization
}

export interface Player {
  playerId: number
  slug: string
  currentPseudo: string
  firstName?: string
  lastName?: string
  nationality?: string
  twitter?: string
  twitch?: string
}

export interface PlayerContract {
  contractId: number
  playerId: number
  teamId: number
  role?: string
  isStarter: boolean
  startDate?: string
  endDate?: string
  team?: Team
  player?: Player
}

export interface LolAccount {
  puuid: string
  playerId: number
  gameName?: string
  tagLine?: string
  region: string
  isPrimary: boolean
  player?: Player
}

export interface LolMatch {
  matchId: string
  gameStart: string
  gameDuration: number
  queueId: number
  gameVersion?: string
}

export interface LolMatchStat {
  matchId: string
  puuid: string
  championId: number
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  visionScore: number
  damageDealt: number
  goldEarned: number
  role?: string
}

export interface LolDailyStat {
  puuid: string
  date: string
  gamesPlayed: number
  wins: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  totalGameDuration?: number
  tier?: string
  rank?: string
  lp: number
}

export interface LolCurrentRank {
  puuid: string
  queueType: string
  tier?: string
  rank?: string
  leaguePoints: number
  wins: number
  losses: number
}

export interface LolStreak {
  puuid: string
  currentStreak: number
  currentStreakStart?: string
  bestWinStreak: number
  bestWinStreakStart?: string
  bestWinStreakEnd?: string
  worstLossStreak: number
  worstLossStreakStart?: string
  worstLossStreakEnd?: string
}

export interface LolRecord {
  id: number
  puuid: string
  matchId?: string
  recordType: string
  value: number
  achievedAt: string
}

export interface LolChampionStat {
  puuid: string
  championId: number
  gamesPlayed: number
  wins: number
  totalKills: number
  totalDeaths: number
  totalAssists: number
  totalCs: number
  totalDamage: number
  bestKda?: number
  bestKdaMatchId?: string
  lastPlayed?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

// Period types
export type DashboardPeriod = 'day' | 'month' | 'year' | 'custom'

// Dashboard types

export interface DashboardSummary {
  totalGames: number
  totalGamesChange: number
  avgWinrate: number
  avgWinrateChange: number
  totalMinutes: number
  totalMinutesChange: number
  totalLp: number
  lastUpdated: string
}

export interface GamesPerDayData {
  date: string
  label: string // "Lun", "Mar", etc.
  games: number
  wins: number
  winrate: number
}

// Données unifiées pour l'historique d'une équipe (games + LP)
export interface TeamHistoryData {
  date: string
  label: string
  games: number
  wins: number
  winrate: number
  totalLp: number
}

export interface PlayerInTeam {
  playerId: number
  slug: string
  pseudo: string
  role: string
  games: number
  winrate: number
  tier: string | null
  rank: string | null
  lp: number
  totalLp: number
}

export interface TeamLeaderboardEntry {
  rank: number
  team: {
    teamId: number
    slug: string
    currentName: string
    shortName: string
    logoUrl?: string
    region: string
    league?: string
  }
  games: number
  gamesChange: number
  winrate: number
  winrateChange: number
  totalMinutes: number
  totalMinutesChange: number
  totalLp: number
  totalLpChange: number
  players: PlayerInTeam[]
}

export interface PlayerAccount {
  puuid: string
  gameName: string
  tagLine: string
  region: string
  tier: string | null
  rank: string | null
  lp: number
  totalLp: number
  games: number
  wins: number
  winrate: number
}

export interface PlayerLeaderboardEntry {
  rank: number
  player: {
    playerId: number
    slug: string
    pseudo: string
  }
  team: {
    teamId: number
    slug: string
    shortName: string
    logoUrl?: string
    region: string
    league?: string
  } | null
  role: string
  games: number
  gamesChange: number
  winrate: number
  winrateChange: number
  totalMinutes: number
  totalMinutesChange: number
  tier: string | null
  rank_division: string | null
  lp: number
  totalLp: number
  totalLpChange: number
  accounts: PlayerAccount[]
}

export interface TeamLeaderboardResponse {
  period: DashboardPeriod
  startDate: string
  endDate: string
  data: TeamLeaderboardEntry[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface TopGrinderEntry {
  rank: number
  player: {
    playerId: number
    pseudo: string
    slug: string
  }
  team: {
    shortName: string
    slug: string
  }
  role: string
  games: number
}

export interface StreakEntry {
  rank: number
  player: {
    playerId: number
    pseudo: string
    slug: string
  }
  team: {
    shortName: string
    slug: string
  }
  streak: number // positive = wins
}

// LP Change leaderboard entry (for top LP gainers/losers)
export interface LpChangeEntry {
  rank: number
  entity: {
    id: number
    slug: string
    name: string
    shortName?: string
    logoUrl?: string
  }
  entityType: 'team' | 'player'
  team?: {
    shortName: string
    slug: string
  }
  lpChange: number // positive = gained, negative = lost
  games: number
}

// Split and league types
export interface Split {
  split_id: number
  season: number
  split_number: number
  name: string
  start_date: string
  end_date: string
}

// Worker Monitoring Types

export interface WorkerRegionStats {
  accounts_total: number
  accounts_done: number
  matches: number
}

export interface ActiveBatch {
  type: 'lol' | 'valorant'
  progress: number
  total: number
  priority_counts?: {
    active: number
    today: number
    inactive: number
  }
}

export interface WorkerStatus {
  is_running: boolean
  started_at: string | null
  uptime: number // seconds

  // Active batches by region (parallel processing)
  active_batches: Record<string, ActiveBatch>

  session_lol_matches: number
  session_valorant_matches: number
  session_lol_accounts: number
  session_valorant_accounts: number
  session_errors: number
  session_api_requests: number

  // Region stats
  region_stats: Record<string, WorkerRegionStats>
  current_account_name: string | null
  current_account_region: string | null

  // Smart refresh priority counts
  active_accounts_count: number
  today_accounts_count: number
  inactive_accounts_count: number

  last_activity_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  updated_at: string | null
}

export interface WorkerLog {
  id: number
  timestamp: string
  log_type: 'lol' | 'valorant' | 'error' | 'info'
  severity: 'info' | 'warning' | 'error'
  message: string
  account_name: string | null
  account_puuid: string | null
  details: Record<string, unknown> | null
}

export interface WorkerMetricsHourly {
  id: number
  hour: string
  lol_matches_added: number
  valorant_matches_added: number
  lol_accounts_processed: number
  valorant_accounts_processed: number
  api_requests_made: number
  api_errors: number
}

export interface WorkerDailyStats {
  date: string
  lol_matches: number
  valorant_matches: number
  lol_accounts: number
  valorant_accounts: number
  errors: number
}

export interface WorkerMetricsTotals {
  lol_matches: number
  valorant_matches: number
  lol_accounts: number
  valorant_accounts: number
  errors: number
  api_requests: number
}

export type WorkerLogFilter = 'all' | 'lol' | 'valorant' | 'error'
export type WorkerMetricsPeriod = 'day' | 'week' | 'month'

export interface WorkerAccountInfo {
  puuid: string
  game_name: string
  tag_line: string
  region: string
  last_fetched: string | null
  last_match_at: string | null
  player_name: string | null
}

export interface WorkerAccountStats {
  recent: WorkerAccountInfo[]
  oldest: WorkerAccountInfo[]
  total: number
  by_region: { region: string; count: number }[]
}

export interface PlayerSearchResult {
  player_id: number
  pseudo: string
  slug: string
  team_name: string | null
  team_region: string | null
  accounts: WorkerAccountInfo[]
}

// Player Profile Types

export interface PlayerProfileData {
  player: {
    playerId: number
    slug: string
    pseudo: string
    team: {
      teamId: number
      name: string
      shortName: string
      slug: string
      region: string
    } | null
    role: string | null
  }
  period: DashboardPeriod
  startDate: string
  endDate: string
  stats: {
    games: number
    wins: number
    winrate: number
    gamesChange: number
    winrateChange: number
    totalDuration: number
    avgKills: number
    avgDeaths: number
    avgAssists: number
  } | null
  rank: {
    tier: string
    rank: string
    lp: number
    wins: number
    losses: number
  } | null
  totalLp: number
  ranking: {
    global: {
      rank: number
      total: number
    }
    league: {
      rank: number
      total: number
    } | null
  } | null
}

export interface PlayHoursData {
  player: { slug: string; pseudo: string }
  period: DashboardPeriod
  startDate: string
  endDate: string
  groupBy: 'hour' | 'weekday-hour'
  data: PlayHourEntry[] | PlayHourMatrix
}

export interface PlayHourEntry {
  hour: number
  games: number
  wins: number
  winrate: number
}

export interface PlayHourMatrixEntry {
  dow: number
  hour: number
  games: number
  wins: number
  winrate: number
}

export type PlayHourMatrix = PlayHourMatrixEntry[][]

export interface PlayerDuosData {
  player: { slug: string; pseudo: string }
  duos: DuoEntry[]
  winAgainst: AdversaryEntry[]
  loseAgainst: AdversaryEntry[]
}

export interface DuoEntry {
  puuid: string
  gameName: string
  tagLine: string
  player: {
    playerId: number
    slug: string
    pseudo: string
  } | null
  team: string | null
  games: number
  wins: number
  winrate: number
}

export interface AdversaryEntry extends DuoEntry {
  losses?: number
}

export interface PlayerCompareData {
  period: DashboardPeriod
  startDate: string
  endDate: string
  players: {
    slug: string
    pseudo: string
    team: string | null
    stats: {
      games: number
      wins: number
      winrate: number
      avgKills: number
      avgDeaths: number
      avgAssists: number
      totalLp: number
    }
    playHours: { hour: number; games: number }[]
  }[]
}

export interface PlayerChampionStats {
  player: { slug: string; pseudo: string }
  stats: {
    championId: number
    games: number
    wins: number
    winrate: number
    avgKills: number
    avgDeaths: number
    avgAssists: number
    avgCs: number
    avgDamage: number
    avgKp: number | null
    avgDmgShare: number | null
  }[]
}

// Admin Types

export const PLAYER_ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const
export type PlayerRole = (typeof PLAYER_ROLES)[number]

export interface AdminPlayer {
  playerId: number
  slug: string
  currentPseudo: string
  firstName: string | null
  lastName: string | null
  nationality: string | null
  twitter: string | null
  twitch: string | null
  contract: {
    contractId: number
    teamId: number
    teamName: string
    teamShortName: string
    teamRegion: string | null
    role: string | null
    isStarter: boolean
    startDate: string | null
    endDate: string | null
  } | null
  accounts: {
    puuid: string
    gameName: string | null
    tagLine: string | null
    region: string
  }[]
}

export interface AdminTeam {
  teamId: number
  slug: string
  currentName: string
  shortName: string
  region: string | null
  league: string | null
}

export interface UpdatePlayerPayload {
  currentPseudo?: string
  firstName?: string | null
  lastName?: string | null
  nationality?: string | null
  twitter?: string | null
  twitch?: string | null
}

export interface UpsertContractPayload {
  teamId: number
  role?: string | null
  isStarter: boolean
  startDate?: string | null
  endDate?: string | null
}

export interface AdminPlayersResponse {
  data: AdminPlayer[]
  teams: AdminTeam[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

// Admin User Management Types

export interface AdminUser {
  id: number
  email: string
  fullName: string | null
  role: 'user' | 'admin'
  emailVerified: boolean
  twoFactorEnabled: boolean
  createdAt: string
  lastLoginAt: string | null
  lockedUntil: string | null
  failedLoginAttempts: number
}

export interface CreateUserPayload {
  email: string
  password: string
  fullName?: string
  role?: 'user' | 'admin'
}

export type UserRoleFilter = 'all' | 'user' | 'admin'

// Enhanced Worker Monitoring Types

export type AccountHealthStatus = 'fresh' | 'normal' | 'stale' | 'critical'

export interface EnhancedWorkerAccountInfo extends WorkerAccountInfo {
  health_status: AccountHealthStatus
}

export interface WorkerAccountsListResponse {
  data: EnhancedWorkerAccountInfo[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
  summary: {
    fresh: number
    normal: number
    stale: number
    critical: number
  }
}

export interface DailyCoverageEntry {
  date: string
  accountsUpdated: number
  coverage: number
}

export interface CoverageStatsData {
  todayCoverage: number
  weeklyAvgCoverage: number
  accountsWithActivityToday: number
  totalAccounts: number
  trend: 'up' | 'down' | 'stable'
  trendValue: number
  dailyUpdateCoverage: number
  accountsUpdatedToday: number
  dailyCoverage: DailyCoverageEntry[]
}

export interface ProcessingTimelineEntry {
  timestamp: string
  label: string
  accountsProcessed: number
  matchesAdded: number
}
