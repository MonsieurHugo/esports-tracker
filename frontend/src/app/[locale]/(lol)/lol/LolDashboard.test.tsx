import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import LolDashboard from './LolDashboard'
import { mockTeam, mockPlayer, mockGrinderEntries } from '@/tests/mocks'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry, GrinderEntry, LpChangeEntry } from '@/lib/types'

// Mock the API module - the component makes direct API calls for leagues
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

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: vi.fn(() => {
    const t = (key: string) => {
      const translations: Record<string, string> = {
        'dashboard.title': 'Dashboard',
        'common.reset': 'Réinitialiser les filtres',
        'common.expand': 'Agrandir',
        'common.supportDev': 'Soutenir le dev',
        'errors.loadLeagues': 'Erreur lors du chargement des ligues',
      }
      return translations[key] || key
    }
    return t
  }),
}))

// Mock the data fetching hook
vi.mock('@/hooks/useLolDashboardData', () => ({
  useLolDashboardData: vi.fn(),
}))

// Mock the URL sync hook
vi.mock('@/hooks/useLolDashboardUrl', () => ({
  useLolDashboardUrl: vi.fn(() => ({ isUrlInitialized: true })),
}))

// Mock stores hydration
vi.mock('@/hooks/useStoresHydrated', () => ({
  useStoresHydrated: vi.fn(() => true),
}))

// Mock the dashboard store
vi.mock('@/stores/dashboardStore', () => ({
  useDashboardStore: vi.fn(),
  usePeriodStore: vi.fn(),
  useFilterStore: vi.fn(),
  useSelectionStore: vi.fn(),
  useUIStore: vi.fn(),
}))

// Mock toast store
vi.mock('@/stores/toastStore', () => ({
  useToastStore: vi.fn((selector: (state: { addToast: () => void }) => unknown) =>
    selector({ addToast: vi.fn() })
  ),
}))

// Mock period store constant
vi.mock('@/stores/periodStore', () => ({
  MIN_DATA_DATE: '2024-01-01',
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

// Mock date utils
vi.mock('@/lib/dateUtils', () => ({
  generateCompleteDateRange: vi.fn(() => []),
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

vi.mock('@/components/dashboard/StatsCards', () => ({
  default: ({ viewMode, selectedTeams, selectedPlayers }: {
    viewMode: 'teams' | 'players'
    selectedTeams: TeamLeaderboardEntry[]
    selectedPlayers: PlayerLeaderboardEntry[]
  }) => {
    if (viewMode === 'teams') {
      if (selectedTeams.length >= 1) {
        const team = selectedTeams[0]
        return (
          <>
            <div data-testid="stat-card-games">
              <span data-testid="stat-label">Games</span>
              <span data-testid="stat-value">{team.games}</span>
            </div>
            <div data-testid="stat-card-winrate">
              <span data-testid="stat-label">Winrate</span>
              <span data-testid="stat-value">{team.winrate.toFixed(1)}%</span>
            </div>
            <div data-testid="stat-card-lp">
              <span data-testid="stat-label">LP</span>
              <span data-testid="stat-value">{team.totalLp}</span>
            </div>
          </>
        )
      }
      return (
        <>
          <div data-testid="stat-card-games">
            <span data-testid="stat-label">Games</span>
            <span data-testid="stat-value">-</span>
          </div>
          <div data-testid="stat-card-winrate">
            <span data-testid="stat-label">Winrate</span>
            <span data-testid="stat-value">-</span>
          </div>
          <div data-testid="stat-card-lp">
            <span data-testid="stat-label">LP</span>
            <span data-testid="stat-value">-</span>
          </div>
        </>
      )
    }
    // Players view
    if (selectedPlayers.length >= 1) {
      const player = selectedPlayers[0]
      return (
        <>
          <div data-testid="stat-card-games">
            <span data-testid="stat-label">Games</span>
            <span data-testid="stat-value">{player.games}</span>
          </div>
          <div data-testid="stat-card-winrate">
            <span data-testid="stat-label">Winrate</span>
            <span data-testid="stat-value">{player.winrate.toFixed(1)}%</span>
          </div>
          <div data-testid="stat-card-lp">
            <span data-testid="stat-label">LP</span>
            <span data-testid="stat-value">{player.totalLp}</span>
          </div>
        </>
      )
    }
    return (
      <>
        <div data-testid="stat-card-games">
          <span data-testid="stat-label">Games</span>
          <span data-testid="stat-value">-</span>
        </div>
        <div data-testid="stat-card-winrate">
          <span data-testid="stat-label">Winrate</span>
          <span data-testid="stat-value">-</span>
        </div>
        <div data-testid="stat-card-lp">
          <span data-testid="stat-label">LP</span>
          <span data-testid="stat-value">-</span>
        </div>
      </>
    )
  },
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
        <div key={i} data-testid={`grinder-${i}`}>{e.entity.name}</div>
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

vi.mock('@/components/layout/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Language</div>,
}))

vi.mock('@/components/dashboard/MobileControlBar', () => ({
  default: () => <div data-testid="mobile-control-bar">Mobile Controls</div>,
}))

vi.mock('@/components/dashboard/MobileFiltersSheet', () => ({
  default: () => <div data-testid="mobile-filters-sheet">Mobile Filters</div>,
}))

vi.mock('@/components/dashboard/ChartsModal', () => ({
  default: () => <div data-testid="charts-modal">Charts Modal</div>,
}))

vi.mock('@/components/ui/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/ChartErrorFallback', () => ({
  ChartErrorFallback: () => <div data-testid="chart-error">Chart Error</div>,
}))

// Import mocked modules
import { useLolDashboardData } from '@/hooks/useLolDashboardData'
import { useDashboardStore, useUIStore } from '@/stores/dashboardStore'
import api from '@/lib/api'

const mockUseLolDashboardData = useLolDashboardData as Mock
const mockUseDashboardStore = useDashboardStore as Mock
const mockUseUIStore = useUIStore as Mock
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

// Default hook return value for useLolDashboardData
const createMockDashboardDataResult = (overrides = {}) => ({
  data: {
    teams: [mockTeam],
    teamsMeta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: mockGrinderEntries,
    topLpGainers: [],
    topLpLosers: [],
  },
  isLoading: false,
  players: [mockPlayer],
  playersMeta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
  isPlayersLoading: false,
  teamsLpData: [],
  teamsGamesData: [],
  playersLpData: [],
  playersGamesData: [],
  isHistoryLoading: false,
  getTeamLpStats: vi.fn((team: TeamLeaderboardEntry) => ({ totalLp: team.totalLp, lpChange: team.totalLpChange })),
  getPlayerLpStats: vi.fn((player: PlayerLeaderboardEntry) => ({ totalLp: player.totalLp, lpChange: player.totalLpChange })),
  ...overrides,
})

describe('LolDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup API mock for leagues fetch (the only direct API call in the component)
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/lol/dashboard/leagues') {
        return Promise.resolve({ data: [{ leagueId: 1, shortName: 'LEC', name: 'LEC', region: 'EMEA' }, { leagueId: 2, shortName: 'LFL', name: 'LFL', region: 'FR' }] })
      }
      return Promise.resolve({ data: [] })
    })

    // Setup store mocks
    mockUseDashboardStore.mockReturnValue(createMockStore())
    mockUseUIStore.mockReturnValue(createMockUIStore())

    // Setup hook mock
    mockUseLolDashboardData.mockReturnValue(createMockDashboardDataResult())
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
      // StatsCards are rendered in multiple places (xl sidebar + smaller screen areas)
      expect(screen.getAllByTestId('stat-card-games').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('stat-card-winrate').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('stat-card-lp').length).toBeGreaterThan(0)
    })
  })

  describe('loading state', () => {
    it('shows loading state in team leaderboard when data is loading', () => {
      mockUseLolDashboardData.mockReturnValue(createMockDashboardDataResult({
        isLoading: true,
        data: {
          teams: [],
          teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
          topGrinders: mockGrinderEntries,
          topLpGainers: [],
          topLpLosers: [],
        },
      }))

      render(<LolDashboard />)
      expect(screen.getByTestId('team-leaderboard-loading')).toBeInTheDocument()
    })

    it('shows charts initially without loading state (mocked components)', async () => {
      render(<LolDashboard />)

      expect(screen.getByTestId('games-chart')).toHaveTextContent('Games Chart')
      expect(screen.getByTestId('lp-chart')).toHaveTextContent('LP Chart')
    })

    it('shows loading state in top grinders when loading', () => {
      mockUseLolDashboardData.mockReturnValue(createMockDashboardDataResult({ isLoading: true }))

      render(<LolDashboard />)
      const grinders = screen.getAllByTestId('top-grinders')
      expect(grinders[0]).toHaveTextContent('Loading...')
    })
  })

  describe('data display', () => {
    it('displays team data in leaderboard after loading', async () => {
      render(<LolDashboard />)

      const teamRow = screen.getByTestId(`team-row-${mockTeam.team.teamId}`)
      expect(teamRow).toBeInTheDocument()
      expect(teamRow).toHaveTextContent(mockTeam.team.currentName)
    })

    it('displays grinders after loading', async () => {
      render(<LolDashboard />)

      const grinders = screen.getAllByTestId('top-grinders')
      const hasLoadedGrinders = grinders.some(grinder => !grinder.textContent?.includes('Loading'))
      expect(hasLoadedGrinders).toBe(true)
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

      fireEvent.click(screen.getByTestId(`team-row-${mockTeam.team.teamId}`))
      expect(selectTeam).toHaveBeenCalledWith(mockTeam)
    })

    it('displays selected team stats in stat cards when team is selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [mockTeam],
      }))

      render(<LolDashboard />)

      const gamesCards = screen.getAllByTestId('stat-card-games')
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

      const gamesCards = screen.getAllByTestId('stat-card-games')
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

      expect(screen.getByTestId(`player-row-${mockPlayer.player.playerId}`)).toBeInTheDocument()
      expect(screen.getByText(mockPlayer.player.pseudo)).toBeInTheDocument()
    })

    it('calls selectPlayer when clicking on a player row', async () => {
      const selectPlayer = vi.fn()
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectPlayer,
      }))

      render(<LolDashboard />)

      fireEvent.click(screen.getByTestId(`player-row-${mockPlayer.player.playerId}`))
      expect(selectPlayer).toHaveBeenCalledWith(mockPlayer)
    })

    it('shows player stats in stat cards when player is selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        leaderboardView: 'players',
        selectedPlayers: [mockPlayer],
      }))

      render(<LolDashboard />)

      const gamesCards = screen.getAllByTestId('stat-card-games')
      const hasPlayerGames = gamesCards.some(card =>
        within(card).getByTestId('stat-value').textContent === String(mockPlayer.games)
      )
      expect(hasPlayerGames).toBe(true)
    })
  })

  describe('error handling', () => {
    it('handles API errors gracefully without crashing', async () => {
      // Make leagues fetch fail
      mockApiGet.mockRejectedValue(new Error('Network error'))

      expect(() => render(<LolDashboard />)).not.toThrow()

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('continues to render leaderboard during API failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      render(<LolDashboard />)

      expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument()
    })

    it('does not display error message when API succeeds', async () => {
      render(<LolDashboard />)

      await waitFor(() => {
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
      })
    })

    it('shows data from hook after loading', async () => {
      render(<LolDashboard />)

      expect(screen.getByTestId(`team-row-${mockTeam.team.teamId}`)).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('renders correctly with empty teams list', () => {
      mockUseLolDashboardData.mockReturnValue(createMockDashboardDataResult({
        data: {
          teams: [],
          teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
          topGrinders: [],
          topLpGainers: [],
          topLpLosers: [],
        },
      }))

      render(<LolDashboard />)

      expect(screen.getByTestId('team-leaderboard')).toBeInTheDocument()
    })

    it('shows dash for stats when no team/player selected', () => {
      mockUseDashboardStore.mockReturnValue(createMockStore({
        selectedTeams: [],
        selectedPlayers: [],
      }))

      render(<LolDashboard />)

      const gamesCards = screen.getAllByTestId('stat-card-games')
      const winrateCards = screen.getAllByTestId('stat-card-winrate')
      const lpCards = screen.getAllByTestId('stat-card-lp')

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

      const resetButton = screen.getByTitle('Réinitialiser les filtres')
      fireEvent.click(resetButton)

      expect(resetToDefault).toHaveBeenCalled()
    })
  })

  describe('API integration', () => {
    it('fetches leagues on mount', async () => {
      render(<LolDashboard />)

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith('/lol/dashboard/leagues')
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

      const gamesCards = screen.getAllByTestId('stat-card-games')
      expect(gamesCards.length).toBeGreaterThan(0)
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
