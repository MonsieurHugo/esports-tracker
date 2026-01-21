import type {
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  TopGrinderEntry,
  StreakEntry,
  GrinderEntry,
  LeagueInfo,
} from '@/lib/types'

export const mockTeam: TeamLeaderboardEntry = {
  rank: 1,
  team: {
    teamId: 1,
    slug: 'karmine-corp',
    currentName: 'Karmine Corp',
    shortName: 'KC',
    logoUrl: '/images/teams/kc.png',
    region: 'LEC',
  },
  games: 150,
  gamesChange: 12,
  winrate: 58.5,
  winrateChange: 2.3,
  totalMinutes: 4500,
  totalMinutesChange: 360,
  totalLp: 12500,
  totalLpChange: 450,
  players: [
    {
      playerId: 1,
      slug: 'player1',
      pseudo: 'Player1',
      role: 'TOP',
      games: 30,
      winrate: 60,
      tier: 'CHALLENGER',
      rank: 'I',
      lp: 500,
      totalLp: 2500,
      countsForStats: true,
    },
    {
      playerId: 2,
      slug: 'player2',
      pseudo: 'Player2',
      role: 'JGL',
      games: 28,
      winrate: 55,
      tier: 'GRANDMASTER',
      rank: 'I',
      lp: 400,
      totalLp: 2400,
      countsForStats: true,
    },
  ],
}

export const mockPlayer: PlayerLeaderboardEntry = {
  rank: 1,
  player: {
    playerId: 1,
    slug: 'faker',
    pseudo: 'Faker',
  },
  team: {
    teamId: 10,
    slug: 't1',
    shortName: 'T1',
    logoUrl: '/images/teams/t1.png',
    region: 'LCK',
  },
  role: 'MID',
  games: 45,
  gamesChange: 5,
  winrate: 62.5,
  winrateChange: 3.2,
  totalMinutes: 1350,
  totalMinutesChange: 150,
  tier: 'CHALLENGER',
  rank_division: 'I',
  lp: 1200,
  totalLp: 3200,
  totalLpChange: 150,
  accounts: [
    {
      puuid: 'puuid-1',
      gameName: 'Hide on Bush',
      tagLine: 'KR1',
      region: 'KR',
      tier: 'CHALLENGER',
      rank: 'I',
      lp: 1200,
      totalLp: 3200,
      games: 45,
      wins: 28,
      winrate: 62.2,
    },
  ],
}

export const mockTopGrinders: TopGrinderEntry[] = [
  {
    rank: 1,
    player: { playerId: 1, pseudo: 'Grinder1', slug: 'grinder1' },
    team: { shortName: 'KC', slug: 'karmine-corp' },
    role: 'MID',
    games: 85,
  },
  {
    rank: 2,
    player: { playerId: 2, pseudo: 'Grinder2', slug: 'grinder2' },
    team: { shortName: 'G2', slug: 'g2-esports' },
    role: 'ADC',
    games: 78,
  },
]

export const mockStreaks: StreakEntry[] = [
  {
    rank: 1,
    player: { playerId: 1, pseudo: 'Streaker1', slug: 'streaker1' },
    team: { shortName: 'FNC', slug: 'fnatic' },
    streak: 12,
  },
  {
    rank: 2,
    player: { playerId: 2, pseudo: 'Streaker2', slug: 'streaker2' },
    team: { shortName: 'VIT', slug: 'team-vitality' },
    streak: 9,
  },
]

export const mockTeams = [mockTeam]
export const mockPlayers = [mockPlayer]

// GrinderEntry mocks for TopGrinders component (new format)
export const mockGrinderEntries: GrinderEntry[] = [
  {
    rank: 1,
    entity: {
      id: 1,
      slug: 'karmine-corp',
      name: 'Karmine Corp',
      shortName: 'KC',
      logoUrl: '/images/teams/kc.png',
    },
    entityType: 'team',
    games: 85,
  },
  {
    rank: 2,
    entity: {
      id: 2,
      slug: 'player-grinder',
      name: 'TopGrinder',
    },
    entityType: 'player',
    team: { shortName: 'G2', slug: 'g2-esports' },
    role: 'MID',
    games: 78,
  },
  {
    rank: 3,
    entity: {
      id: 3,
      slug: 'fnatic',
      name: 'Fnatic',
      shortName: 'FNC',
      logoUrl: '/images/teams/fnc.png',
    },
    entityType: 'team',
    games: 72,
  },
]

// LeagueInfo mocks for LeagueDropdown
export const mockLeagues: LeagueInfo[] = [
  { leagueId: 1, name: 'League of Legends EMEA Championship', shortName: 'LEC', region: 'EMEA', color: '#00e5bf' },
  { leagueId: 2, name: 'Ligue Française de League of Legends', shortName: 'LFL', region: 'FR', color: '#ff7b57' },
  { leagueId: 3, name: 'League of Legends Champions Korea', shortName: 'LCK', region: 'KR', color: '#f5e6d3' },
]

// LpChart mock data
export const mockLpChartTeams = [
  {
    teamName: 'Karmine Corp',
    shortName: 'KC',
    data: [
      { date: '2024-01-15', label: '15/01', totalLp: 2500 },
      { date: '2024-01-16', label: '16/01', totalLp: 2650 },
      { date: '2024-01-17', label: '17/01', totalLp: 2800 },
    ],
  },
]

export const mockDateRange = [
  { date: '2024-01-15', label: '15/01' },
  { date: '2024-01-16', label: '16/01' },
  { date: '2024-01-17', label: '17/01' },
]
