'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import api from '@/lib/api'
import type {
  DashboardSummary,
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  TopGrinderEntry,
  LpChangeEntry,
} from '@/lib/types'

interface DashboardData {
  summary: DashboardSummary | null
  teams: TeamLeaderboardEntry[]
  teamsMeta: { total: number; perPage: number; currentPage: number; lastPage: number }
  topGrinders: TopGrinderEntry[]
  topLpGainers: LpChangeEntry[]
  topLpLosers: LpChangeEntry[]
}

interface UseDashboardDataParams {
  period: string
  refDate: string
  customStartDate?: string
  customEndDate?: string
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
}

interface UseDashboardDataResult {
  data: DashboardData
  isLoading: boolean
  newTeams: TeamLeaderboardEntry[]
  isPeriodChange: boolean
}

export function useDashboardData({
  period,
  refDate,
  customStartDate,
  customEndDate,
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
}: UseDashboardDataParams): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData>({
    summary: null,
    teams: [],
    teamsMeta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
    topGrinders: [],
    topLpGainers: [],
    topLpLosers: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [newTeams, setNewTeams] = useState<TeamLeaderboardEntry[]>([])
  const [isPeriodChange, setIsPeriodChange] = useState(false)

  const prevPeriodRef = useRef<{ period: string; refDate: string }>({ period, refDate })

  // Fetch main dashboard data (summary + teams)
  useEffect(() => {
    const abortController = new AbortController()

    const fetchData = async () => {
      const isInitialLoad = data.teams.length === 0
      if (isInitialLoad) {
        setIsLoading(true)
      }

      try {
        const baseParams: Record<string, string | undefined> = { period, date: refDate }
        if (period === 'custom' && customStartDate && customEndDate) {
          baseParams.startDate = customStartDate
          baseParams.endDate = customEndDate
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
              roles: selectedRoles.length > 0 ? selectedRoles : undefined,
              minGames: minGames > 0 ? minGames : undefined,
              sortBy,
              page: currentPage,
              limit: itemsPerPage,
            },
            signal: abortController.signal,
          }),
        ])

        if (abortController.signal.aborted) return

        const teams = teamsRes.data || []
        setNewTeams(teams)

        const periodChanged = prevPeriodRef.current.period !== period || prevPeriodRef.current.refDate !== refDate
        prevPeriodRef.current = { period, refDate }
        setIsPeriodChange(periodChanged)

        setData((prev) => ({
          ...prev,
          summary: summaryRes,
          teams,
          teamsMeta: teamsRes.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 },
        }))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
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
  }, [period, refDate, customStartDate, customEndDate, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage])

  // Fetch grinders data
  useEffect(() => {
    const abortController = new AbortController()

    const fetchGrinders = async () => {
      try {
        const params: Record<string, string | undefined> = { period, date: refDate }
        if (period === 'custom' && customStartDate && customEndDate) {
          params.startDate = customStartDate
          params.endDate = customEndDate
        }
        if (selectedTeamIds) {
          params.teamIds = selectedTeamIds
        }
        if (selectedLeagues.length > 0) {
          params.leagues = selectedLeagues.join(',')
        }
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
      }
    }

    fetchGrinders()

    return () => {
      abortController.abort()
    }
  }, [period, refDate, customStartDate, customEndDate, grindersSort, selectedTeamIds, selectedLeagues, selectedRoles, minGames])

  // Fetch LP gainers/losers data
  useEffect(() => {
    const abortController = new AbortController()

    const fetchLpLeaderboards = async () => {
      try {
        const params: Record<string, string | undefined> = { period, date: refDate }
        if (period === 'custom' && customStartDate && customEndDate) {
          params.startDate = customStartDate
          params.endDate = customEndDate
        }
        if (selectedLeagues.length > 0) {
          params.leagues = selectedLeagues.join(',')
        }
        if (selectedRoles.length > 0) {
          params.roles = selectedRoles.join(',')
        }
        if (minGames > 0) {
          params.minGames = minGames.toString()
        }
        params.viewMode = leaderboardView

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
      }
    }

    fetchLpLeaderboards()

    return () => {
      abortController.abort()
    }
  }, [period, refDate, customStartDate, customEndDate, lpGainersSort, lpLosersSort, selectedLeagues, selectedRoles, minGames, leaderboardView])

  return { data, isLoading, newTeams, isPeriodChange }
}

interface UsePlayersDataParams {
  leaderboardView: 'teams' | 'players'
  period: string
  refDate: string
  customStartDate?: string
  customEndDate?: string
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
}

export function usePlayersData({
  leaderboardView,
  period,
  refDate,
  customStartDate,
  customEndDate,
  selectedLeagues,
  selectedRoles,
  minGames,
  sortBy,
  currentPage,
  itemsPerPage,
}: UsePlayersDataParams): UsePlayersDataResult {
  const [players, setPlayers] = useState<PlayerLeaderboardEntry[]>([])
  const [playersMeta, setPlayersMeta] = useState({ total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (leaderboardView !== 'players') return

    const abortController = new AbortController()

    const fetchPlayers = async () => {
      setIsLoading(true)
      try {
        const params: Record<string, string | number | string[] | undefined> = { period, date: refDate }
        if (period === 'custom' && customStartDate && customEndDate) {
          params.startDate = customStartDate
          params.endDate = customEndDate
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
            sortBy,
            page: currentPage,
            limit: itemsPerPage,
          },
          signal: abortController.signal,
        })

        if (abortController.signal.aborted) return

        setPlayers(res.data || [])
        setPlayersMeta(res.meta || { total: 0, perPage: 10, currentPage: 1, lastPage: 1 })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchPlayers()

    return () => {
      abortController.abort()
    }
  }, [leaderboardView, period, refDate, customStartDate, customEndDate, selectedLeagues, selectedRoles, minGames, sortBy, currentPage, itemsPerPage])

  return { players, playersMeta, isLoading }
}
