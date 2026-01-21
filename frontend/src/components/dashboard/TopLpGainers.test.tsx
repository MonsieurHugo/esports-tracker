import { render, screen, fireEvent } from '@testing-library/react'
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

// Mock SortIcon component
vi.mock('@/components/ui/SortIcon', () => ({
  default: ({ direction }: { direction: string }) => (
    <span data-testid={`sort-icon-${direction}`} />
  ),
}))

describe('TopLpGainers', () => {
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
      render(<TopLpGainers {...baseProps} entries={[]} isLoading={true} />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders placeholder rows when no entries', () => {
      render(<TopLpGainers {...baseProps} entries={[]} isLoading={false} />)
      // Component shows 5 placeholder rows with "---" text
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
      render(<TopLpGainers {...baseProps} entries={mockEntries} />)

      // Header should be visible
      expect(screen.getByText('Top LP+')).toBeInTheDocument()

      // All 5 ranks should be visible
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()

      // LP values should have + prefix (French format)
      expect(screen.getByText('+500')).toBeInTheDocument()
      expect(screen.getByText('+400')).toBeInTheDocument()
    })

    it('renders team names and logos in teams viewMode', () => {
      render(<TopLpGainers {...baseProps} entries={mockEntries} viewMode="teams" />)

      // Team names should be visible
      expect(screen.getByText('T1')).toBeInTheDocument()
      expect(screen.getByText('T2')).toBeInTheDocument()

      // Team logos should be rendered
      expect(screen.getByTestId('team-logo-T1')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-T2')).toBeInTheDocument()
    })

    it('renders player names in players viewMode', () => {
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

      render(<TopLpGainers {...baseProps} entries={playerEntries} viewMode="players" />)

      expect(screen.getByText('Faker')).toBeInTheDocument()
      expect(screen.getByTestId('team-logo-T1')).toBeInTheDocument()
    })
  })

  describe('sort toggle', () => {
    it('calls onSortChange with opposite direction on click', () => {
      render(
        <TopLpGainers
          {...baseProps}
          entries={[createMockEntry(1, 100)]}
          sortDirection="desc"
        />
      )

      const sortButton = screen.getByRole('button')
      fireEvent.click(sortButton)

      expect(mockOnSortChange).toHaveBeenCalledWith('asc')
    })

    it('toggles from asc to desc', () => {
      render(
        <TopLpGainers
          {...baseProps}
          entries={[createMockEntry(1, 100)]}
          sortDirection="asc"
        />
      )

      const sortButton = screen.getByRole('button')
      fireEvent.click(sortButton)

      expect(mockOnSortChange).toHaveBeenCalledWith('desc')
    })

    it('renders sort icon with correct direction', () => {
      render(
        <TopLpGainers
          {...baseProps}
          entries={[createMockEntry(1, 100)]}
          sortDirection="desc"
        />
      )

      expect(screen.getByTestId('sort-icon-desc')).toBeInTheDocument()
    })
  })
})
