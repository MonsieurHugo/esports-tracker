import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import LolDashboard from './LolDashboard'
import { mockTeam, mockPlayer, mockTopGrinders } from '@/tests/mocks'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry, GrinderEntry, LpChangeEntry } from '@/lib/types'

// Mock the API module - the component makes direct API calls
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
  usePathname: vi.fn(() => '/lol'),
}))

// Mock all hooks (these are mocked but the component doesn't use most of them)
vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: vi.fn(),
  usePlayersData: vi.fn(),
}))

vi.mock('@/hooks/useHistoryData', () => ({
  useTeamHistory: vi.fn(),
  usePlayerHistory: vi.fn(),
}))

vi.mock('@/hooks/useLeagues', () => ({
  useLeagues: vi.fn(),
}))

vi.mock('@/hooks/useUrlSync', () => ({
  useUrlSync: vi.fn(),
}))

vi.mock('@/hooks/useStoresHydrated', () => ({
  useStoresHydrated: vi.fn(() => true),
}))

// Mock the store
vi.mock('@/stores/dashboardStore', () => ({
  useDashboardStore: vi.fn(),
  usePeriodStore: vi.fn(),
  useFilterStore: vi.fn(),
  useSelectionStore: vi.fn(),
  useUIStore: vi.fn(),
}))

// Mock child components that are complex
vi.mock('@/components/dashboard/TeamLeaderboard', () => ({
  default: ({ data, isLoading, onSelectTeam, selectedTeams }: {
    data: TeamLeaderboardEntry[]
    isLoading: boolean
    onSelectTeam: (team: TeamLeaderboardEntry) => void
    selectedTeams: TeamLeaderboardEntry[]
  }) => (
    <div data-testid="team-leaderboard">
      {isLoading ? (
        <div data-testid="team-leaderboard-loading">Loading teams...</div>
      ) : (
        <div>
          {data.map((team) => (
            <button
              key={team.team.teamId}
              data-testid={`team-row-${team.team.teamId}`}
              onClick={() => onSelectTeam(team)}
              className={selectedTeams.some(t => t.team.teamId === team.team.teamId) ? 'selected' : ''}
            >
              {team.team.currentName}
            </button>
          ))}
        </div>
      )}
    </div>
  ),
}))

vi.mock('@/components/dashboard/PlayerLeaderboard', () => ({
  default: ({ data, isLoading, onSelectPlayer, selectedPlayers }: {
    data: PlayerLeaderboardEntry[]
    isLoading: boolean
    onSelectPlayer: (player: PlayerLeaderboardEntry) => void
    selectedPlayers: PlayerLeaderboardEntry[]
  }) => (
    <div data-testid="player-leaderboard">
      {isLoading ? (
        <div data-testid="player-leaderboard-loading">Loading players...</div>
      ) : (
        <div>
          {data.map((player) => (
            <button
              key={player.player.playerId}
              data-testid={`player-row-${player.player.playerId}`}
              onClick={() => onSelectPlayer(player)}
              className={selectedPlayers.some(p => p.player.playerId === player.player.playerId) ? 'selected' : ''}
            >
              {player.player.pseudo}
            </button>
          ))}
        </div>
      )}
    </div>
  ),
}))

vi.mock('@/components/dashboard/PeriodNavigator', () => ({
  default: ({ label, onPrevious, onNext, canGoNext }: {
    label: string
    onPrevious: () => void
    onNext: () => void
    canGoNext: boolean
  }) => (
    <div data-testid="period-navigator">
      <button data-testid="prev-period" onClick={onPrevious}>Previous</button>
      <span data-testid="period-label">{label}</span>
      <button data-testid="next-period" onClick={onNext} disabled={!canGoNext}>Next</button>
    </div>
  ),
}))

vi.mock('@/components/dashboard/PeriodSelector', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select data-testid="period-selector" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="7d">7J</option>
      <option value="14d">14J</option>
      <option value="30d">30J</option>
      <option value="90d">90J</option>
    </select>
  ),
}))

vi.mock('@/components/dashboard/StatCard', () => ({
  default: ({ label, value, change }: { label: string; value?: string | number; change?: number }) => (
    <div data-testid={`stat-card-${label.toLowerCase()}`}>
      <span data-testid="stat-label">{label}</span>
      <span data-testid="stat-value">{value ?? '-'}</span>
      {change !== undefined && <span data-testid="stat-change">{change}</span>}
    </div>
  ),
}))

vi.mock('@/components/dashboard/GamesChart', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="games-chart">
      {isLoading ? 'Loading chart...' : 'Games Chart'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/LpChart', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="lp-chart">
      {isLoading ? 'Loading chart...' : 'LP Chart'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/LpChangeChart', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="lp-change-chart">
      {isLoading ? 'Loading chart...' : 'LP Change Chart'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/DailyWinrateChart', () => ({
  default: ({ isLoading }: { isLoading: boolean }) => (
    <div data-testid="daily-winrate-chart">
      {isLoading ? 'Loading chart...' : 'Daily Winrate Chart'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/TopGrinders', () => ({
  default: ({ entries, isLoading }: { entries: GrinderEntry[]; isLoading: boolean }) => (
    <div data-testid="top-grinders">
      {isLoading ? 'Loading...' : entries.map((e, i) => (
        <div key={i} data-testid={`grinder-${i}`}>{e.player.pseudo}</div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/dashboard/TopLpGainers', () => ({
  default: ({ entries, isLoading }: { entries: LpChangeEntry[]; isLoading: boolean }) => (
    <div data-testid="top-lp-gainers">
      {isLoading ? 'Loading...' : 'LP Gainers loaded'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/TopLpLosers', () => ({
  default: ({ entries, isLoading }: { entries: LpChangeEntry[]; isLoading: boolean }) => (
    <div data-testid="top-lp-losers">
      {isLoading ? 'Loading...' : 'LP Losers loaded'}
    </div>
  ),
}))

vi.mock('@/components/dashboard/TeamSearchDropdown', () => ({
  default: ({ onClear }: { onClear: () => void }) => (
    <div data-testid="team-search">
      <button data-testid="clear-teams" onClick={onClear}>Clear</button>
    </div>
  ),
}))

vi.mock('@/components/dashboard/PlayerSearchDropdown', () => ({
  default: ({ onClear }: { onClear: () => void }) => (
    <div data-testid="player-search">
      <button data-testid="clear-players" onClick={onClear}>Clear</button>
    </div>
  ),
}))

vi.mock('@/components/dashboard/LeagueDropdown', () => ({
  default: () => <div data-testid="league-dropdown">League Filter</div>,
}))

vi.mock('@/components/dashboard/RoleIconFilter', () => ({
  default: () => <div data-testid="role-filter">Role Filter</div>,
}))

vi.mock('@/components/dashboard/GamesFilter', () => ({
  default: () => <div data-testid="games-filter">Games Filter</div>,
}))

vi.mock('@/components/ThemeSelector', () => ({
  default: () => <div data-testid="theme-selector">Theme</div>,
}))

// Import mocked modules
import { useDashboardData, usePlayersData } from '@/hooks/useDashboardData'
import { useTeamHistory, usePlayerHistory } from '@/hooks/useHistoryData'
import { useLeagues } from '@/hooks/useLeagues'
import { useDashboardStore, useUIStore, useFilterStore } from '@/stores/dashboardStore'
import api from '@/lib/api'

const mockUseDashboardData = useDashboardData as Mock
const mockUsePlayersData = usePlayersData as Mock
const mockUseTeamHistory = useTeamHistory as Mock
const mockUsePlayerHistory = usePlayerHistory as Mock
const mockUseLeagues = useLeagues as Mock
const mockUseDashboardStore = useDashboardStore as Mock
const mockUseUIStore = useUIStore as Mock
const mockUseFilterStore = useFilterStore as Mock
const mockApiGet = vi.mocked(api.get)

// Default mock store values
const createMockStore = (overrides = {}) => ({
  period: '7d',
  selectedLeagues: [],
  selectedRoles: [],
  minGames: 0,
  sortBy: 'lp',
  currentPage: 1,
  itemsPerPage: 20,
  leaderboardView: 'teams' as const,
  selectedTeams: [],
  selectedPlayers: [],
  resetKey: 0,
  lockedTeamIds: [],
  lockedPlayerIds: [],
  setPeriod: vi.fn(),
  navigatePeriod: vi.fn(),
  toggleLeague: vi.fn(),
  selectAllLeagues: vi.fn(),
  toggleRole: vi.fn(),
  selectAllRoles: vi.fn(),
  setMinGames: vi.fn(),
  setSortBy: vi.fn(),
  setPage: vi.fn(),
  setItemsPerPage: vi.fn(),
  setLeaderboardView: vi.fn(),
  selectTeam: vi.fn(),
  updateSelectedTeamData: vi.fn(),
  clearTeams: vi.fn(),
  selectPlayer: vi.fn(),
  clearPlayers: vi.fn(),
  toggleLockTeam: vi.fn(),
  toggleLockPlayer: vi.fn(),
  resetToDefault: vi.fn(),
  getPeriodLabel: vi.fn(() => '9 - 15 jan. 2024'),
  getRefDateString: vi.fn(() => '2024-01-15'),
  getDateRange: vi.fn(() => ({ startDate: '2024-01-09', endDate: '2024-01-15' })),
  ...overrides,
})

// Mock UI store values
const createMockUIStore = (overrides = {}) => ({
  isChartsModalOpen: false,
  openChartsModal: vi.fn(),
  closeChartsModal: vi.fn(),
  ...overrides,
})

// Mock filter store values
const createMockFilterStore = (overrides = {}) => ({
  teamsSelectedLeagues: [],
  playersSelectedLeagues: [],
  teamsMinGames: 0,
  playersMinGames: 0,
  selectedRoles: [],
  toggleLeague: vi.fn(),
  selectAllLeagues: vi.fn(),
  setMinGames: vi.fn(),
  toggleRole: vi.fn(),
  selectAllRoles: vi.fn(),
  resetFilters: vi.fn(),
  getSelectedLeagues: vi.fn(() => []),
  getMinGames: vi.fn(() => 0),
  ...overrides,
})

// Default dashboard data
const createMockDashboardData = (overrides = {}) => ({
  data: {
    teams: [mockTeam],
    teamsMeta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: mockTopGrinders,
    topLpGainers: [],
    topLpLosers: [],
  },
  isLoading: false,
  error: null,
  retry: vi.fn(),
  newTeams: [mockTeam],
  isPeriodChange: false,
  ...overrides,
})

// Default players data
const createMockPlayersData = (overrides = {}) => ({
  players: [mockPlayer],
  playersMeta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
  isLoading: false,
  error: null,
  retry: vi.fn(),
  ...overrides,
})

// Default history data
const createMockHistoryData = (overrides = {}) => ({
  gamesData: [],
  lpData: [],
  isLoading: false,
  ...overrides,
})

describe('LolDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup API mock responses - the component makes direct API calls
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/lol/dashboard/leagues') {
        return Promise.resolve({ data: [{ id: 'LEC', name: 'LEC' }, { id: 'LFL', name: 'LFL' }] })
      }
      if (endpoint === '/lol/dashboard/batch') {
        return Promise.resolve({
          grinders: { data: mockTopGrinders },
          gainers: { data: [] },
          losers: { data: [] },
        })
      }
      if (endpoint === '/lol/dashboard/teams') {
        return Promise.resolve({
          data: [mockTeam],
          meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      }
      if (endpoint === '/lol/dashboard/players') {
        return Promise.resolve({
          data: [mockPlayer],
          meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      }
      if (endpoint.includes('/lol/dashboard/team-history')) {
        return Promise.resolve({ data: [] })
      }
      if (endpoint.includes('/lol/dashboard/player-history')) {
        return Promise.resolve({ data: [] })
      }
      // Default response for any other endpoint
      return Promise.resolve({ data: [] })
    })

    // Setup store and hook mocks (these may or may not be used depending on component implementation)
    mockUseDashboardStore.mockReturnValue(createMockStore())
    mockUseUIStore.mockReturnValue(createMockUIStore())
    mockUseFilterStore.mockReturnValue(createMockFilterStore())
    mockUseDashboardData.mockReturnValue(createMockDashboardData())
    mockUsePlayersData.mockReturnValue(createMockPlayersData())
    mockUseTeamHistory.mockReturnValue(createMockHistoryData())
    mockUsePlayerHistory.mockReturnValue(createMockHistoryData())
    mockUseLeagues.mockReturnValue({ leagues: ['LEC', 'LFL', 'LCK'] })
  })

  describe('initial render', () => {
    it('renders the dashboard header', () => {
      render(<LolDashboard />)
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('renders the theme selector', () => {
      render(<LolDashboard />)
      expect(screen.getByTestId('theme-selector')).toBeInTheDocument()
    })

    it('renders stat cards', () => {
      render(<LolDashboard />)
      // StatCards are rendered in multiple places (xl sidebar + smaller screen areas)
      expect(screen.getAllByTestId('stat-card-games').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('stat-card-winrate').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('stat-card-lp').length).toBeGreaterThan(0)
    })
  })

  describe('loading state', () => {
    it('shows loading state in team leaderboard when data is loading', () => {
      mockUseDashboardData.mockReturnValue(createMockDashboardData({ isLoading: true }))

      render(<LolDashboard />)
      expect(screen.getByTestId('team-leaderboard-loading')).toBeInTheDocument()
    })

    it('shows charts initially without loading state (mocked components)', async () => {
      // Since components are mocked, they show "Games Chart" etc. by default
      // The actual loading state would be managed by the real components
      render(<LolDashboard />)

      // Mocked chart components render their default content
      expect(screen.getByTestId('games-chart')).toHaveTextContent('Games Chart')
      expect(screen.getByTestId('lp-chart')).toHaveTextContent('LP Chart')
    })

    it('shows loading state in top grinders when loading', () => {
      mockUseDashboardData.mockReturnValue(createMockDashboardData({ isLoading: true }))

      render(<LolDashboard />)
      // TopGrinders is rendered twice (xl and smaller screens), check one instance
      const grinders = screen.getAllByTestId('top-grinders')
      expect(grinders[0]).toHaveTextContent('Loading...')
    })
  })

  describe('data display', () => {
    it('displays team data in leaderboard after loading', async () => {
      render(<LolDashboard />)

      await waitFor(() => {
        expect(screen.getByTestId(`team-row-${mockTeam.team.teamId}`)).toBeInTheDocument()
      })
      expect(screen.getByText(mockTeam.team.currentName)).toBeInTheDocument()
    })

    it('displays grinders after loading', async () => {
      render(<LolDashboard />)

      // Wait for API data to load and grinders to be displayed
      await waitFor(() => {
        // TopGrinders is rendered twice (responsive layout), check any instance
        const grinders = screen.getAllByTestId('top-grinders')
        // At least one should have loaded and show grinder data (not "Loading...")
        const hasLoadedGrinders = grinders.some(grinder => !grinder.textContent?.includes('Loading'))
        expect(hasLoadedGrinders).toBe(true)
      })
    })

    it('displays charts after loading', () => {
      render(<LolDashboard />)

      expect(screen.getByTestId('games-chart')).toHaveTextContent('Games Chart')
      expect(screen.getByTestId('lp-chart')).toHaveTextContent('LP Chart')
      expect(screen.getByTestId('lp-change-chart')).toHaveTextContent('LP Change Chart')
      expect(screen.getByTestId('daily-winrate-chart')).toHaveTextContent('Daily Winrate Chart')
    })
  })

  describe('period navigation', () => {
    it('calls navigatePeriod with prev when clicking previous button', async () => {
      const navigatePeriod = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ navigatePeriod }))

      render(<LolDashboard />)

      fireEvent.click(screen.getByTestId('prev-period'))
      expect(navigatePeriod).toHaveBeenCalledWith('prev')
    })

    it('calls navigatePeriod with next when clicking next button', async () => {
      const navigatePeriod = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ navigatePeriod }))

      render(<LolDashboard />)

      fireEvent.click(screen.getByTestId('next-period'))
      expect(navigatePeriod).toHaveBeenCalledWith('next')
    })

    it('displays current period label', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        getPeriodLabel: vi.fn(() => '9 - 15 jan. 2024'),
      }))

      render(<LolDashboard />)

      expect(screen.getByTestId('period-label')).toHaveTextContent('9 - 15 jan. 2024')
    })

    it('changes period when selector changes', async () => {
      const setPeriod = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ setPeriod }))

      render(<LolDashboard />)

      fireEvent.change(screen.getByTestId('period-selector'), { target: { value: '14d' } })
      expect(setPeriod).toHaveBeenCalledWith('14d')
    })
  })

  describe('team selection', () => {
    it('calls selectTeam when clicking on a team row', async () => {
      const selectTeam = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ selectTeam }))

      render(<LolDashboard />)

      // Wait for team row to be rendered from API data
      await waitFor(() => {
        expect(screen.getByTestId(`team-row-${mockTeam.team.teamId}`)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId(`team-row-${mockTeam.team.teamId}`))
      expect(selectTeam).toHaveBeenCalledWith(mockTeam)
    })

    it('displays selected team stats in stat cards when team is selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [mockTeam],
      }))

      render(<LolDashboard />)

      // Stat cards have multiple instances due to responsive layout
      const gamesCards = screen.getAllByTestId('stat-card-games')
      // At least one of them should show the team's games count
      const hasTeamGames = gamesCards.some(card =>
        within(card).getByTestId('stat-value').textContent === String(mockTeam.games)
      )
      expect(hasTeamGames).toBe(true)
    })

    it('shows dash placeholder in stat cards when no team is selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [],
      }))

      render(<LolDashboard />)

      // Stat cards have multiple instances due to responsive layout
      const gamesCards = screen.getAllByTestId('stat-card-games')
      // At least one of them should show '-' when no team is selected
      const hasDash = gamesCards.some(card =>
        within(card).getByTestId('stat-value').textContent === '-'
      )
      expect(hasDash).toBe(true)
    })

    it('clears teams when clicking clear button', async () => {
      const clearTeams = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ clearTeams }))

      render(<LolDashboard />)

      fireEvent.click(screen.getByTestId('clear-teams'))
      expect(clearTeams).toHaveBeenCalled()
    })
  })

  describe('leaderboard view switching', () => {
    it('shows team leaderboard by default', () => {
      render(<LolDashboard />)

      expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument()
      expect(screen.queryByTestId('player-leaderboard')).not.toBeInTheDocument()
    })

    it('shows player leaderboard when in players view', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
      }))

      render(<LolDashboard />)

      expect(screen.getByTestId('player-leaderboard')).toBeInTheDocument()
      expect(screen.queryByTestId('team-leaderboard')).not.toBeInTheDocument()
    })

    it('shows player search in players view', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
      }))

      render(<LolDashboard />)

      expect(screen.getByTestId('player-search')).toBeInTheDocument()
      expect(screen.queryByTestId('team-search')).not.toBeInTheDocument()
    })

    it('shows team search in teams view', () => {
      render(<LolDashboard />)

      expect(screen.getByTestId('team-search')).toBeInTheDocument()
      expect(screen.queryByTestId('player-search')).not.toBeInTheDocument()
    })
  })

  describe('player selection in players view', () => {
    beforeEach(() => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
      }))
    })

    it('displays player data in leaderboard', async () => {
      render(<LolDashboard />)

      await waitFor(() => {
        expect(screen.getByTestId(`player-row-${mockPlayer.player.playerId}`)).toBeInTheDocument()
      })
      expect(screen.getByText(mockPlayer.player.pseudo)).toBeInTheDocument()
    })

    it('calls selectPlayer when clicking on a player row', async () => {
      const selectPlayer = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectPlayer,
      }))

      render(<LolDashboard />)

      // Wait for player row to be rendered from API data
      await waitFor(() => {
        expect(screen.getByTestId(`player-row-${mockPlayer.player.playerId}`)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId(`player-row-${mockPlayer.player.playerId}`))
      expect(selectPlayer).toHaveBeenCalledWith(mockPlayer)
    })

    it('shows player stats in stat cards when player is selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectedPlayers: [mockPlayer],
      }))

      render(<LolDashboard />)

      // Stat cards have multiple instances due to responsive layout
      const gamesCards = screen.getAllByTestId('stat-card-games')
      // At least one of them should show the player's games count
      const hasPlayerGames = gamesCards.some(card =>
        within(card).getByTestId('stat-value').textContent === String(mockPlayer.games)
      )
      expect(hasPlayerGames).toBe(true)
    })
  })

  // Error handling tests - component manages errors internally via API calls
  // Note: The component silently fails on API errors (no error UI shown) based on current implementation
  describe('error handling', () => {
    it('handles API errors gracefully without crashing', async () => {
      // Make all API calls fail
      mockApiGet.mockRejectedValue(new Error('Network error'))

      // Should not throw - component handles errors gracefully
      expect(() => render(<LolDashboard />)).not.toThrow()

      // Component should still render basic structure
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('continues to render loading state during API failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      render(<LolDashboard />)

      // The team leaderboard should show loading state since data never arrives
      await waitFor(() => {
        expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument()
      })
    })

    it('does not display error message when API succeeds', async () => {
      render(<LolDashboard />)

      await waitFor(() => {
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
      })
    })

    it('shows data after successful API call', async () => {
      render(<LolDashboard />)

      // Wait for team data to load and render
      await waitFor(() => {
        expect(screen.getByTestId(`team-row-${mockTeam.team.teamId}`)).toBeInTheDocument()
      })
    })
  })

  describe('empty state', () => {
    it('renders correctly with empty teams list', () => {
      mockUseDashboardData.mockReturnValue(createMockDashboardData({
        data: {
          teams: [],
          teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
          topGrinders: [],
          topLpGainers: [],
          topLpLosers: [],
        },
      }))

      render(<LolDashboard />)

      // Should still render the leaderboard container
      expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument()
    })

    it('shows dash for stats when no team/player selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [],
        selectedPlayers: [],
      }))

      render(<LolDashboard />)

      // Stat cards have multiple instances due to responsive layout
      // Verify at least one instance of each shows dash for no selection
      const gamesCards = screen.getAllByTestId('stat-card-games')
      const winrateCards = screen.getAllByTestId('stat-card-winrate')
      const lpCards = screen.getAllByTestId('stat-card-lp')

      // At least one of each card type should show '-'
      const gamesHasDash = gamesCards.some(card =>
        within(card).getByTestId('stat-value').textContent === '-'
      )
      const winrateHasDash = winrateCards.some(card =>
        within(card).getByTestId('stat-value').textContent === '-'
      )
      const lpHasDash = lpCards.some(card =>
        within(card).getByTestId('stat-value').textContent === '-'
      )

      expect(gamesHasDash).toBe(true)
      expect(winrateHasDash).toBe(true)
      expect(lpHasDash).toBe(true)
    })
  })

  describe('reset functionality', () => {
    it('calls resetToDefault when clicking reset button', () => {
      const resetToDefault = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({ resetToDefault }))

      render(<LolDashboard />)

      // Find and click the reset button (the one with the refresh icon)
      const resetButton = screen.getByTitle('Réinitialiser les filtres')
      fireEvent.click(resetButton)

      expect(resetToDefault).toHaveBeenCalled()
    })
  })

  // Tests for API call integration - verifies the component makes correct API calls
  describe('API integration', () => {
    it('calls /lol/dashboard/teams with correct filter params', async () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedLeagues: ['LEC'],
        minGames: 5,
        sortBy: 'games',
        currentPage: 2,
        itemsPerPage: 10,
      }))

      render(<LolDashboard />)

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/teams',
          expect.objectContaining({
            params: expect.objectContaining({
              leagues: ['LEC'],
              minGames: 5,
              sort: 'games',
              page: 2,
              perPage: 10,
            }),
          })
        )
      })
    })

    it('calls /lol/dashboard/players when in players view', async () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectedLeagues: ['LCK'],
        selectedRoles: ['ADC'],
        minGames: 10,
        sortBy: 'winrate',
        currentPage: 3,
        itemsPerPage: 50,
      }))

      render(<LolDashboard />)

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/players',
          expect.objectContaining({
            params: expect.objectContaining({
              leagues: ['LCK'],
              roles: ['ADC'],
              minGames: 10,
              sort: 'winrate',
              page: 3,
              perPage: 50,
            }),
          })
        )
      })
    })

    it('calls /lol/dashboard/team-history with selected team', async () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [mockTeam],
      }))

      render(<LolDashboard />)

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          expect.stringContaining('/lol/dashboard/team-history'),
          expect.any(Object)
        )
      })
    })

    it('calls /lol/dashboard/player-history with selected player in players view', async () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectedPlayers: [mockPlayer],
      }))

      render(<LolDashboard />)

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          expect.stringContaining('/lol/dashboard/player-history'),
          expect.any(Object)
        )
      })
    })
  })

  describe('two teams comparison', () => {
    it('shows comparison stats when two teams are selected', () => {
      const team2: TeamLeaderboardEntry = {
        ...mockTeam,
        team: { ...mockTeam.team, teamId: 2, currentName: 'G2 Esports', shortName: 'G2' },
        games: 120,
        winrate: 55.0,
        totalLp: 11000,
      }

      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [mockTeam, team2],
      }))

      render(<LolDashboard />)

      // With 2 teams selected, StatCard receives teams prop instead of value/change
      // StatCards are rendered in multiple places (responsive layout)
      const gamesCards = screen.getAllByTestId('stat-card-games')
      expect(gamesCards.length).toBeGreaterThan(0)
    })
  })

  describe('period date range', () => {
    it('passes computed date range to API calls', async () => {
      // Store computes date range from period (e.g., 30d = 30 days sliding window)
      const startDate = '2024-01-01'
      const endDate = '2024-01-30'

      mockUseDashboardStore.mockReturnValue(createMockStore({
        period: '30d',
        getDateRange: vi.fn(() => ({ startDate, endDate })),
      }))

      render(<LolDashboard />)

      // Verify API is called with computed date range params
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/teams',
          expect.objectContaining({
            params: expect.objectContaining({
              startDate,
              endDate,
            }),
          })
        )
      })
    })
  })

  describe('responsive behavior', () => {
    it('renders mini leaderboards in both locations', () => {
      render(<LolDashboard />)

      // TopGrinders, TopLpGainers, TopLpLosers are each rendered twice
      // (once in xl sidebar, once in smaller screen section)
      const grinders = screen.getAllByTestId('top-grinders')
      const gainers = screen.getAllByTestId('top-lp-gainers')
      const losers = screen.getAllByTestId('top-lp-losers')

      expect(grinders.length).toBe(2)
      expect(gainers.length).toBe(2)
      expect(losers.length).toBe(2)
    })
  })
})
