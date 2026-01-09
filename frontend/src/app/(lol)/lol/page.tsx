'use client'

import { useEffect, useState, useRef } from 'react'
import { useDashboardStore } from '@/stores/dashboardStore'
import api from '@/lib/api'
import type {
  DashboardSummary,
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  TopGrinderEntry,
  StreakEntry,
  TeamHistoryData,
} from '@/lib/types'

import PeriodSelector from '@/components/dashboard/PeriodSelector'
import PeriodNavigator from '@/components/dashboard/PeriodNavigator'
import LeagueDropdown from '@/components/dashboard/LeagueDropdown'
import TeamSearchDropdown from '@/components/dashboard/TeamSearchDropdown'
import PlayerSearchDropdown from '@/components/dashboard/PlayerSearchDropdown'
import StatCard from '@/components/dashboard/StatCard'
import GamesChart, { type TeamGamesData } from '@/components/dashboard/GamesChart'
import LpChart, { type TeamLpData } from '@/components/dashboard/LpChart'
import TeamLeaderboard from '@/components/dashboard/TeamLeaderboard'
import PlayerLeaderboard from '@/components/dashboard/PlayerLeaderboard'
import TopGrinders from '@/components/dashboard/TopGrinders'
import StreakList from '@/components/dashboard/StreakList'
import ThemeSelector from '@/components/ThemeSelector'

interface DashboardData {
  summary: DashboardSummary | null
  teams: TeamLeaderboardEntry[]
  teamsMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  topGrinders: TopGrinderEntry[]
  streaks: StreakEntry[]
  lossStreaks: StreakEntry[]
}

export default function LolDashboard() {
  const {
    period,
    customStartDate,
    customEndDate,
    selectedLeagues,
    sortBy,
    currentPage,
    itemsPerPage,
    leaderboardView,
    selectedTeams,
    selectedPlayers,
    resetKey,
    setPeriod,
    setCustomDateRange,
    navigatePeriod,
    toggleLeague,
    selectAllLeagues,
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

  // Pour la compatibilité avec les composants existants (stats, etc.)
  const selectedTeam = selectedTeams[0] || null

  const [data, setData] = useState<DashboardData>({
    summary: null,
    teams: [],
    teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: [],
    streaks: [],
    lossStreaks: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isPlayersLoading, setIsPlayersLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [teamsLpData, setTeamsLpData] = useState<TeamLpData[]>([])
  const [teamsGamesData, setTeamsGamesData] = useState<TeamGamesData[]>([])
  const [playersLpData, setPlayersLpData] = useState<TeamLpData[]>([])
  const [playersGamesData, setPlayersGamesData] = useState<TeamGamesData[]>([])
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[]>([])
  const [playersMeta, setPlayersMeta] = useState({ total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
  const [grindersSort, setGrindersSort] = useState<'asc' | 'desc'>('desc')
  const [streaksSort, setStreaksSort] = useState<'asc' | 'desc'>('desc')
  const [lossStreaksSort, setLossStreaksSort] = useState<'asc' | 'desc'>('desc')

  const refDate = getRefDateString()
  // For custom period, use the end date to determine if we can go next
  const canGoNext = period === 'custom' && customEndDate
    ? customEndDate < new Date()
    : new Date(refDate) < new Date()

  // Set default itemsPerPage based on screen size (20 on desktop, 10 on mobile)
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    setItemsPerPage(isMobile ? 10 : 20)
  }, [setItemsPerPage])

  // Track previous period/refDate to detect period changes vs filter changes
  const prevPeriodRef = useRef<{ period: string; refDate: string }>({ period, refDate })

  // Créer une chaîne stable des teamIds pour éviter les boucles infinies
  const selectedTeamIdsString = selectedTeams.map((t) => t.team.teamId).join(',')

  // Get date range for API calls
  const dateRange = getDateRange()
  const customStartDateStr = customStartDate ? customStartDate.toISOString().split('T')[0] : undefined
  const customEndDateStr = customEndDate ? customEndDate.toISOString().split('T')[0] : undefined

  // Fetch main dashboard data (summary + teams)
  useEffect(() => {
    const fetchData = async () => {
      // Seulement afficher le loading sur le chargement initial
      const isInitialLoad = data.teams.length === 0
      if (isInitialLoad) {
        setIsLoading(true)
      }

      try {
        const baseParams: Record<string, string | undefined> = { period, date: refDate }
        // For custom period, add explicit start and end dates
        if (period === 'custom' && customStartDateStr && customEndDateStr) {
          baseParams.startDate = customStartDateStr
          baseParams.endDate = customEndDateStr
        }

        const [summaryRes, teamsRes] = await Promise.all([
          api.get<DashboardSummary>(
            '/lol/dashboard/summary',
            { params: baseParams }
          ),
          api.get<{
            data: TeamLeaderboardEntry[]
            meta: { total: number; perPage: number; currentPage: number; lastPage: number }
          }>('/lol/dashboard/teams', {
            params: {
              ...baseParams,
              leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
              sortBy,
              page: currentPage,
              limit: itemsPerPage,
            },
          }),
        ])

        const newTeams = teamsRes.data || []
        setData((prev) => ({
          ...prev,
          summary: summaryRes,
          teams: newTeams,
          teamsMeta: teamsRes.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 },
        }))

        // Détecter si c'est un changement de période ou juste un changement de filtre
        const isPeriodChange = prevPeriodRef.current.period !== period || prevPeriodRef.current.refDate !== refDate
        prevPeriodRef.current = { period, refDate }

        // Mettre à jour les données des équipes sélectionnées (sans toggler la sélection)
        selectedTeams.forEach((selectedTeam) => {
          const updatedTeam = newTeams.find((t) => t.team.teamId === selectedTeam.team.teamId)
          if (updatedTeam) {
            updateSelectedTeamData(updatedTeam)
          } else if (isPeriodChange) {
            // L'équipe n'a pas de données pour cette nouvelle période - marquer sans données
            updateSelectedTeamData({
              ...selectedTeam,
              rank: -1, // -1 = pas de données
              games: -1,
              gamesChange: 0,
              winrate: -1,
              winrateChange: 0,
              totalMinutes: -1,
              totalMinutesChange: 0,
              totalLp: selectedTeam.totalLp,
              totalLpChange: 0,
              players: selectedTeam.players.map(p => ({
                ...p,
                games: -1,
                winrate: -1,
              })),
            })
          } else {
            // Changement de filtre de ligue - garder les stats mais masquer le rang
            updateSelectedTeamData({
              ...selectedTeam,
              rank: -1, // Pas dans ce filtre
            })
          }
        })
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refDate, customStartDateStr, customEndDateStr, selectedLeagues, sortBy, currentPage, itemsPerPage])

  // Fetch grinders/streaks data (separate effect to handle team and league filtering)
  useEffect(() => {
    const fetchGrindersAndStreaks = async () => {
      try {
        const params: Record<string, string | undefined> = { period, date: refDate }
        // For custom period, add explicit start and end dates
        if (period === 'custom' && customStartDateStr && customEndDateStr) {
          params.startDate = customStartDateStr
          params.endDate = customEndDateStr
        }

        // Envoyer les IDs d'équipes en chaîne séparée par virgules
        if (selectedTeamIdsString) {
          params.teamIds = selectedTeamIdsString
        }

        // Envoyer les ligues en chaîne séparée par virgules
        if (selectedLeagues.length > 0) {
          params.leagues = selectedLeagues.join(',')
        }

        const [grindersRes, streaksRes, lossStreaksRes] = await Promise.all([
          api.get<{ data: TopGrinderEntry[] }>('/lol/dashboard/top-grinders', {
            params: { ...params, limit: 5, sort: grindersSort },
          }),
          api.get<{ data: StreakEntry[] }>('/lol/dashboard/streaks', {
            params: { ...params, limit: 5, sort: streaksSort },
          }),
          api.get<{ data: StreakEntry[] }>('/lol/dashboard/loss-streaks', {
            params: { ...params, limit: 5, sort: lossStreaksSort },
          }),
        ])

        setData((prev) => ({
          ...prev,
          topGrinders: grindersRes.data || [],
          streaks: streaksRes.data || [],
          lossStreaks: lossStreaksRes.data || [],
        }))
      } catch (error) {
        console.error('Failed to fetch grinders/streaks:', error)
      }
    }

    fetchGrindersAndStreaks()
  }, [period, refDate, customStartDateStr, customEndDateStr, grindersSort, streaksSort, lossStreaksSort, selectedTeamIdsString, selectedLeagues])

  // Fetch players data when in players view
  useEffect(() => {
    if (leaderboardView !== 'players') return

    const fetchPlayers = async () => {
      setIsPlayersLoading(true)
      try {
        const params: Record<string, string | number | string[] | undefined> = { period, date: refDate }
        // For custom period, add explicit start and end dates
        if (period === 'custom' && customStartDateStr && customEndDateStr) {
          params.startDate = customStartDateStr
          params.endDate = customEndDateStr
        }
        const res = await api.get<{
          data: PlayerLeaderboardEntry[]
          meta: { total: number; perPage: number; currentPage: number; lastPage: number }
        }>('/lol/dashboard/players', {
          params: {
            ...params,
            leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
            sortBy,
            page: currentPage,
            limit: itemsPerPage,
          },
        })
        setPlayers(res.data || [])
        setPlayersMeta(res.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
      } catch (error) {
        console.error('Failed to fetch players data:', error)
      } finally {
        setIsPlayersLoading(false)
      }
    }

    fetchPlayers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardView, period, refDate, customStartDateStr, customEndDateStr, selectedLeagues, sortBy, currentPage, itemsPerPage])

  // Fetch unified team history (games + LP) for selected teams
  useEffect(() => {
    const fetchTeamHistory = async () => {
      if (selectedTeams.length === 0) {
        setTeamsGamesData([])
        setTeamsLpData([])
        return
      }

      setIsHistoryLoading(true)
      try {
        // Fetch unified history for all selected teams in parallel
        const results = await Promise.all(
          selectedTeams.map(async (team) => {
            const params: Record<string, string | number | undefined> = {
              period,
              date: refDate,
              teamId: team.team.teamId,
            }
            // For custom period, add explicit start and end dates
            if (period === 'custom' && customStartDateStr && customEndDateStr) {
              params.startDate = customStartDateStr
              params.endDate = customEndDateStr
            }
            const res = await api.get<{ data: TeamHistoryData[] }>('/lol/dashboard/team-history', {
              params,
            })
            return {
              teamName: team.team.currentName,
              data: res.data || [],
            }
          })
        )

        // Extraire les données de games pour GamesChart
        setTeamsGamesData(results.map((r) => ({
          teamName: r.teamName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            games: d.games,
            wins: d.wins,
            winrate: d.winrate,
          })),
        })))

        // Extraire les données de LP pour LpChart
        setTeamsLpData(results.map((r) => ({
          teamName: r.teamName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        console.error('Failed to fetch team history:', error)
        setTeamsGamesData([])
        setTeamsLpData([])
      } finally {
        setIsHistoryLoading(false)
      }
    }

    fetchTeamHistory()
  }, [selectedTeams, period, refDate, customStartDateStr, customEndDateStr])

  // Fetch player history for selected players (games + LP)
  useEffect(() => {
    const fetchPlayerHistory = async () => {
      if (selectedPlayers.length === 0) {
        setPlayersGamesData([])
        setPlayersLpData([])
        return
      }

      setIsHistoryLoading(true)
      try {
        const results = await Promise.all(
          selectedPlayers.map(async (player) => {
            const params: Record<string, string | number | undefined> = {
              period,
              date: refDate,
              playerId: player.player.playerId,
            }
            // For custom period, add explicit start and end dates
            if (period === 'custom' && customStartDateStr && customEndDateStr) {
              params.startDate = customStartDateStr
              params.endDate = customEndDateStr
            }
            const res = await api.get<{ data: TeamHistoryData[] }>('/lol/dashboard/player-history', {
              params,
            })
            return {
              playerName: player.player.pseudo,
              data: res.data || [],
            }
          })
        )

        // Extract games data
        setPlayersGamesData(results.map((r) => ({
          teamName: r.playerName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            games: d.games,
            wins: d.wins,
            winrate: d.winrate,
          })),
        })))

        // Extract LP data
        setPlayersLpData(results.map((r) => ({
          teamName: r.playerName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        console.error('Failed to fetch player history:', error)
        setPlayersGamesData([])
        setPlayersLpData([])
      } finally {
        setIsHistoryLoading(false)
      }
    }

    fetchPlayerHistory()
  }, [selectedPlayers, period, refDate, customStartDateStr, customEndDateStr])

  // Format total minutes as hours
  const formatMinutesAsHours = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60)
    return `${hours.toLocaleString('fr-FR')}h`
  }

  return (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="flex justify-between items-center mb-4 sm:mb-5">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <ThemeSelector />
      </header>

      {/* Main Grid - Contenu */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column - Filters + Leaderboard */}
        <div className="flex flex-col gap-3">
          {/* Filters */}
          <div className="flex flex-col gap-2 sm:gap-3">
            {/* Row 1: Period Selector + Reset */}
            <div className="flex flex-wrap justify-between items-center gap-2 sm:gap-3">
              <PeriodSelector
                value={period}
                onChange={setPeriod}
                customStartDate={customStartDate}
                customEndDate={customEndDate}
                onCustomDateChange={setCustomDateRange}
              />
              <button
                onClick={resetToDefault}
                className="flex items-center justify-center w-8 h-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
                title="Réinitialiser les filtres"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M3 4V9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            {/* Row 2: Period Navigator + Search */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <PeriodNavigator
                label={getPeriodLabel()}
                onPrevious={() => navigatePeriod('prev')}
                onNext={() => navigatePeriod('next')}
                canGoNext={canGoNext}
              />
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
                />
              }
            />
          )}
        </div>

        {/* Right Column - Stats + Charts */}
        <div className="flex flex-col gap-3">
          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {leaderboardView === 'teams' ? (
              // Teams stats
              selectedTeams.length === 2 ? (
                <>
                  <StatCard
                    label="Games"
                    changeUnit=""
                    teams={selectedTeams.map((t) => ({
                      value: t.games === -1 ? '-' : t.games,
                      change: t.games === -1 ? undefined : t.gamesChange,
                    }))}
                  />
                  <StatCard
                    label="Winrate"
                    changeUnit="%"
                    teams={selectedTeams.map((t) => ({
                      value: t.winrate === -1 || t.games === 0 ? '-' : `${t.winrate.toFixed(1)}%`,
                      change: t.winrate === -1 || t.games === 0 ? undefined : t.winrateChange,
                    }))}
                  />
                  <StatCard
                    label="LP"
                    changeUnit=" LP"
                    teams={selectedTeams.map((t) => ({
                      value: t.totalLp.toLocaleString('fr-FR'),
                      change: t.totalLpChange,
                    }))}
                  />
                  <StatCard
                    label="Temps de jeu"
                    changeUnit=" min"
                    teams={selectedTeams.map((t) => ({
                      value: t.totalMinutes === -1 ? '-' : formatMinutesAsHours(t.totalMinutes),
                      change: t.totalMinutes === -1 ? undefined : t.totalMinutesChange,
                    }))}
                  />
                </>
              ) : selectedTeams.length === 1 ? (
                <>
                  <StatCard
                    label="Games"
                    value={selectedTeam!.games === -1 ? '-' : selectedTeam!.games}
                    change={selectedTeam!.games === -1 ? undefined : selectedTeam!.gamesChange}
                    changeUnit=""
                  />
                  <StatCard
                    label="Winrate"
                    value={selectedTeam!.winrate === -1 || selectedTeam!.games === 0 ? '-' : `${selectedTeam!.winrate.toFixed(1)}%`}
                    change={selectedTeam!.winrate === -1 || selectedTeam!.games === 0 ? undefined : selectedTeam!.winrateChange}
                    changeUnit="%"
                  />
                  <StatCard
                    label="LP"
                    value={selectedTeam!.totalLp.toLocaleString('fr-FR')}
                    change={selectedTeam!.totalLpChange}
                    changeUnit=" LP"
                  />
                  <StatCard
                    label="Temps de jeu"
                    value={selectedTeam!.totalMinutes === -1 ? '-' : formatMinutesAsHours(selectedTeam!.totalMinutes)}
                    change={selectedTeam!.totalMinutes === -1 ? undefined : selectedTeam!.totalMinutesChange}
                    changeUnit=" min"
                  />
                </>
              ) : (
                <>
                  <StatCard label="Games" value="-" />
                  <StatCard label="Winrate" value="-" />
                  <StatCard label="LP" value="-" />
                  <StatCard label="Temps de jeu" value="-" />
                </>
              )
            ) : (
              // Players stats
              selectedPlayers.length === 2 ? (
                <>
                  <StatCard
                    label="Games"
                    changeUnit=""
                    teams={selectedPlayers.map((p) => ({
                      value: p.games,
                      change: p.gamesChange,
                    }))}
                  />
                  <StatCard
                    label="Winrate"
                    changeUnit="%"
                    teams={selectedPlayers.map((p) => ({
                      value: p.games === 0 ? '-' : `${p.winrate.toFixed(1)}%`,
                      change: p.games === 0 ? undefined : p.winrateChange,
                    }))}
                  />
                  <StatCard
                    label="LP"
                    changeUnit=" LP"
                    teams={selectedPlayers.map((p) => ({
                      value: p.totalLp.toLocaleString('fr-FR'),
                      change: p.totalLpChange,
                    }))}
                  />
                  <StatCard
                    label="Temps de jeu"
                    changeUnit=" min"
                    teams={selectedPlayers.map((p) => ({
                      value: formatMinutesAsHours(p.totalMinutes),
                      change: p.totalMinutesChange,
                    }))}
                  />
                </>
              ) : selectedPlayers.length === 1 ? (
                <>
                  <StatCard
                    label="Games"
                    value={selectedPlayers[0].games}
                    change={selectedPlayers[0].gamesChange}
                    changeUnit=""
                  />
                  <StatCard
                    label="Winrate"
                    value={selectedPlayers[0].games === 0 ? '-' : `${selectedPlayers[0].winrate.toFixed(1)}%`}
                    change={selectedPlayers[0].games === 0 ? undefined : selectedPlayers[0].winrateChange}
                    changeUnit="%"
                  />
                  <StatCard
                    label="LP"
                    value={selectedPlayers[0].totalLp.toLocaleString('fr-FR')}
                    change={selectedPlayers[0].totalLpChange}
                    changeUnit=" LP"
                  />
                  <StatCard
                    label="Temps de jeu"
                    value={formatMinutesAsHours(selectedPlayers[0].totalMinutes)}
                    change={selectedPlayers[0].totalMinutesChange}
                    changeUnit=" min"
                  />
                </>
              ) : (
                <>
                  <StatCard label="Games" value="-" />
                  <StatCard label="Winrate" value="-" />
                  <StatCard label="LP" value="-" />
                  <StatCard label="Temps de jeu" value="-" />
                </>
              )
            )}
          </div>

          {/* Charts */}
          <GamesChart
            teams={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
            isLoading={isHistoryLoading}
          />
          <LpChart
            teams={leaderboardView === 'players' ? playersLpData : teamsLpData}
            isLoading={isHistoryLoading}
          />

          {/* Mini Leaderboards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TopGrinders
              entries={data.topGrinders}
              isLoading={isLoading}
              sortDirection={grindersSort}
              onSortChange={setGrindersSort}
            />
            <StreakList
              entries={data.streaks}
              type="wins"
              isLoading={isLoading}
              sortDirection={streaksSort}
              onSortChange={setStreaksSort}
            />
            <StreakList
              entries={data.lossStreaks}
              type="losses"
              isLoading={isLoading}
              sortDirection={lossStreaksSort}
              onSortChange={setLossStreaksSort}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
