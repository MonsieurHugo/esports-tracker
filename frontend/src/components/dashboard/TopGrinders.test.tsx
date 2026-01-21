import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import TopGrinders from './TopGrinders'
import { mockGrinderEntries } from '@/tests/mocks'

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

      // Header should be visible
      expect(screen.getByText('Top Grinders')).toBeInTheDocument()
      expect(screen.getByText('Games')).toBeInTheDocument()

      // Should show 5 placeholder rows
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

      // Team entry should have a link
      const teamLink = screen.getByRole('link', { name: 'KC' })
      expect(teamLink).toHaveAttribute('href', '/lol/team/karmine-corp')
    })

    it('renders player entries without links', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      // Player entry should show name but not be a link
      expect(screen.getByText('TopGrinder')).toBeInTheDocument()
    })

    it('renders rankings correctly', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      // Check ranks are displayed
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('renders games count correctly', () => {
      render(<TopGrinders entries={mockGrinderEntries} isLoading={false} />)

      // Check games are displayed
      expect(screen.getByText('85')).toBeInTheDocument()
      expect(screen.getByText('78')).toBeInTheDocument()
      expect(screen.getByText('72')).toBeInTheDocument()
    })

    it('renders partial list with placeholder rows', () => {
      // Only 2 entries - should have 3 placeholders
      const partialEntries = mockGrinderEntries.slice(0, 2)
      render(<TopGrinders entries={partialEntries} isLoading={false} />)

      // Check that both entries are rendered
      expect(screen.getByText('KC')).toBeInTheDocument()
      expect(screen.getByText('TopGrinder')).toBeInTheDocument()

      // Should have 3 placeholder rows
      const placeholderTexts = screen.getAllByText('---')
      expect(placeholderTexts.length).toBe(3)
    })
  })
})
