// Pro Stats Types - Professional Match Data

// ============================================================================
// TOURNAMENTS
// ============================================================================

export interface ProTournament {
  tournamentId: number
  externalId: string
  name: string
  slug: string
  region: string | null
  season: string | null
  split: string | null
  tier: number
  status: 'upcoming' | 'ongoing' | 'completed'
  startDate: string | null
  endDate: string | null
  logoUrl: string | null
}

export interface ProStage {
  stageId: number
  name: string
  stageType: string | null
  stageOrder: number
  status: 'upcoming' | 'ongoing' | 'completed'
  standings: unknown | null
}

export interface ProTournamentStanding {
  teamId: number
  teamName: string
  shortName: string
  teamSlug: string
  matchesPlayed: number
  matchesWon: number
  gamesPlayed: number
  gamesWon: number
  matchWinRate: number
  gameWinRate: number
}

export interface ProTournamentDetail {
  tournament: ProTournament
  stages: ProStage[]
  standings: ProTournamentStanding[]
}

// ============================================================================
// MATCHES
// ============================================================================

export interface ProTeamInfo {
  teamId: number | null
  name: string | null
  shortName: string | null
  slug: string | null
}

export interface ProMatch {
  matchId: number
  externalId: string
  tournamentId: number
  tournamentName: string
  tournamentSlug: string
  team1: ProTeamInfo
  team2: ProTeamInfo
  team1Score: number
  team2Score: number
  winnerTeamId: number | null
  format: string
  status: 'upcoming' | 'live' | 'completed' | 'postponed'
  scheduledAt: string | null
  startedAt: string | null
  endedAt: string | null
  streamUrl: string | null
}

export interface ProGameObjectives {
  blueTowers: number
  redTowers: number
  blueDragons: number
  redDragons: number
  blueBarons: number
  redBarons: number
  blueHeralds?: number
  redHeralds?: number
  blueGrubs?: number
  redGrubs?: number
}

export interface ProFirstObjectives {
  blood: 'blue' | 'red' | null
  tower: 'blue' | 'red' | null
  dragon: 'blue' | 'red' | null
  herald: 'blue' | 'red' | null
  baron: 'blue' | 'red' | null
}

export interface ProGame {
  gameId: number
  gameNumber: number
  blueTeam: ProTeamInfo
  redTeam: ProTeamInfo
  winnerTeamId: number | null
  duration: number | null
  status: 'upcoming' | 'live' | 'completed'
  patch: string | null
  objectives: ProGameObjectives
  firstObjectives: ProFirstObjectives
}

export interface ProMatchDetail {
  match: ProMatch
  games: ProGame[]
}

// ============================================================================
// GAME DETAILS
// ============================================================================

export interface ProDraft {
  bluePicks: number[]
  redPicks: number[]
  blueBans: number[]
  redBans: number[]
}

export interface ProPlayerGameStats {
  playerId: number
  playerName: string
  playerSlug: string
  teamId: number
  teamName: string
  teamShort: string
  side: 'blue' | 'red'
  role: string
  championId: number
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  goldEarned: number
  goldShare: number
  damageDealt: number
  damageShare: number
  visionScore: number
  killParticipation: number
  csAt15: number
  goldAt15: number
  goldDiffAt15: number
  csDiffAt15: number
}

export interface ProGameDetail {
  game: ProGame & {
    matchId: number
    goldAt15: {
      blue: number | null
      red: number | null
    }
  }
  draft: ProDraft | null
  players: ProPlayerGameStats[]
}

// ============================================================================
// TEAM STATS
// ============================================================================

export interface ProTeamTournamentStats {
  tournamentId: number
  tournamentName: string
  tournamentSlug: string
  matchesPlayed: number
  matchesWon: number
  gamesPlayed: number
  gamesWon: number
  matchWinRate: number
  gameWinRate: number
  avgGameDuration: number
  avgKills: number
  avgDeaths: number
  avgTowers: number
  avgDragons: number
  avgBarons: number
  avgGoldAt15: number
  avgGoldDiffAt15: number
  firstBloodRate: number
  firstTowerRate: number
  firstDragonRate: number
  firstHeraldRate: number
  blueSideGames: number
  blueSideWins: number
  redSideGames: number
  redSideWins: number
}

export interface ProTeamStatsResponse {
  team: {
    teamId: number
    name: string
    shortName: string
    slug: string
  }
  stats: ProTeamTournamentStats[]
}

// ============================================================================
// PLAYER STATS
// ============================================================================

export interface ProPlayerTournamentStats {
  tournamentId: number
  tournamentName: string
  tournamentSlug: string
  team: {
    teamId: number
    name: string
    shortName: string
    slug: string
  }
  role: string
  gamesPlayed: number
  gamesWon: number
  winRate: number
  avgKills: number
  avgDeaths: number
  avgAssists: number
  avgKda: number
  avgCsPerMin: number
  avgGoldPerMin: number
  avgDamagePerMin: number
  avgVisionScore: number
  avgKillParticipation: number
  avgGoldShare: number
  avgDamageShare: number
  avgCsDiffAt15: number
  avgGoldDiffAt15: number
  uniqueChampionsPlayed: number
}

export interface ProPlayerStatsResponse {
  player: {
    playerId: number
    name: string
    slug: string
    nationality: string | null
  }
  stats: ProPlayerTournamentStats[]
}

// ============================================================================
// CHAMPION STATS (DRAFT ANALYSIS)
// ============================================================================

export interface ProChampionStats {
  championId: number
  picks: number
  bans: number
  wins: number
  losses: number
  presenceRate: number
  pickRate: number
  banRate: number
  winRate: number
  avgKda: number
  avgCsPerMin: number
  blueSidePicks: number
  blueSideWins: number
  redSidePicks: number
  redSideWins: number
  roleDistribution: {
    top: number
    jungle: number
    mid: number
    adc: number
    support: number
  }
}

export interface ProChampionStatsResponse {
  data: ProChampionStats[]
}

// ============================================================================
// HEAD TO HEAD
// ============================================================================

export interface ProH2HTeam {
  teamId: number
  name: string
  shortName: string
  slug: string
  wins: number
}

export interface ProH2HMatch {
  matchId: number
  tournamentName: string
  tournamentSlug: string
  team1Score: number
  team2Score: number
  winnerId: number
  endedAt: string
}

export interface ProHeadToHeadResponse {
  team1: ProH2HTeam
  team2: ProH2HTeam
  totalMatches: number
  recentMatches: ProH2HMatch[]
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ProTournamentsResponse {
  data: ProTournament[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export interface ProMatchesResponse {
  data: ProMatch[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}
