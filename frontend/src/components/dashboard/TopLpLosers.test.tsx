import { render, screen, fireEvent } from '@testing-library/react'
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

// Mock SortIcon component
vi.mock('@/components/ui/SortIcon', () => ({
  default: ({ direction }: { direction: string }) => (
    <span data-testid={`sort-icon-${direction}`} />
  ),
}))

describe('TopLpLosers', () => {
  const mockOnSortChange = vi.fn()

  const baseProps = {
    sortDirection: 'desc' as const,
    onSortChange: mockOnSortChange,
    viewMode: 'teams' as const,
  }

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

  beforeEach(() => {
    mockOnSortChange.mockClear()
  })

  describe('loading state', () => {
    it('renders loading message when isLoading is true', () => {
      render(<TopLpLosers {...baseProps} entries={[]} isLoading={true} />)
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
      render(<TopLpLosers {...baseProps} entries={mockEntries} />)

      // Header should be visible
      expect(screen.getByText('Top LP-')).toBeInTheDocument()

      // All 5 ranks should be visible
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()

      // Team names should be visible
      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()
    })

    it('renders team logos', () => {
      render(<TopLpLosers {...baseProps} entries={mockEntries} />)

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

      render(<TopLpLosers {...baseProps} entries={twoEntries} />)

      // Should have 2 actual entries
      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()

      // Should have 3 placeholder rows with "---" text
      const placeholders = screen.getAllByText('---')
      expect(placeholders).toHaveLength(3)
    })

    it('renders all 5 rows even with empty entries', () => {
      render(<TopLpLosers {...baseProps} entries={[]} />)

      // Should have 5 placeholder rows
      const placeholders = screen.getAllByText('---')
      expect(placeholders).toHaveLength(5)

      // Should have 5 "-" placeholders for LP values
      const lpPlaceholders = screen.getAllByText('-')
      expect(lpPlaceholders).toHaveLength(5)
    })

    it('renders placeholder rank numbers', () => {
      render(<TopLpLosers {...baseProps} entries={[]} />)

      // Placeholder rows should show rank numbers
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('players viewMode', () => {
    it('renders player names in players viewMode', () => {
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

      render(<TopLpLosers {...baseProps} entries={playerEntries} viewMode="players" />)

      expect(screen.getByText('Caps')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-G2')).toBeInTheDocument()
    })
  })

  describe('sort toggle', () => {
    it('calls onSortChange with opposite direction on click', () => {
      render(
        <TopLpLosers
          {...baseProps}
          entries={[createMockEntry(1, -100)]}
          sortDirection="desc"
        />
      )

      const sortButton = screen.getByRole('button')
      fireEvent.click(sortButton)

      expect(mockOnSortChange).toHaveBeenCalledWith('asc')
    })

    it('toggles from asc to desc', () => {
      render(
        <TopLpLosers
          {...baseProps}
          entries={[createMockEntry(1, -100)]}
          sortDirection="asc"
        />
      )

      const sortButton = screen.getByRole('button')
      fireEvent.click(sortButton)

      expect(mockOnSortChange).toHaveBeenCalledWith('desc')
    })

    it('renders sort icon with correct direction', () => {
      render(
        <TopLpLosers
          {...baseProps}
          entries={[createMockEntry(1, -100)]}
          sortDirection="desc"
        />
      )

      expect(screen.getByTestId('sort-icon-desc')).toBeInTheDocument()
    })
  })
})
