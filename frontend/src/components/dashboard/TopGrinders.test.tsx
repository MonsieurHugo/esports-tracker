import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TopGrinders from './TopGrinders'
import { mockGrinderEntries } from '@/tests/mocks'

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
      'leaderboard.topGrinders': 'Top Grinders',
      'dashboard.games': 'Games',
      'common.loading': 'Chargement...',
    }
    return translations[key] || key
  },
}))

describe('TopGrinders', () => {
  describe('loading state', () => {
    it('renders loading state', () => {
      render(<TopGrinders entries={[]} isLoading={true} />)
      expect(screen.getByText('Chargement...')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders placeholder rows when no entries', () => {
      render(<TopGrinders entries={[]} isLoading={false} />)

      expect(screen.getByText('Top Grinders')).toBeInTheDocument()
      expect(screen.getByText('Games')).toBeInTheDocument()

      const placeholderTexts = screen.getAllByText('---')
      expect(placeholderTexts.length).toBe(5)
    })
  })

  describe('with data', () => {
    it('renders header correctly', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      expect(screen.getByText('Top Grinders')).toBeInTheDocument()
      expect(screen.getByText('Games')).toBeInTheDocument()
    })

    it('renders team entries with links', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      const teamLink = screen.getByRole('link', { name: 'KC' })
      expect(teamLink).toHaveAttribute('href', '/lol/team/karmine-corp')
    })

    it('renders player entries without links', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      expect(screen.getByText('TopGrinder')).toBeInTheDocument()
    })

    it('renders rankings correctly', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('renders games count correctly', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      expect(screen.getByText('85')).toBeInTheDocument()
      expect(screen.getByText('78')).toBeInTheDocument()
      expect(screen.getByText('72')).toBeInTheDocument()
    })

    it('renders partial list with placeholder rows', () => {
      const partialEntries = mockGrinderEntries.slice(0, 2)
      render(<TopGrinders entries={partialEntries} isLoading={false} />)

      expect(screen.getByText('KC')).toBeInTheDocument()
      expect(screen.getByText('TopGrinder')).toBeInTheDocument()

      const placeholderTexts = screen.getAllByText('---')
      expect(placeholderTexts.length).toBe(3)
    })
  })
})
