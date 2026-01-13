'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useDashboardStore } from '@/stores/dashboardStore'
import api from '@/lib/api'
import type {
  DashboardSummary,
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  TopGrinderEntry,
  TeamHistoryData,
  LpChangeEntry,
  LeagueInfo,
} from '@/lib/types'

import PeriodSelector from '@/components/dashboard/PeriodSelector'
import PeriodNavigator from '@/components/dashboard/PeriodNavigator'
import LeagueDropdown from '@/components/dashboard/LeagueDropdown'
import RoleIconFilter from '@/components/dashboard/RoleIconFilter'
import GamesFilter from '@/components/dashboard/GamesFilter'
import TeamSearchDropdown from '@/components/dashboard/TeamSearchDropdown'
import PlayerSearchDropdown from '@/components/dashboard/PlayerSearchDropdown'
import StatCard from '@/components/dashboard/StatCard'
import GamesChart, { type TeamGamesData } from '@/components/dashboard/GamesChart'
import LpChart, { type TeamLpData } from '@/components/dashboard/LpChart'
import LpChangeChart from '@/components/dashboard/LpChangeChart'
import DailyWinrateChart from '@/components/dashboard/DailyWinrateChart'
import TeamLeaderboard from '@/components/dashboard/TeamLeaderboard'
import PlayerLeaderboard from '@/components/dashboard/PlayerLeaderboard'
import TopGrinders from '@/components/dashboard/TopGrinders'
import TopLpGainers from '@/components/dashboard/TopLpGainers'
import TopLpLosers from '@/components/dashboard/TopLpLosers'
import ThemeSelector from '@/components/ThemeSelector'

interface DashboardData {
  summary: DashboardSummary | null
  teams: TeamLeaderboardEntry[]
  teamsMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  topGrinders: TopGrinderEntry[]
  topLpGainers: LpChangeEntry[]
  topLpLosers: LpChangeEntry[]
}

export default function LolDashboard() {
  const {
    period,
    customStartDate,
    customEndDate,
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
    setCustomDateRange,
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

  // URL persistence
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isInitialMount = useRef(true)
  const isUpdatingFromUrl = useRef(false)

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isInitialMount.current) return
    isInitialMount.current = false
    isUpdatingFromUrl.current = true

    const urlPeriod = searchParams.get('period')
    const urlLeagues = searchParams.get('leagues')
    const urlRoles = searchParams.get('roles')
    const urlMinGames = searchParams.get('minGames')
    const urlView = searchParams.get('view')
    const urlSort = searchParams.get('sort')

    if (urlPeriod && ['day', 'month', 'year', 'custom'].includes(urlPeriod)) {
      setPeriod(urlPeriod as 'day' | 'month' | 'year' | 'custom')
    }
    if (urlLeagues) {
      const leagues = urlLeagues.split(',').filter(Boolean)
      // Reset then toggle each league
      selectAllLeagues()
      leagues.forEach(toggleLeague)
    }
    if (urlRoles) {
      const roles = urlRoles.split(',').filter(Boolean)
      selectAllRoles()
      roles.forEach(toggleRole)
    }
    if (urlMinGames) {
      const minGamesVal = parseInt(urlMinGames, 10)
      if (!isNaN(minGamesVal) && minGamesVal >= 0) {
        setMinGames(minGamesVal)
      }
    }
    if (urlView && ['teams', 'players'].includes(urlView)) {
      setLeaderboardView(urlView as 'teams' | 'players')
    }
    if (urlSort && ['lp', 'games', 'winrate'].includes(urlSort)) {
      setSortBy(urlSort as 'lp' | 'games' | 'winrate')
    }

    // Reset flag after a tick to allow URL updates
    setTimeout(() => {
      isUpdatingFromUrl.current = false
    }, 100)
  }, [searchParams, setPeriod, selectAllLeagues, toggleLeague, selectAllRoles, toggleRole, setMinGames, setLeaderboardView, setSortBy])

  // Update URL when filters change
  const updateUrl = useCallback(() => {
    if (isUpdatingFromUrl.current) return

    const params = new URLSearchParams()

    if (period !== 'day') params.set('period', period)
    if (selectedLeagues.length > 0) params.set('leagues', selectedLeagues.join(','))
    if (selectedRoles.length > 0) params.set('roles', selectedRoles.join(','))
    if (minGames > 0) params.set('minGames', minGames.toString())
    if (leaderboardView !== 'teams') params.set('view', leaderboardView)
    if (sortBy !== 'lp') params.set('sort', sortBy)

    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname

    router.replace(newUrl, { scroll: false })
  }, [period, selectedLeagues, selectedRoles, minGames, leaderboardView, sortBy, pathname, router])

  useEffect(() => {
    updateUrl()
  }, [updateUrl])

  // Pour la compatibilité avec les composants existants (stats, etc.)
  const selectedTeam = selectedTeams[0] || null

  const [data, setData] = useState<DashboardData>({
    summary: null,
    teams: [],
    teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: [],
    topLpGainers: [],
    topLpLosers: [],
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
  const [lpGainersSort, setLpGainersSort] = useState<'asc' | 'desc'>('desc')
  const [lpLosersSort, setLpLosersSort] = useState<'asc' | 'desc'>('desc')
  const [availableLeagues, setAvailableLeagues] = useState<LeagueInfo[]>([])

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

  // Fetch available leagues on mount
  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        const res = await api.get<{ data: LeagueInfo[] }>('/lol/dashboard/leagues')
        setAvailableLeagues(res.data || [])
      } catch (error) {
        console.error('Failed to fetch leagues:', error)
      }
    }
    fetchLeagues()
  }, [])

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
    const abortController = new AbortController()

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
            { params: baseParams, signal: abortController.signal }
          ),
          api.get<{
            data: TeamLeaderboardEntry[]
            meta: { total: number; perPage: number; currentPage: number; lastPage: number }
          }>('/lol/dashboard/teams', {
            params: {
              ...baseParams,
              leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
              // Ne pas envoyer les rôles pour les équipes (non pertinent)
              minGames: minGames > 0 ? minGames : undefined,
              sort: sortBy,
              page: currentPage,
              perPage: itemsPerPage,
            },
            signal: abortController.signal,
          }),
        ])

        // Check if request was aborted before updating state
        if (abortController.signal.aborted) return

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
        // Ignore abort errors - they are expected during navigation
        if (error instanceof Error && error.name === 'AbortError') return
        // Silent fail - UI will show empty/stale data
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      abortController.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, refDate, customStartDateStr, customEndDateStr, selectedLeagues, minGames, sortBy, currentPage, itemsPerPage])

  // Fetch grinders data (separate effect to handle team and league filtering)
  useEffect(() => {
    const abortController = new AbortController()

    const fetchGrinders = async () => {
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

        // Add role and minGames filters
        if (selectedRoles.length > 0) {
          params.roles = selectedRoles.join(',')
        }
        if (minGames > 0) {
          params.minGames = minGames.toString()
        }

        const grindersRes = await api.get<{ data: TopGrinderEntry[] }>('/lol/dashboard/top-grinders', {
          params: { ...params, limit: 5, sort: grindersSort },
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) return

        setData((prev) => ({
          ...prev,
          topGrinders: grindersRes.data || [],
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Silent fail - UI will show empty data
      }
    }

    fetchGrinders()

    return () => {
      abortController.abort()
    }
  }, [period, refDate, customStartDateStr, customEndDateStr, grindersSort, selectedTeamIdsString, selectedLeagues, selectedRoles, minGames])

  // Fetch LP gainers/losers data (independent of team/player selection, only depends on league filter and view mode)
  useEffect(() => {
    const abortController = new AbortController()

    const fetchLpLeaderboards = async () => {
      try {
        const params: Record<string, string | undefined> = { period, date: refDate }
        // For custom period, add explicit start and end dates
        if (period === 'custom' && customStartDateStr && customEndDateStr) {
          params.startDate = customStartDateStr
          params.endDate = customEndDateStr
        }

        // Only filter by leagues, NOT by selected teams/players
        if (selectedLeagues.length > 0) {
          params.leagues = selectedLeagues.join(',')
        }

        // Add view mode to get teams or players
        params.viewMode = leaderboardView

        // Add role filter only in players view (roles don't apply to teams)
        if (leaderboardView === 'players' && selectedRoles.length > 0) {
          params.roles = selectedRoles.join(',')
        }
        if (minGames > 0) {
          params.minGames = minGames.toString()
        }

        const [gainersRes, losersRes] = await Promise.all([
          api.get<{ data: LpChangeEntry[] }>('/lol/dashboard/top-lp-gainers', {
            params: { ...params, limit: 5, sort: lpGainersSort },
            signal: abortController.signal,
          }),
          api.get<{ data: LpChangeEntry[] }>('/lol/dashboard/top-lp-losers', {
            params: { ...params, limit: 5, sort: lpLosersSort },
            signal: abortController.signal,
          }),
        ])

        if (abortController.signal.aborted) return

        setData((prev) => ({
          ...prev,
          topLpGainers: gainersRes.data || [],
          topLpLosers: losersRes.data || [],
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Silent fail - UI will show empty data
      }
    }

    fetchLpLeaderboards()

    return () => {
      abortController.abort()
    }
  }, [period, refDate, customStartDateStr, customEndDateStr, lpGainersSort, lpLosersSort, selectedLeagues, selectedRoles, minGames, leaderboardView])

  // Fetch players data when in players view
  useEffect(() => {
    if (leaderboardView !== 'players') return

    const abortController = new AbortController()

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
            roles: selectedRoles.length > 0 ? selectedRoles : undefined,
            minGames: minGames > 0 ? minGames : undefined,
            sort: sortBy,
            page: currentPage,
            perPage: itemsPerPage,
          },
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) return

        setPlayers(res.data || [])
        setPlayersMeta(res.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Silent fail - UI will show empty data
      } finally {
        if (!abortController.signal.aborted) {
          setIsPlayersLoading(false)
        }
      }
    }

    fetchPlayers()

    return () => {
      abortController.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardView, period, refDate, customStartDateStr, customEndDateStr, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage])

  // Fetch unified team history (games + LP) for selected teams
  useEffect(() => {
    if (selectedTeams.length === 0) {
      setTeamsGamesData([])
      setTeamsLpData([])
      return
    }

    const abortController = new AbortController()

    const fetchTeamHistory = async () => {
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
              signal: abortController.signal,
            })
            return {
              teamName: team.team.currentName,
              data: res.data || [],
            }
          })
        )

        if (abortController.signal.aborted) return

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
        if (error instanceof Error && error.name === 'AbortError') return
        // Clear data on error
        setTeamsGamesData([])
        setTeamsLpData([])
      } finally {
        if (!abortController.signal.aborted) {
          setIsHistoryLoading(false)
        }
      }
    }

    fetchTeamHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedTeams, period, refDate, customStartDateStr, customEndDateStr])

  // Fetch player history for selected players (games + LP)
  useEffect(() => {
    if (selectedPlayers.length === 0) {
      setPlayersGamesData([])
      setPlayersLpData([])
      return
    }

    const abortController = new AbortController()

    const fetchPlayerHistory = async () => {
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
              signal: abortController.signal,
            })
            return {
              playerName: player.player.pseudo,
              data: res.data || [],
            }
          })
        )

        if (abortController.signal.aborted) return

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
        if (error instanceof Error && error.name === 'AbortError') return
        // Clear data on error
        setPlayersGamesData([])
        setPlayersLpData([])
      } finally {
        if (!abortController.signal.aborted) {
          setIsHistoryLoading(false)
        }
      }
    }

    fetchPlayerHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedPlayers, period, refDate, customStartDateStr, customEndDateStr])

  // Format total minutes as hours
  const formatMinutesAsHours = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60)
    return `${hours.toLocaleString('fr-FR')}h`
  }

  return (
    <main className="p-3 sm:p-5 max-w-[1600px] mx-auto">
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
            />
          </div>

          {/* Stats Cards (2x2 grid) */}
          <div className="grid grid-cols-2 gap-2">
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

          {/* Mini Leaderboards - LP Gainers/Losers (stacked vertically) */}
          <div className="flex flex-col gap-3">
            <TopLpGainers
              entries={data.topLpGainers}
              isLoading={isLoading}
              sortDirection={lpGainersSort}
              onSortChange={setLpGainersSort}
              viewMode={leaderboardView}
            />
            <TopLpLosers
              entries={data.topLpLosers}
              isLoading={isLoading}
              sortDirection={lpLosersSort}
              onSortChange={setLpLosersSort}
              viewMode={leaderboardView}
            />
            <TopGrinders
              entries={data.topGrinders}
              isLoading={isLoading}
              sortDirection={grindersSort}
              onSortChange={setGrindersSort}
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
            <button
              onClick={resetToDefault}
              className="flex items-center justify-center w-8 h-8 bg-(--bg-card) border border-(--border) rounded-md text-(--text-muted) hover:text-(--text-primary) hover:border-(--text-muted) transition-colors"
              title="Réinitialiser les filtres"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C9.69494 21 7.59227 20.1334 6 18.7083" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M3 4V9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
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

            {/* Mini Leaderboards (horizontal on lg, stacked on mobile) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TopLpGainers
                entries={data.topLpGainers}
                isLoading={isLoading}
                sortDirection={lpGainersSort}
                onSortChange={setLpGainersSort}
                viewMode={leaderboardView}
              />
              <TopLpLosers
                entries={data.topLpLosers}
                isLoading={isLoading}
                sortDirection={lpLosersSort}
                onSortChange={setLpLosersSort}
                viewMode={leaderboardView}
              />
              <TopGrinders
                entries={data.topGrinders}
                isLoading={isLoading}
                sortDirection={grindersSort}
                onSortChange={setGrindersSort}
              />
            </div>
          </div>
        </div>

        {/* Right Column - Charts */}
        <div className="flex flex-col gap-3">
          <GamesChart
            teams={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
            isLoading={isHistoryLoading}
          />
          <DailyWinrateChart
            teams={leaderboardView === 'players' ? playersGamesData : teamsGamesData}
            isLoading={isHistoryLoading}
          />
          <LpChart
            teams={leaderboardView === 'players' ? playersLpData : teamsLpData}
            isLoading={isHistoryLoading}
          />
          <LpChangeChart
            teams={leaderboardView === 'players' ? playersLpData : teamsLpData}
            isLoading={isHistoryLoading}
          />
        </div>
      </div>
    </main>
  )
}
