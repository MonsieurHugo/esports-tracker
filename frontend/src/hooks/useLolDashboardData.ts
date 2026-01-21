'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import api, { ApiError } from '@/lib/api'
import { logError } from '@/lib/logger'
import { useToastStore } from '@/stores/toastStore'
import type {
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  GrinderEntry,
  LpChangeEntry,
  TeamHistoryData,
  DashboardPeriod,
  SortOption,
} from '@/lib/types'
import type { TeamGamesData } from '@/components/dashboard/GamesChart'
import type { TeamLpData } from '@/components/dashboard/LpChart'

interface DashboardData {
  teams: TeamLeaderboardEntry[]
  teamsMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  topGrinders: GrinderEntry[]
  topLpGainers: LpChangeEntry[]
  topLpLosers: LpChangeEntry[]
}

interface UseLolDashboardDataParams {
  startDate: string
  endDate: string
  period: DashboardPeriod
  refDate: string
  selectedLeagues: string[]
  selectedRoles: string[]
  minGames: number
  sortBy: SortOption
  currentPage: number
  itemsPerPage: number
  leaderboardView: 'teams' | 'players'
  selectedTeams: TeamLeaderboardEntry[]
  selectedPlayers: PlayerLeaderboardEntry[]
  isHydrated: boolean
  isUrlInitialized: boolean
  updateSelectedTeamData: (team: TeamLeaderboardEntry) => void
}

interface UseLolDashboardDataResult {
  // Main dashboard data
  data: DashboardData
  isLoading: boolean
  // Players data (when in players view)
  players: PlayerLeaderboardEntry[]
  playersMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  isPlayersLoading: boolean
  // History data for charts
  teamsLpData: TeamLpData[]
  teamsGamesData: TeamGamesData[]
  playersLpData: TeamLpData[]
  playersGamesData: TeamGamesData[]
  isHistoryLoading: boolean
  // LP stats calculated from history
  getTeamLpStats: (team: TeamLeaderboardEntry) => { totalLp: number; lpChange: number }
  getPlayerLpStats: (player: PlayerLeaderboardEntry) => { totalLp: number; lpChange: number }
}

/**
 * Hook for managing all dashboard data fetching.
 *
 * Consolidates:
 * - Teams leaderboard fetch
 * - Batch data (grinders, gainers, losers)
 * - Players leaderboard (when in players view)
 * - Team/player history for charts
 *
 * Handles abort controllers, loading states, and toast notifications.
 */
export function useLolDashboardData({
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
}: UseLolDashboardDataParams): UseLolDashboardDataResult {
  const addToast = useToastStore(state => state.addToast)

  // Main dashboard data state
  const [data, setData] = useState<DashboardData>({
    teams: [],
    teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: [],
    topLpGainers: [],
    topLpLosers: [],
  })
  const [isLoading, setIsLoading] = useState(true)

  // Players data state
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[]>([])
  const [playersMeta, setPlayersMeta] = useState({ total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
  const [isPlayersLoading, setIsPlayersLoading] = useState(false)

  // History data state
  const [teamsLpData, setTeamsLpData] = useState<TeamLpData[]>([])
  const [teamsGamesData, setTeamsGamesData] = useState<TeamGamesData[]>([])
  const [playersLpData, setPlayersLpData] = useState<TeamLpData[]>([])
  const [playersGamesData, setPlayersGamesData] = useState<TeamGamesData[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)

  // Track previous period/refDate to detect period changes vs filter changes
  const prevPeriodRef = useRef<{ period: string; refDate: string }>({ period, refDate })

  // Request ID refs to prevent race conditions
  const teamsRequestIdRef = useRef(0)
  const batchRequestIdRef = useRef(0)
  const playersRequestIdRef = useRef(0)
  const teamHistoryRequestIdRef = useRef(0)
  const playerHistoryRequestIdRef = useRef(0)

  // Fetch main dashboard data (teams)
  useEffect(() => {
    if (!isHydrated || !isUrlInitialized) return

    const abortController = new AbortController()
    const currentRequestId = ++teamsRequestIdRef.current

    const fetchData = async () => {
      const isInitialLoad = data.teams.length === 0
      if (isInitialLoad) {
        setIsLoading(true)
      }

      try {
        const baseParams: Record<string, string | undefined> = { startDate, endDate }

        const teamsRes = await api.get<{
          data: TeamLeaderboardEntry[]
          meta: { total: number; perPage: number; currentPage: number; lastPage: number }
        }>('/lol/dashboard/teams', {
          params: {
            ...baseParams,
            leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
            minGames: minGames > 0 ? minGames : undefined,
            sort: sortBy,
            page: currentPage,
            perPage: itemsPerPage,
          },
          signal: abortController.signal,
        })

        // Ignore stale responses
        if (currentRequestId !== teamsRequestIdRef.current) return
        if (abortController.signal.aborted) return

        const newTeams = teamsRes.data || []
        setData((prev) => ({
          ...prev,
          teams: newTeams,
          teamsMeta: teamsRes.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 },
        }))

        // Detect period change vs filter change
        const isPeriodChange = prevPeriodRef.current.period !== period || prevPeriodRef.current.refDate !== refDate
        prevPeriodRef.current = { period, refDate }

        // Update selected teams data
        selectedTeams.forEach((selectedTeam) => {
          const updatedTeam = newTeams.find((t) => t.team.teamId === selectedTeam.team.teamId)
          if (updatedTeam) {
            updateSelectedTeamData(updatedTeam)
          } else if (isPeriodChange) {
            updateSelectedTeamData({
              ...selectedTeam,
              rank: -1,
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
            updateSelectedTeamData({
              ...selectedTeam,
              rank: -1,
            })
          }
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Ignore errors from stale requests
        if (currentRequestId !== teamsRequestIdRef.current) return

        logError('Failed to fetch teams', error)
        addToast({
          message: error instanceof ApiError
            ? `Erreur lors du chargement des équipes (${error.status})`
            : 'Impossible de charger les données des équipes',
          type: 'error',
        })
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === teamsRequestIdRef.current && !abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      abortController.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, isUrlInitialized, startDate, endDate, selectedLeagues, minGames, sortBy, currentPage, itemsPerPage])

  // Fetch batch data (grinders, gainers, losers)
  useEffect(() => {
    if (!isHydrated || !isUrlInitialized) return

    const abortController = new AbortController()
    const currentRequestId = ++batchRequestIdRef.current

    const fetchBatchData = async () => {
      try {
        const params: Record<string, string | undefined> = { startDate, endDate }

        if (selectedLeagues.length > 0) {
          params.leagues = selectedLeagues.join(',')
        }

        params.viewMode = leaderboardView

        if (leaderboardView === 'players' && selectedRoles.length > 0) {
          params.roles = selectedRoles.join(',')
        }
        if (minGames > 0) {
          params.minGames = minGames.toString()
        }

        const batchRes = await api.get<{
          grinders: { data: GrinderEntry[] }
          gainers: { data: LpChangeEntry[] }
          losers: { data: LpChangeEntry[] }
        }>('/lol/dashboard/batch', {
          params: { ...params, limit: 5 },
          signal: abortController.signal,
        })

        // Ignore stale responses
        if (currentRequestId !== batchRequestIdRef.current) return
        if (abortController.signal.aborted) return

        setData((prev) => ({
          ...prev,
          topGrinders: batchRes.grinders?.data || [],
          topLpGainers: batchRes.gainers?.data || [],
          topLpLosers: batchRes.losers?.data || [],
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Ignore errors from stale requests
        if (currentRequestId !== batchRequestIdRef.current) return

        logError('Failed to fetch batch data', error)
        addToast({
          message: error instanceof ApiError
            ? `Erreur lors du chargement des statistiques (${error.status})`
            : 'Impossible de charger les classements',
          type: 'error',
        })
      }
    }

    fetchBatchData()

    return () => {
      abortController.abort()
    }
  }, [isHydrated, isUrlInitialized, startDate, endDate, selectedLeagues, selectedRoles, minGames, leaderboardView, addToast])

  // Fetch players data when in players view
  useEffect(() => {
    if (leaderboardView !== 'players') return

    const abortController = new AbortController()
    const currentRequestId = ++playersRequestIdRef.current

    const fetchPlayers = async () => {
      setIsPlayersLoading(true)
      try {
        const params: Record<string, string | number | string[] | undefined> = { startDate, endDate }
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

        // Ignore stale responses
        if (currentRequestId !== playersRequestIdRef.current) return
        if (abortController.signal.aborted) return

        setPlayers(res.data || [])
        setPlayersMeta(res.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Ignore errors from stale requests
        if (currentRequestId !== playersRequestIdRef.current) return

        logError('Failed to fetch players', error)
        addToast({
          message: error instanceof ApiError
            ? `Erreur lors du chargement des joueurs (${error.status})`
            : 'Impossible de charger les données des joueurs',
          type: 'error',
        })
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === playersRequestIdRef.current && !abortController.signal.aborted) {
          setIsPlayersLoading(false)
        }
      }
    }

    fetchPlayers()

    return () => {
      abortController.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardView, startDate, endDate, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage])

  // Fetch team history for selected teams
  useEffect(() => {
    if (selectedTeams.length === 0) {
      setTeamsGamesData([])
      setTeamsLpData([])
      return
    }

    const abortController = new AbortController()
    const currentRequestId = ++teamHistoryRequestIdRef.current

    const fetchTeamHistory = async () => {
      setIsHistoryLoading(true)
      try {
        const entityIds = selectedTeams.map((t) => t.team.teamId).join(',')
        const params: Record<string, string | number | undefined> = {
          startDate,
          endDate,
          entityIds,
          period,
        }
        const res = await api.get<{ data: Array<{ teamId: number; teamName: string; shortName: string; data: TeamHistoryData[] }> }>('/lol/dashboard/team-history-batch', {
          params,
          signal: abortController.signal,
        })

        // Ignore stale responses
        if (currentRequestId !== teamHistoryRequestIdRef.current) return
        if (abortController.signal.aborted) return

        const results = res.data || []

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
        // Ignore errors from stale requests
        if (currentRequestId !== teamHistoryRequestIdRef.current) return

        logError('Failed to fetch team history', error)
        addToast({
          message: error instanceof ApiError
            ? `Erreur lors du chargement de l'historique des équipes (${error.status})`
            : 'Impossible de charger l\'historique des équipes',
          type: 'error',
        })
        setTeamsGamesData([])
        setTeamsLpData([])
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === teamHistoryRequestIdRef.current && !abortController.signal.aborted) {
          setIsHistoryLoading(false)
        }
      }
    }

    fetchTeamHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedTeams, startDate, endDate, period, addToast])

  // Fetch player history for selected players
  useEffect(() => {
    if (selectedPlayers.length === 0) {
      setPlayersGamesData([])
      setPlayersLpData([])
      return
    }

    const abortController = new AbortController()
    const currentRequestId = ++playerHistoryRequestIdRef.current

    const fetchPlayerHistory = async () => {
      setIsHistoryLoading(true)
      try {
        const entityIds = selectedPlayers.map((p) => p.player.playerId).join(',')
        const params: Record<string, string | number | undefined> = {
          startDate,
          endDate,
          entityIds,
          period,
        }
        const res = await api.get<{ data: Array<{ playerId: number; playerName: string; data: TeamHistoryData[] }> }>('/lol/dashboard/player-history-batch', {
          params,
          signal: abortController.signal,
        })

        // Ignore stale responses
        if (currentRequestId !== playerHistoryRequestIdRef.current) return
        if (abortController.signal.aborted) return

        const results = res.data || []

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
        // Ignore errors from stale requests
        if (currentRequestId !== playerHistoryRequestIdRef.current) return

        logError('Failed to fetch player history', error)
        addToast({
          message: error instanceof ApiError
            ? `Erreur lors du chargement de l'historique des joueurs (${error.status})`
            : 'Impossible de charger l\'historique des joueurs',
          type: 'error',
        })
        setPlayersGamesData([])
        setPlayersLpData([])
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === playerHistoryRequestIdRef.current && !abortController.signal.aborted) {
          setIsHistoryLoading(false)
        }
      }
    }

    fetchPlayerHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedPlayers, startDate, endDate, period, addToast])

  // Calculate LP stats from history data
  const teamsLpStats = useMemo(() => {
    const stats = new Map<number, { totalLp: number; lpChange: number }>()

    selectedTeams.forEach((team) => {
      const historyData = teamsLpData.find((t) => t.teamName === team.team.currentName)
      if (historyData && historyData.data.length > 0) {
        const validData = historyData.data.filter((d) => d.totalLp !== undefined && d.totalLp !== null)
        if (validData.length > 0) {
          const lastLp = validData[validData.length - 1].totalLp
          const firstLp = validData[0].totalLp
          stats.set(team.team.teamId, {
            totalLp: lastLp,
            lpChange: lastLp - firstLp,
          })
        }
      }
    })

    return stats
  }, [selectedTeams, teamsLpData])

  const playersLpStats = useMemo(() => {
    const stats = new Map<number, { totalLp: number; lpChange: number }>()

    selectedPlayers.forEach((player) => {
      const historyData = playersLpData.find((p) => p.teamName === player.player.pseudo)
      if (historyData && historyData.data.length > 0) {
        const validData = historyData.data.filter((d) => d.totalLp !== undefined && d.totalLp !== null)
        if (validData.length > 0) {
          const lastLp = validData[validData.length - 1].totalLp
          const firstLp = validData[0].totalLp
          stats.set(player.player.playerId, {
            totalLp: lastLp,
            lpChange: lastLp - firstLp,
          })
        }
      }
    })

    return stats
  }, [selectedPlayers, playersLpData])

  // Helper to get LP stats with fallback
  const getTeamLpStats = useCallback((team: TeamLeaderboardEntry) => {
    const stats = teamsLpStats.get(team.team.teamId)
    return stats || { totalLp: team.totalLp, lpChange: team.totalLpChange }
  }, [teamsLpStats])

  const getPlayerLpStats = useCallback((player: PlayerLeaderboardEntry) => {
    const stats = playersLpStats.get(player.player.playerId)
    return stats || { totalLp: player.totalLp, lpChange: player.totalLpChange }
  }, [playersLpStats])

  return {
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
  }
}
