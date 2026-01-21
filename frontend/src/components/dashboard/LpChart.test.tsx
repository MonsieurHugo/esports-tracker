import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LpChart, { type TeamLpData } from './LpChart'

// Mock Recharts components to avoid SVG rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Area: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`area-${dataKey}`} />
  ),
  LabelList: () => null,
}))

// Mock chart hooks
vi.mock('@/hooks/useChartTicks', () => ({
  useChartTicks: () => ({ ticks: [0, 500, 1000], domain: [0, 1000] }),
  useXAxisInterval: () => 0,
  useChartWidth: () => 600,
}))

describe('LpChart', () => {
  const baseProps = {
    period: '7d' as const,
    refDate: '2024-01-15',
  }

  describe('empty state', () => {
    it('renders empty state message when no teams', () => {
      render(<LpChart {...baseProps} teams={[]} />)
      expect(screen.getByText('Sélectionnez une équipe')).toBeInTheDocument()
    })

    it('renders empty state when teams have no data', () => {
      const teamsWithNoData: TeamLpData[] = [
        { teamName: 'Team 1', shortName: 'T1', data: [] },
      ]
      render(<LpChart {...baseProps} teams={teamsWithNoData} />)
      expect(screen.getByText('Sélectionnez une équipe')).toBeInTheDocument()
    })
  })

  describe('with data', () => {
    const mockTeam1: TeamLpData = {
      teamName: 'Karmine Corp',
      shortName: 'KC',
      data: [
        { date: '2024-01-14', label: '14/01', totalLp: 1000 },
        { date: '2024-01-15', label: '15/01', totalLp: 1100 },
      ],
    }

    const mockTeam2: TeamLpData = {
      teamName: 'G2 Esports',
      shortName: 'G2',
      data: [
        { date: '2024-01-14', label: '14/01', totalLp: 900 },
        { date: '2024-01-15', label: '15/01', totalLp: 950 },
      ],
    }

    it('renders chart with 1 team', () => {
      render(<LpChart {...baseProps} teams={[mockTeam1]} />)

      // Header should be visible
      expect(screen.getByText('Évolution LP')).toBeInTheDocument()

      // Team legend should be visible
      expect(screen.getByText('KC')).toBeInTheDocument()

      // Chart container should be rendered
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
      expect(screen.getByTestId('area-team0Lp')).toBeInTheDocument()
    })

    it('renders chart with 2 teams (comparison)', () => {
      render(<LpChart {...baseProps} teams={[mockTeam1, mockTeam2]} />)

      // Header should be visible
      expect(screen.getByText('Évolution LP')).toBeInTheDocument()

      // Both team legends should be visible
      expect(screen.getByText('KC')).toBeInTheDocument()
      expect(screen.getByText('G2')).toBeInTheDocument()

      // Chart container should be rendered
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument()

      // Both areas should be rendered
      expect(screen.getByTestId('area-team0Lp')).toBeInTheDocument()
      expect(screen.getByTestId('area-team1Lp')).toBeInTheDocument()
    })

    it('renders team color indicators in legend', () => {
      render(<LpChart {...baseProps} teams={[mockTeam1, mockTeam2]} />)

      // Should have 2 color dots (one for each team)
      const colorDots = document.querySelectorAll('.rounded-full')
      expect(colorDots.length).toBe(2)
    })
  })
})
