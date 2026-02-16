import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TopLpGainers from './TopLpGainers'
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
      'leaderboard.topLpGainers': 'Top LP+',
      'dashboard.lp': 'LP',
      'common.loading': 'Chargement...',
    }
    return translations[key] || key
  },
}))

describe('TopLpGainers', () => {
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
      render(<TopLpGainers entries={[]} isLoading={true} />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders placeholder rows when no entries', () => {
      render(<TopLpGainers entries={[]} isLoading={false} />)
      const placeholders = screen.getAllByText('---')
      expect(placeholders).toHaveLength(5)
    })
  })

  describe('with data', () => {
    const mockEntries = [
      createMockEntry(1, 500),
      createMockEntry(2, 400),
      createMockEntry(3, 300),
      createMockEntry(4, 200),
      createMockEntry(5, 100),
    ]

    it('renders 5 entries correctly', () => {
      render(<TopLpGainers entries={mockEntries} />)

      expect(screen.getByText('Top LP+')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('renders team names and logos', () => {
      render(<TopLpGainers entries={mockEntries} />)

      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-T1')).toBeInTheDocument()
    })

    it('renders player names with team logos', () => {
      const playerEntries: LpChangeEntry[] = [
        {
          rank: 1,
          entity: { id: 1, slug: 'player-1', name: 'Faker' },
          entityType: 'player',
          team: { shortName: 'T1', slug: 't1' },
          lpChange: 300,
          games: 15,
        },
      ]

      render(<TopLpGainers entries={playerEntries} />)

      expect(screen.getByText('Faker')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-T1')).toBeInTheDocument()
    })

    it('renders positive LP values with + prefix', () => {
      render(<TopLpGainers entries={[createMockEntry(1, 500)]} />)

      // LP values should have + prefix
      expect(screen.getByText(/\+500/)).toBeInTheDocument()
    })
  })
})
