'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import api, { ApiError } from '@/lib/api'
import { useToastStore } from '@/stores/toastStore'
import { logError } from '@/lib/logger'
import type {
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  GrinderEntry,
  LpChangeEntry,
} from '@/lib/types'

interface DashboardData {
  teams: TeamLeaderboardEntry[]
  teamsMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  topGrinders: GrinderEntry[]
  topLpGainers: LpChangeEntry[]
  topLpLosers: LpChangeEntry[]
}

/**
 * Mark which players count for team stats (top 5 by LP)
 * Only Master+ players with LP are counted
 */
function addCountsForStats(teams: TeamLeaderboardEntry[]): TeamLeaderboardEntry[] {
  return teams.map((team) => {
    // Sort players by totalLp descending, keep track of their indices
    const playersWithIndex = team.players.map((p, idx) => ({ player: p, originalIndex: idx }))
    const sorted = [...playersWithIndex].sort((a, b) => (b.player.totalLp || 0) - (a.player.totalLp || 0))

    // Mark top 5 players with LP > 0 as counting
    const countingPlayerIds = new Set<number>()
    let counted = 0
    for (const item of sorted) {
      if (counted >= 5) break
      // Only count players with Master+ LP (totalLp > 0)
      if (item.player.totalLp > 0) {
        countingPlayerIds.add(item.player.playerId)
        counted++
      }
    }

    return {
      ...team,
      players: team.players.map((p) => ({
        ...p,
        countsForStats: countingPlayerIds.has(p.playerId),
      })),
    }
  })
}

interface UseDashboardDataParams {
  period: string
  refDate: string
  selectedLeagues: string[]
  selectedRoles: string[]
  minGames: number
  sortBy: string
  currentPage: number
  itemsPerPage: number
  selectedTeamIds: string
  grindersSort: 'asc' | 'desc'
  lpGainersSort: 'asc' | 'desc'
  lpLosersSort: 'asc' | 'desc'
  leaderboardView: 'teams' | 'players'
  onTeamsChange?: (teams: TeamLeaderboardEntry[], isPeriodChange: boolean) => void
}

interface UseDashboardDataResult {
  data: DashboardData
  isLoading: boolean
  newTeams: TeamLeaderboardEntry[]
  isPeriodChange: boolean
  error: Error | null
  retry: () => void
}

/**
 * Error Handling Pattern:
 * - AbortError: Silently ignored (request cancelled)
 * - 404: Warning toast (no data available)
 * - 5xx: Error toast (server error)
 * - Other: Logged + error state set
 */
export function useDashboardData({
  period,
  refDate,
  selectedLeagues,
  selectedRoles,
  minGames,
  sortBy,
  currentPage,
  itemsPerPage,
  selectedTeamIds,
  grindersSort,
  lpGainersSort,
  lpLosersSort,
  leaderboardView,
  onTeamsChange,
}: UseDashboardDataParams): UseDashboardDataResult {
  const addToast = useToastStore((s) => s.addToast)
  const [data, setData] = useState<DashboardData>({
    teams: [],
    teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: [],
    topLpGainers: [],
    topLpLosers: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [newTeams, setNewTeams] = useState<TeamLeaderboardEntry[]>([])
  const [isPeriodChange, setIsPeriodChange] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const prevPeriodRef = useRef<{ period: string; refDate: string }>({ period, refDate })

  // Ref pour stabiliser le callback et éviter les stale closures
  const onTeamsChangeRef = useRef(onTeamsChange)
  onTeamsChangeRef.current = onTeamsChange

  const retry = useCallback(() => {
    setError(null)
    setRetryTrigger((prev) => prev + 1)
  }, [])

  // Fetch all dashboard data using batch endpoint (reduces 5 requests to 2)
  useEffect(() => {
    const abortController = new AbortController()

    const fetchData = async () => {
      const isInitialLoad = data.teams.length === 0
      if (isInitialLoad) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const baseParams: Record<string, string | undefined> = { period, date: refDate }

        // Batch params for grinders + gainers + losers
        const batchParams: Record<string, string | undefined> = {
          ...baseParams,
          leagues: selectedLeagues.length > 0 ? selectedLeagues.join(',') : undefined,
          roles: leaderboardView === 'players' && selectedRoles.length > 0 ? selectedRoles.join(',') : undefined,
          minGames: minGames > 0 ? minGames.toString() : undefined,
          viewMode: leaderboardView,
          limit: '5',
        }

        // Fetch batch (grinders + gainers + losers) and teams in parallel
        const [batchRes, teamsRes] = await Promise.all([
          api.get<{
            grinders: { data: GrinderEntry[] }
            gainers: { data: LpChangeEntry[] }
            losers: { data: LpChangeEntry[] }
          }>('/lol/dashboard/batch', {
            params: batchParams,
            signal: abortController.signal,
          }),
          api.get<{
            data: TeamLeaderboardEntry[]
            meta: { total: number; perPage: number; currentPage: number; lastPage: number }
          }>('/lol/dashboard/teams', {
            params: {
              ...baseParams,
              leagues: selectedLeagues.length > 0 ? selectedLeagues.join(',') : undefined,
              minGames: minGames > 0 ? minGames : undefined,
              sort: sortBy,
              page: currentPage,
              perPage: itemsPerPage,
            },
            signal: abortController.signal,
          }),
        ])

        if (abortController.signal.aborted) return

        // Add countsForStats to each player (top 5 by LP count for team stats)
        const teams = addCountsForStats(teamsRes.data || [])
        setNewTeams(teams)

        const periodChanged = prevPeriodRef.current.period !== period || prevPeriodRef.current.refDate !== refDate
        prevPeriodRef.current = { period, refDate }
        setIsPeriodChange(periodChanged)

        // Call callback to allow parent to update selected team data
        onTeamsChangeRef.current?.(teams, periodChanged)

        setData({
          teams,
          teamsMeta: teamsRes.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 },
          topGrinders: batchRes.grinders.data || [],
          topLpGainers: batchRes.gainers.data || [],
          topLpLosers: batchRes.losers.data || [],
        })
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') return

          // Add toast for critical errors
          if (error instanceof ApiError) {
            if (error.status === 404) {
              addToast({ message: 'Aucune donnée disponible pour cette période', type: 'warning' })
            } else if (error.status >= 500) {
              addToast({ message: 'Erreur serveur, veuillez réessayer', type: 'error' })
            }
          }

          logError('Dashboard data fetch error', error)
          setError(error)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    // Debounce to prevent request bursts on rapid filter changes
    const debounceTimer = setTimeout(fetchData, 300)

    return () => {
      clearTimeout(debounceTimer)
      abortController.abort()
    }
  }, [period, refDate, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage, leaderboardView, retryTrigger])

  return { data, isLoading, newTeams, isPeriodChange, error, retry }
}

interface UsePlayersDataParams {
  leaderboardView: 'teams' | 'players'
  period: string
  refDate: string
  selectedLeagues: string[]
  selectedRoles: string[]
  minGames: number
  sortBy: string
  currentPage: number
  itemsPerPage: number
}

interface UsePlayersDataResult {
  players: PlayerLeaderboardEntry[]
  playersMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  isLoading: boolean
  error: Error | null
  retry: () => void
}

/**
 * Error Handling Pattern:
 * - AbortError: Silently ignored (request cancelled)
 * - 404: Warning toast (no data available)
 * - 5xx: Error toast (server error)
 * - Other: Logged + error state set
 */
export function usePlayersData({
  leaderboardView,
  period,
  refDate,
  selectedLeagues,
  selectedRoles,
  minGames,
  sortBy,
  currentPage,
  itemsPerPage,
}: UsePlayersDataParams): UsePlayersDataResult {
  const addToast = useToastStore((s) => s.addToast)
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[]>([])
  const [playersMeta, setPlayersMeta] = useState({ total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const retry = useCallback(() => {
    setError(null)
    setRetryTrigger((prev) => prev + 1)
  }, [])

  // Fetch players data with debounce
  useEffect(() => {
    if (leaderboardView !== 'players') return

    const abortController = new AbortController()

    const fetchPlayers = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const params: Record<string, string | number | string[] | undefined> = { period, date: refDate }
        const res = await api.get<{
          data: PlayerLeaderboardEntry[]
          meta: { total: number; perPage: number; currentPage: number; lastPage: number }
        }>('/lol/dashboard/players', {
          params: {
            ...params,
            leagues: selectedLeagues.length > 0 ? selectedLeagues.join(',') : undefined,
            roles: selectedRoles.length > 0 ? selectedRoles.join(',') : undefined,
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
        if (error instanceof Error) {
          if (error.name === 'AbortError') return

          // Add toast for critical errors
          if (error instanceof ApiError) {
            if (error.status === 404) {
              addToast({ message: 'Aucune donnée disponible pour cette période', type: 'warning' })
            } else if (error.status >= 500) {
              addToast({ message: 'Erreur serveur, veuillez réessayer', type: 'error' })
            }
          }

          logError('Players data fetch error', error)
          setError(error)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    // Debounce to prevent request bursts on rapid filter changes
    const debounceTimer = setTimeout(fetchPlayers, 300)

    return () => {
      clearTimeout(debounceTimer)
      abortController.abort()
    }
  }, [leaderboardView, period, refDate, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage, retryTrigger])

  return { players, playersMeta, isLoading, error, retry }
}
