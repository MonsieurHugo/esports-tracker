'use client'

import { useEffect, useState, useMemo } from 'react'
import { useDashboardStore, useUIStore } from '@/stores/dashboardStore'
import { useStoresHydrated } from '@/hooks/useStoresHydrated'
import { useToastStore } from '@/stores/toastStore'
import { useLolDashboardUrl } from '@/hooks/useLolDashboardUrl'
import { useLolDashboardData } from '@/hooks/useLolDashboardData'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { generateCompleteDateRange } from '@/lib/dateUtils'
import { MIN_DATA_DATE } from '@/stores/periodStore'
import { PERIOD_DAYS } from '@/lib/types'
import type { LeagueInfo } from '@/lib/types'

import PeriodSelector from '@/components/dashboard/PeriodSelector'
import PeriodNavigator from '@/components/dashboard/PeriodNavigator'
import LeagueDropdown from '@/components/dashboard/LeagueDropdown'
import RoleIconFilter from '@/components/dashboard/RoleIconFilter'
import GamesFilter from '@/components/dashboard/GamesFilter'
import TeamSearchDropdown from '@/components/dashboard/TeamSearchDropdown'
import PlayerSearchDropdown from '@/components/dashboard/PlayerSearchDropdown'
import StatsCards from '@/components/dashboard/StatsCards'
import GamesChart from '@/components/dashboard/GamesChart'
import LpChart from '@/components/dashboard/LpChart'
import LpChangeChart from '@/components/dashboard/LpChangeChart'
import DailyWinrateChart from '@/components/dashboard/DailyWinrateChart'
import ChartsModal from '@/components/dashboard/ChartsModal'
import MobileControlBar from '@/components/dashboard/MobileControlBar'
import MobileFiltersSheet from '@/components/dashboard/MobileFiltersSheet'
import TeamLeaderboard from '@/components/dashboard/TeamLeaderboard'
import PlayerLeaderboard from '@/components/dashboard/PlayerLeaderboard'
import TopGrinders from '@/components/dashboard/TopGrinders'
import TopLpGainers from '@/components/dashboard/TopLpGainers'
import TopLpLosers from '@/components/dashboard/TopLpLosers'
import ThemeSelector from '@/components/ThemeSelector'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ChartErrorFallback } from '@/components/ui/ChartErrorFallback'

export default function LolDashboard() {
  const {
    period,
    selectedLeagues,
    selectedRoles,
    minGames,
    sortBy,
    currentPage,
    itemsPerPage,
    leaderboardView,
    selectedTeams,
    selectedPlayers,
    resetKey,
    setPeriod,
    navigatePeriod,
    toggleLeague,
    selectAllLeagues,
    toggleRole,
    selectAllRoles,
    setMinGames,
    setSortBy,
    setPage,
    setItemsPerPage,
    setLeaderboardView,
    selectTeam,
    updateSelectedTeamData,
    clearTeams,
    selectPlayer,
    clearPlayers,
    lockedTeamIds,
    lockedPlayerIds,
    toggleLockTeam,
    toggleLockPlayer,
    resetToDefault,
    getPeriodLabel,
    getRefDateString,
    getDateRange,
  } = useDashboardStore()

  // Charts modal state
  const { isChartsModalOpen, openChartsModal, closeChartsModal } = useUIStore()

  // Toast notifications
  const addToast = useToastStore(state => state.addToast)

  // Wait for stores to hydrate before fetching data
  const isHydrated = useStoresHydrated()

  // Available leagues for URL cleanup (when all leagues selected = no filter)
  const [availableLeagues, setAvailableLeagues] = useState<LeagueInfo[]>([])

  const refDate = getRefDateString()
  const { startDate, endDate } = getDateRange()

  // URL synchronization
  const { isUrlInitialized } = useLolDashboardUrl({
    period,
    selectedLeagues,
    selectedRoles,
    minGames,
    leaderboardView,
    sortBy,
    availableLeagues,
    setPeriod,
    selectAllRoles,
    toggleRole,
    setLeaderboardView,
    setSortBy,
  })

  // Data fetching
  const {
    data,
    isLoading,
    players,
    playersMeta,
    isPlayersLoading,
    teamsLpData,
    teamsGamesData,
    playersLpData,
    playersGamesData,
    isHistoryLoading,
    getTeamLpStats,
    getPlayerLpStats,
  } = useLolDashboardData({
    startDate,
    endDate,
    period,
    refDate,
    selectedLeagues,
    selectedRoles,
    minGames,
    sortBy,
    currentPage,
    itemsPerPage,
    leaderboardView,
    selectedTeams,
    selectedPlayers,
    isHydrated,
    isUrlInitialized,
    updateSelectedTeamData,
  })

  // Determine if we can navigate to next period
  const todayStr = new Date().toISOString().split('T')[0]
  const canGoNext = refDate < todayStr

  // Determine if we can navigate to previous period
  const canGoPrev = useMemo(() => {
    const days = PERIOD_DAYS[period]
    const ref = new Date(refDate + 'T00:00:00')
    ref.setDate(ref.getDate() - days)
    const newStartDate = new Date(ref)
    newStartDate.setDate(ref.getDate() - days + 1)
    const year = newStartDate.getFullYear()
    const month = String(newStartDate.getMonth() + 1).padStart(2, '0')
    const day = String(newStartDate.getDate()).padStart(2, '0')
    const newStartDateStr = `${year}-${month}-${day}`
    return newStartDateStr >= MIN_DATA_DATE
  }, [period, refDate])

  // Set default itemsPerPage based on screen size
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    setItemsPerPage(isMobile ? 10 : 20)
  }, [setItemsPerPage])

  // Fetch available leagues on mount
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        const res = await api.get<{ data: LeagueInfo[] }>('/lol/dashboard/leagues')
        setAvailableLeagues(res.data || [])
      } catch (error) {
        logError('Failed to fetch leagues', error)
        addToast({
          message: 'Impossible de charger les ligues disponibles',
          type: 'error',
        })
      }
    }
    fetchLeagues()
  }, [addToast])

  // Generate complete date range for charts
  const chartDateRange = useMemo(() => {
    return generateCompleteDateRange({
      period,
      refDate,
    })
  }, [period, refDate])

  // Calculate active filters count for mobile badge
  const activeFiltersCount = (() => {
    let count = 0
    if (selectedLeagues.length > 0 && selectedLeagues.length < availableLeagues.length) count++
    if (leaderboardView === 'players' && selectedRoles.length > 0 && selectedRoles.length < 5) count++
    if (minGames > 0) count++
    return count
  })()

  return (
    <main className="p-3 sm:p-5 pb-20 lg:pb-5 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-4 sm:mb-5">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <ThemeSelector />
      </header>

      {/* Main Grid - 3 columns: Stats (left) + Leaderboard (center) + Charts (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr_420px] lg:grid-cols-[1fr_380px] gap-4">
        {/* Left Column - Period + Stats + Mini Leaderboards (hidden on lg, visible on xl) */}
        <div className="hidden xl:flex flex-col gap-3">
          {/* Period Controls */}
          <div className="flex flex-col gap-2">
            <PeriodSelector
              value={period}
              onChange={setPeriod}
            />
            <PeriodNavigator
              label={getPeriodLabel()}
              onPrevious={() => navigatePeriod('prev')}
              onNext={() => navigatePeriod('next')}
              canGoNext={canGoNext}
              canGoPrev={canGoPrev}
            />
          </div>

          {/* Mini Leaderboards - LP Gainers/Losers (stacked vertically) */}
          <div className="flex flex-col gap-3">
            <TopLpGainers
              entries={data.topLpGainers}
              isLoading={isLoading}
            />
            <TopLpLosers
              entries={data.topLpLosers}
              isLoading={isLoading}
            />
            <TopGrinders
              entries={data.topGrinders}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Center Column - Leaderboard */}
        <div className="flex flex-col gap-3">
          {/* Search + Reset above Leaderboard */}
          <div className="flex items-center gap-2">
            <a
              href="https://buymeacoffee.com/MonsieurYordle"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center justify-center gap-2.5 min-w-[180px] h-[34px] px-4 bg-(--warning)/10 border border-(--warning)/40 rounded-md text-(--warning) hover:bg-(--warning)/20 hover:border-(--warning)/60 transition-all duration-200"
              title="Buy me a coffee"
            >
              <span className="text-base">☕</span>
              <span className="text-[11px] font-medium hidden sm:inline">Soutenez le développement du site</span>
            </a>
            <div className="flex-1">
              {leaderboardView === 'teams' ? (
                <TeamSearchDropdown
                  selectedTeams={selectedTeams}
                  onSelect={selectTeam}
                  onClear={clearTeams}
                  period={period}
                  refDate={refDate}
                  selectedLeagues={selectedLeagues}
                  lockedTeamIds={lockedTeamIds}
                  onToggleLock={toggleLockTeam}
                />
              ) : (
                <PlayerSearchDropdown
                  selectedPlayers={selectedPlayers}
                  onSelect={selectPlayer}
                  onClear={clearPlayers}
                  period={period}
                  refDate={refDate}
                  selectedLeagues={selectedLeagues}
                  lockedPlayerIds={lockedPlayerIds}
                  onToggleLock={toggleLockPlayer}
                />
              )}
            </div>
            {/* Expand charts button - hidden on mobile (available in MobileControlBar) */}
            <button
              onClick={openChartsModal}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-(--bg-hover) border border-(--border) rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:border-(--text-muted) transition-colors text-xs"
              title="Agrandir les graphiques"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 21H3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 3L14 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 21L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden xl:inline">Agrandir</span>
            </button>
            <button
              onClick={resetToDefault}
              className="flex items-center justify-center gap-1.5 px-2 h-8 bg-(--bg-card) border border-(--border) rounded-md text-(--text-muted) hover:text-(--text-primary) hover:border-(--text-muted) transition-colors"
              title="Réinitialiser les filtres"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M3 4V9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="hidden md:inline text-xs">reset</span>
            </button>
          </div>

          {/* Leaderboard */}
          {leaderboardView === 'teams' ? (
            <TeamLeaderboard
              key={resetKey}
              data={data.teams}
              isLoading={isLoading}
              currentPage={currentPage}
              totalItems={data.teamsMeta.total}
              itemsPerPage={itemsPerPage}
              onPageChange={setPage}
              onItemsPerPageChange={setItemsPerPage}
              selectedTeams={selectedTeams}
              onSelectTeam={selectTeam}
              sortBy={sortBy}
              onSortChange={setSortBy}
              lockedTeamIds={lockedTeamIds}
              onToggleLock={toggleLockTeam}
              leaderboardView={leaderboardView}
              onViewChange={setLeaderboardView}
              leagueFilter={
                <LeagueDropdown
                  selected={selectedLeagues}
                  onToggle={toggleLeague}
                  onSelectAll={selectAllLeagues}
                  leagues={availableLeagues}
                />
              }
              roleFilter={
                <RoleIconFilter
                  selected={selectedRoles}
                  onToggle={toggleRole}
                  onSelectAll={selectAllRoles}
                />
              }
              gamesFilter={
                <GamesFilter
                  value={minGames}
                  onChange={setMinGames}
                />
              }
            />
          ) : (
            <PlayerLeaderboard
              key={`players-${resetKey}`}
              data={players}
              isLoading={isPlayersLoading}
              currentPage={currentPage}
              totalItems={playersMeta.total}
              itemsPerPage={itemsPerPage}
              onPageChange={setPage}
              onItemsPerPageChange={setItemsPerPage}
              selectedPlayers={selectedPlayers}
              onSelectPlayer={selectPlayer}
              sortBy={sortBy}
              onSortChange={setSortBy}
              lockedPlayerIds={lockedPlayerIds}
              onToggleLock={toggleLockPlayer}
              leaderboardView={leaderboardView}
              onViewChange={setLeaderboardView}
              leagueFilter={
                <LeagueDropdown
                  selected={selectedLeagues}
                  onToggle={toggleLeague}
                  onSelectAll={selectAllLeagues}
                  leagues={availableLeagues}
                />
              }
              roleFilter={
                <RoleIconFilter
                  selected={selectedRoles}
                  onToggle={toggleRole}
                  onSelectAll={selectAllRoles}
                />
              }
              gamesFilter={
                <GamesFilter
                  value={minGames}
                  onChange={setMinGames}
                />
              }
            />
          )}

          {/* Stats + Mini Leaderboards for smaller screens (lg and below) */}
          <div className="xl:hidden flex flex-col gap-3">
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatsCards
                viewMode={leaderboardView}
                selectedTeams={selectedTeams}
                selectedPlayers={selectedPlayers}
                getTeamLpStats={getTeamLpStats}
                getPlayerLpStats={getPlayerLpStats}
              />
            </div>

            {/* Mini Leaderboards (horizontal on lg, stacked on mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TopLpGainers
                entries={data.topLpGainers}
                isLoading={isLoading}
              />
              <TopLpLosers
                entries={data.topLpLosers}
                isLoading={isLoading}
              />
              <TopGrinders
                entries={data.topGrinders}
                isLoading={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Right Column - Stats + Charts */}
        <div className="flex flex-col gap-3">
          {/* Stats Cards (3 cards in a row) */}
          <div className="hidden xl:grid grid-cols-3 gap-2">
            <StatsCards
              viewMode={leaderboardView}
              selectedTeams={selectedTeams}
              selectedPlayers={selectedPlayers}
              getTeamLpStats={getTeamLpStats}
              getPlayerLpStats={getPlayerLpStats}
            />
          </div>
          <ErrorBoundary
            fallback={({ error, resetError }) => (
              <ChartErrorFallback error={error} onRetry={resetError} chartName="Games Played" />
            )}
          >
            <GamesChart
              teams={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
              isLoading={isHistoryLoading}
              dateRange={chartDateRange}
              period={period}
              viewMode={leaderboardView}
            />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ error, resetError }) => (
              <ChartErrorFallback error={error} onRetry={resetError} chartName="Daily Winrate" />
            )}
          >
            <DailyWinrateChart
              teams={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
              isLoading={isHistoryLoading}
              dateRange={chartDateRange}
              period={period}
              viewMode={leaderboardView}
            />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ error, resetError }) => (
              <ChartErrorFallback error={error} onRetry={resetError} chartName="LP Evolution" />
            )}
          >
            <LpChart
              teams={leaderboardView === 'players' ? playersLpData : teamsLpData}
              isLoading={isHistoryLoading}
              dateRange={chartDateRange}
              period={period}
              viewMode={leaderboardView}
            />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={({ error, resetError }) => (
              <ChartErrorFallback error={error} onRetry={resetError} chartName="LP Change" />
            )}
          >
            <LpChangeChart
              teams={leaderboardView === 'players' ? playersLpData : teamsLpData}
              isLoading={isHistoryLoading}
              dateRange={chartDateRange}
              period={period}
              viewMode={leaderboardView}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* Charts Modal for expanded view */}
      <ChartsModal
        isOpen={isChartsModalOpen}
        onClose={closeChartsModal}
        teams={leaderboardView === 'teams' ? selectedTeams : undefined}
        players={leaderboardView === 'players' ? selectedPlayers : undefined}
        gamesData={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
        lpData={leaderboardView === 'players' ? playersLpData : teamsLpData}
        isLoading={isHistoryLoading}
        period={period}
        onPeriodChange={setPeriod}
        periodLabel={getPeriodLabel()}
        onNavigatePeriod={navigatePeriod}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
        leaderboardView={leaderboardView}
        onViewChange={setLeaderboardView}
        dateRange={chartDateRange}
        searchDropdown={
          leaderboardView === 'teams' ? (
            <TeamSearchDropdown
              selectedTeams={selectedTeams}
              onSelect={selectTeam}
              onClear={clearTeams}
              period={period}
              refDate={refDate}
              selectedLeagues={selectedLeagues}
              lockedTeamIds={lockedTeamIds}
              onToggleLock={toggleLockTeam}
            />
          ) : (
            <PlayerSearchDropdown
              selectedPlayers={selectedPlayers}
              onSelect={selectPlayer}
              onClear={clearPlayers}
              period={period}
              refDate={refDate}
              selectedLeagues={selectedLeagues}
              lockedPlayerIds={lockedPlayerIds}
              onToggleLock={toggleLockPlayer}
            />
          )
        }
      />

      {/* Mobile Controls */}
      <MobileControlBar
        period={period}
        onPeriodChange={setPeriod}
        periodLabel={getPeriodLabel()}
        onNavigatePeriod={navigatePeriod}
        canGoNext={canGoNext}
        canGoPrev={canGoPrev}
        activeFiltersCount={activeFiltersCount}
      />

      {/* Mobile Filters Sheet */}
      <MobileFiltersSheet
        period={period}
        onPeriodChange={setPeriod}
        leaderboardView={leaderboardView}
        onViewChange={setLeaderboardView}
        selectedLeagues={selectedLeagues}
        onToggleLeague={toggleLeague}
        onSelectAllLeagues={selectAllLeagues}
        leagues={availableLeagues}
        selectedRoles={selectedRoles}
        onToggleRole={toggleRole}
        onSelectAllRoles={selectAllRoles}
        minGames={minGames}
        onMinGamesChange={setMinGames}
        onResetFilters={resetToDefault}
      />
    </main>
  )
}
