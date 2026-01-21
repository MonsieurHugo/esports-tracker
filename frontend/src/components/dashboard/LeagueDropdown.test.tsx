import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LeagueDropdown from './LeagueDropdown'
import { mockLeagues } from '@/tests/mocks'

describe('LeagueDropdown', () => {
  const defaultProps = {
    selected: [] as string[],
    onToggle: vi.fn(),
    onSelectAll: vi.fn(),
    leagues: mockLeagues,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('button display', () => {
    it('shows "Ligues: toutes" when nothing selected', () => {
      render(<LeagueDropdown {...defaultProps} />)
      expect(screen.getByText('Ligues: toutes')).toBeInTheDocument()
    })

    it('shows "Ligues: toutes" when all leagues selected', () => {
      render(
        <LeagueDropdown
          {...defaultProps}
          selected={mockLeagues.map((l) => l.shortName)}
        />
      )
      expect(screen.getByText('Ligues: toutes')).toBeInTheDocument()
    })

    it('shows single league name when only one selected', () => {
      render(<LeagueDropdown {...defaultProps} selected={['LEC']} />)
      expect(screen.getByText('Ligues: LEC')).toBeInTheDocument()
    })

    it('shows count when multiple leagues selected', () => {
      render(<LeagueDropdown {...defaultProps} selected={['LEC', 'LFL']} />)
      expect(screen.getByText('Ligues: 2')).toBeInTheDocument()
    })
  })

  describe('dropdown toggle', () => {
    it('opens dropdown when button is clicked', () => {
      render(<LeagueDropdown {...defaultProps} />)

      // Dropdown should be closed initially
      expect(screen.queryByText('Toutes')).not.toBeInTheDocument()

      // Click to open
      fireEvent.click(screen.getByText('Ligues: toutes'))

      // Dropdown should be open
      expect(screen.getByText('Toutes')).toBeInTheDocument()
    })

    it('closes dropdown when clicking outside', () => {
      render(
        <div>
          <LeagueDropdown {...defaultProps} />
          <div data-testid="outside">Outside</div>
        </div>
      )

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: toutes'))
      expect(screen.getByText('Toutes')).toBeInTheDocument()

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'))

      // Dropdown should be closed
      expect(screen.queryByText('Toutes')).not.toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('calls onSelectAll when "Toutes" is clicked', () => {
      render(<LeagueDropdown {...defaultProps} />)

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: toutes'))

      // Click "Toutes"
      fireEvent.click(screen.getByText('Toutes'))

      expect(defaultProps.onSelectAll).toHaveBeenCalledTimes(1)
    })

    it('calls onToggle with league shortName when league is clicked', () => {
      render(<LeagueDropdown {...defaultProps} />)

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: toutes'))

      // Click on LEC
      fireEvent.click(screen.getByText('LEC'))

      expect(defaultProps.onToggle).toHaveBeenCalledWith('LEC')
    })

    it('shows checkmark on "Toutes" when all selected', () => {
      render(<LeagueDropdown {...defaultProps} selected={[]} />)

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: toutes'))

      // "Toutes" should have checkmark (accent color)
      const toutesButton = screen.getByText('Toutes').closest('button')
      expect(toutesButton?.className).toContain('text-(--accent)')
    })

    it('shows checkmark on selected league', () => {
      render(<LeagueDropdown {...defaultProps} selected={['LEC']} />)

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: LEC'))

      // LEC button should have accent color
      const lecButton = screen.getByText('LEC').closest('button')
      expect(lecButton?.className).toContain('text-(--accent)')
    })
  })

  describe('league colors', () => {
    it('displays color dots for each league', () => {
      render(<LeagueDropdown {...defaultProps} />)

      // Open dropdown
      fireEvent.click(screen.getByText('Ligues: toutes'))

      // Each league should have a color dot
      const colorDots = document.querySelectorAll('.rounded-full')
      // 3 leagues = 3 color dots
      expect(colorDots.length).toBe(3)
    })
  })

  describe('styling', () => {
    it('highlights button when leagues are filtered', () => {
      render(<LeagueDropdown {...defaultProps} selected={['LEC']} />)

      const button = screen.getByText('Ligues: LEC').closest('button')
      expect(button?.className).toContain('border-(--accent)')
    })

    it('does not highlight button when all leagues selected', () => {
      render(<LeagueDropdown {...defaultProps} selected={[]} />)

      const button = screen.getByText('Ligues: toutes').closest('button')
      expect(button?.className).not.toContain('border-(--accent)')
    })
  })
})
