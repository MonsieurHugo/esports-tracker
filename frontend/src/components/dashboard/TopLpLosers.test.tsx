import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TopLpLosers from './TopLpLosers'
import type { LpChangeEntry } from '@/lib/types'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock TeamLogo component
vi.mock('@/components/ui/TeamLogo', () => ({
  default: ({ shortName }: { shortName: string }) => (
    <div data-testid={`team-logo-${shortName}`} />
  ),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'leaderboard.topLpLosers': 'Top LP-',
      'dashboard.lp': 'LP',
      'common.loading': 'Chargement...',
    }
    return translations[key] || key
  },
}))

describe('TopLpLosers', () => {
  const createMockEntry = (rank: number, lpChange: number): LpChangeEntry => ({
    rank,
    entity: {
      id: rank,
      slug: `team-${rank}`,
      name: `Team ${rank}`,
      shortName: `T${rank}`,
    },
    entityType: 'team',
    lpChange,
    games: 10,
  })

  describe('loading state', () => {
    it('renders loading message when isLoading is true', () => {
      render(<TopLpLosers entries={[]} isLoading={true} />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })
  })

  describe('with data', () => {
    const mockEntries = [
      createMockEntry(1, -500),
      createMockEntry(2, -400),
      createMockEntry(3, -300),
      createMockEntry(4, -200),
      createMockEntry(5, -100),
    ]

    it('renders 5 entries correctly', () => {
      render(<TopLpLosers entries={mockEntries} />)

      expect(screen.getByText('Top LP-')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()

      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()
    })

    it('renders team logos', () => {
      render(<TopLpLosers entries={mockEntries} />)

      expect(screen.getByTestId('team-logo-T1')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-T2')).toBeInTheDocument()
    })
  })

  describe('placeholder rows', () => {
    it('renders placeholder rows when less than 5 entries', () => {
      const twoEntries = [
        createMockEntry(1, -500),
        createMockEntry(2, -400),
      ]

      render(<TopLpLosers entries={twoEntries} />)

      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()

      const placeholders = screen.getAllByText('---')
      expect(placeholders).toHaveLength(3)
    })

    it('renders all 5 rows even with empty entries', () => {
      render(<TopLpLosers entries={[]} />)

      const placeholders = screen.getAllByText('---')
      expect(placeholders).toHaveLength(5)

      const lpPlaceholders = screen.getAllByText('-')
      expect(lpPlaceholders).toHaveLength(5)
    })

    it('renders placeholder rank numbers', () => {
      render(<TopLpLosers entries={[]} />)

      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('players viewMode', () => {
    it('renders player names with team logos', () => {
      const playerEntries: LpChangeEntry[] = [
        {
          rank: 1,
          entity: { id: 1, slug: 'player-1', name: 'Caps' },
          entityType: 'player',
          team: { shortName: 'G2', slug: 'g2-esports' },
          lpChange: -300,
          games: 15,
        },
      ]

      render(<TopLpLosers entries={playerEntries} />)

      expect(screen.getByText('Caps')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-G2')).toBeInTheDocument()
    })
  })
})
