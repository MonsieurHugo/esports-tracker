import type {
  ProPlayerRecord,
  ProTeamRecord,
  ProBoRecord,
  ProStreakRecord,
  ProTournamentKillsRecord,
  ProTournamentPlayerRecord,
} from '@/lib/types'

export type SocialCardFormat = 'twitter' | 'instagram' | 'tiktok'

export const CARD_DIMENSIONS = {
  twitter: { width: 1200, height: 1600 },
  instagram: { width: 1080, height: 1080 },
  tiktok: { width: 1080, height: 1920 },
} as const

/** TikTok safe zone insets (px) — UI overlays outside these margins */
export const TIKTOK_SAFE_ZONE = {
  top: 130,
  bottom: 250,
  left: 60,
  right: 120,
} as const

export const CARD_COLORS = {
  bg: '#07070a',
  bgHeader: '#0c0c0f',
  bgRow: '#101014',
  bgRowAlt: '#0c0c0f',
  border: '#1e1e24',
  text: '#f0f0f0',
  textSecondary: '#b0b0b8',
  textMuted: '#8a8a94',
  accent: '#00dc82',
  gold: '#facc15',
  silver: '#9ca3af',
  bronze: '#d97706',
} as const

export type RecordCardType =
  | 'player'
  | 'team'
  | 'bo'
  | 'streak'
  | 'tournamentKills'
  | 'tournamentPlayer'

export interface FilterSummary {
  leagues: string[]
  years: number[]
  role: string | null
  teams: string[]
}

export interface SocialCardData {
  title: string
  cardType: RecordCardType
  formatValue: (r: never) => string
  records:
    | ProPlayerRecord[]
    | ProTeamRecord[]
    | ProBoRecord[]
    | ProStreakRecord[]
    | ProTournamentKillsRecord[]
    | ProTournamentPlayerRecord[]
  filters: FilterSummary
  /** Extra props for team/streak tables */
  extra?: {
    valueLabel?: string
    winnerLabel?: string
    loserLabel?: string
    unit?: string
  }
}
